"""
Stage 3: 3-Step Hybrid Principle Extraction & Grounded Ontology Linker.
- Step 3A: Causal Span Extraction & Routine Proof Citation Filter
- Step 3B: High-Speed Hybrid Ontology Subgraph Retrieval (via OntologyGraph inverted index)
- Step 3C: Most-Specific Node Resolution & Multi-Principle Grounding
"""

import re

from arabic_norm import normalize_arabic, triage_fatwa_reasoning
from ontology_index import STOP_TOKENS, OntologyGraph

_CLAUSE_SPLIT_RE = re.compile(r"[.؛!؟\n]+")


def extract_causal_clauses(answer_text: str) -> list[str]:
    """
    Step 3A: Extracts causal clauses ('محل الشاهد') from a proofread Arabic fatwa answer.
    """
    clauses = [c.strip() for c in _CLAUSE_SPLIT_RE.split(answer_text) if len(c.strip()) > 12]
    causal_clauses = []
    for cl in clauses:
        triage = triage_fatwa_reasoning(cl)
        if triage["has_causal_reasoning"]:
            causal_clauses.append(cl)
    return causal_clauses


def _get_root_id(ontology: OntologyGraph, node_id: str) -> str:
    curr = ontology.nodes[node_id]
    while curr.get("parent_id"):
        curr = ontology.nodes[curr["parent_id"]]
    return curr["id"]


