"""
Unified deterministic Takhrij grounder.

Single public seam: ``ground_fatwa(fatwa, ontology, *, candidate_ids=None)``.
Matching rules, epistemic markers, and explanation templates live on ontology
Principle nodes; callers must not depend on internal scoring structures.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from typing import Any

from arabic_norm import normalize_arabic, triage_fatwa_reasoning
from ontology_index import STOP_TOKENS, OntologyGraph
from verbatim import locate_verbatim

_CLAUSE_SPLIT_RE = re.compile(r"[.؛!؟\n]+")

SKIP_ROUTINE = "ROUTINE_PROOF_CITATION_ONLY"
SKIP_NO_CAUSAL = "NO_CAUSAL_PRINCIPLE_DETECTED"
SKIP_NO_CANDIDATES = "NO_CANDIDATE_SUBGRAPH_MATCH"
SKIP_NO_APPLICABLE = "NO_APPLICABLE_PRINCIPLE"


@dataclass(frozen=True)
class GroundingInvocation:
    principle_id: str
    matched_alias_id: str | None
    invocation_type: str
    evidence_quote_ar: str
    application_explanation_ar: str
    confidence_score: float
    difficulty: str | None = None


@dataclass(frozen=True)
class GroundingResult:
    fatwa_id: str
    skipped: bool
    skip_reason: str | None
    invocations: tuple[GroundingInvocation, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "fatwa_id": self.fatwa_id,
            "skipped": self.skipped,
            "skip_reason": self.skip_reason,
            "invocations": [asdict(inv) for inv in self.invocations],
            # Compatibility with Stage 3 / Corpus consumers that still read grounded_links.
            "grounded_links": [
                {
                    "id": f"fp-{self.fatwa_id}-{i}",
                    "fatwa_id": self.fatwa_id,
                    "principle_id": inv.principle_id,
                    "matched_alias_id": inv.matched_alias_id,
                    "invocation_type": inv.invocation_type,
                    "evidence_quote_ar": inv.evidence_quote_ar,
                    "application_explanation_ar": inv.application_explanation_ar,
                    "confidence_score": inv.confidence_score,
                }
                for i, inv in enumerate(self.invocations, start=1)
            ],
        }

    def to_fatwa_result(self) -> dict[str, Any]:
        """FATWA_RESULT_SCHEMA shape for chapter / batch response writers."""
        return {
            "fatwa_id": self.fatwa_id,
            "has_applicable_principle": not self.skipped and bool(self.invocations),
            "invocations": [
                {
                    "principle_id": inv.principle_id,
                    "matched_alias_id": inv.matched_alias_id,
                    "invocation_type": inv.invocation_type,
                    "evidence_quote_ar": inv.evidence_quote_ar,
                    "application_explanation_ar": inv.application_explanation_ar,
                    "difficulty": inv.difficulty or "intermediate",
                    "confidence_score": inv.confidence_score,
                    "proposed_new_dabit": None,
                }
                for inv in self.invocations
            ],
        }


def ground_fatwa(
    fatwa: dict,
    ontology: OntologyGraph,
    *,
    candidate_ids: list[str] | None = None,
) -> GroundingResult:
    """
    Deterministically ground one Fatwa onto Ontology Principles.

    When ``candidate_ids`` is omitted the module retrieves its own candidate
    subgraph; when provided, linking is restricted to that set.
    """
    fid = _fatwa_id(fatwa)
    answer = fatwa.get("answer_shown") or fatwa["answer_text"]
    full_answer = fatwa.get("answer_text") or answer
    question = fatwa.get("question_text") or ""

    norm_answer = fatwa.get("answer_norm") or normalize_arabic(answer)
    # Prefer full-answer norm when the shown slice differs (chapter jobs).
    norm_full = normalize_arabic(full_answer) if full_answer != answer else norm_answer
    norm_question = fatwa.get("question_norm") or normalize_arabic(question)
    combined_norm = f"{norm_question} {norm_full}"

    skip = _match_grounding_skips(
        ontology, fid=fid, norm_question=norm_question, norm_answer=norm_full
    )
    if skip:
        return GroundingResult(fid, True, skip, ())

    triage = triage_fatwa_reasoning(full_answer, norm_text=norm_full)
    if not triage["has_causal_reasoning"]:
        reason = SKIP_ROUTINE if triage["is_routine_citation_only"] else SKIP_NO_CAUSAL
        return GroundingResult(fid, True, reason, ())

    if candidate_ids is None:
        candidates = _retrieve_candidates(fatwa, ontology, norm_full)
        if not candidates:
            return GroundingResult(fid, True, SKIP_NO_CANDIDATES, ())
        cand_ids = [n["id"] for n in candidates]
    else:
        cand_ids = [cid for cid in candidate_ids if cid in ontology.nodes]
        if not cand_ids:
            return GroundingResult(fid, True, SKIP_NO_CANDIDATES, ())

    chapter = fatwa.get("topic_chapter") or ""
    clauses = [c.strip() for c in _CLAUSE_SPLIT_RE.split(answer) if len(c.strip()) > 10]
    if not clauses:
        clauses = [answer[:280]] if answer else [full_answer[:280]]

    hits: list[dict[str, Any]] = []
    for pid in cand_ids:
        node = ontology.nodes[pid]
        match = node.get("match")
        if not match:
            continue
        ctx_text = combined_norm if match.get("context") == "combined" else norm_full
        if not _match_applies(match, ctx_text, node):
            continue
        quote = _find_quote(match, clauses, full_answer, node, norm_full)
        if not quote:
            continue
        inv_type = _resolve_invocation_type(node, norm_full)
        alias_id = _resolve_alias(match, node, norm_full)
        explanation = _fill_template(node, fatwa)
        hits.append(
            {
                "node": node,
                "matched_alias_id": alias_id,
                "invocation_type": inv_type,
                "evidence_quote_ar": quote,
                "application_explanation_ar": explanation,
                "confidence_score": float(match.get("confidence", 0.9)),
                "difficulty": match.get("difficulty"),
                "specificity_score": _specificity_score(node, chapter, inv_type),
            }
        )

    if not hits:
        return GroundingResult(fid, True, SKIP_NO_APPLICABLE, ())

    selected = _most_specific_per_root(hits, ontology)
    if not selected:
        return GroundingResult(fid, True, SKIP_NO_APPLICABLE, ())

    invocations = tuple(
        GroundingInvocation(
            principle_id=h["node"]["id"],
            matched_alias_id=h["matched_alias_id"],
            invocation_type=h["invocation_type"],
            evidence_quote_ar=h["evidence_quote_ar"],
            application_explanation_ar=h["application_explanation_ar"],
            confidence_score=round(h["confidence_score"], 2),
            difficulty=h["difficulty"],
        )
        for h in selected
    )
    return GroundingResult(fid, False, None, invocations)


def epistemic_markers_for(ontology: OntologyGraph, principle_id: str) -> list[str]:
    """Normalized epistemic markers declared on a Principle (shared with validate)."""
    node = ontology.nodes.get(principle_id)
    if not node:
        return []
    return list(node.get("epistemic_markers_norm") or [])


def _fatwa_id(fatwa: dict) -> str:
    return str(fatwa.get("id") or fatwa["fatwa_id"])


def _match_grounding_skips(
    ontology: OntologyGraph, *, fid: str, norm_question: str, norm_answer: str
) -> str | None:
    for rule in ontology.grounding_skips:
        if fid in rule.get("fatwa_ids", []):
            return rule["skip_reason"]
        q_any = rule.get("question_any_norm") or []
        a_any = rule.get("answer_any_norm") or []
        a_all = rule.get("answer_all_norm") or []
        if a_all and all(m in norm_answer for m in a_all):
            return rule["skip_reason"]
        if (
            q_any
            and a_any
            and any(m in norm_question for m in q_any)
            and any(m in norm_answer for m in a_any)
        ):
            return rule["skip_reason"]
    return None


def _retrieve_candidates(fatwa: dict, ontology: OntologyGraph, norm_answer: str) -> list[dict]:
    norm_subtopic = fatwa.get("subtopic_norm") or normalize_arabic(
        fatwa.get("topic_subtopic") or ""
    )
    norm_query = f"{norm_subtopic} {norm_answer}"
    query_tokens = {t for t in norm_query.split() if len(t) > 2 and t not in STOP_TOKENS}
    candidates, _ = ontology.retrieve_candidate_subgraph_fast(
        norm_query, query_tokens, top_k_seeds=6
    )
    # Always include chapter dawabit + kubra so declarative rules can fire even when
    # inverted-index retrieval misses the seed.
    chapter = fatwa.get("topic_chapter")
    by_id = {n["id"]: n for n in candidates}
    for node in ontology.nodes.values():
        if node.get("match") and (
            node["domain_section"] == chapter
            or node.get("kind") == "qa_idah_kubra"
            or (
                node.get("science") == "usul"
                and node.get("domain_section") == "دلالات الألفاظ"
                and node.get("kind") == "asl_kulli"
            )
        ):
            by_id.setdefault(node["id"], node)
    # Also include every node that has match metadata and whose distinctive tokens
    # or require markers could appear — keep the candidate pool to nodes with match.
    for node in ontology.nodes.values():
        if node.get("match") and node["id"] not in by_id:
            # Cheap gate: any require marker token overlapping answer → include
            markers = _all_require_markers(node["match"])
            if any(m in norm_answer for m in markers):
                by_id[node["id"]] = node
    return list(by_id.values())


def _pattern_markers(pattern: dict) -> list[str]:
    out: list[str] = []
    out.extend(pattern.get("require_any_norm") or pattern.get("require_any") or [])
    out.extend(pattern.get("require_all_norm") or pattern.get("require_all") or [])
    for g in pattern.get("require_groups_norm") or pattern.get("require_groups") or []:
        out.extend(g.get("any") or [])
    return out


def _all_require_markers(match: dict) -> list[str]:
    alternatives = match.get("any_of_norm") or match.get("any_of")
    if alternatives:
        out: list[str] = []
        for alt in alternatives:
            out.extend(_pattern_markers(alt))
        return out
    return _pattern_markers(match)


def _pattern_applies(pattern: dict, ctx_text: str) -> bool:
    """True when one alternative pattern's require_* constraints hold."""
    require_any = pattern.get("require_any_norm") or pattern.get("require_any") or []
    require_all = pattern.get("require_all_norm") or pattern.get("require_all") or []
    groups = pattern.get("require_groups_norm") or pattern.get("require_groups") or []
    has_constraint = bool(require_any or require_all or groups)
    if not has_constraint:
        return False
    if require_any and not any(m in ctx_text for m in require_any):
        return False
    if require_all and not all(m in ctx_text for m in require_all):
        return False
    for g in groups:
        markers = g.get("any") or []
        if markers and not any(m in ctx_text for m in markers):
            return False
    return True


