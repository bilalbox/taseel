"""Diacritic / punctuation / whitespace tolerant verbatim quote location."""

from __future__ import annotations

import unicodedata

_FOLD_MAP = {"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ة": "ه", "ى": "ي", "ؤ": "ء", "ئ": "ء"}


def _fold_with_index(text: str) -> tuple[str, list[int]]:
    """
    Folds text for matching (drops harakat/tatweel, unifies alef/taa/yaa/hamza, collapses
    punctuation+whitespace into single spaces) and returns a map folded_idx -> raw_idx.
    """
    out: list[str] = []
    idx: list[int] = []
    pending_space = False
    for i, ch in enumerate(text):
        if ch == "\u0640" or unicodedata.category(ch) == "Mn":
            continue
        ch = _FOLD_MAP.get(ch, ch)
        if ch.isalnum():
            if pending_space and out:
                out.append(" ")
                idx.append(i)
            pending_space = False
            out.append(ch.lower())
            idx.append(i)
        else:
            pending_space = True
    return "".join(out), idx


def locate_verbatim(quote: str, answer_text: str) -> str | None:
    """
    Returns the exact raw substring of `answer_text` matching `quote` (tolerating
    differences in diacritics, punctuation and whitespace), or None if absent.
    """
    if not quote or not quote.strip():
        return None
    q = quote.strip()
    if q in answer_text:
        return q
    folded_q, _ = _fold_with_index(q)
    if len(folded_q) < 8:
        return None
    folded_a, a_idx = _fold_with_index(answer_text)
    pos = folded_a.find(folded_q)
    if pos < 0:
        return None
    start_raw = a_idx[pos]
    end_raw = a_idx[pos + len(folded_q) - 1] + 1
    while end_raw < len(answer_text) and unicodedata.category(answer_text[end_raw]) == "Mn":
        end_raw += 1
    return answer_text[start_raw:end_raw]
