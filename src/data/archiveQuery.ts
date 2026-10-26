import { normalizeArabic } from '../utils/arabic';
import type {
  BrowseFatwasParams,
  BrowseFatwasResult,
  Episode,
  Fatwa,
  FatwaPrinciple,
  FatwaSummary,
  Principle,
} from '../types';

export interface BrowseFatwasQuery {
  countSql: string;
  pageSql: string;
  bindings: any[];
  pageBindings: any[];
  ftsQuery?: string;
  normalizedQuery?: string;
}

/** Drop dead IA placeholder URLs (`noor-ala-al-darb-samples` never existed). */
export function usableAudioUrl(...candidates: Array<any>): string | undefined {
  for (const c of candidates) {
    if (c == null) continue;
    const s = String(c).trim();
    if (!s || s.includes('archive.org')) continue;
    return s;
  }
  return undefined;
}

export function buildBrowseFatwasQuery(params: BrowseFatwasParams = {}): BrowseFatwasQuery {
  const {
    query,
    scholar = 'ALL',
    chapter = 'ALL',
    subtopic,
    principleId,
    limit = 20,
    offset = 0,
  } = params;

  const conditions: string[] = [];
  const bindings: any[] = [];

  const rawQuery = (query || '').trim();
  const norm = normalizeArabic(rawQuery);

  let fromClause = '';
  let countFromClause = '';
  let ftsQuery: string | undefined;

  if (norm) {
    const tokens = norm
      .split(/\s+/)
      .map(tok => tok.replace(/["*(){}:^]/g, '').trim())
      .filter(Boolean);

    if (tokens.length > 0) {
      ftsQuery = tokens.map(tok => `"${tok}"*`).join(' AND ');
      fromClause = `
        FROM fatwas_fts fts
        JOIN fatwas f ON f.rowid = fts.rowid
        LEFT JOIN episodes e ON e.id = f.episode_id
      `;
      countFromClause = `
        FROM fatwas_fts fts
        JOIN fatwas f ON f.rowid = fts.rowid
      `;
      conditions.push('fatwas_fts MATCH ?');
      bindings.push(ftsQuery);
    } else {
      fromClause = `
        FROM fatwas f
        LEFT JOIN episodes e ON e.id = f.episode_id
      `;
      countFromClause = `FROM fatwas f`;
    }
  } else {
    fromClause = `
      FROM fatwas f
      LEFT JOIN episodes e ON e.id = f.episode_id
    `;
    countFromClause = `FROM fatwas f`;
  }

  if (scholar && scholar !== 'ALL') {
    conditions.push('f.scholar_name = ?');
    bindings.push(scholar);
  }

  if (chapter && chapter !== 'ALL') {
    conditions.push('f.topic_chapter = ?');
    bindings.push(chapter);
  }

  if (subtopic) {
    conditions.push('f.topic_subtopic = ?');
    bindings.push(subtopic);
  }

  if (principleId) {
    conditions.push(
      'EXISTS (SELECT 1 FROM fatwa_principles fp WHERE fp.fatwa_id = f.id AND fp.principle_id = ?)'
    );
    bindings.push(principleId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countSql = `SELECT COUNT(*) ${countFromClause} ${whereClause}`.trim();

  const pageBindings = [...bindings, limit, offset];
  const pageSql = `
    SELECT f.id, f.episode_id, f.scholar_name, f.question_text,
           f.topic_domain, f.topic_chapter, f.topic_subtopic, f.audio_start_sec,
           f.audio_url AS fatwa_audio_url,
           e.episode_number, e.audio_url AS episode_audio_url,
           (SELECT COUNT(*) FROM fatwa_principles fp WHERE fp.fatwa_id = f.id) AS linked_principles_count
    ${fromClause}
    ${whereClause}
    ORDER BY
      CASE
        WHEN COALESCE(NULLIF(f.audio_url, ''), NULLIF(e.audio_url, '')) IS NOT NULL
             AND COALESCE(f.audio_url, e.audio_url) NOT LIKE '%archive.org%' THEN 0
        WHEN COALESCE(NULLIF(f.audio_url, ''), NULLIF(e.audio_url, '')) IS NOT NULL THEN 1
        ELSE 2
      END,
      f.rowid ASC
    LIMIT ? OFFSET ?
  `.trim();

  return {
    countSql,
    pageSql,
    bindings,
    pageBindings,
    ftsQuery,
    normalizedQuery: norm || undefined,
  };
}

export function executeBrowseFatwas(db: any, params: BrowseFatwasParams = {}): BrowseFatwasResult {
  const t0 = performance.now();
  const { countSql, pageSql, bindings, pageBindings } = buildBrowseFatwasQuery(params);

  const total = Number(
    (bindings.length > 0 ? db.selectValue(countSql, bindings) : db.selectValue(countSql)) || 0
  );
  const rows =
    pageBindings.length > 0
      ? db.selectObjects(pageSql, pageBindings)
      : db.selectObjects(pageSql);

  const fatwas: FatwaSummary[] = rows.map((r: any) => {
    const clip = usableAudioUrl(r.fatwa_audio_url, r.episode_audio_url);
    return {
      id: String(r.id),
      episode_id: String(r.episode_id),
      scholar_name: String(r.scholar_name) as any,
      episode_number: Number(r.episode_number || 1),
      question_text: String(r.question_text),
      topic_domain: String(r.topic_domain) as any,
      topic_chapter: String(r.topic_chapter),
      topic_subtopic: String(r.topic_subtopic || 'فتاوى نور على الدرب'),
      audio_url: clip,
      audio_timestamp: Number(r.audio_start_sec || 0),
      linked_principles_count: Number(r.linked_principles_count || 0),
    };
  });

  const limit = typeof params.limit === 'number' ? params.limit : 20;
  const offset = typeof params.offset === 'number' ? params.offset : 0;
  const hasMore = offset + limit < total;
  const latencyMs = Number((performance.now() - t0).toFixed(2));

  return {
    fatwas,
    total,
    hasMore,
    latencyMs,
  };
}

export function createInMemoryArchiveDb(
  sqlite3: any,
  options: {
    episodes?: Episode[];
    fatwas?: Fatwa[];
    principles?: Principle[];
    fatwaPrinciples?: FatwaPrinciple[];
  } = {}
): any {
  const db = new sqlite3.oo1.DB();

  db.exec(`
    CREATE TABLE IF NOT EXISTS episodes (
      id TEXT PRIMARY KEY,
      scholar_name TEXT NOT NULL,
      episode_number INTEGER NOT NULL,
      source_url TEXT,
      audio_url TEXT
    );

    CREATE TABLE IF NOT EXISTS principles (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      depth INTEGER NOT NULL,
      science TEXT NOT NULL,
      domain_section TEXT NOT NULL,
      kind TEXT NOT NULL,
      canonical_text_ar TEXT NOT NULL,
      canonical_text_norm TEXT NOT NULL,
      summary_ar TEXT NOT NULL,
      textual_evidence_ar TEXT
    );

    CREATE TABLE IF NOT EXISTS fatwas (
      id TEXT PRIMARY KEY,
      episode_id TEXT NOT NULL,
      scholar_name TEXT NOT NULL,
      question_text TEXT NOT NULL,
      answer_text TEXT NOT NULL,
      topic_domain TEXT NOT NULL,
      topic_chapter TEXT NOT NULL,
      topic_subtopic TEXT,
      audio_url TEXT,
      audio_start_sec INTEGER
    );

    CREATE TABLE IF NOT EXISTS fatwa_principles (
      id TEXT PRIMARY KEY,
      fatwa_id TEXT NOT NULL,
      principle_id TEXT NOT NULL,
      invocation_type TEXT NOT NULL DEFAULT 'explicit_verbatim',
      evidence_quote_ar TEXT NOT NULL DEFAULT '',
      application_explanation_ar TEXT NOT NULL DEFAULT '',
      confidence_score REAL NOT NULL DEFAULT 1.0,
      difficulty TEXT
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS fatwas_fts USING fts5(
      question_norm,
      answer_norm,
      topic_subtopic_norm,
      content='',
      tokenize='unicode61'
    );
  `);

  const { episodes = [], fatwas = [], principles = [], fatwaPrinciples = [] } = options;

  for (const ep of episodes) {
    db.exec({
      sql: `INSERT OR REPLACE INTO episodes (id, scholar_name, episode_number, source_url, audio_url)
            VALUES (?, ?, ?, ?, ?)`,
      bind: [ep.id, ep.scholar_name, ep.episode_number, ep.source_url || null, ep.audio_url || null],
    });
  }

  for (const p of principles) {
    db.exec({
      sql: `INSERT OR REPLACE INTO principles (id, parent_id, depth, science, domain_section, kind, canonical_text_ar, canonical_text_norm, summary_ar, textual_evidence_ar)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [
        p.id,
        p.parent_id || null,
        p.depth ?? 0,
        p.science || (p.category === 'usuliyyah' ? 'usul' : 'fiqh'),
        p.domain_section || '',
        p.kind || (p.category === 'dabit' ? 'dabit_fiqhi' : 'qa_idah_kulliyyah'),
        p.canonical_text_ar,
        p.canonical_text_norm,
        p.general_explanation_ar,
        null,
      ],
    });
  }

  let rowidCounter = 1;
  for (const f of fatwas) {
    const rowid = rowidCounter++;
    db.exec({
      sql: `INSERT OR REPLACE INTO fatwas (rowid, id, episode_id, scholar_name, question_text, answer_text, topic_domain, topic_chapter, topic_subtopic, audio_url, audio_start_sec)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [
        rowid,
        f.id,
        f.episode_id,
        f.scholar_name,
        f.question_text,
        f.answer_text,
        f.topic_domain,
        f.topic_chapter,
        f.topic_subtopic || null,
        f.audio_url || null,
        f.audio_timestamp || 0,
      ],
    });

    db.exec({
      sql: `INSERT INTO fatwas_fts (rowid, question_norm, answer_norm, topic_subtopic_norm)
            VALUES (?, ?, ?, ?)`,
      bind: [
        rowid,
        f.question_norm || normalizeArabic(f.question_text),
        f.answer_norm || normalizeArabic(f.answer_text),
        normalizeArabic(f.topic_subtopic || ''),
      ],
    });
  }

  for (const fp of fatwaPrinciples) {
    db.exec({
      sql: `INSERT OR REPLACE INTO fatwa_principles (id, fatwa_id, principle_id, application_explanation_ar, difficulty)
            VALUES (?, ?, ?, ?, ?)`,
      bind: [
        fp.id,
        fp.fatwa_id,
        fp.principle_id,
        fp.application_explanation_ar || '',
        fp.difficulty || null,
      ],
    });
  }

  return db;
}
