-- =============================================================================
-- Noor 'ala al-Darb Offline Search & Quiz Engine
-- Primary Read-Only Content Database Schema (content.sqlite3)
-- =============================================================================

PRAGMA foreign_keys = ON;

-- 1. Episodes Table
CREATE TABLE IF NOT EXISTS episodes (
    id TEXT PRIMARY KEY,
    scholar_name TEXT NOT NULL CHECK(scholar_name IN ('ابن باز', 'ابن عثيمين')),
    episode_number INTEGER NOT NULL,
    source_url TEXT,
    audio_url TEXT
);

-- 2. Jurisprudence Principles Graph (Variable-Depth Hierarchy: depth 0..N)
CREATE TABLE IF NOT EXISTS principles (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES principles(id),
    depth INTEGER NOT NULL CHECK(depth >= 0),
    science TEXT NOT NULL CHECK(science IN ('fiqh', 'usul')),
    domain_section TEXT NOT NULL, -- e.g. 'الأدلة الشرعية', 'دلالات الألفاظ', 'Taharah', 'Muamalat'
    kind TEXT NOT NULL CHECK(kind IN (
        -- Fiqh classifications
        'qa_idah_kubra',      -- قاعدة فقهية كبرى
        'qa_idah_kulliyyah',  -- قاعدة كلية مندرجة
        'dabit_fiqhi',        -- ضابط فقهي خاص بباب
        -- Usul classifications
        'asl_kulli',          -- أصل أصولي كلي (كحجية الإجماع وحجية خبر الواحد)
        'qa_idah_usuliyyah',  -- قاعدة أصولية استدلالية أو لغوية
        'dabit_usuli'         -- ضابط أصولي تطبيقي / قيد
    )),
    canonical_text_ar TEXT NOT NULL UNIQUE,
    canonical_text_norm TEXT NOT NULL,
    summary_ar TEXT NOT NULL,
    textual_evidence_ar TEXT,
    matching_guardrail TEXT       -- Disambiguation instructions for extraction pipeline
);

-- 3. Alternative Formulations & Phrasings (Siyagh / Aliases)
CREATE TABLE IF NOT EXISTS principle_aliases (
    id TEXT PRIMARY KEY,
    principle_id TEXT NOT NULL REFERENCES principles(id) ON DELETE CASCADE,
    alias_text_ar TEXT NOT NULL,
    alias_text_norm TEXT NOT NULL,
    scholar_preference TEXT,      -- e.g. 'ابن باز', 'ابن عثيمين', or NULL
    is_colloquial_variant INTEGER NOT NULL DEFAULT 0
);