def extract_and_ground_fatwa(
    fatwa: dict,
    ontology: OntologyGraph,
    norm_question: str = "",
    norm_answer: str = "",
) -> dict[str, object]:
    """
    Runs the 3-Step Extraction & Grounding loop on a single Fatwa:
    1. Pre-triages & filters out routine proof citations (e.g. 'بالكتاب والسنة والإجماع').
    2. Extracts causal reasoning spans and retrieves the expanded Ontology Subgraph.
    3. Grounds each independent jurisprudential branch to the most specific applicable node
       (preferring deeper chapter Dawabit/Criteria when matched), while preserving
       multi-principle invocations across distinct root branches.
    """
    if not norm_answer:
        norm_answer = normalize_arabic(fatwa["answer_text"])
    if not norm_question:
        norm_question = normalize_arabic(fatwa["question_text"])

    triage = triage_fatwa_reasoning(fatwa["answer_text"], norm_text=norm_answer)
    if not triage["has_causal_reasoning"]:
        return {
            "fatwa_id": fatwa["id"],
            "skipped": True,
            "skip_reason": (
                "ROUTINE_PROOF_CITATION_ONLY"
                if triage["is_routine_citation_only"]
                else "NO_CAUSAL_PRINCIPLE_DETECTED"
            ),
            "grounded_links": [],
        }

    norm_subtopic = normalize_arabic(fatwa.get("topic_subtopic", ""))
    norm_query = f"{norm_subtopic} {norm_answer}"
    query_tokens: set[str] = {t for t in norm_query.split() if len(t) > 2 and t not in STOP_TOKENS}

    # Step 3B: High-speed inverted-index candidate subgraph retrieval
    candidates, _ = ontology.retrieve_candidate_subgraph_fast(
        norm_query, query_tokens, top_k_seeds=6
    )
    if not candidates:
        return {
            "fatwa_id": fatwa["id"],
            "skipped": True,
            "skip_reason": "NO_CANDIDATE_SUBGRAPH_MATCH",
            "grounded_links": [],
        }

    answer_tokens: set[str] = set(norm_answer.split())
    chapter = fatwa["topic_chapter"]

    # Step 3C: Score candidates within the subgraph & enforce Guardrails + Specificity
    qualified_by_root: dict[str, list[dict]] = {}

    for node in candidates:
        nid = node["id"]
        # Enforce Usul Guardrail on routine 'بالإجماع' or 'بالسنة' citations
        if nid.startswith("usul.adillah.ijma") and (
            "حجه قطعيه" not in norm_answer
            and "تحرم مخالفته" not in norm_answer
            and "يخرق" not in norm_answer
        ):
            continue
        if (
            (
                nid.startswith("usul.adillah.sunnah")
                and nid != "usul.adillah.sunnah.khabar_wahid.riwayat_sahabi"
            )
            and "خبر الواحد" not in norm_answer
            and "حديث الاحاد" not in norm_answer
        ):
            continue
        if nid == "usul.ahkam.ma_la_yatimmu_wajib" and (
            "ما لا يتم الواجب" not in norm_answer
            and "لا يتم الواجب الا" not in norm_answer
            and "وسيله الواجب" not in norm_answer
        ):
            continue
        if nid == "fiqh.yaqeen.baqaa":
            # Guardrail: Requires actual Istishab phrasing or doubt/certainty tension.
            # Pure mention of "بقاء" (e.g. بقاء النكاح as hikmah, or بقاء الأظافر) is NOT Istishab.
            has_istishab_phrase = any(
                p in norm_answer
                for p in (
                    "بقاء ما كان",
                    "استصحاب",
                    "استمرار الحكم",
                    "الاصل بقاء الطهاره",
                    "الاصل استمرار",
                    "يبني علي الاقل",
                    "يبني علي اليقين",
                )
            )
            has_doubt_context = any(
                d in norm_answer for d in ("شك", "الشك", "مشكوك", "ريب", "تردد", "تيقن", "اليقين")
            )
            if not (has_istishab_phrase or (has_doubt_context and "الاصل بقاء" in norm_answer)):
                continue

        matched_alias_id: str | None = None
        invocation_type = "implicit_application"
        match_strength = 0.0

        if node["canonical_text_norm"] in norm_answer:
            invocation_type = "explicit_verbatim"
            match_strength += 6.0

        for al in node["aliases_resolved"]:
            if al["alias_text_norm"] in norm_answer:
                matched_alias_id = al["id"]
                if invocation_type != "explicit_verbatim":
                    invocation_type = "explicit_paraphrase"
                match_strength += 5.5
                break

        distinctive_tokens = node["distinctive_tokens"]
        # Do not allow a single common token (len < 2) to trigger implicit matching by itself
        if distinctive_tokens and len(distinctive_tokens) >= 2:
            hits = sum(1 for t in distinctive_tokens if t in answer_tokens or t in norm_answer)
            token_ratio = hits / len(distinctive_tokens)
            if token_ratio >= 0.70:
                match_strength += token_ratio * 4.5

        if match_strength < 3.0:
            continue

        # Specificity bonus: when both a parent (depth=0/1) and its specific child dabit (depth=2)
        # match the fatwa, prefer the deeper, more specific node!
        chapter_bonus = 1.5 if node["domain_section"] == chapter else 0.0
        specificity_score = match_strength + (node["depth"] * 1.4) + chapter_bonus

        root_id = _get_root_id(ontology, nid)
        qualified_by_root.setdefault(root_id, []).append(
            {
                "node": node,
                "specificity_score": specificity_score,
                "matched_alias_id": matched_alias_id,
                "invocation_type": invocation_type,
            }
        )

    if not qualified_by_root:
        return {
            "fatwa_id": fatwa["id"],
            "skipped": True,
            "skip_reason": "BELOW_GROUNDING_THRESHOLD",
            "grounded_links": [],
        }

    # Only split clauses once we know the fatwa actually grounded at least one principle!
    raw_clauses = [
        c.strip() for c in _CLAUSE_SPLIT_RE.split(fatwa["answer_text"]) if len(c.strip()) > 12
    ]
    if not raw_clauses:
        raw_clauses = [fatwa["answer_text"][:220]]

    # Pick the most specific node per independent root branch (supports Multi-Principle fatwas!)
    grounded_links = []
    for idx, (_root_id, branch_hits) in enumerate(qualified_by_root.items(), start=1):
        branch_hits.sort(key=lambda x: (x["specificity_score"], x["node"]["depth"]), reverse=True)
        best = branch_hits[0]
        target_node = best["node"]

        # Find best evidence quote clause
        best_clause = raw_clauses[0]
        for cl in raw_clauses:
            norm_cl = normalize_arabic(cl)
            if any(tok in norm_cl for tok in target_node["distinctive_tokens"]):
                best_clause = cl
                break

        grounded_links.append(
            {
                "id": f"fp-{fatwa['id']}-{idx}",
                "fatwa_id": fatwa["id"],
                "principle_id": target_node["id"],
                "matched_alias_id": best["matched_alias_id"],
                "invocation_type": best["invocation_type"],
                "evidence_quote_ar": best_clause[:300],
                "application_explanation_ar": (
                    f"خرّج الشيخ {fatwa['scholar_name']} حكم المسألة ({fatwa.get('topic_subtopic', '')}) "
                    f"على «{target_node['canonical_text_ar']}» ({target_node['summary_ar']})"
                ),
                "confidence_score": round(min(0.99, 0.78 + best["specificity_score"] * 0.02), 2),
            }
        )

    return {
        "fatwa_id": fatwa["id"],
        "skipped": False,
        "candidate_subgraph_size": len(candidates),
        "grounded_links": grounded_links,
    }
