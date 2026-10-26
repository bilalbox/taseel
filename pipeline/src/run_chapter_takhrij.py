"""
Automated Chapter Takhrij Runner.
Executes the batch lifecycle chapter-by-chapter in priority order:
1. Taharah, 2. Salat, 3. Sawm, 4. Zakat, 5. Hajj, 6. Janaiz,
7. Nikah, 8. Muamalat, 9. Faraid, 10. Ayman, 11. Jinayat,
12. Udhiyah, 13. Jihad, 14. Mutafarriqat, 15. Hadith, 16. Tafsir,
17. Ilm, 18. Adab, 19. Aqidah.

For each batch:
- Exports jobs and prompt (batch_NNNN.jobs.json, batch_NNNN.prompt.md)
- Evaluates every fatwa using takhrij_engine (batch_NNNN.response.jsonl)
- Validates batch (check)
- Ingests batch into llm_extractions.jsonl and moves to done/
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Set

ROOT_DIR = Path(__file__).resolve().parents[2]
PIPELINE_DIR = ROOT_DIR / "pipeline"
sys.path.insert(0, str(PIPELINE_DIR / "src"))

from llm_batch_enrich import (
    Corpus,
    DATA_DIR,
    DONE_DIR,
    JOBS_DIR,
    EXTRACTIONS_PATH,
    _batch_files,
    _estimate_tokens,
    _next_batch_number,
    _rel_path,
    _repair_trailing_partial_line,
    build_jobs,
    evaluate_batch,
    pending_fatwa_ids,
    read_extraction_records,
    render_prompt,
)
from takhrij_engine import evaluate_fatwa


CHAPTER_PRIORITY = [
    "Taharah", "Salat", "Sawm", "Zakat", "Hajj", "Janaiz", "Nikah", "Muamalat",
    "Faraid", "Ayman", "Jinayat", "Udhiyah", "Jihad", "Mutafarriqat",
    "Hadith", "Tafsir", "Ilm", "Adab", "Aqidah",
]


def run_chapter(chapter: str, corpus: Corpus, jobs_per_batch: int = 30, max_batches: Optional[int] = None) -> int:
    """Runs all batches for a single chapter until no eligible jobs remain."""
    print(f"\n=======================================================")
    print(f"=== Starting Chapter: {chapter} ===")
    print(f"=======================================================")
    
    batches_processed = 0
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
    DONE_DIR.mkdir(parents=True, exist_ok=True)
    _repair_trailing_partial_line(EXTRACTIONS_PATH)
    processed = set(read_extraction_records())

    while True:
        if max_batches is not None and batches_processed >= max_batches:
            print(f"Reached max_batches limit ({max_batches}) for {chapter}.")
            break

        pending = pending_fatwa_ids()
        jobs = build_jobs(
            corpus,
            processed | pending,
            corpus.fatwa_to_cluster,  # Note: build_jobs takes exclude_ids then max_fatwas_per_job etc.
        ) if False else None
        
        # Correctly call build_jobs:
        # build_jobs(corpus, exclude_ids, max_fatwas_per_job=3, max_answer_chars=2000, max_candidates=15, chapters={chapter})
        jobs = build_jobs(
            corpus,
            exclude_ids=processed | pending,
            chapters={chapter},
        )
        
        if not jobs:
            print(f"✓ No eligible jobs remain for chapter {chapter}.")
            break

        chunk = jobs[:jobs_per_batch]
        batch_no = _next_batch_number()
        batch_id = f"batch_{batch_no:04d}"
        files = _batch_files(batch_id)

        meta = {
            "batch_id": batch_id,
            "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "ontology_version": corpus.ontology.version,
            "jobs": chunk,
        }
        files["jobs"].write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
        prompt = render_prompt(batch_id, chunk, corpus.ontology, _rel_path(files["response"]))
        files["prompt"].write_text(prompt, encoding="utf-8")
        n_fatwas = sum(len(j["fatwas"]) for j in chunk)
        
        print(f"\n--- [{chapter}] Exported {batch_id}: {len(chunk)} jobs ({n_fatwas} fatwas) ---")

        # Evaluate fatwas using takhrij_engine
        responses = []
        for job in chunk:
            cands = job["candidate_ids"]
            for f in job["fatwas"]:
                res = evaluate_fatwa(f, cands, corpus.ontology)
                responses.append(res)

        # Write response.jsonl
        with open(files["response"], "w", encoding="utf-8") as out:
            for r in responses:
                out.write(json.dumps(r, ensure_ascii=False) + "\n")

        # Validate using evaluate_batch
        fatwas_by_id = {f["id"]: f for f in corpus.fatwas}
        rep = evaluate_batch(batch_id, fatwas_by_id, corpus.ontology)
        if rep["errors"]:
            print(f"ERROR: {batch_id} failed validation with {len(rep['errors'])} errors:")
            for err in rep["errors"][:10]:
                print(f"  • {err}")
            sys.exit(1)

        # Ingest
        new_records = 0
        with open(EXTRACTIONS_PATH, "a", encoding="utf-8") as out:
            def _append(rec: dict) -> None:
                out.write(json.dumps(rec, ensure_ascii=False) + "\n")
                out.flush()

            for job in rep["jobs"]:
                for jf in job["fatwas"]:
                    fid = jf["fatwa_id"]
                    res = rep["accepted"].get(fid)
                    if res is None or fid in processed:
                        continue
                    _append({
                        "fatwa_id": fid,
                        "source": "agent",
                        "representative_fatwa_id": None,
                        "cluster_id": job["cluster_id"],
                        "job_id": job["job_id"],
                        "batch_id": batch_id,
                        "model": "takhrij-engine",
                        "candidate_ids": job["candidate_ids"],
                        "response": res,
                        "ingested_at": now,
                    })
                    processed.add(fid)
                    new_records += 1

                for prop in job["propagate_to"]:
                    fid, rep_id = prop["fatwa_id"], prop["representative_fatwa_id"]
                    res = rep["accepted"].get(rep_id)
                    if res is None or fid in processed:
                        continue
                    derived = {**res, "fatwa_id": fid}
                    _append({
                        "fatwa_id": fid,
                        "source": "cluster_propagation",
                        "representative_fatwa_id": rep_id,
                        "cluster_id": job["cluster_id"],
                        "job_id": job["job_id"],
                        "batch_id": batch_id,
                        "model": "takhrij-engine",
                        "candidate_ids": job["candidate_ids"],
                        "response": derived,
                        "ingested_at": now,
                    })
                    processed.add(fid)
                    new_records += 1

        # Move to done/
        src = _batch_files(batch_id)
        dst = _batch_files(batch_id, DONE_DIR)
        for key in ("jobs", "prompt", "response"):
            if src[key].exists():
                src[key].replace(dst[key])

        batches_processed += 1
        print(f"  ✓ {batch_id}: {rep['links']} links accepted | {new_records} records ingested ({len(processed):,} total processed).")

    return batches_processed


def main():
    parser = argparse.ArgumentParser(description="Automated Systematic Takhrij Runner across Noor 'ala al-Darb.")
    parser.add_argument("--chapter", action="append", help="Target chapter (repeatable). Defaults to all priority chapters.")
    parser.add_argument("--max-batches-per-chapter", type=int, help="Limit batches per chapter.")
    args = parser.parse_args()

    target_chapters = args.chapter if args.chapter else CHAPTER_PRIORITY
    
    print(f"Loading corpus with include_grounded=True...")
    t0 = time.perf_counter()
    corpus = Corpus(include_grounded=True)
    print(f"Corpus loaded in {time.perf_counter() - t0:.2f}s. Eligible fatwas: {len(corpus.eligible_ids):,}")

    total_batches = 0
    for ch in target_chapters:
        b_count = run_chapter(ch, corpus, jobs_per_batch=30, max_batches=args.max_batches_per_chapter)
        total_batches += b_count

    print(f"\n=======================================================")
    print(f"=== All Target Chapters Completed: {total_batches} batches processed ===")
    print(f"=======================================================")


if __name__ == "__main__":
    main()
