"""
Stage 3D: Resumable, Cluster-Deduplicated Structured-Output Extraction Pass (Agent-Driven).

Extracts *implicit* Qawa'id Fiqhiyyah / Qawa'id Usuliyyah / chapter Dawabit from the
fatwas that Stage 3 (`ground_fatwa`) could not ground deterministically.

Instead of calling an LLM API, the "model" is a coding agent working through
file-based batches (see `pipeline/LLM_EXTRACTION_RUNBOOK.md`):

    plan     Show eligibility / progress statistics (no files written).
    export   Build cluster-deduplicated jobs for unprocessed fatwas and write
             `pipeline/data/llm_jobs/batch_NNNN.{jobs.json,prompt.md}`.
    check    Validate an agent-written `batch_NNNN.response.jsonl` (no writes).
    ingest   Validate responses, append one line per fatwa to
             `pipeline/data/llm_extractions.jsonl` (flushed immediately), and move
             the batch to `pipeline/data/llm_jobs/done/`.
    status   List outstanding batches and their response state.

Token-efficient strategy (AGENT_TASK_LLM_EXTRACTION.md §3):
  1. Stage 1 pre-triage drops fatwas with no causal reasoning / routine citations.
  2. Fatwas already grounded deterministically are skipped (override: --include-grounded).
  3. Issue clusters are deduplicated: small clusters are sent together in one job (so
     Ibn Baz vs. Ibn Uthaymeen nuances are captured together); large clusters send the
     longest answer per scholar and propagate its links to the remaining members
     wherever the evidence quote also occurs verbatim in that member's answer.
  4. Each job carries only its candidate subgraph (top ~15 nodes from the inverted-index
     neighbourhood + topic_chapter dawabit) plus the 5 universal maxims.

Guardrails (§5) are enforced in `validate_fatwa_response`, which `compile_sqlite.py`
re-runs on the raw cached responses, so guardrail tweaks never require re-extraction.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter
from collections.abc import Iterable
from datetime import UTC, datetime
from pathlib import Path

from arabic_norm import normalize_arabic
from cluster_issues import cluster_fatwa_issues
from grounding import epistemic_markers_for, ground_fatwa
from ingest_archives import load_full_archives
from ontology_index import STOP_TOKENS, OntologyGraph
from verbatim import locate_verbatim

ROOT_DIR = Path(__file__).resolve().parents[2]
PIPELINE_DIR = ROOT_DIR / "pipeline"
DATA_DIR = PIPELINE_DIR / "data"
ONTOLOGY_PATH = PIPELINE_DIR / "seed" / "ontology.json"
EXTRACTIONS_PATH = DATA_DIR / "llm_extractions.jsonl"
JOBS_DIR = DATA_DIR / "llm_jobs"
DONE_DIR = JOBS_DIR / "done"

NEW_CANDIDATE = "NEW_CANDIDATE"
INVOCATION_TYPES = ("explicit_verbatim", "explicit_paraphrase", "implicit_application")
DIFFICULTIES = ("beginner", "intermediate", "advanced")
NEW_DABIT_SCIENCES = ("fiqh", "usul")
NEW_DABIT_KINDS = ("qa_idah_kulliyyah", "dabit_fiqhi", "qa_idah_usuliyyah", "dabit_usuli")

DEFAULT_MIN_CONFIDENCE = 0.5
DEFAULT_MAX_CANDIDATES = 15
DEFAULT_MAX_ANSWER_CHARS = 2000
DEFAULT_MAX_QUESTION_CHARS = 450
DEFAULT_MAX_FATWAS_PER_JOB = 3
DEFAULT_JOBS_PER_BATCH = 30

# Fiqh chapters first: they are the densest in qawa'id/dawabit, so early batches
# (and pilots) yield the most useful links.
CHAPTER_PRIORITY = [
    "Taharah",
    "Salat",
    "Sawm",
    "Zakat",
    "Hajj",
    "Janaiz",
    "Nikah",
    "Muamalat",
    "Faraid",
    "Ayman",
    "Jinayat",
    "Udhiyah",
    "Jihad",
    "Mutafarriqat",
    "Hadith",
    "Tafsir",
    "Ilm",
    "Adab",
    "Aqidah",
]

# §4 Structured Output schema — one object per fatwa (kept verbatim from the spec).
FATWA_RESULT_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "fatwa_id": {"type": "string"},
        "has_applicable_principle": {"type": "boolean"},
        "invocations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "principle_id": {
                        "type": "string",
                        "description": "Must match an existing ID from the candidate ontology subgraph, or 'NEW_CANDIDATE' if proposing a new chapter dabit.",
                    },
                    "matched_alias_id": {"type": ["string", "null"]},
                    "invocation_type": {"type": "string", "enum": list(INVOCATION_TYPES)},
                    "evidence_quote_ar": {
                        "type": "string",
                        "description": "Exact verbatim substring from answer_text ('محل الشاهد') demonstrating the causal reasoning.",
                    },
                    "application_explanation_ar": {
                        "type": "string",
                        "description": "Concise Arabic explanation (1-2 sentences) of how the scholar applied this principle to derive the ruling ('تحقيق المناط').",
                    },
                    "difficulty": {"type": "string", "enum": list(DIFFICULTIES)},
                    "confidence_score": {"type": "number"},
                    "proposed_new_dabit": {
                        "type": ["object", "null"],
                        "properties": {
                            "suggested_id": {"type": "string"},
                            "parent_id": {"type": "string"},
                            "science": {"type": "string", "enum": list(NEW_DABIT_SCIENCES)},
                            "kind": {"type": "string", "enum": list(NEW_DABIT_KINDS)},
                            "canonical_text_ar": {"type": "string"},
                            "summary_ar": {"type": "string"},
                        },
                        "required": [
                            "suggested_id",
                            "parent_id",
                            "science",
                            "kind",
                            "canonical_text_ar",
                            "summary_ar",
                        ],
                    },
                },
                "required": [
                    "principle_id",
                    "matched_alias_id",
                    "invocation_type",
                    "evidence_quote_ar",
                    "application_explanation_ar",
                    "difficulty",
                    "confidence_score",
                    "proposed_new_dabit",
                ],
            },
        },
    },
    "required": ["fatwa_id", "has_applicable_principle", "invocations"],
}

# §5.1 Routine Proof Citation Guardrail: these Usul nodes may only be linked when the
# answer discusses the *authority / epistemic weight* of the proof itself.
_CLAUSE_RE = re.compile(r"[^.؛!؟\n]+")
_CAUSAL_CLAUSE_HINTS = [
    normalize_arabic(h)
    for h in (
        "لأن",
        "لأجل",
        "الأصل",
        "القاعدة",
        "بناء على",
        "يقين",
        "الشك",
        "مشقة",
        "التيسير",
        "الضرر",
        "الضرورة",
        "المقاصد",
        "بالنيات",
        "العبرة",
        "العادة",
        "العرف",
        "المفاسد",
        "المصالح",
        "الذرائع",
        "الإكراه",
        "النسيان",
        "الجاهل",
        "توقيف",
        "بدعة",
        "استصحاب",
        "فإن",
        "ولهذا",
        "فلهذا",
        "لهذا",
    )
]


# =============================================================================
# Corpus loading & eligibility
# =============================================================================
class Corpus:
    def __init__(self, include_grounded: bool = False):
        self.ontology = OntologyGraph(ONTOLOGY_PATH)
        _, fatwas = load_full_archives(PIPELINE_DIR)
        for f in fatwas:
            f["question_norm"] = normalize_arabic(f["question_text"])
            f["answer_norm"] = normalize_arabic(f["answer_text"])
            f["subtopic_norm"] = normalize_arabic(f.get("topic_subtopic") or "")
        self.fatwas: list[dict] = fatwas
        self.fatwas_by_id: dict[str, dict] = {f["id"]: f for f in fatwas}
        self.clusters, self.fatwa_to_cluster = cluster_fatwa_issues(fatwas)
        self.clusters_by_id: dict[str, dict] = {c["id"]: c for c in self.clusters}

        self.eligibility: Counter = Counter()
        self.eligible_ids: set[str] = set()
        for f in fatwas:
            res = ground_fatwa(f, self.ontology)
            if not res.skipped:
                self.eligibility["DETERMINISTICALLY_GROUNDED"] += 1
                if include_grounded:
                    self.eligible_ids.add(f["id"])
            elif res.skip_reason in (
                "ROUTINE_PROOF_CITATION_ONLY",
                "NO_CAUSAL_PRINCIPLE_DETECTED",
            ):
                self.eligibility[f"TRIAGE_{res.skip_reason}"] += 1
            else:
                self.eligibility[f"ELIGIBLE_{res.skip_reason}"] += 1
                self.eligible_ids.add(f["id"])


def ancestor_ids(ontology: OntologyGraph, node_id: str) -> list[str]:
    out = []
    curr = ontology.nodes[node_id]
    while curr.get("parent_id"):
        out.append(curr["parent_id"])
        curr = ontology.nodes[curr["parent_id"]]
    return out


def has_textual_proof_or_linguistic_markers(answer_raw: str, norm_answer: str) -> bool:
    """Checks if answer contains Quran/Hadith citations or Usuli linguistic markers."""
    if any(q in answer_raw for q in ("﴿", "﴾", "«", "»", "ﷺ", "قال النبي", "قال رسول")):
        return True
    usul_tokens = (
        "الامر",
        "النهي",
        "الوجوب",
        "التحريم",
        "الاستحباب",
        "الكراهه",
        "الفور",
        "العموم",
        "النكره",
        "المطلق",
        "المقيد",
        "صارف",
        "الظاهر",
        "مفهوم",
        "دلاله",
        "النفي",
    )
    return any(t in norm_answer for t in usul_tokens)


def candidate_subgraph_ids(
    fatwa: dict,
    ontology: OntologyGraph,
    max_candidates: int = DEFAULT_MAX_CANDIDATES,
    science: str | None = None,
) -> list[str]:
    """Top-N inverted-index neighbourhood + topic_chapter dawabit, plus kubra maxims and Usul subgraphs."""
    norm_query = f"{fatwa['subtopic_norm']} {fatwa['question_norm']} {fatwa['answer_norm']}"
    tokens = {t for t in norm_query.split() if len(t) > 2 and t not in STOP_TOKENS}
    retrieved, _ = ontology.retrieve_candidate_subgraph_fast(norm_query, tokens, top_k_seeds=6)

    ordered: list[str] = []
    seen: set[str] = set()

    def _add(nid: str) -> None:
        if nid not in seen and nid in ontology.nodes:
            seen.add(nid)
            ordered.append(nid)

    for node in retrieved:
        _add(node["id"])
    if science != "usul":
        for node in ontology.nodes.values():
            if node["domain_section"] == fatwa["topic_chapter"]:
                _add(node["id"])
    ordered = ordered[:max_candidates]
    seen = set(ordered)
    if science != "usul":
        for node in ontology.nodes.values():
            if node["kind"] == "qa_idah_kubra":
                _add(node["id"])

    # Always inject relevant Usul nodes when textual citations or linguistic markers are present
    if (
        has_textual_proof_or_linguistic_markers(fatwa.get("answer_text", ""), fatwa["answer_norm"])
        or science == "usul"
    ):
        ans_norm = fatwa["answer_norm"]
        for node in ontology.nodes.values():
            if node.get("science") == "usul" and node.get("domain_section") == "دلالات الألفاظ":
                # Inject root asl_kulli nodes
                if node.get("kind") == "asl_kulli":
                    _add(node["id"])
                # Inject amr sub-principles when amr/wujub is relevant
                if any(
                    k in ans_norm for k in ("امر", "يامر", "وجوب", "واجب", "فور", "افعل")
                ) and node["id"].startswith("usul.alfaz.amr"):
                    _add(node["id"])
                # Inject nahy sub-principles when nahy/tahrim/fasad is relevant
                if any(
                    k in ans_norm
                    for k in ("نهي", "ينهي", "حرم", "تحريم", "حرام", "فساد", "باطل", "كراهه")
                ) and node["id"].startswith("usul.alfaz.nahy"):
                    _add(node["id"])
                # Inject umum sub-principles when umum/nafy is relevant
                if any(k in ans_norm for k in ("عموم", "عام", "نفي", "نكره", "استفصال")) and node[
                    "id"
                ].startswith("usul.alfaz.umum"):
                    _add(node["id"])

    return ordered


def make_excerpt(answer_text: str, max_chars: int) -> tuple[str, bool]:
    """Keeps the opening clause + causal clauses (verbatim segments joined by ' … ')."""
    if len(answer_text) <= max_chars:
        return answer_text, False
    spans = [
        (m.start(), m.end())
        for m in _CLAUSE_RE.finditer(answer_text)
        if len(m.group().strip()) > 12
    ]
    if not spans:
        return answer_text[:max_chars], True
    chosen: list[tuple[int, int]] = [spans[0]]
    budget = max_chars - (spans[0][1] - spans[0][0])
    for s, e in spans[1:]:
        norm_clause = normalize_arabic(answer_text[s:e])
        if any(h in norm_clause for h in _CAUSAL_CLAUSE_HINTS) and (e - s) <= budget:
            chosen.append((s, e))
            budget -= (e - s) + 3
    for s, e in spans[1:]:  # fill leftover budget with remaining clauses in order
        if (s, e) not in chosen and (e - s) <= budget:
            chosen.append((s, e))
            budget -= (e - s) + 3
    chosen.sort()
    return " … ".join(answer_text[s:e].strip() for s, e in chosen), True


# =============================================================================
# Resumable cache helpers
# =============================================================================
def _repair_trailing_partial_line(path: Path) -> None:
    """Truncates a half-written final line left by an interrupted append."""
    if not path.exists() or path.stat().st_size == 0:
        return
    with open(path, "rb+") as fh:
        fh.seek(-1, os.SEEK_END)
        if fh.read(1) == b"\n":
            return
        fh.seek(0)
        data = fh.read()
        cut = data.rfind(b"\n") + 1
        fh.truncate(cut)
        print(
            f"  ! Repaired truncated trailing line in {path.name} ({len(data) - cut} bytes dropped)."
        )


def read_extraction_records(path: Path | None = None) -> dict[str, dict]:
    """fatwa_id -> latest record (later lines win, so re-ingests override)."""
    path = path or EXTRACTIONS_PATH
    records: dict[str, dict] = {}
    if not path.exists():
        return records
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if isinstance(rec, dict) and rec.get("fatwa_id"):
                records[rec["fatwa_id"]] = rec
    return records


def _batch_files(batch_id: str, directory: Path | None = None) -> dict[str, Path]:
    directory = directory or JOBS_DIR
    return {
        "jobs": directory / f"{batch_id}.jobs.json",
        "prompt": directory / f"{batch_id}.prompt.md",
        "response": directory / f"{batch_id}.response.jsonl",
    }


def outstanding_batches() -> list[str]:
    if not JOBS_DIR.exists():
        return []
    return sorted(p.name[: -len(".jobs.json")] for p in JOBS_DIR.glob("batch_*.jobs.json"))


def _next_batch_number() -> int:
    nums = [0]
    for d in (JOBS_DIR, DONE_DIR):
        if d.exists():
            for p in d.glob("batch_*.jobs.json"):
                m = re.match(r"batch_(\d+)", p.name)
                if m:
                    nums.append(int(m.group(1)))
    return max(nums) + 1


def pending_fatwa_ids() -> set[str]:
    """Fatwas already exported into a batch that has not been ingested yet."""
    ids: set[str] = set()
    for b in outstanding_batches():
        jobs = json.loads(_batch_files(b)["jobs"].read_text(encoding="utf-8"))["jobs"]
        for job in jobs:
            ids.update(f["fatwa_id"] for f in job["fatwas"])
            ids.update(p["fatwa_id"] for p in job["propagate_to"])
    return ids


# =============================================================================
# Job building (cluster-first deduplication)
# =============================================================================
def build_jobs(
    corpus: Corpus,
    exclude_ids: set[str],
    max_fatwas_per_job: int = DEFAULT_MAX_FATWAS_PER_JOB,
    max_answer_chars: int = DEFAULT_MAX_ANSWER_CHARS,
    max_candidates: int = DEFAULT_MAX_CANDIDATES,
    chapters: set[str] | None = None,
    science: str | None = None,
) -> list[dict]:
    ontology = corpus.ontology
    by_cluster: dict[str, list[dict]] = {}
    for f in corpus.fatwas:  # preserves archive order -> deterministic jobs
        fid = f["id"]
        if fid not in corpus.eligible_ids or fid in exclude_ids:
            continue
        if chapters and f["topic_chapter"] not in chapters:
            continue
        if science == "usul" and not has_textual_proof_or_linguistic_markers(
            f.get("answer_text", ""), f["answer_norm"]
        ):
            continue
        by_cluster.setdefault(corpus.fatwa_to_cluster[fid], []).append(f)

    jobs: list[dict] = []
    for cluster_id, members in by_cluster.items():
        if len(members) <= max_fatwas_per_job:
            sent, propagate = members, []
        else:
            # Longest (most detailed) answer per scholar; propagate to the rest.
            reps: dict[str, dict] = {}
            for f in members:
                cur = reps.get(f["scholar_name"])
                if cur is None or len(f["answer_text"]) > len(cur["answer_text"]):
                    reps[f["scholar_name"]] = f
            sent = list(reps.values())
            sent_ids = {f["id"] for f in sent}
            propagate = [
                {"fatwa_id": f["id"], "representative_fatwa_id": reps[f["scholar_name"]]["id"]}
                for f in members
                if f["id"] not in sent_ids
            ]

        cand: list[str] = []
        for f in sent:
            for nid in candidate_subgraph_ids(f, ontology, max_candidates, science=science):
                if nid not in cand:
                    cand.append(nid)

        cluster = corpus.clusters_by_id[cluster_id]
        job_fatwas = []
        for f in sent:
            excerpt, is_excerpt = make_excerpt(f["answer_text"], max_answer_chars)
            q = f["question_text"]
            job_fatwas.append(
                {
                    "fatwa_id": f["id"],
                    "scholar_name": f["scholar_name"],
                    "topic_subtopic": f.get("topic_subtopic") or "",
                    "question_text": q
                    if len(q) <= DEFAULT_MAX_QUESTION_CHARS
                    else q[:DEFAULT_MAX_QUESTION_CHARS] + " …",
                    "answer_shown": excerpt,
                    "answer_is_excerpt": is_excerpt,
                }
            )
        jobs.append(
            {
                "job_id": f"job-{cluster_id}-{sent[0]['id']}",
                "cluster_id": cluster_id,
                "cluster_title": cluster["canonical_issue_title_ar"],
                "topic_chapter": cluster["topic_chapter"],
                "candidate_ids": cand,
                "fatwas": job_fatwas,
                "propagate_to": propagate,
            }
        )

    prio = {ch: i for i, ch in enumerate(CHAPTER_PRIORITY)}
    jobs.sort(key=lambda j: (prio.get(j["topic_chapter"], len(prio)), j["cluster_id"]))
    return jobs


def _rel_path(p: Path) -> str:
    try:
        return str(p.relative_to(ROOT_DIR))
    except ValueError:
        return str(p)


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // 3)  # rough: Arabic ≈ 3 chars/token


# =============================================================================
# Prompt rendering
# =============================================================================
PROMPT_INSTRUCTIONS = """\
# Ta'seel (تأصيل) Extraction Batch `{batch_id}`

