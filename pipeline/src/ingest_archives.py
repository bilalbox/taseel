"""
Stage 1 Full Archive Ingestion:
Downloads (if not cached) and parses the complete Noor 'ala al-Darb archives for:
  1. Shaykh Abd al-Aziz ibn Baz (12,269 fatwas from binbaz.org.sa dump)
  2. Shaykh Muhammad ibn Salih al-Uthaymeen (24 volumes / 7,096 Q&As from Shamela Book 2300)
"""

import csv
import json
import re
import sys
import urllib.request
from pathlib import Path

csv.field_size_limit(sys.maxsize)

IBN_BAZ_URL = (
    "https://raw.githubusercontent.com/rn0x/binbaz_database/main/database/nur_ealaa_aldarb.json"
)
UTHAYMEEN_CSV_URL = "https://huggingface.co/datasets/MoMonir/shamela_books_text/resolve/main/shamela_books_text_category_22.csv"
UTHAYMEEN_BYTE_RANGE = "bytes=386000000-404000000"

# Volume -> (topic_domain, topic_chapter) for Shaykh Ibn Uthaymeen's 24-volume Noor 'ala al-Darb
UTHAYMEEN_VOLUME_MAP: dict[int, tuple[str, str]] = {
    1: ("Aqidah", "Aqidah"),
    2: ("Aqidah", "Aqidah"),
    3: ("Aqidah", "Aqidah"),
    4: ("Aqidah", "Aqidah"),
    5: ("Tafsir", "Tafsir"),
    6: ("Hadith", "Hadith"),
    7: ("Fiqh", "Taharah"),
    8: ("Fiqh", "Salat"),
    9: ("Fiqh", "Janaiz"),
    10: ("Fiqh", "Zakat"),
    11: ("Fiqh", "Sawm"),
    12: ("Fiqh", "Hajj"),
    13: ("Fiqh", "Udhiyah"),
    14: ("Fiqh", "Udhiyah"),
    15: ("Fiqh", "Jihad"),
    16: ("Fiqh", "Muamalat"),
    17: ("Fiqh", "Faraid"),
    18: ("Fiqh", "Faraid"),
    19: ("Fiqh", "Nikah"),
    20: ("Fiqh", "Jinayat"),
    21: ("Fiqh", "Ayman"),
    22: ("Adab", "Adab"),
    23: ("Adab", "Ilm"),
    24: ("Fiqh", "Mutafarriqat"),
}

_EPISODE_RE = re.compile(r"nour_(\d+)")
_QA_SPLIT_RE = re.compile(r"(?:فأجاب رحمه الله تعالى\s*:?|فأجاب فضيلة الشيخ\s*:?|الجواب\s*:)")


def _map_ibn_baz_categories(categories: list[str]) -> tuple[str, str]:
    joined = " ".join(categories)
    if any(
        k in joined
        for k in ("الطهارة", "الوضوء", "الغسل", "التيمم", "الحيض", "النفاس", "المسح", "النجاسات")
    ):
        return ("Fiqh", "Taharah")
    if any(
        k in joined
        for k in (
            "الصلاة",
            "الأذان",
            "الإقامة",
            "السهو",
            "الجماعة",
            "الجمعة",
            "التطوع",
            "الوتر",
            "القبلة",
            "المساجد",
        )
    ):
        return ("Fiqh", "Salat")
    if any(k in joined for k in ("الجنائز", "الميت", "القبور", "التعزية")):
        return ("Fiqh", "Janaiz")
    if any(k in joined for k in ("الزكاة", "صدقة", "الفطر")):
        return ("Fiqh", "Zakat")
    if any(k in joined for k in ("الصوم", "الصيام", "رمضان", "الاعتكاف", "الفطر")):
        return ("Fiqh", "Sawm")
    if any(
        k in joined
        for k in ("الحج", "العمرة", "الإحرام", "الطواف", "السعي", "عرفة", "منى", "الهدي", "الأضاحي")
    ):
        return ("Fiqh", "Hajj")
    if any(
        k in joined
        for k in (
            "البيوع",
            "الربا",
            "القرض",
            "الإجارة",
            "الشركات",
            "المعاملات",
            "الوقف",
            "الهبة",
            "الوصايا",
            "الفرائض",
            "المواريث",
        )
    ):
        return ("Fiqh", "Muamalat")
    if any(
        k in joined
        for k in (
            "النكاح",
            "الطلاق",
            "الخلع",
            "الرجعة",
            "العدة",
            "الرضاع",
            "النفقات",
            "الحضانة",
            "الأسرة",
            "المرأة",
        )
    ):
        return ("Fiqh", "Nikah")
    if any(k in joined for k in ("الأيمان", "النذور", "الكفارات", "الأطعمة", "الذبائح")):
        return ("Fiqh", "Ayman")
    if any(k in joined for k in ("الجنايات", "الحدود", "الديات", "القضاء", "الشهادات")):
        return ("Fiqh", "Jinayat")
    if any(
        k in joined
        for k in ("العقيدة", "التوحيد", "الشرك", "البدع", "الولاء", "الإيمان", "القدر", "نواقض")
    ):
        return ("Aqidah", "Aqidah")
    if any(k in joined for k in ("التفسير", "القرآن", "التجويد")):
        return ("Tafsir", "Tafsir")
    if any(k in joined for k in ("الحديث", "الأحاديث", "السنة")):
        return ("Hadith", "Hadith")
    return ("Adab", "Adab")


