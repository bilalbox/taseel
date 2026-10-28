"""Golden contract tests for the unified Takhrij grounder (issue #9 seams)."""

from __future__ import annotations

from pathlib import Path

import pytest
from grounding import ground_fatwa
from llm_batch_enrich import merge_fatwa_links, validate_fatwa_response
from ontology_index import OntologyGraph

ONTOLOGY_PATH = Path(__file__).resolve().parents[1] / "seed" / "ontology.json"


@pytest.fixture(scope="module")
def ontology() -> OntologyGraph:
    return OntologyGraph(ONTOLOGY_PATH)


def _fatwa(
    fid: str,
    *,
    question: str,
    answer: str,
    chapter: str = "Taharah",
    subtopic: str = "",
    scholar: str = "ابن باز",
) -> dict:
    return {
        "id": fid,
        "fatwa_id": fid,
        "question_text": question,
        "answer_text": answer,
        "topic_chapter": chapter,
        "topic_subtopic": subtopic,
        "scholar_name": scholar,
    }


def test_skips_pregnant_divorce_hikmah_not_istishab(ontology: OntologyGraph) -> None:
    fatwa = _fatwa(
        "baz-2",
        question="امرأة تطلق وهي حامل فما الحكم؟",
        answer="بقاء النكاح مقصود للشارع في الجملة، والعدة واجبة.",
        chapter="Nikah",
    )
    res = ground_fatwa(fatwa, ontology)
    assert res.skipped is True
    assert res.skip_reason == "HIKMAH_NOT_ISTISHAB"
    assert res.invocations == ()


def test_skips_nail_trimming_permanence_pattern(ontology: OntologyGraph) -> None:
    fatwa = _fatwa(
        "baz-430",
        question="هل تقليم الأظافر من الفطرة؟",
        answer="تقليم الاظافر من الفطره ويستحب بقائه على النظافة.",
        chapter="Taharah",
    )
    res = ground_fatwa(fatwa, ontology)
    assert res.skipped is True
    assert res.skip_reason == "NAIL_TRIMMING_PERMANENCE"


def test_explicit_yaqeen_maxim_links_and_fills_template(ontology: OntologyGraph) -> None:
    fatwa = _fatwa(
        "golden-yaqeen-1",
        question="شككت في الحدث بعد الوضوء",
        answer=(
            "من تيقن الطهارة وشك في الحدث فلا يلتفت إلى الشك؛ "
            "لأن اليقين لا يزول بالشك، فيبني على طهارته."
        ),
        chapter="Taharah",
    )
    res = ground_fatwa(fatwa, ontology)
    assert res.skipped is False
    ids = {inv.principle_id for inv in res.invocations}
    assert "fiqh.yaqeen" in ids or "fiqh.yaqeen.baqaa.taharah" in ids
    for inv in res.invocations:
        assert inv.evidence_quote_ar
        assert inv.evidence_quote_ar in fatwa["answer_text"]
        assert inv.application_explanation_ar.strip()
        assert inv.confidence_score > 0


def test_dabit_supersedes_ancestor_yaqeen(ontology: OntologyGraph) -> None:
    fatwa = _fatwa(
        "golden-taharah-dabit",
        question="تيقنت الطهارة ثم شككت",
        answer=(
            "إذا تيقن الطهاره وشك في الحدث فهو على طهارته؛ "
            "لأن اليقين لا يزول بالشك، والأصل بقاء الطهاره."
        ),
        chapter="Taharah",
    )
    res = ground_fatwa(fatwa, ontology)
    assert res.skipped is False
    ids = [inv.principle_id for inv in res.invocations]
    # Most-specific under the yaqeen root should win over bare kubra when both match.
    assert "fiqh.yaqeen.baqaa.taharah" in ids
    assert "fiqh.yaqeen" not in ids


def test_candidate_ids_restriction_honoured(ontology: OntologyGraph) -> None:
    fatwa = _fatwa(
        "golden-restrict",
        question="ما حكم الشك في الطهارة؟",
        answer="اليقين لا يزول بالشك فيبني على اليقين.",
        chapter="Taharah",
    )
    open_res = ground_fatwa(fatwa, ontology)
    assert open_res.skipped is False
    assert any(inv.principle_id.startswith("fiqh.yaqeen") for inv in open_res.invocations)

    closed = ground_fatwa(
        fatwa,
        ontology,
        candidate_ids=["usul.alfaz.amr_wujub"],
    )
    assert closed.skipped is True


def test_usul_ijma_routine_citation_not_linked(ontology: OntologyGraph) -> None:
    fatwa = _fatwa(
        "golden-ijma-routine",
        question="ما حكم كذا؟",
        answer="هذا محرم بالكتاب والسنة والإجماع بلا خلاف.",
        chapter="Aqidah",
    )
    res = ground_fatwa(fatwa, ontology, candidate_ids=["usul.adillah.ijma"])
    assert res.skipped is True or all(
        inv.principle_id != "usul.adillah.ijma" for inv in res.invocations
    )


def test_validate_rejects_routine_ijma_without_epistemic_markers(
    ontology: OntologyGraph,
) -> None:
    fatwa = _fatwa(
        "golden-validate-ijma",
        question="ما حكم كذا؟",
        answer="أجمع العلماء على تحريم هذا الفعل كما في كتب الفقه.",
        chapter="Aqidah",
    )
    response = {
        "fatwa_id": fatwa["id"],
        "has_applicable_principle": True,
        "invocations": [
            {
                "principle_id": "usul.adillah.ijma",
                "matched_alias_id": None,
                "invocation_type": "implicit_application",
                "evidence_quote_ar": "أجمع العلماء على تحريم هذا الفعل",
                "application_explanation_ar": "استند إلى الإجماع.",
                "difficulty": "advanced",
                "confidence_score": 0.9,
                "proposed_new_dabit": None,
            }
        ],
    }
    links, rejections, _ = validate_fatwa_response(response, fatwa, ontology)
    assert links == []
    assert any(r["reason"] == "ROUTINE_PROOF_CITATION" for r in rejections)