def _match_applies(match: dict, ctx_text: str, node: dict) -> bool:
    forbid = match.get("forbid_any_norm") or match.get("forbid_any") or []
    if any(m in ctx_text for m in forbid):
        return False

    epistemic = node.get("epistemic_markers_norm") or []
    if epistemic and not any(m in ctx_text for m in epistemic):
        return False

    alternatives = match.get("any_of_norm") or match.get("any_of")
    if alternatives:
        return any(_pattern_applies(alt, ctx_text) for alt in alternatives)

    if _pattern_applies(match, ctx_text):
        return True
    # Epistemic-only Principles (Usul adillah): markers alone are the positive gate.
    return bool(epistemic)


def _find_quote(
    match: dict,
    clauses: list[str],
    full_answer: str,
    node: dict,
    norm_answer: str,
) -> str | None:
    quote_markers = match.get("quote_any_norm") or match.get("quote_any") or []
    if not quote_markers:
        quote_markers = _all_require_markers(match)
    for clause in clauses:
        nc = normalize_arabic(clause)
        if any(m in nc for m in quote_markers):
            cleaned = _clean_quote(clause, full_answer)
            if cleaned:
                return cleaned
    # Fall back: canonical / alias span if present verbatim in the answer.
    if node["canonical_text_norm"] in norm_answer:
        loc = locate_verbatim(node["canonical_text_ar"], full_answer)
        if loc and len(loc) <= 300:
            return loc
    for al in node["aliases_resolved"]:
        if al["alias_text_norm"] in norm_answer:
            loc = locate_verbatim(al["alias_text_ar"], full_answer)
            if loc and len(loc) <= 300:
                return loc
    return None