def ensure_raw_files_downloaded(data_dir: Path) -> tuple[Path, Path]:
    data_dir.mkdir(parents=True, exist_ok=True)
    baz_path = data_dir / "ibn_baz_raw.json"
    uth_path = data_dir / "uthaymeen_2300_slice.csv"

    if not baz_path.exists():
        print(f"  ↓ Downloading Shaykh Ibn Baz archive from {IBN_BAZ_URL}...")
        req = urllib.request.Request(IBN_BAZ_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as resp, open(baz_path, "wb") as out:
            out.write(resp.read())

    if not uth_path.exists():
        print(f"  ↓ Downloading Shaykh Ibn Uthaymeen archive slice ({UTHAYMEEN_BYTE_RANGE})...")
        req = urllib.request.Request(
            UTHAYMEEN_CSV_URL,
            headers={"User-Agent": "Mozilla/5.0", "Range": UTHAYMEEN_BYTE_RANGE},
        )
        with urllib.request.urlopen(req) as resp, open(uth_path, "wb") as out:
            out.write(resp.read())

    return baz_path, uth_path


def load_full_archives(pipeline_dir: Path) -> tuple[list[dict], list[dict]]:
    """
    Returns (episodes_list, fatwas_list) combining:
      1. The golden verification fatwas from sample_corpus/noor_sample_raw.json
      2. All 12,269 fatwas from Shaykh Ibn Baz's Noor 'ala al-Darb
      3. All ~7,096 Q&A fatwas from Shaykh Ibn Uthaymeen's 24-volume Noor 'ala al-Darb
    """
    baz_path, uth_path = ensure_raw_files_downloaded(pipeline_dir / "data")

    episodes_by_id: dict[str, dict] = {}
    fatwas: list[dict] = []

    # 1. Include golden sample corpus first for deterministic verification queries
    sample_path = pipeline_dir / "sample_corpus" / "noor_sample_raw.json"
    if sample_path.exists():
        with open(sample_path, encoding="utf-8") as f:
            sample_data = json.load(f)
        for ep in sample_data.get("episodes", []):
            episodes_by_id[ep["id"]] = ep
        for fw in sample_data.get("fatwas", []):
            fatwas.append(fw)

    # 2. Parse Shaykh Ibn Baz (12,269 fatwas)
    with open(baz_path, encoding="utf-8") as f:
        baz_raw = json.load(f)

    for item in baz_raw:
        raw_id = item.get("id")
        q_text = (item.get("question") or "").strip()
        a_text = (item.get("answer") or "").strip()
        if not q_text or not a_text:
            continue

        audio_url = item.get("audio") or ""
        source_url = item.get("link") or ""
        ep_match = _EPISODE_RE.search(audio_url)
        ep_num = int(ep_match.group(1)) if ep_match else ((int(raw_id) // 15) + 1)
        ep_id = f"ep-baz-{ep_num:04d}"

        if ep_id not in episodes_by_id:
            episodes_by_id[ep_id] = {
                "id": ep_id,
                "scholar_name": "ابن باز",
                "episode_number": ep_num,
                "source_url": source_url,
                "audio_url": audio_url,
            }

        categories = item.get("categories") or []
        domain, chapter = _map_ibn_baz_categories(categories)
        title = (item.get("title") or (categories[0] if categories else "")).strip()

        fatwas.append(
            {
                "id": f"baz-{raw_id}",
                "episode_id": ep_id,
                "scholar_name": "ابن باز",
                "topic_domain": domain,
                "topic_chapter": chapter,
                "topic_subtopic": title,
                "audio_url": audio_url or None,
                "audio_start_sec": 0,
                "audio_end_sec": None,
                "question_text": q_text,
                "answer_text": a_text,
            }
        )

    # 3. Parse Shaykh Ibn Uthaymeen (Shamela Book 2300, 24 volumes)
    with open(uth_path, encoding="utf-8", errors="ignore") as f:
        lines = f.read().splitlines()

    reader = csv.reader(lines[1:-1])
    current_subtopic = "فتاوى نور على الدرب"

    for row in reader:
        if len(row) < 10 or row[4] != "2300":
            continue
        serial_id = row[0]
        page_num = int(row[7]) if row[7].isdigit() else 1
        vol_num = int(row[8]) if row[8].isdigit() else 24
        raw_text = row[9].replace("\u200c", "").replace("***", "").strip()
        if not raw_text:
            continue

        # Short rows without Q&A splitters are chapter/topic headers in Shamela
        parts = _QA_SPLIT_RE.split(raw_text, maxsplit=1)
        if len(parts) < 2:
            if len(raw_text) < 140:
                current_subtopic = raw_text.strip("_ \t\r\n")
            continue

        q_text = parts[0].strip()
        a_text = parts[1].strip()
        if len(q_text) < 10 or len(a_text) < 10:
            continue

        domain, chapter = UTHAYMEEN_VOLUME_MAP.get(vol_num, ("Fiqh", "Mutafarriqat"))
        ep_id = f"ep-uth-v{vol_num:02d}"
        if ep_id not in episodes_by_id:
            episodes_by_id[ep_id] = {
                "id": ep_id,
                "scholar_name": "ابن عثيمين",
                "episode_number": vol_num,
                "source_url": f"https://shamela.ws/book/2300/{page_num}",
                "audio_url": None,
            }

        fatwas.append(
            {
                "id": f"uth-{serial_id}",
                "episode_id": ep_id,
                "scholar_name": "ابن عثيمين",
                "topic_domain": domain,
                "topic_chapter": chapter,
                "topic_subtopic": current_subtopic[:120],
                "audio_url": None,
                "audio_start_sec": 0,
                "audio_end_sec": None,
                "question_text": q_text,
                "answer_text": a_text,
            }
        )

    return list(episodes_by_id.values()), fatwas
