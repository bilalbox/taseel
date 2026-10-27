"""
Stage 2: High-Throughput Chapter-Blocked Question Deduplication & Issue Clustering.
Uses an Inverted Stem Index within each Fiqh chapter to cluster ~20,000 fatwas in < 2 seconds.
"""

import math
import re
from collections import Counter

from arabic_norm import normalize_arabic

STOPWORDS: set[str] = {
    "رجل",
    "ساىل",
    "يقول",
    "يسال",
    "ما",
    "حكم",
    "هل",
    "في",
    "من",
    "علي",
    "عن",
    "الي",
    "اذا",
    "ثم",
    "بعد",
    "ان",
    "او",
    "ام",
    "لا",
    "هذا",
    "فما",
    "فهل",
    "ذلك",
    "وقت",
    "حين",
    "دخل",
    "لما",
    "قام",
    "سماحه",
    "الشيخ",
    "فضيله",
    "احسن",
    "الله",
    "اليكم",
    "جزاكم",
    "خيرا",
    "السؤال",
    "الأول",
    "الثاني",
    "يوجد",
    "لدي",
    "عندي",
    "شخص",
    "انسان",
    "المسلم",
    "الناس",
    "البعض",
    "كثير",
    "بعض",
}

_PREFIX_RE = re.compile(r"^(وال|فال|بال|كال|لل|ال)")
_SUFFIX_RE = re.compile(r"(هم|هن|كم|نا|ها|تي|ته|ه|ي)$")


def _light_arabic_stem(token: str) -> str:
    t = _PREFIX_RE.sub("", token)
    t = _SUFFIX_RE.sub("", t)
    return t if len(t) >= 3 else token


def _extract_stems_and_vec(question_text: str, subtopic: str) -> tuple[list[str], dict[str, float]]:
    # Limit question length to first 350 chars to ignore caller salutations/preambles
    norm = normalize_arabic(f"{subtopic} {subtopic} {question_text[:350]}")
    tokens = [t for t in norm.split() if len(t) > 2 and t not in STOPWORDS]
    stems = [_light_arabic_stem(t) for t in tokens if len(_light_arabic_stem(t)) >= 3]

    vec: dict[str, float] = {}
    for st in stems:
        vec[st] = vec.get(st, 0.0) + 1.0

    norm_len = math.sqrt(sum(v * v for v in vec.values())) or 1.0
    return list(set(stems)), {k: v / norm_len for k, v in vec.items()}


def _cosine(a: dict[str, float], b: dict[str, float]) -> float:
    if len(a) > len(b):
        a, b = b, a
    return sum(v * b.get(k, 0.0) for k, v in a.items())


def cluster_fatwa_issues(
    fatwas: list[dict], similarity_threshold: float = 0.56
) -> tuple[list[dict], dict[str, str]]:
    """
    Partitions fatwas by `topic_chapter` and clusters questions with cosine >= threshold
    using an inverted stem index for O(N) average-case performance across 20,000+ fatwas.
    """
    by_chapter: dict[str, list[dict]] = {}
    for f in fatwas:
        ch = f["topic_chapter"]
        by_chapter.setdefault(ch, []).append(f)

    issue_clusters: list[dict] = []
    fatwa_to_cluster: dict[str, str] = {}

    for chapter, chapter_fatwas in by_chapter.items():
        # Pre-extract stem sets and normalized TF vectors
        features = [
            _extract_stems_and_vec(f["question_text"], f.get("topic_subtopic", ""))
            for f in chapter_fatwas
        ]

        # Inverted index: stem -> list of (cluster_record, seed_vec)
        stem_to_clusters: dict[str, list[int]] = {}
        chapter_clusters: list[dict] = []
        cluster_seed_vecs: list[dict[str, float]] = []

        for idx, f in enumerate(chapter_fatwas):
            fid = f["id"]
            stems, vec = features[idx]

            # Find candidate existing clusters sharing at least 2 stems
            candidate_counts: Counter = Counter()
            for st in stems:
                for c_idx in stem_to_clusters.get(st, ()):
                    candidate_counts[c_idx] += 1

            best_c_idx = -1
            best_sim = similarity_threshold
            for c_idx, shared in candidate_counts.items():
                if shared < 2 and len(stems) >= 2:
                    continue
                sim = _cosine(vec, cluster_seed_vecs[c_idx])
                if sim >= best_sim:
                    best_sim = sim
                    best_c_idx = c_idx

            if best_c_idx >= 0:
                cluster_id = chapter_clusters[best_c_idx]["id"]
                chapter_clusters[best_c_idx]["member_fatwa_ids"].append(fid)
                fatwa_to_cluster[fid] = cluster_id
            else:
                new_c_idx = len(chapter_clusters)
                cluster_id = f"cluster.{chapter.lower()}.{new_c_idx + 1:04d}"
                title = (f.get("topic_subtopic") or "").strip()
                if not title or title == "فتاوى نور على الدرب":
                    title = f["question_text"][:90].strip()
                chapter_clusters.append(
                    {
                        "id": cluster_id,
                        "canonical_issue_title_ar": title,
                        "topic_domain": f["topic_domain"],
                        "topic_chapter": chapter,
                        "member_fatwa_ids": [fid],
                    }
                )
                cluster_seed_vecs.append(vec)
                fatwa_to_cluster[fid] = cluster_id
                for st in stems[:10]:
                    stem_to_clusters.setdefault(st, []).append(new_c_idx)

        issue_clusters.extend(chapter_clusters)

    return issue_clusters, fatwa_to_cluster