You are a specialist in أصول الفقه and القواعد الفقهية. For **every fatwa** below, decide which
principles from the job's **candidate list** the scholar (ابن باز / ابن عثيمين) applies — explicitly
or *implicitly* — to derive the ruling, and write one JSON object per fatwa.

## Output
Write **`{response_path}`** — JSON Lines, exactly **one line per fatwa_id** ({n_fatwas} lines total,
every fatwa of every job, including each fatwa in multi-fatwa jobs). Each line must match this schema
(all keys required; use `null` where allowed):

```json
{schema}
```

Then validate and fix until it passes:
```bash
python3 pipeline/src/llm_batch_enrich.py check {batch_id}
```

## Rules
1. **principle_id** must be one of the job's `candidates` (see Ontology Reference), or `NEW_CANDIDATE`
   with a filled `proposed_new_dabit` when the scholar clearly applies a chapter ضابط missing from the
   ontology (parent_id must be an existing ID). Otherwise `proposed_new_dabit` is `null`.
2. **evidence_quote_ar** — copy an exact, contiguous substring (محل الشاهد) of the shown answer, ≤ 300
   characters, from a single segment (never across ` … `), no ellipses, no added/removed words.
3. **Do not force links.** If the answer is a plain ruling, narration, عقيدة/أدب exhortation, or merely
   cites a verse/hadith without active derivation, set `has_applicable_principle: false` and `invocations: []`.
   **Dalalat al-Alfaz exception:** when the answer derives an obligation, prohibition, invalidity, or generality
   from the linguistic construction of the quoted verse/hadith (e.g. an imperative implying obligation, negative particle
   governing an indefinite noun, or resolving a qualifier), link the applicable `usul.alfaz.*` principle.
