"""
Stage 4: End-to-End Full Archive SQLite Compiler, FTS5 Indexer, Gzip Compressor & Verification Suite.
Ingests the complete Noor 'ala al-Darb archives of Shaykh Ibn Baz (12,269 fatwas) and
Shaykh Ibn Uthaymeen (24 volumes / 7,096 Q&As), merges deterministic Stage 3 links with the
cached Stage 3D structured-output extractions (pipeline/data/llm_extractions.jsonl, when present),
and compiles:
  - public/content.sqlite3
  - public/content.sqlite3.gz
  - public/manifest.json
"""

import gzip
import hashlib
import json
import sqlite3
import time
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

from arabic_norm import normalize_arabic
from cluster_issues import cluster_fatwa_issues
from grounding import ground_fatwa
from ingest_archives import load_full_archives
from llm_batch_enrich import EXTRACTIONS_PATH, load_llm_links, merge_fatwa_links
from ontology_index import OntologyGraph

ROOT_DIR = Path(__file__).resolve().parents[2]
PIPELINE_DIR = ROOT_DIR / "pipeline"
PUBLIC_DIR = ROOT_DIR / "public"


def build_content_database() -> None:
    t0 = time.perf_counter()
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    data_dir = PIPELINE_DIR / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    # Store uncompressed SQLite DB in pipeline/data/ so Vite's public/ -> dist/ copy
    # only ships content.sqlite3.gz (21.19 MB < Cloudflare Pages 25 MiB limit)
    db_path = data_dir / "content.sqlite3"
    legacy_public_db = PUBLIC_DIR / "content.sqlite3"
    gz_path = PUBLIC_DIR / "content.sqlite3.gz"
    manifest_path = PUBLIC_DIR / "manifest.json"

    if db_path.exists():
        db_path.unlink()
    if legacy_public_db.exists():
        legacy_public_db.unlink()

    print("=== [Stage 0] Loading & Validating Master Jurisprudence Ontology ===")
    ontology = OntologyGraph(PIPELINE_DIR / "seed" / "ontology.json")
    print(
        f"  ✓ Validated {len(ontology.nodes)} principles (max depth = "
        f"{max(n['depth'] for n in ontology.nodes.values())}), "
        f"{len(ontology.aliases)} aliases, {len(ontology.relations)} graph edges."
    )

    print("\n=== [Stage 1] Ingesting Full Noor 'ala al-Darb Archives (Ibn Baz & Ibn Uthaymeen) ===")
    t_ingest = time.perf_counter()
    episodes, raw_fatwas = load_full_archives(PIPELINE_DIR)
    scholar_counts = Counter(f["scholar_name"] for f in raw_fatwas)
    print(
        f"  ✓ Loaded {len(episodes):,} episodes and {len(raw_fatwas):,} proofread fatwas "
        f"in {time.perf_counter() - t_ingest:.2f}s:"
    )
    for scholar, cnt in scholar_counts.most_common():
        print(f"    • {scholar}: {cnt:,} fatwas")

    print("\n=== [Stage 1B] Pre-Normalizing Arabic Corpus (19,300+ Q&A Pairs) ===")
    t_norm = time.perf_counter()
    for f in raw_fatwas:
        f["question_norm"] = normalize_arabic(f["question_text"])
        f["answer_norm"] = normalize_arabic(f["answer_text"])
        f["subtopic_norm"] = normalize_arabic(f.get("topic_subtopic") or "")
    print(f"  ✓ Normalized {len(raw_fatwas):,} Q&A pairs in {time.perf_counter() - t_norm:.2f}s.")

    print("\n=== [Stage 2] Clustering Duplicate Radio Questions (issue_clusters) ===")
    t_cluster = time.perf_counter()
    issue_clusters, fatwa_to_cluster = cluster_fatwa_issues(raw_fatwas)
    multi_member_clusters = [c for c in issue_clusters if len(c["member_fatwa_ids"]) > 1]
    print(
        f"  ✓ Collapsed {len(raw_fatwas):,} fatwas into {len(issue_clusters):,} unique issue_clusters "
        f"({len(multi_member_clusters):,} multi-fatwa clusters) in {time.perf_counter() - t_cluster:.2f}s."
    )

    print("\n=== [Stage 3] Running 3-Step Hybrid Principle Extraction & Grounding ===")
    t_extract = time.perf_counter()
    deterministic_links_by_fatwa = {}
    skip_reasons = Counter()

    for fatwa in raw_fatwas:
        res = ground_fatwa(fatwa, ontology)
        if res.skipped:
            skip_reasons[res.skip_reason or "UNKNOWN"] += 1
        else:
            deterministic_links_by_fatwa[fatwa["id"]] = res.to_dict()["grounded_links"]

    print(
        f"  ✓ Deterministic pass over {len(raw_fatwas):,} fatwas in {time.perf_counter() - t_extract:.2f}s: "
        f"{len(deterministic_links_by_fatwa):,} grounded fatwas, "
        f"{sum(len(v) for v in deterministic_links_by_fatwa.values()):,} links. "
        f"Filtered / Skipped: {dict(skip_reasons)}"
    )

    print(
        "\n=== [Stage 3D] Merging Cached Structured-Output Extractions (llm_extractions.jsonl) ==="
    )
    llm_links_by_fatwa = {}
    llm_stats = None
    if EXTRACTIONS_PATH.exists():
        fatwas_by_id = {f["id"]: f for f in raw_fatwas}
        llm_links_by_fatwa, llm_stats, proposals = load_llm_links(fatwas_by_id, ontology)
        print(
            f"  ✓ Re-validated {llm_stats['records']:,} cached responses {dict(llm_stats['sources'])}: "
            f"{llm_stats['fatwas_with_links']:,} fatwas / {llm_stats['links']:,} links pass guardrails "
            f"(unmatched records: {llm_stats['unknown_fatwa']:,}).\n"
            f"    • Guardrail rejections: {dict(llm_stats['rejections'])}"
        )
        if proposals:
            proposals_path = data_dir / "llm_proposed_dawabit.json"
            grouped = {}
            for p in proposals:
                g = grouped.setdefault(
                    p["suggested_id"],
                    {
                        **{
                            k: p[k]
                            for k in (
                                "suggested_id",
                                "parent_id",
                                "parent_exists",
                                "science",
                                "kind",
                                "canonical_text_ar",
                                "summary_ar",
                            )
                        },
                        "fatwa_ids": [],
                        "examples": [],
                    },
                )
                g["fatwa_ids"].append(p["fatwa_id"])
                if len(g["examples"]) < 3:
                    g["examples"].append(
                        {
                            k: p[k]
                            for k in (
                                "fatwa_id",
                                "evidence_quote_ar",
                                "application_explanation_ar",
                                "confidence_score",
                            )
                        }
                    )
            ordered = sorted(grouped.values(), key=lambda g: -len(g["fatwa_ids"]))
            proposals_path.write_text(
                json.dumps(ordered, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            print(
                f"    • {len(proposals):,} NEW_CANDIDATE dawabit ({len(ordered):,} distinct) → {proposals_path} for curation"
            )
    else:
        print(f"  • {EXTRACTIONS_PATH} not found — compiling deterministic links only.")

    fatwa_principles_rows = []
    grounded_fatwa_count = 0
    multi_principle_fatwas = 0
    invocation_counts = Counter()
    method_counts = Counter()
    principle_hit_counts = Counter()
    for fatwa in raw_fatwas:
        fid = fatwa["id"]
        det = deterministic_links_by_fatwa.get(fid, [])
        llm = llm_links_by_fatwa.get(fid, [])
        if not det and not llm:
            continue
        links = merge_fatwa_links(fid, det, llm, ontology)
        grounded_fatwa_count += 1
        if len(links) > 1:
            multi_principle_fatwas += 1
        fatwa_principles_rows.extend(links)
        for l in links:
            invocation_counts[l["invocation_type"]] += 1
            method_counts[l["extraction_method"]] += 1
            principle_hit_counts[l["principle_id"]] += 1

    print(
        f"  ✓ Merged links in {time.perf_counter() - t_extract:.2f}s:\n"
        f"    • Grounded Fatwas:          {grounded_fatwa_count:,} ({multi_principle_fatwas:,} multi-principle fatwas)\n"
        f"    • Total Grounded Links:     {len(fatwa_principles_rows):,}\n"
        f"    • Extraction Methods:       {dict(method_counts)}\n"
        f"    • Invocation Breakdown:     {dict(invocation_counts)}"
    )
    print("    • Top 10 Grounded Principles across the Archive:")
    for pid, cnt in principle_hit_counts.most_common(10):
        node = ontology.nodes[pid]
        print(
            f"      - [{pid}] ({node['kind']}, depth={node['depth']}): {cnt:,} fatwas — «{node['canonical_text_ar']}»"
        )

    print("\n=== [Stage 4] Compiling SQLite Database & FTS5 Virtual Tables ===")
    t_sql = time.perf_counter()
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA page_size = 4096;")
    conn.execute("PRAGMA journal_mode = DELETE;")
    conn.execute("PRAGMA synchronous = OFF;")
    conn.execute("PRAGMA foreign_keys = ON;")

    schema_sql = (PIPELINE_DIR / "schema.sql").read_text(encoding="utf-8")
    conn.executescript(schema_sql)

    with conn:
        # 1. Insert episodes
        conn.executemany(
            """
            INSERT INTO episodes (id, scholar_name, episode_number, source_url, audio_url)
            VALUES (:id, :scholar_name, :episode_number, :source_url, :audio_url)
            """,
            episodes,
        )

        # 2. Insert principles (ordered by depth so parent_id FK always exists)
        ordered_nodes = sorted(ontology.nodes.values(), key=lambda n: n["depth"])
        conn.executemany(
            """
            INSERT INTO principles (
                id, parent_id, depth, science, domain_section, kind,
                canonical_text_ar, canonical_text_norm, summary_ar,
                textual_evidence_ar, matching_guardrail
            ) VALUES (
                :id, :parent_id, :depth, :science, :domain_section, :kind,
                :canonical_text_ar, :canonical_text_norm, :summary_ar,
                :textual_evidence_ar, :matching_guardrail
            )
            """,
            ordered_nodes,
        )

        # 3. Insert principle_aliases
        conn.executemany(
            """
            INSERT INTO principle_aliases (
                id, principle_id, alias_text_ar, alias_text_norm,
                scholar_preference, is_colloquial_variant
            ) VALUES (
                :id, :principle_id, :alias_text_ar, :alias_text_norm,
                :scholar_preference, :is_colloquial_variant
            )
            """,
            ontology.aliases,
        )

        # 4. Insert principle_relations
        conn.executemany(
            """
            INSERT INTO principle_relations (
                source_id, target_id, relation_type, explanation_ar
            ) VALUES (
                :source_id, :target_id, :relation_type, :explanation_ar
            )
            """,
            ontology.relations,
        )

        # 5. Insert issue_clusters
        conn.executemany(
            """
            INSERT INTO issue_clusters (
                id, canonical_issue_title_ar, topic_domain, topic_chapter
            ) VALUES (
                :id, :canonical_issue_title_ar, :topic_domain, :topic_chapter
            )
            """,
            issue_clusters,
        )

        # 6. Batch insert fatwas & contentless fatwas_fts (joined by explicit rowid)
        fatwa_tuples = []
        fts_tuples = []
        for rowid_idx, f in enumerate(raw_fatwas, start=1):
            fatwa_tuples.append(
                (
                    rowid_idx,
                    f["id"],
                    f["episode_id"],
                    fatwa_to_cluster[f["id"]],
                    f["scholar_name"],
                    f["question_text"],
                    f["answer_text"],
                    f["topic_domain"],
                    f["topic_chapter"],
                    f.get("topic_subtopic"),
                    f.get("audio_url"),
                    f.get("audio_start_sec"),
                    f.get("audio_end_sec"),
                )
            )
            fts_tuples.append(
                (
                    rowid_idx,
                    f["question_norm"],
                    f["answer_norm"],
                    f["subtopic_norm"],
                )
            )

        conn.executemany(
            """
            INSERT INTO fatwas (
                rowid, id, episode_id, issue_cluster_id, scholar_name,
                question_text, answer_text,
                topic_domain, topic_chapter, topic_subtopic,
                audio_url, audio_start_sec, audio_end_sec
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            fatwa_tuples,
        )
        conn.executemany(
            """
            INSERT INTO fatwas_fts (rowid, question_norm, answer_norm, topic_subtopic_norm)
            VALUES (?, ?, ?, ?)
            """,
            fts_tuples,
        )

        # 7. Populate principles_fts (denormalizing aliases into aliases_concat_norm!)
        for node in ordered_nodes:
            aliases_concat = " | ".join(a["alias_text_norm"] for a in node["aliases_resolved"])
            conn.execute(
                """
                INSERT INTO principles_fts (
                    principle_id, canonical_text_norm, aliases_concat_norm, summary_norm
                ) VALUES (?, ?, ?, ?)
                """,
                (
                    node["id"],
                    node["canonical_text_norm"],
                    aliases_concat,
                    node["summary_norm"],
                ),
            )

        # 8. Insert fatwa_principles
        conn.executemany(
            """
            INSERT INTO fatwa_principles (
                id, fatwa_id, principle_id, matched_alias_id,
                invocation_type, evidence_quote_ar, application_explanation_ar,
                confidence_score, difficulty, extraction_method
            ) VALUES (
                :id, :fatwa_id, :principle_id, :matched_alias_id,
                :invocation_type, :evidence_quote_ar, :application_explanation_ar,
                :confidence_score, :difficulty, :extraction_method
            )
            """,
            fatwa_principles_rows,
        )

    # Optimize & Vacuum for read-only OPFS deployment
    conn.execute("INSERT INTO fatwas_fts(fatwas_fts) VALUES('optimize');")
    conn.execute("INSERT INTO principles_fts(principles_fts) VALUES('optimize');")
    conn.commit()
    conn.execute("PRAGMA optimize;")
    conn.execute("VACUUM;")
    print(f"  ✓ Compiled & vacuumed SQLite DB in {time.perf_counter() - t_sql:.2f}s.")

    # Run SQL Verification Suite before closing
    _run_sql_verification_suite(conn)
    conn.close()

    # Compress to content.sqlite3.gz & write manifest.json
    print("\n=== [Stage 5] Compressing to content.sqlite3.gz & Generating Manifest ===")
    raw_bytes = db_path.read_bytes()
    sha256_hash = hashlib.sha256(raw_bytes).hexdigest()
    with gzip.open(gz_path, "wb", compresslevel=6) as gz_file:
        gz_file.write(raw_bytes)

    manifest = {
        "version": datetime.now(UTC).strftime("%Y.%m.%d"),
        "ontology_version": ontology.version,
        "sha256": sha256_hash,
        "url": "/content.sqlite3.gz",
        "uncompressed_bytes": len(raw_bytes),
        "gzip_bytes": gz_path.stat().st_size,
        "counts": {
            "episodes": len(episodes),
            "ibn_baz_fatwas": scholar_counts["ابن باز"],
            "ibn_uthaymeen_fatwas": scholar_counts["ابن عثيمين"],
            "principles": len(ontology.nodes),
            "principle_aliases": len(ontology.aliases),
            "principle_relations": len(ontology.relations),
            "issue_clusters": len(issue_clusters),
            "fatwas": len(raw_fatwas),
            "grounded_fatwas": grounded_fatwa_count,
            "fatwa_principles": len(fatwa_principles_rows),
            "llm_extracted_fatwas": llm_stats["records"] if llm_stats else 0,
            "llm_links": method_counts["llm"] + method_counts["hybrid"],
        },
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"\n=== [Build Complete in {time.perf_counter() - t0:.2f}s] ===\n"
        f"  • SQLite DB:   {db_path} ({len(raw_bytes):,} bytes / {len(raw_bytes) / (1024 * 1024):.2f} MB)\n"
        f"  • Gzipped DB:  {gz_path} ({gz_path.stat().st_size:,} bytes / {gz_path.stat().st_size / (1024 * 1024):.2f} MB)\n"
        f"  • Manifest:    {manifest_path} (SHA-256: {sha256_hash[:16]}...)"
    )


def _run_sql_verification_suite(conn: sqlite3.Connection) -> None:
    print("\n=== [Verification] Running SQLite Graph & FTS5 Queries on Full Archive ===")

    # Test 1: FTS5 Alias Search ('البراءة الأصلية' -> 'fiqh.yaqeen.baraa')
    q_alias = normalize_arabic("البراءة الأصلية")
    row = conn.execute(
        """
        SELECT p.id, p.canonical_text_ar, p.kind, p.depth
        FROM principles_fts fts
        JOIN principles p ON p.id = fts.principle_id
        WHERE principles_fts MATCH ?
        """,
        (f'"{q_alias}"',),
    ).fetchone()
    print(
        f"  1. FTS5 Alias Match for «البراءة الأصلية»: {row[0]} -> «{row[1]}» (kind={row[2]}, depth={row[3]})"
    )

    # Test 2: Recursive CTE Subtree Roll-Up under 'fiqh.yaqeen'
    rollup_count = conn.execute(
        """
        WITH RECURSIVE subtree(id, depth) AS (
            SELECT id, depth FROM principles WHERE id = 'fiqh.yaqeen'
            UNION ALL
            SELECT p.id, p.depth FROM principles p
            JOIN subtree s ON p.parent_id = s.id
        )
        SELECT COUNT(DISTINCT fp.fatwa_id)
        FROM subtree s
        JOIN fatwa_principles fp ON fp.principle_id = s.id;
        """
    ).fetchone()[0]
    print(
        f"  2. Recursive CTE Subtree Roll-up for 'fiqh.yaqeen': {rollup_count:,} distinct fatwas rolled up across all sub-branches."
    )

    # Test 3: Breakdown by Science (Fiqh vs Usul)
    science_rows = conn.execute(
        """
        SELECT p.science, p.kind, COUNT(fp.id)
        FROM fatwa_principles fp
        JOIN principles p ON p.id = fp.principle_id
        GROUP BY p.science, p.kind
        ORDER BY COUNT(fp.id) DESC;
        """
    ).fetchall()
    print("  3. Grounded Fatwa-Principle Links by Science & Kind:")
    for sc, kd, cnt in science_rows:
        print(f"     • {sc} / {kd}: {cnt:,} links")

    # Test 4: Contentless FTS5 Join on fatwas.rowid
    fts_q = normalize_arabic("الشك في الطهارة")
    fts_hits = conn.execute(
        """
        SELECT f.id, f.scholar_name, f.topic_subtopic
        FROM fatwas_fts fts
        JOIN fatwas f ON f.rowid = fts.rowid
        WHERE fatwas_fts MATCH ?
        LIMIT 3;
        """,
        (fts_q,),
    ).fetchall()
    print(
        f"  4. FTS5 Contentless Rowid Join for «الشك في الطهارة» (top 3 hits): {[r[0] for r in fts_hits]}"
    )


if __name__ == "__main__":
    build_content_database()