def test_merge_llm_overwrites_explanation_keeps_det_invocation_type(
    ontology: OntologyGraph,
) -> None:
    det = [
        {
            "fatwa_id": "f1",
            "principle_id": "fiqh.yaqeen",
            "matched_alias_id": "al.yaqeen.1",
            "invocation_type": "explicit_verbatim",
            "evidence_quote_ar": "اليقين لا يزول بالشك",
            "application_explanation_ar": "قالب حتمي مختصر.",
            "confidence_score": 0.9,
        }
    ]
    llm = [
        {
            "fatwa_id": "f1",
            "principle_id": "fiqh.yaqeen",
            "matched_alias_id": None,
            "invocation_type": "implicit_application",
            "evidence_quote_ar": "اليقين لا يزول بالشك في هذه الواقعة",
            "application_explanation_ar": "شرح تحقيق المناط من الوكيل أغنى وأدق.",
            "difficulty": "beginner",
            "confidence_score": 0.95,
        }
    ]
    merged = merge_fatwa_links("f1", det, llm, ontology)
    assert len(merged) == 1
    row = merged[0]
    assert row["extraction_method"] == "hybrid"
    assert row["invocation_type"] == "explicit_verbatim"
    assert row["matched_alias_id"] == "al.yaqeen.1"
    assert row["application_explanation_ar"].startswith("شرح تحقيق")
    assert row["difficulty"] == "beginner"


def test_multi_principle_distinct_roots(ontology: OntologyGraph) -> None:
    fatwa = _fatwa(
        "golden-multi-root",
        question="عقد فيه ضرر ومشقة",
        answer=(
            "يحرم هذا العقد لأن الضرر يزال، وأيضاً المشقه تجلب التيسير "
            "فيرخص عند الحرج الشديد."
        ),
        chapter="Muamalat",
    )
    res = ground_fatwa(fatwa, ontology)
    assert res.skipped is False
    roots = set()
    for inv in res.invocations:
        pid = inv.principle_id
        if pid.startswith("fiqh.darar"):
            roots.add("darar")
        if pid.startswith("fiqh.mashaqqah"):
            roots.add("mashaqqah")
    assert roots == {"darar", "mashaqqah"}


def test_baqaa_explicit_verbatim(ontology: OntologyGraph) -> None:
    fatwa = _fatwa(
        "golden-baqaa",
        question="شك في زوال الحالة السابقة",
        answer="الأصل بقاء ما كان على ما كان حتى يثبت المغير بيقين.",
        chapter="Mutafarriqat",
    )
    res = ground_fatwa(fatwa, ontology)
    assert res.skipped is False
    inv = next(i for i in res.invocations if i.principle_id == "fiqh.yaqeen.baqaa")
    assert inv.invocation_type == "explicit_verbatim"
    assert "بقاء ما كان" in inv.evidence_quote_ar or inv.evidence_quote_ar in fatwa["answer_text"]


def test_usuli_dalalat_al_alfaz_grounding(ontology: OntologyGraph) -> None:
    fatwa = _fatwa(
        "golden-usul-amr-fawr",
        question="هل الحج واجب على الفور؟",
        answer="يجب الحج على الفور لأن الأمر يقتضي الفور والمبادرة ولا يجوز التراخي.",
        chapter="Hajj",
    )
    res = ground_fatwa(fatwa, ontology)
    assert res.skipped is False
    assert any(i.principle_id == "usul.alfaz.amr.fawr" for i in res.invocations)


def test_dual_fiqh_and_usul_grounding(ontology: OntologyGraph) -> None:
    fatwa = _fatwa(
        "golden-dual-taharah",
        question="ما حكم الشك في نقض الوضوء بلحم الإبل؟",
        answer=(
            "الأصل بقاء الطهارة فلا ينتقض بيقين الشك، ولكن إذا تيقن أكل لحم الإبل "
            "وجب عليه الوضوء لأن النبي صلى الله عليه وسلم أمر بذلك والأصل في الأمر الوجوب."
        ),
        chapter="Taharah",
    )
    res = ground_fatwa(fatwa, ontology)
    assert res.skipped is False
    pids = {i.principle_id for i in res.invocations}
    assert "fiqh.yaqeen.baqaa.taharah" in pids
    assert "usul.alfaz.amr_wujub" in pids


def test_validation_rejects_missing_usul_markers(ontology: OntologyGraph) -> None:
    fatwa = _fatwa(
        "f-usul-invalid",
        question="سؤال عام",
        answer="ذهب أهل العلم إلى جواز الصلاة جالسا للعاجز.",
        chapter="Salat",
    )
    # Attempting to link amr_wujub to an answer that has no amr linguistic markers
    resp = {
        "fatwa_id": "f-usul-invalid",
        "has_applicable_principle": True,
        "invocations": [
            {
                "principle_id": "usul.alfaz.amr_wujub",
                "matched_alias_id": None,
                "invocation_type": "implicit_application",
                "evidence_quote_ar": "ذهب أهل العلم",
                "application_explanation_ar": "استنباط خاطئ غير مدعوم بالنص.",
                "difficulty": "intermediate",
                "confidence_score": 0.9,
                "proposed_new_dabit": None,
            }
        ],
    }
    links, rejections, _ = validate_fatwa_response(resp, fatwa, ontology)
    assert len(links) == 0
    assert any(r["reason"] == "MISSING_AMR_LINGUISTIC_MARKER" for r in rejections)