4. **Routine proof guardrail:** never link `usul.adillah.ijma`, `usul.adillah.sunnah` or
   `usul.adillah.sunnah.khabar_wahid` when the scholar just cites consensus (بالإجماع) or a hadith as
   evidence for a ruling. Link them only when he discusses the *authority* of the proof itself
   (حجية الإجماع، خبر الواحد حجة …).
5. **Most specific node:** within one branch give only the deepest applicable node (e.g. the
   صلاة dabit rather than «اليقين لا يزول بالشك»). Distinct branches applying together
   (e.g. المشقة + الضرر) → list each one.
6. **invocation_type:** `explicit_verbatim` = canonical wording appears; `explicit_paraphrase` = an alias
   or clear rewording appears (set `matched_alias_id` if it is a listed alias); `implicit_application` =
   the reasoning applies the principle without stating it (`matched_alias_id: null`).
7. **application_explanation_ar:** 1–2 Arabic sentences on تحقيق المناط: how this principle yields the
   ruling in this specific question.
8. **difficulty:** `beginner` (the principle is stated/obvious), `intermediate` (clear implicit
   application), `advanced` (subtle تخريج, competing principles, or an usuli inference).
9. **confidence_score** 0–1, calibrated: ≥0.85 unmistakable, 0.6–0.85 sound reading, <0.6 → omit the link.