def _clean_quote(quote: str, answer_text: str) -> str | None:
    if not quote:
        return None
    if len(quote) > 280:
        parts = [p.strip() for p in _CLAUSE_SPLIT_RE.split(quote) if len(p.strip()) > 8]
        for p in parts:
            if len(p) <= 280:
                loc = locate_verbatim(p, answer_text)
                if loc:
                    return loc
    loc = locate_verbatim(quote, answer_text)
    if loc and len(loc) <= 300:
        return loc
    return None


def _resolve_invocation_type(node: dict, norm_answer: str) -> str:
    """Derive invocation typing from what actually appears in the answer text."""
    if node["canonical_text_norm"] in norm_answer:
        return "explicit_verbatim"
    for al in node["aliases_resolved"]:
        if al["alias_text_norm"] in norm_answer:
            return "explicit_paraphrase"
    return "implicit_application"


def _resolve_alias(match: dict, node: dict, norm_answer: str) -> str | None:
    preferred = match.get("preferred_alias_id")
    alias_by_id = {a["id"]: a for a in node["aliases_resolved"]}
    if preferred and preferred in alias_by_id:
        al = alias_by_id[preferred]
        if al["alias_text_norm"] in norm_answer:
            return preferred
    for al in node["aliases_resolved"]:
        if al["alias_text_norm"] in norm_answer:
            return al["id"]
    return preferred if preferred in alias_by_id else None