-- 4. Non-Hierarchical Graph Edges (Secondary Parents, Usul-Fiqh Bridges, Contrast Pairs)
CREATE TABLE IF NOT EXISTS principle_relations (
    source_id TEXT NOT NULL REFERENCES principles(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES principles(id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL CHECK(relation_type IN (
        'secondary_parent', -- Multi-parent inheritance (e.g. Mashaqqah + Darar)
        'usul_foundation',  -- Bridges a Fiqh maxim to its underlying Usul proof
        'contrast_pair',    -- High-value pedagogical contrast pair for quiz distractors
        'exception_to'      -- Marks a rule that carves out an exception to a general maxim
    )),
    explanation_ar TEXT NOT NULL,
    PRIMARY KEY (source_id, target_id, relation_type)
);

-- 5. Question Deduplication / Issue Clusters (وحدات المسائل الفقهية المتكررة)
CREATE TABLE IF NOT EXISTS issue_clusters (
    id TEXT PRIMARY KEY,
    canonical_issue_title_ar TEXT NOT NULL,
    topic_domain TEXT NOT NULL,
    topic_chapter TEXT NOT NULL
);

-- 6. Fatwas (Proofread Q&A Transcripts)
CREATE TABLE IF NOT EXISTS fatwas (
    id TEXT PRIMARY KEY,
    episode_id TEXT NOT NULL REFERENCES episodes(id),
    issue_cluster_id TEXT REFERENCES issue_clusters(id),
    scholar_name TEXT NOT NULL CHECK(scholar_name IN ('ابن باز', 'ابن عثيمين')),
    question_text TEXT NOT NULL,
    answer_text TEXT NOT NULL,
    topic_domain TEXT NOT NULL,
    topic_chapter TEXT NOT NULL,
    topic_subtopic TEXT,
    audio_url TEXT,                 -- Per-fatwa clip (Ibn Baz dump); falls back to episode.audio_url
    audio_start_sec INTEGER,
    audio_end_sec INTEGER
);

-- 7. Fatwa <-> Principle Invocations (Supports Multi-Principle Rulings)
CREATE TABLE IF NOT EXISTS fatwa_principles (
    id TEXT PRIMARY KEY,
    fatwa_id TEXT NOT NULL REFERENCES fatwas(id) ON DELETE CASCADE,
    principle_id TEXT NOT NULL REFERENCES principles(id),
    matched_alias_id TEXT REFERENCES principle_aliases(id),
    invocation_type TEXT NOT NULL CHECK(invocation_type IN (
        'explicit_verbatim',
        'explicit_paraphrase',
        'implicit_application'
    )),
    evidence_quote_ar TEXT NOT NULL,          -- Verbatim substring ("محل الشاهد")
    application_explanation_ar TEXT NOT NULL, -- How the principle yields the ruling ("تحقيق المناط")
    confidence_score REAL NOT NULL DEFAULT 1.0,
    difficulty TEXT CHECK(difficulty IS NULL OR difficulty IN ('beginner', 'intermediate', 'advanced')),
    extraction_method TEXT NOT NULL DEFAULT 'deterministic' CHECK(extraction_method IN (
        'deterministic', -- Stage 3 string-grounded linker (extractor.py)
        'llm',           -- Stage 3D structured-output pass (llm_batch_enrich.py)
        'hybrid'         -- Found by both; deterministic type/alias + LLM quote/explanation
    )),
    UNIQUE(fatwa_id, principle_id)
);

-- =============================================================================
-- Relational Indexes for Sub-2ms Graph Traversal & Quiz Generation
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_principles_parent ON principles(parent_id);
CREATE INDEX IF NOT EXISTS idx_principles_science_section ON principles(science, domain_section);
CREATE INDEX IF NOT EXISTS idx_principles_depth ON principles(depth);
CREATE INDEX IF NOT EXISTS idx_aliases_principle ON principle_aliases(principle_id);
CREATE INDEX IF NOT EXISTS idx_aliases_norm ON principle_aliases(alias_text_norm);
CREATE INDEX IF NOT EXISTS idx_relations_target ON principle_relations(target_id, relation_type);
CREATE INDEX IF NOT EXISTS idx_fatwas_cluster ON fatwas(issue_cluster_id);
CREATE INDEX IF NOT EXISTS idx_fatwas_scholar_chapter ON fatwas(scholar_name, topic_chapter);
CREATE INDEX IF NOT EXISTS idx_fp_fatwa ON fatwa_principles(fatwa_id);
CREATE INDEX IF NOT EXISTS idx_fp_principle ON fatwa_principles(principle_id);

-- =============================================================================
-- Full-Text Search (FTS5) Virtual Tables (Normalized Arabic)
-- Uses content='' (contentless FTS5 joined on fatwas.rowid) so normalized strings
-- are indexed for sub-2ms search without duplicating 19,300+ Q&A texts on disk.
-- =============================================================================
CREATE VIRTUAL TABLE IF NOT EXISTS fatwas_fts USING fts5(
    question_norm,
    answer_norm,
    topic_subtopic_norm,
    content='',
    tokenize='unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS principles_fts USING fts5(
    principle_id UNINDEXED,
    canonical_text_norm,
    aliases_concat_norm,
    summary_norm,
    tokenize='unicode61'
);
