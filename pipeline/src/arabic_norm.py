"""
Arabic text normalization and Stage 1 causal reasoning pre-triage.
Maintains exact parity with frontend `src/utils/arabic.ts`.
"""

import re

_DIACRITICS_RE = re.compile(r"[\u064B-\u065F\u0670]")
_TATWEEL_RE = re.compile(r"\u0640")
_ALEF_RE = re.compile(r"[أإآٱ]")
_TAA_MARBUTA_RE = re.compile(r"ة")
_ALIF_MAQSURA_RE = re.compile(r"ى")
_HAMZA_CARRIER_RE = re.compile(r"[ؤئ]")
_WHITESPACE_RE = re.compile(r"\s+")
_PUNCT_RE = re.compile(r"[^\w\s\u0600-\u06FF]")


def normalize_arabic(text: str) -> str:
    """Strip diacritics/tatweel and unify Alefs, Taa Marbuta, Yaa, and Hamzas."""
    if not text:
        return ""
    res = _DIACRITICS_RE.sub("", text)
    res = _TATWEEL_RE.sub("", res)
    res = _ALEF_RE.sub("ا", res)
    res = _TAA_MARBUTA_RE.sub("ه", res)
    res = _ALIF_MAQSURA_RE.sub("ي", res)
    res = _HAMZA_CARRIER_RE.sub("ء", res)
    res = _PUNCT_RE.sub(" ", res)
    res = _WHITESPACE_RE.sub(" ", res)
    return res.strip()


# Causal & methodological markers in classical Arabic fatwa reasoning
CAUSAL_MARKERS: list[str] = [
    "لان",
    "لاجل",
    "الاصل",
    "القاعده",
    "بناء علي",
    "يقين",
    "الشك",
    "مشقه",
    "التيسير",
    "الضرر",
    "الضروره",
    "الضرورات",
    "المقاصد",
    "بالنيات",
    "العبره",
    "العاده",
    "العرف",
    "التابع",
    "المفاسد",
    "المصالح",
    "الذراىع",
    "الاكراه",
    "مكره",
    "الناسي",
    "النسيان",
    "الجاهل",
    "الوجوب",
    "الفور",
    "الفساد",
    "البطلان",
    "المطلق",
    "المقيد",
    "اجتهاد",
    "الغالب",
    "النادر",
    "الحيل",
    "الغرم",
    "الضمان",
    "شروطهم",
    "عموم اللفظ",
    "خصوص السبب",
    "توقيف",
    "بدعه",
    "البراءه الاصليه",
    "براءه الذمه",
    "استصحاب",
    "حجه قطعيه",
    "تحرم مخالفته",
    "ما روي الصحابي",
    "قرض جر",
]


def triage_fatwa_reasoning(answer_text: str, norm_text: str = "") -> dict[str, object]:
    """
    Stage 1 Pre-Triage:
    Evaluates whether a fatwa answer contains causal jurisprudential reasoning
    or is merely a brief/routine citation (e.g. 'بالكتاب والسنة والإجماع').
    """
    norm = norm_text if norm_text else normalize_arabic(answer_text)
    matched_markers = [m for m in CAUSAL_MARKERS if m in norm]

    # Guardrail: Check if 'الاجماع' or 'السنه' appears ONLY inside a routine proof formula
    # such as 'بالكتاب والسنه والاجماع' with no other causal or methodological markers.
    is_routine_citation_only = ("بالكتاب والسنه والاجماع" in norm or "بالاجماع" in norm) and len(
        matched_markers
    ) == 0

    return {
        "has_causal_reasoning": len(matched_markers) > 0 and not is_routine_citation_only,
        "is_routine_citation_only": is_routine_citation_only,
        "matched_markers": matched_markers,
        "reasoning_score": len(matched_markers),
    }