## Ontology Reference (nodes used in this batch)
`id` · parent · kind · canonical text — guardrail · aliases
{ontology_table}

## Jobs
"""


def render_prompt(
    batch_id: str, jobs: list[dict], ontology: OntologyGraph, response_path: str
) -> str:
    used: list[str] = []
    for job in jobs:
        for nid in job["candidate_ids"]:
            if nid not in used:
                used.append(nid)
    used.sort(key=lambda nid: (nid.split(".")[0], nid))

    rows = []
    for nid in used:
        n = ontology.nodes[nid]
        aliases = "; ".join(f"`{a['id']}` {a['alias_text_ar']}" for a in n["aliases_resolved"])
        guard = (n.get("matching_guardrail") or "").strip()
        rows.append(
            f"- `{nid}` · {n.get('parent_id') or '—'} · {n['kind']} · «{n['canonical_text_ar']}»"
            + (f" — {guard}" if guard else "")
            + (f" · aliases: {aliases}" if aliases else "")
        )

    n_fatwas = sum(len(j["fatwas"]) for j in jobs)
    parts = [
        PROMPT_INSTRUCTIONS.format(
            batch_id=batch_id,
            response_path=response_path,
            n_fatwas=n_fatwas,
            schema=json.dumps(FATWA_RESULT_SCHEMA, ensure_ascii=False, indent=1),
            ontology_table="\n".join(rows),
        )
    ]
    for i, job in enumerate(jobs, start=1):
        parts.append(
            f"### Job {i}/{len(jobs)} · {job['topic_chapter']} · {job['cluster_title']}\n"
            f"candidates: {', '.join('`' + c + '`' for c in job['candidate_ids'])}\n"
        )
        for f in job["fatwas"]:
            parts.append(
                f"#### fatwa_id: `{f['fatwa_id']}` · الشيخ {f['scholar_name']} · {f['topic_subtopic']}\n"
                f"**السؤال:** {f['question_text']}\n\n"
                f"**الجواب{' (مقتطف)' if f['answer_is_excerpt'] else ''}:** {f['answer_shown']}\n"
            )
    return "\n".join(parts)


# =============================================================================
# Validation (shared by `check`, `ingest` and compile_sqlite.py)
# =============================================================================
def schema_errors(obj: object) -> list[str]:
    errs: list[str] = []
    if not isinstance(obj, dict):
        return ["result is not a JSON object"]
    if not isinstance(obj.get("fatwa_id"), str):
        errs.append("fatwa_id must be a string")
    if not isinstance(obj.get("has_applicable_principle"), bool):
        errs.append("has_applicable_principle must be a boolean")
    invs = obj.get("invocations")
    if not isinstance(invs, list):
        return errs + ["invocations must be an array"]
    for i, inv in enumerate(invs):
        p = f"invocations[{i}]"
        if not isinstance(inv, dict):
            errs.append(f"{p} is not an object")
            continue
        for key in FATWA_RESULT_SCHEMA["properties"]["invocations"]["items"]["required"]:
            if key not in inv:
                errs.append(f"{p}.{key} is missing")
        for key in ("principle_id", "evidence_quote_ar", "application_explanation_ar"):
            if key in inv and (not isinstance(inv[key], str) or not inv[key].strip()):
                errs.append(f"{p}.{key} must be a non-empty string")
        if (
            "matched_alias_id" in inv
            and inv["matched_alias_id"] is not None
            and not isinstance(inv["matched_alias_id"], str)
        ):
            errs.append(f"{p}.matched_alias_id must be string or null")
        if "invocation_type" in inv and inv["invocation_type"] not in INVOCATION_TYPES:
            errs.append(f"{p}.invocation_type must be one of {INVOCATION_TYPES}")
        if "difficulty" in inv and inv["difficulty"] not in DIFFICULTIES:
            errs.append(f"{p}.difficulty must be one of {DIFFICULTIES}")
        cs = inv.get("confidence_score")
        if "confidence_score" in inv and (isinstance(cs, bool) or not isinstance(cs, (int, float))):
            errs.append(f"{p}.confidence_score must be a number")
        nd = inv.get("proposed_new_dabit")
        if nd is not None:
            if not isinstance(nd, dict):
                errs.append(f"{p}.proposed_new_dabit must be object or null")
            else:
                for key in (
                    "suggested_id",
                    "parent_id",
                    "science",
                    "kind",
                    "canonical_text_ar",
                    "summary_ar",
                ):
                    if not isinstance(nd.get(key), str) or not nd[key].strip():
                        errs.append(f"{p}.proposed_new_dabit.{key} must be a non-empty string")
                if nd.get("science") not in NEW_DABIT_SCIENCES:
                    errs.append(
                        f"{p}.proposed_new_dabit.science must be one of {NEW_DABIT_SCIENCES}"
                    )
                if nd.get("kind") not in NEW_DABIT_KINDS:
                    errs.append(f"{p}.proposed_new_dabit.kind must be one of {NEW_DABIT_KINDS}")
        if inv.get("principle_id") == NEW_CANDIDATE and not isinstance(nd, dict):
            errs.append(f"{p}: NEW_CANDIDATE requires proposed_new_dabit")
    return errs


def prune_to_most_specific(
    links: list[dict], ontology: OntologyGraph
) -> tuple[list[dict], list[dict]]:
    """§5.2: drop any link whose principle is an ancestor of another linked principle."""
    linked = {l["principle_id"] for l in links}
    covered: set[str] = set()
    for pid in linked:
        covered.update(ancestor_ids(ontology, pid))
    kept = [l for l in links if l["principle_id"] not in covered]
    dropped = [l for l in links if l["principle_id"] in covered]
    return kept, dropped


def validate_fatwa_response(
    response: dict,
    fatwa: dict,
    ontology: OntologyGraph,
    min_confidence: float = DEFAULT_MIN_CONFIDENCE,
) -> tuple[list[dict], list[dict], list[dict]]:
    """
    Applies the §5 guardrails to one schema-valid response.
    Returns (links, rejections, proposals). `links` are ready for `fatwa_principles`.
    """
    answer = fatwa["answer_text"]
    answer_norm = fatwa.get("answer_norm") or normalize_arabic(answer)
    links: list[dict] = []
    rejections: list[dict] = []
    proposals: list[dict] = []

    def _reject(inv: dict, reason: str) -> None:
        rejections.append(
            {
                "principle_id": inv.get("principle_id"),
                "reason": reason,
                "evidence_quote_ar": inv.get("evidence_quote_ar", "")[:120],
            }
        )

    for inv in response.get("invocations") or []:
        pid = inv["principle_id"]
        quote = locate_verbatim(inv["evidence_quote_ar"], answer)
        if quote is None:
            _reject(inv, "QUOTE_NOT_VERBATIM")
            continue
        conf = max(0.0, min(1.0, float(inv["confidence_score"])))

        if pid == NEW_CANDIDATE:
            nd = dict(inv["proposed_new_dabit"])
            proposals.append(
                {
                    **nd,
                    "fatwa_id": fatwa["id"],
                    "evidence_quote_ar": quote,
                    "application_explanation_ar": inv["application_explanation_ar"],
                    "confidence_score": conf,
                    "parent_exists": nd["parent_id"] in ontology.nodes,
                }
            )
            continue
        if pid not in ontology.nodes:
            _reject(inv, "UNKNOWN_PRINCIPLE_ID")
            continue
        if conf < min_confidence:
            _reject(inv, "BELOW_MIN_CONFIDENCE")
            continue
        markers = epistemic_markers_for(ontology, pid)
        if markers and not any(m in answer_norm for m in markers):
            _reject(inv, "ROUTINE_PROOF_CITATION")
            continue

        quote_norm = normalize_arabic(quote)
        # Structural linguistic marker verification for Dalalat al-Alfaz
        if pid.startswith("usul.alfaz.amr"):
            if not any(
                k in quote_norm or k in answer_norm
                for k in ("امر", "يامر", "وجوب", "واجب", "فرض", "فور", "افعل", "استحباب", "صارف")
            ):
                _reject(inv, "MISSING_AMR_LINGUISTIC_MARKER")
                continue
        elif pid.startswith("usul.alfaz.nahy"):
            if not any(
                k in quote_norm or k in answer_norm
                for k in (
                    "نهي",
                    "ينهي",
                    "حرم",
                    "تحريم",
                    "حرام",
                    "فساد",
                    "باطل",
                    "كراهه",
                    "مكروه",
                    " لا ",
                )
            ):
                _reject(inv, "MISSING_NAHY_LINGUISTIC_MARKER")
                continue
        elif pid == "usul.alfaz.umum.nakirah_nafy":
            if not any(
                k in quote_norm or k in answer_norm
                for k in (" لا ", " ما ", " لم ", " لن ", " ليس ", "نكره", "نفي")
            ):
                _reject(inv, "MISSING_NAFY_LINGUISTIC_MARKER")
                continue

        node = ontology.nodes[pid]
        alias_id = inv.get("matched_alias_id")
        alias_ids = {a["id"]: a for a in node["aliases_resolved"]}
        if alias_id not in alias_ids or alias_ids[alias_id]["alias_text_norm"] not in answer_norm:
            alias_id = None
        if alias_id is None:  # recover an alias that does appear verbatim
            alias_id = next(
                (a["id"] for a in node["aliases_resolved"] if a["alias_text_norm"] in answer_norm),
                None,
            )

        # Normalise invocation_type against what is actually present in the text.
        inv_type = inv["invocation_type"]
        if node["canonical_text_norm"] in answer_norm:
            inv_type = "explicit_verbatim"
        elif inv_type == "explicit_verbatim":
            inv_type = "explicit_paraphrase" if alias_id else "implicit_application"
        # An explicit_paraphrase without a catalogued alias is allowed (clear rewording).

        links.append(
            {
                "fatwa_id": fatwa["id"],
                "principle_id": pid,
                "matched_alias_id": alias_id,
                "invocation_type": inv_type,
                "evidence_quote_ar": quote,
                "application_explanation_ar": inv["application_explanation_ar"].strip(),
                "difficulty": inv["difficulty"],
                "confidence_score": round(conf, 2),
            }
        )

    # Duplicate principle within one fatwa -> keep highest confidence.
    best: dict[str, dict] = {}
    for l in links:
        if (
            l["principle_id"] not in best
            or l["confidence_score"] > best[l["principle_id"]]["confidence_score"]
        ):
            best[l["principle_id"]] = l
    links, dropped = prune_to_most_specific(list(best.values()), ontology)
    for l in dropped:
        rejections.append(
            {
                "principle_id": l["principle_id"],
                "reason": "SUPERSEDED_BY_MORE_SPECIFIC_NODE",
                "evidence_quote_ar": l["evidence_quote_ar"][:120],
            }
        )
    return links, rejections, proposals


def parse_response_file(path: Path) -> tuple[list[dict], list[str]]:
    """Accepts JSON Lines (preferred), a JSON array, or {"results": [...]}."""
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return [], []
    try:
        whole = json.loads(text)
        if isinstance(whole, list):
            return whole, []
        if isinstance(whole, dict) and isinstance(whole.get("results"), list):
            return whole["results"], []
        if isinstance(whole, dict):
            return [whole], []
    except json.JSONDecodeError:
        pass
    results, errors = [], []
    for ln, line in enumerate(text.splitlines(), start=1):
        line = line.strip()
        if not line:
            continue
        try:
            results.append(json.loads(line))
        except json.JSONDecodeError as exc:
            errors.append(f"line {ln}: invalid JSON ({exc.msg})")
    return results, errors


def evaluate_batch(
    batch_id: str,
    corpus_fatwas: dict[str, dict],
    ontology: OntologyGraph,
    directory: Path | None = None,
    min_confidence: float = DEFAULT_MIN_CONFIDENCE,
) -> dict:
    files = _batch_files(batch_id, directory)
    jobs = json.loads(files["jobs"].read_text(encoding="utf-8"))["jobs"]
    expected: dict[str, dict] = {}
    for job in jobs:
        for f in job["fatwas"]:
            expected[f["fatwa_id"]] = job

    report = {
        "batch_id": batch_id,
        "jobs": jobs,
        "expected": expected,
        "accepted": {},
        "errors": [],
        "warnings": [],
        "rejections": Counter(),
        "links": 0,
    }
    if not files["response"].exists():
        report["errors"].append(f"missing response file {files['response']}")
        return report

    results, parse_errs = parse_response_file(files["response"])
    report["errors"].extend(parse_errs)
    for res in results:
        fid = res.get("fatwa_id") if isinstance(res, dict) else None
        errs = schema_errors(res)
        if fid not in expected:
            report["errors"].append(f"{fid!r}: fatwa_id not in this batch")
            continue
        if errs:
            report["errors"].extend(f"{fid}: {e}" for e in errs)
            continue
        job = expected[fid]
        for inv in res["invocations"]:
            if (
                inv["principle_id"] not in job["candidate_ids"]
                and inv["principle_id"] != NEW_CANDIDATE
            ):
                report["warnings"].append(
                    f"{fid}: {inv['principle_id']} is outside the job's candidate list"
                )
        links, rejections, _ = validate_fatwa_response(
            res, corpus_fatwas[fid], ontology, min_confidence
        )
        for r in rejections:
            report["rejections"][r["reason"]] += 1
            if r["reason"] in ("QUOTE_NOT_VERBATIM", "UNKNOWN_PRINCIPLE_ID"):
                report["errors"].append(
                    f"{fid}: {r['reason']} for {r['principle_id']} «{r['evidence_quote_ar']}»"
                )
        if res["has_applicable_principle"] and not res["invocations"]:
            report["warnings"].append(
                f"{fid}: has_applicable_principle=true but invocations is empty"
            )
        report["links"] += len(links)
        report["accepted"][fid] = res
    missing = [fid for fid in expected if fid not in report["accepted"]]
    for fid in missing:
        if not any(e.startswith(f"{fid}:") for e in report["errors"]):
            report["errors"].append(f"{fid}: no result line")
    report["missing"] = missing
    return report


# =============================================================================
# Loading cached extractions for compile_sqlite.py
# =============================================================================
def load_llm_links(
    fatwas_by_id: dict[str, dict],
    ontology: OntologyGraph,
    path: Path | None = None,
    min_confidence: float = DEFAULT_MIN_CONFIDENCE,
) -> tuple[dict[str, list[dict]], dict, list[dict]]:
    """Re-validates every cached response. Returns (links_by_fatwa, stats, proposals)."""
    records = read_extraction_records(path)
    links_by_fatwa: dict[str, list[dict]] = {}
    proposals: list[dict] = []
    stats = {
        "records": len(records),
        "unknown_fatwa": 0,
        "fatwas_with_links": 0,
        "links": 0,
        "rejections": Counter(),
        "sources": Counter(),
    }
    for fid, rec in records.items():
        fatwa = fatwas_by_id.get(fid)
        if fatwa is None or schema_errors(rec.get("response")):
            stats["unknown_fatwa"] += 1
            continue
        stats["sources"][rec.get("source", "agent")] += 1
        links, rejections, props = validate_fatwa_response(
            rec["response"], fatwa, ontology, min_confidence
        )
        for r in rejections:
            stats["rejections"][r["reason"]] += 1
        if rec.get("source") != "cluster_propagation":
            proposals.extend(props)
        if links:
            links_by_fatwa[fid] = links
            stats["fatwas_with_links"] += 1
            stats["links"] += len(links)
    return links_by_fatwa, stats, proposals


def merge_fatwa_links(
    fatwa_id: str, deterministic: list[dict], llm: list[dict], ontology: OntologyGraph
) -> list[dict]:
    """
    Unions deterministic + LLM links for one fatwa (UNIQUE(fatwa_id, principle_id)).
    On overlap the string-verified deterministic invocation_type / alias win, while the
    agent's verbatim quote, تحقيق المناط explanation and difficulty replace the templates.
    Most-specific resolution is re-applied across the combined set.
    """
    merged: dict[str, dict] = {}
    for l in deterministic:
        merged[l["principle_id"]] = {**l, "difficulty": None, "extraction_method": "deterministic"}
    for l in llm:
        pid = l["principle_id"]
        if pid in merged:
            base = merged[pid]
            merged[pid] = {
                **base,
                "evidence_quote_ar": l["evidence_quote_ar"],
                "application_explanation_ar": l["application_explanation_ar"],
                "difficulty": l["difficulty"],
                "confidence_score": max(base["confidence_score"], l["confidence_score"]),
                "matched_alias_id": base["matched_alias_id"] or l["matched_alias_id"],
                "extraction_method": "hybrid",
            }
        else:
            merged[pid] = {**l, "extraction_method": "llm"}
    kept, _ = prune_to_most_specific(list(merged.values()), ontology)
    kept.sort(key=lambda l: (-ontology.nodes[l["principle_id"]]["depth"], l["principle_id"]))
    return [{**l, "id": f"fp-{fatwa_id}-{i}"} for i, l in enumerate(kept, start=1)]


# =============================================================================
# CLI commands
# =============================================================================
def _load_corpus(args) -> Corpus:
    print("Loading ontology, archives, clusters and deterministic baseline ...", flush=True)
    return Corpus(include_grounded=getattr(args, "include_grounded", False))


def cmd_plan(args) -> None:
    corpus = _load_corpus(args)
    processed = set(read_extraction_records())
    pending = pending_fatwa_ids()
    jobs = build_jobs(
        corpus,
        processed | pending,
        args.max_fatwas_per_job,
        args.max_answer_chars,
        args.max_candidates,
        set(args.chapter) if args.chapter else None,
        science=getattr(args, "science", None),
    )
    eligible_clusters = {corpus.fatwa_to_cluster[f] for f in corpus.eligible_ids}
    sent = sum(len(j["fatwas"]) for j in jobs)
    prop = sum(len(j["propagate_to"]) for j in jobs)
    chars = sum(len(f["answer_shown"]) + len(f["question_text"]) for j in jobs for f in j["fatwas"])
    by_chapter = Counter(j["topic_chapter"] for j in jobs)
    print(f"\nFatwas: {len(corpus.fatwas):,} | issue_clusters: {len(corpus.clusters):,}")
    for k, v in sorted(corpus.eligibility.items()):
        print(f"  • {k}: {v:,}")
    print(f"Eligible: {len(corpus.eligible_ids):,} fatwas in {len(eligible_clusters):,} clusters")
    print(
        f"Processed (in {EXTRACTIONS_PATH.name}): {len(processed):,} | pending in outstanding batches: {len(pending):,}"
    )
    print(
        f"Remaining: {len(jobs):,} jobs → {sent:,} fatwas sent + {prop:,} covered by cluster propagation"
    )
    print(
        f"  ≈ {_estimate_tokens('x' * chars):,} fatwa-text tokens "
        f"(~{(len(jobs) + args.jobs_per_batch - 1) // max(1, args.jobs_per_batch):,} batches of {args.jobs_per_batch})"
    )
    print(
        "  Jobs by chapter: "
        + ", ".join(f"{c}={n:,}" for c, n in sorted(by_chapter.items(), key=lambda x: -x[1]))
    )


def cmd_export(args) -> None:
    corpus = _load_corpus(args)
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    processed = set(read_extraction_records())
    pending = pending_fatwa_ids()
    jobs = build_jobs(
        corpus,
        processed | pending,
        args.max_fatwas_per_job,
        args.max_answer_chars,
        args.max_candidates,
        set(args.chapter) if args.chapter else None,
        science=getattr(args, "science", None),
    )
    if args.max_jobs:
        jobs = jobs[: args.max_jobs]
    if not jobs:
        print("Nothing to export: every eligible fatwa is processed or pending.")
        return
    batch_no = _next_batch_number()
    written = []
    for start in range(0, len(jobs), args.jobs_per_batch):
        chunk = jobs[start : start + args.jobs_per_batch]
        batch_id = f"batch_{batch_no:04d}"
        files = _batch_files(batch_id)
        meta = {
            "batch_id": batch_id,
            "created_at": datetime.now(UTC).isoformat(timespec="seconds"),
            "ontology_version": corpus.ontology.version,
            "jobs": chunk,
        }
        files["jobs"].write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
        prompt = render_prompt(batch_id, chunk, corpus.ontology, _rel_path(files["response"]))
        files["prompt"].write_text(prompt, encoding="utf-8")
        n_f = sum(len(j["fatwas"]) for j in chunk)
        written.append(batch_id)
        print(
            f"  ✓ {batch_id}: {len(chunk)} jobs, {n_f} fatwas, ~{_estimate_tokens(prompt):,} prompt tokens "
            f"→ {_rel_path(files['prompt'])}"
        )
        batch_no += 1
    print(f"Exported {len(written)} batch(es) covering {len(jobs):,} jobs.")


def _print_report(rep: dict, verbose_limit: int = 40) -> None:
    n_exp = len(rep["expected"])
    print(
        f"{rep['batch_id']}: {len(rep['accepted'])}/{n_exp} fatwas schema-valid, {rep['links']} links pass guardrails"
    )
    if rep["rejections"]:
        print(f"  rejections: {dict(rep['rejections'])}")
    for w in rep["warnings"][:verbose_limit]:
        print(f"  warn: {w}")
    for e in rep["errors"][:verbose_limit]:
        print(f"  ERROR: {e}")
    if len(rep["errors"]) > verbose_limit:
        print(f"  ... {len(rep['errors']) - verbose_limit} more errors")


def _resolve_batches(ids: list[str], all_flag: bool) -> list[str]:
    if all_flag:
        return [b for b in outstanding_batches() if _batch_files(b)["response"].exists()]
    out = []
    for b in ids:
        b = b if b.startswith("batch_") else f"batch_{int(b):04d}"
        if not _batch_files(b)["jobs"].exists():
            sys.exit(f"Unknown or already-ingested batch: {b}")
        out.append(b)
    return out


def _load_lightweight_fatwas() -> tuple[dict[str, dict], OntologyGraph]:
    """Answer texts only (no clustering / baseline) — enough for check & ingest."""
    ontology = OntologyGraph(ONTOLOGY_PATH)
    _, fatwas = load_full_archives(PIPELINE_DIR)
    return {f["id"]: f for f in fatwas}, ontology


def cmd_check(args) -> None:
    batches = _resolve_batches(args.batch, args.all)
    fatwas_by_id, ontology = _load_lightweight_fatwas()
    failed = False
    for b in batches:
        rep = evaluate_batch(b, fatwas_by_id, ontology)
        _print_report(rep)
        failed |= bool(rep["errors"])
    sys.exit(1 if failed else 0)


def cmd_ingest(args) -> None:
    batches = _resolve_batches(args.batch, args.all)
    if not batches:
        print("No outstanding batches with responses to ingest.")
        return
    fatwas_by_id, ontology = _load_lightweight_fatwas()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DONE_DIR.mkdir(parents=True, exist_ok=True)
    _repair_trailing_partial_line(EXTRACTIONS_PATH)
    processed = set(read_extraction_records())
    now = datetime.now(UTC).isoformat(timespec="seconds")
    total_new = 0

    for b in batches:
        rep = evaluate_batch(b, fatwas_by_id, ontology)
        _print_report(rep, verbose_limit=10)
        if rep["errors"] and not args.allow_partial:
            print(
                f"  ✗ {b} skipped: fix the errors (or pass --allow-partial to ingest valid lines "
                f"and re-export the rest later)."
            )
            continue
        new = 0
        with open(EXTRACTIONS_PATH, "a", encoding="utf-8") as out:

            def _append(rec: dict) -> None:
                out.write(json.dumps(rec, ensure_ascii=False) + "\n")
                out.flush()

            for job in rep["jobs"]:
                for jf in job["fatwas"]:
                    fid = jf["fatwa_id"]
                    res = rep["accepted"].get(fid)
                    if res is None or (fid in processed and not args.reingest):
                        continue
                    _append(
                        {
                            "fatwa_id": fid,
                            "source": "agent",
                            "representative_fatwa_id": None,
                            "cluster_id": job["cluster_id"],
                            "job_id": job["job_id"],
                            "batch_id": b,
                            "model": args.model,
                            "candidate_ids": job["candidate_ids"],
                            "response": res,
                            "ingested_at": now,
                        }
                    )
                    processed.add(fid)
                    new += 1
                for prop in job["propagate_to"]:
                    fid, rep_id = prop["fatwa_id"], prop["representative_fatwa_id"]
                    res = rep["accepted"].get(rep_id)
                    if res is None or (fid in processed and not args.reingest):
                        continue
                    derived = {**res, "fatwa_id": fid}
                    _append(
                        {
                            "fatwa_id": fid,
                            "source": "cluster_propagation",
                            "representative_fatwa_id": rep_id,
                            "cluster_id": job["cluster_id"],
                            "job_id": job["job_id"],
                            "batch_id": b,
                            "model": args.model,
                            "candidate_ids": job["candidate_ids"],
                            "response": derived,
                            "ingested_at": now,
                        }
                    )
                    processed.add(fid)
                    new += 1
        src = _batch_files(b)
        dst = _batch_files(b, DONE_DIR)
        for key in ("jobs", "prompt", "response"):
            if src[key].exists():
                src[key].replace(dst[key])
        total_new += new
        print(f"  ✓ {b}: appended {new} records → {_rel_path(EXTRACTIONS_PATH)}; moved to done/")
    print(
        f"Ingest complete: {total_new} new records ({len(processed):,} fatwas processed in total)."
    )


def cmd_status(args) -> None:
    records = read_extraction_records()
    src = Counter(r.get("source", "agent") for r in records.values())
    print(f"{_rel_path(EXTRACTIONS_PATH)}: {len(records):,} fatwas processed {dict(src)}")
    batches = outstanding_batches()
    if not batches:
        print("No outstanding batches. Run `export` to create more.")
    for b in batches:
        files = _batch_files(b)
        jobs = json.loads(files["jobs"].read_text(encoding="utf-8"))["jobs"]
        n_f = sum(len(j["fatwas"]) for j in jobs)
        if files["response"].exists():
            results, _ = parse_response_file(files["response"])
            state = f"response: {len(results)}/{n_f} lines"
        else:
            state = "awaiting response"
        print(f"  • {b}: {len(jobs)} jobs / {n_f} fatwas — {state}")
    done = sorted(DONE_DIR.glob("batch_*.jobs.json")) if DONE_DIR.exists() else []
    print(f"Ingested batches: {len(done)}")


def main(argv: Iterable[str] | None = None) -> None:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = ap.add_subparsers(dest="command", required=True)

    def _job_opts(p):
        p.add_argument(
            "--chapter", action="append", help="Restrict to topic_chapter (repeatable), e.g. Salat"
        )
        p.add_argument(
            "--include-grounded",
            action="store_true",
            help="Also send fatwas already grounded by the deterministic grounder",
        )
        p.add_argument("--jobs-per-batch", type=int, default=DEFAULT_JOBS_PER_BATCH)
        p.add_argument(
            "--max-fatwas-per-job",
            type=int,
            default=DEFAULT_MAX_FATWAS_PER_JOB,
            help="Clusters up to this size are sent whole; larger ones use representatives",
        )
        p.add_argument("--max-answer-chars", type=int, default=DEFAULT_MAX_ANSWER_CHARS)
        p.add_argument("--max-candidates", type=int, default=DEFAULT_MAX_CANDIDATES)
        p.add_argument(
            "--science",
            choices=["fiqh", "usul"],
            help="Filter jobs by science (e.g. usul for Dalalat al-Alfaz)",
        )

    p = sub.add_parser("plan", help="Show eligibility and remaining work")
    _job_opts(p)
    p.set_defaults(func=cmd_plan)

    p = sub.add_parser("export", help="Write new job batches for unprocessed fatwas")
    _job_opts(p)
    p.add_argument("--max-jobs", type=int, help="Export at most N jobs (e.g. for a pilot)")
    p.set_defaults(func=cmd_export)

    for name, func, help_ in (
        ("check", cmd_check, "Validate response file(s) without writing"),
        ("ingest", cmd_ingest, "Append validated responses to llm_extractions.jsonl"),
    ):
        p = sub.add_parser(name, help=help_)
        p.add_argument("batch", nargs="*", help="Batch ids, e.g. batch_0001 or 1")
        p.add_argument(
            "--all", action="store_true", help="All outstanding batches that have a response"
        )
        if name == "ingest":
            p.add_argument(
                "--model",
                default=os.environ.get("TASEEL_EXTRACTOR_MODEL", "coding-agent"),
                help="Label recorded with each extraction (env TASEEL_EXTRACTOR_MODEL)",
            )
            p.add_argument(
                "--allow-partial",
                action="store_true",
                help="Ingest valid lines even if the batch has errors; the rest get re-exported",
            )
            p.add_argument(
                "--reingest", action="store_true", help="Overwrite already-processed fatwas"
            )
        p.set_defaults(func=func)

    p = sub.add_parser("status", help="Show outstanding batches and progress")
    p.set_defaults(func=cmd_status)

    args = ap.parse_args(list(argv) if argv is not None else None)
    args.func(args)


if __name__ == "__main__":
    main()