def _fill_template(node: dict, fatwa: dict) -> str:
    template = node.get("explanation_template_ar") or (
        "خرّج الشيخ الحكم على «{canonical_text_ar}» ({summary_ar})."
    )
    return template.format(
        canonical_text_ar=node["canonical_text_ar"],
        summary_ar=node["summary_ar"],
        scholar_name=fatwa.get("scholar_name") or "الشيخ",
        topic_subtopic=fatwa.get("topic_subtopic") or "",
    )


def _specificity_score(node: dict, chapter: str, inv_type: str) -> float:
    type_bonus = {
        "explicit_verbatim": 3.0,
        "explicit_paraphrase": 2.0,
        "implicit_application": 1.0,
    }.get(inv_type, 1.0)
    chapter_bonus = 1.5 if node.get("domain_section") == chapter else 0.0
    return type_bonus + (node.get("depth", 0) * 1.4) + chapter_bonus


def _root_id(ontology: OntologyGraph, node_id: str) -> str:
    curr = ontology.nodes[node_id]
    while curr.get("parent_id"):
        curr = ontology.nodes[curr["parent_id"]]
    return curr["id"]


def _most_specific_per_root(hits: list[dict], ontology: OntologyGraph) -> list[dict]:
    by_root: dict[str, list[dict]] = {}
    for h in hits:
        rid = _root_id(ontology, h["node"]["id"])
        by_root.setdefault(rid, []).append(h)
    selected: list[dict] = []
    for branch in by_root.values():
        branch.sort(
            key=lambda x: (x["specificity_score"], x["node"]["depth"]),
            reverse=True,
        )
        selected.append(branch[0])
    selected.sort(key=lambda x: (-x["node"]["depth"], x["node"]["id"]))
    return selected
