/// <reference lib="webworker" />
import sqlite3InitModule, { Database, SAHPoolUtil } from '@sqlite.org/sqlite-wasm';
import { normalizeArabic } from '../utils/arabic';

export interface ManifestData {
  version: string;
  ontology_version: string;
  sha256: string;
  url: string;
  uncompressed_bytes: number;
  gzip_bytes: number;
  counts: {
    episodes: number;
    ibn_baz_fatwas: number;
    ibn_uthaymeen_fatwas: number;
    principles: number;
    principle_aliases: number;
    principle_relations: number;
    issue_clusters: number;
    fatwas: number;
    grounded_fatwas: number;
    fatwa_principles: number;
  };
}

let db: Database | null = null;
let poolUtil: SAHPoolUtil | null = null;
let currentVfs = 'opfs-sahpool';

export const USER_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS bookmarks (
  fatwa_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id TEXT PRIMARY KEY,
  fatwa_id TEXT NOT NULL,
  principle_id TEXT NOT NULL,
  selected_principle_id TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  time_spent_ms INTEGER NOT NULL,
  difficulty TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kv_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function postProgress(stage: string, bytesProcessed = 0, totalExpected = 0, detail = '') {
  if (typeof self !== 'undefined' && self.postMessage) {
    self.postMessage({
      type: 'BOOT_PROGRESS',
      stage,
      bytesProcessed,
      totalExpected,
      detail
    });
  }
}

/** Drop dead IA placeholder URLs (`noor-ala-al-darb-samples` never existed). */
function usableAudioUrl(
  ...candidates: Array<string | null | undefined>
): string | undefined {
  for (const c of candidates) {
    if (c == null) continue;
    const s = String(c).trim();
    if (!s || s.includes('archive.org')) continue;
    return s;
  }
  return undefined;
}

function fatwasHasAudioUrlColumn(database: Database): boolean {
  const cols = database.selectObjects('PRAGMA table_info(fatwas)');
  return cols.some((c: any) => String(c.name) === 'audio_url');
}

async function initEngines() {
  const t0 = performance.now();
  postProgress('INIT_WASM', 0, 0, 'جاري تحميل محرك SQLite WASM...');

  const sqlite3 = await sqlite3InitModule();

  postProgress('MOUNT_OPFS', 0, 0, 'جاري تهيئة نظام الملفات الخاص (opfs-sahpool)...');

  try {
    poolUtil = await sqlite3.installOpfsSAHPoolVfs({
      name: 'taseel-opfs-pool',
      initialCapacity: 8
    });
    currentVfs = 'opfs-sahpool';
  } catch (err) {
    console.warn('[Ta\'seel Worker] opfs-sahpool unavailable, falling back to in-memory DB:', err);
    poolUtil = null;
    currentVfs = 'memory-vfs';
  }

  let manifest: ManifestData | null = null;
  try {
    const res = await fetch('/manifest.json', { cache: 'no-cache' });
    if (res.ok) {
      manifest = await res.json();
    }
  } catch (err) {
    console.warn('[Ta\'seel Worker] Offline or manifest fetch failed, using existing OPFS DB:', err);
  }

  if (poolUtil) {
    // 1. Initialize persistent user_state.sqlite3 first
    const userDb = new poolUtil.OpfsSAHPoolDb('/user_state.sqlite3');
    userDb.exec(USER_SCHEMA_SQL);

    let installedSha = '';
    const shaRows = userDb.selectObjects("SELECT value FROM kv_meta WHERE key = 'content_sha256'");
    if (shaRows.length > 0 && typeof shaRows[0].value === 'string') {
      installedSha = shaRows[0].value;
    }

    const existingFiles = poolUtil.getFileNames();
    const hasContentDb =
      existingFiles.includes('/content.sqlite3') || existingFiles.includes('content.sqlite3');

    // Older OPFS installs predate fatwas.audio_url; querying them throws SQLITE_ERROR.
    let schemaStale = false;
    if (hasContentDb) {
      try {
        const probe = new poolUtil.OpfsSAHPoolDb('/content.sqlite3');
        schemaStale = !fatwasHasAudioUrlColumn(probe);
        probe.close();
      } catch (err) {
        console.warn("[Ta'seel Worker] Content DB probe failed; will re-download:", err);
        schemaStale = true;
      }
    }

    const needsDownload =
      !hasContentDb ||
      schemaStale ||
      Boolean(manifest && manifest.sha256 && installedSha !== manifest.sha256);

    if (needsDownload && manifest) {
      // Close userDb temporarily while streaming content.sqlite3 into SAHPool
      userDb.close();

      if (hasContentDb) {
        try {
          poolUtil.unlink('/content.sqlite3');
        } catch {
          try {
            poolUtil.unlink('content.sqlite3');
          } catch {
            /* importDb will overwrite when possible */
          }
        }
      }

      postProgress(
        'DECOMPRESSING_OPFS',
        0,
        manifest.uncompressed_bytes,
        schemaStale
          ? 'جاري تحديث قاعدة البيانات (مخطط جديد يتضمن روابط الصوت)...'
          : 'جاري فك ضغط أرشيف نور على الدرب (19,301 فتوى) مباشرة إلى OPFS...'
      );

      const response = await fetch(manifest.url);
      if (!response.ok || !response.body) {
        throw new Error(`Failed to fetch ${manifest.url}: ${response.status}`);
      }

      const decompressedStream = response.body.pipeThrough(new DecompressionStream('gzip'));
      const reader = decompressedStream.getReader();
      let bytesWritten = 0;
      let lastReportBytes = 0;

      await poolUtil.importDb('/content.sqlite3', async () => {
        const { done, value } = await reader.read();
        if (done) {
          return undefined;
        }
        bytesWritten += value.byteLength;
        if (bytesWritten - lastReportBytes >= 1_500_000) {
          lastReportBytes = bytesWritten;
          postProgress(
            'DECOMPRESSING_OPFS',
            bytesWritten,
            manifest.uncompressed_bytes,
            `جاري كتابة قاعدة البيانات في OPFS (${(bytesWritten / (1024 * 1024)).toFixed(1)} MB)...`
          );
        }
        return value;
      });

      const userDbUpdate = new poolUtil.OpfsSAHPoolDb('/user_state.sqlite3');
      userDbUpdate.exec({
        sql: "INSERT OR REPLACE INTO kv_meta (key, value) VALUES ('content_sha256', ?)",
        bind: [manifest.sha256]
      });
      userDbUpdate.close();
    } else if (schemaStale) {
      userDb.close();
      throw new Error(
        'Content DB is missing fatwas.audio_url and manifest.json is unavailable for re-download.'
      );
    } else {
      userDb.close();
    }

    // 2. Open content.sqlite3 as primary connection & ATTACH user_state.sqlite3 AS user_db
    postProgress('ATTACHING_USER_DB', 0, 0, 'جاري ربط قاعدة بيانات المستخدم (ATTACH user_db)...');
    db = new poolUtil.OpfsSAHPoolDb('/content.sqlite3');
    db.exec("ATTACH DATABASE '/user_state.sqlite3' AS user_db;");
  } else {
    throw new Error('OPFS SyncAccessHandle Pool requires a modern browser Worker environment.');
  }

  const bootMs = Math.round(performance.now() - t0);
  const payload = loadInitialUiPayload(manifest, bootMs);
  postProgress('READY', manifest?.uncompressed_bytes ?? 0, manifest?.uncompressed_bytes ?? 0, 'جاهز للعمل بدون اتصال (100% Offline)');
  return payload;
}

function mapCategory(science: string, kind: string): 'fiqhiyyah' | 'usuliyyah' | 'dabit' {
  if (kind.startsWith('dabit')) return 'dabit';
  if (science === 'usul') return 'usuliyyah';
  return 'fiqhiyyah';
}

function loadInitialUiPayload(manifest: ManifestData | null, bootMs: number) {
  if (!db) throw new Error('Database not initialized');

  // 1. Load all 44 principles from `principles`
  const principleRows = db.selectObjects(`
    SELECT id, parent_id, depth, science, domain_section, kind,
           canonical_text_ar, canonical_text_norm, summary_ar, textual_evidence_ar
    FROM principles
    ORDER BY depth ASC, id ASC
  `);

  const principles = principleRows.map((r: any) => ({
    id: String(r.id),
    parent_id: r.parent_id ? String(r.parent_id) : null,
    depth: Number(r.depth),
    science: String(r.science),
    domain_section: String(r.domain_section),
    kind: String(r.kind),
    canonical_text_ar: String(r.canonical_text_ar),
    canonical_text_norm: String(r.canonical_text_norm),
    category: mapCategory(String(r.science), String(r.kind)),
    general_explanation_ar: String(r.summary_ar) + (r.textual_evidence_ar ? ` — الدليل: «${r.textual_evidence_ar}»` : '')
  }));

  const principlesById = new Map(principles.map(p => [p.id, p]));

  // 2. Load grounded fatwas (along with episode metadata) for immediate interactive browsing & quizzing
  const fatwaRows = db.selectObjects(`
    SELECT f.id, f.episode_id, f.scholar_name, f.question_text, f.answer_text,
           f.topic_domain, f.topic_chapter, f.topic_subtopic, f.audio_start_sec,
           f.audio_url AS fatwa_audio_url,
           e.episode_number, e.audio_url AS episode_audio_url, e.source_url
    FROM fatwas f
    JOIN episodes e ON e.id = f.episode_id
    WHERE EXISTS (SELECT 1 FROM fatwa_principles fp WHERE fp.fatwa_id = f.id)
    ORDER BY
      CASE
        WHEN COALESCE(NULLIF(f.audio_url, ''), NULLIF(e.audio_url, '')) IS NOT NULL
             AND COALESCE(f.audio_url, e.audio_url) NOT LIKE '%archive.org%' THEN 0
        WHEN COALESCE(NULLIF(f.audio_url, ''), NULLIF(e.audio_url, '')) IS NOT NULL THEN 1
        ELSE 2
      END,
      CASE WHEN f.id LIKE 'fatwa-%' THEN 1 ELSE 0 END,
      f.rowid ASC
    LIMIT 250
  `);

  const fatwas = fatwaRows.map((r: any) => {
    const clip = usableAudioUrl(r.fatwa_audio_url, r.episode_audio_url);
    return {
      id: String(r.id),
      episode_id: String(r.episode_id),
      question_text: String(r.question_text),
      answer_text: String(r.answer_text),
      question_norm: normalizeArabic(String(r.question_text)),
      answer_norm: normalizeArabic(String(r.answer_text)),
      topic_domain: String(r.topic_domain) as any,
      topic_chapter: String(r.topic_chapter),
      topic_subtopic: String(r.topic_subtopic || 'فتاوى نور على الدرب'),
      scholar_name: String(r.scholar_name) as any,
      episode_number: Number(r.episode_number || 1),
      audio_url: clip,
      audio_timestamp: Number(r.audio_start_sec || 0),
    };
  });

  // 3. Load fatwa_principles for loaded fatwas and synthesize distractors from sibling/same-science principles
  const fpRows = db.selectObjects(`
    SELECT fp.id, fp.fatwa_id, fp.principle_id, fp.invocation_type,
           fp.evidence_quote_ar, fp.application_explanation_ar, fp.confidence_score
    FROM fatwa_principles fp
  `);

  const fatwaPrinciples = fpRows.map((r: any) => {
    const pid = String(r.principle_id);
    const targetPrinciple = principlesById.get(pid);
    const distractors = principles
      .filter(p => p.id !== pid && (p.science === targetPrinciple?.science || p.depth === targetPrinciple?.depth))
      .slice(0, 3)
      .map(d => ({
        id: d.id,
        canonical_text_ar: d.canonical_text_ar,
        category: d.category,
        reason_incorrect: `هذه القاعدة (${d.canonical_text_ar}) تتعلق بـ: ${d.general_explanation_ar.slice(0, 95)}... وليست مناط الحكم في هذه الفتوى.`
      }));

    return {
      id: String(r.id),
      fatwa_id: String(r.fatwa_id),
      principle_id: pid,
      explicitly_stated: r.invocation_type !== 'implicit_application',
      application_explanation_ar: `${r.application_explanation_ar} — محل الشاهد: «${r.evidence_quote_ar}»`,
      distractor_principles_json: JSON.stringify(distractors),
      difficulty: (targetPrinciple && targetPrinciple.depth >= 2 ? 'advanced' : targetPrinciple?.depth === 1 ? 'intermediate' : 'beginner') as any
    };
  });

  // 4. Load UserState from attached `user_db`
  const bookmarkRows = db.selectObjects('SELECT fatwa_id FROM user_db.bookmarks ORDER BY created_at DESC');
  const historyRows = db.selectObjects('SELECT * FROM user_db.quiz_attempts ORDER BY timestamp DESC LIMIT 100');

  const totalFatwasCount = Number(
    db.selectValue('SELECT COUNT(*) FROM fatwas') || manifest?.counts.fatwas || 19301
  );
  const totalGroundedCount = Number(
    db.selectValue('SELECT COUNT(*) FROM fatwa_principles') || manifest?.counts.fatwa_principles || 831
  );

  return {
    vfs: currentVfs,
    bootMs,
    manifest,
    totalFatwasCount,
    totalGroundedCount,
    principles,
    fatwas,
    fatwaPrinciples,
    userState: {
      bookmarks: bookmarkRows.map((b: any) => String(b.fatwa_id)),
      history: historyRows.map((h: any) => ({
        id: String(h.id),
        fatwa_id: String(h.fatwa_id),
        principle_id: String(h.principle_id),
        selected_principle_id: String(h.selected_principle_id),
        is_correct: Boolean(h.is_correct),
        timestamp: Number(h.timestamp),
        time_spent_ms: Number(h.time_spent_ms),
        difficulty: String(h.difficulty) as any
      }))
    }
  };
}

function searchFatwasFts(rawQuery: string, limit = 80) {
  if (!db) throw new Error('Database not initialized');
  const t0 = performance.now();
  const norm = normalizeArabic(rawQuery);
  if (!norm) {
    return { fatwas: [], latencyMs: 0 };
  }

  // Construct safe FTS5 token prefix query
  const ftsQuery = norm
    .split(/\s+/)
    .filter(Boolean)
    .map(tok => `"${tok.replace(/"/g, '')}"*`)
    .join(' AND ');

  const rows = db.selectObjects(
    `
    SELECT f.id, f.episode_id, f.scholar_name, f.question_text, f.answer_text,
           f.topic_domain, f.topic_chapter, f.topic_subtopic, f.audio_start_sec,
           f.audio_url AS fatwa_audio_url,
           e.episode_number, e.audio_url AS episode_audio_url
    FROM fatwas_fts fts
    JOIN fatwas f ON f.rowid = fts.rowid
    JOIN episodes e ON e.id = f.episode_id
    WHERE fatwas_fts MATCH ?
    LIMIT ?
    `,
    [ftsQuery, limit]
  );

  const fatwas = rows.map((r: any) => {
    const clip = usableAudioUrl(r.fatwa_audio_url, r.episode_audio_url);
    return {
      id: String(r.id),
      episode_id: String(r.episode_id),
      question_text: String(r.question_text),
      answer_text: String(r.answer_text),
      question_norm: normalizeArabic(String(r.question_text)),
      answer_norm: normalizeArabic(String(r.answer_text)),
      topic_domain: String(r.topic_domain) as any,
      topic_chapter: String(r.topic_chapter),
      topic_subtopic: String(r.topic_subtopic || 'فتاوى نور على الدرب'),
      scholar_name: String(r.scholar_name) as any,
      episode_number: Number(r.episode_number || 1),
      audio_url: clip,
      audio_timestamp: Number(r.audio_start_sec || 0),
    };
  });

  const latencyMs = Number((performance.now() - t0).toFixed(2));
  return { fatwas, latencyMs };
}

if (typeof self !== 'undefined') {
  self.onmessage = async (event: MessageEvent) => {
    const { id, action, payload } = event.data;
    try {
      if (action === 'INIT') {
        const result = await initEngines();
        self.postMessage({ id, ok: true, result });
      } else if (action === 'SEARCH_FATWAS') {
        const result = searchFatwasFts(payload.query, payload.limit || 80);
        self.postMessage({ id, ok: true, result });
      } else if (action === 'TOGGLE_BOOKMARK') {
        if (db) {
          const { fatwaId } = payload;
          const exists = db.selectValue('SELECT 1 FROM user_db.bookmarks WHERE fatwa_id = ?', [fatwaId]);
          if (exists) {
            db.exec({ sql: 'DELETE FROM user_db.bookmarks WHERE fatwa_id = ?', bind: [fatwaId] });
          } else {
            db.exec({
              sql: 'INSERT OR REPLACE INTO user_db.bookmarks (fatwa_id, created_at) VALUES (?, ?)',
              bind: [fatwaId, Date.now()]
            });
          }
        }
        self.postMessage({ id, ok: true, result: true });
      } else if (action === 'RECORD_QUIZ_ATTEMPT') {
        if (db) {
          const { item } = payload;
          db.exec({
            sql: `INSERT OR REPLACE INTO user_db.quiz_attempts
                  (id, fatwa_id, principle_id, selected_principle_id, is_correct, timestamp, time_spent_ms, difficulty)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            bind: [
              item.id,
              item.fatwa_id,
              item.principle_id,
              item.selected_principle_id,
              item.is_correct ? 1 : 0,
              item.timestamp,
              item.time_spent_ms,
              item.difficulty
            ]
          });
        }
        self.postMessage({ id, ok: true, result: true });
      } else if (action === 'CLEAR_QUIZ_ATTEMPTS') {
        if (db) {
          db.exec('DELETE FROM user_db.quiz_attempts;');
        }
        self.postMessage({ id, ok: true, result: true });
      }
    } catch (error: any) {
      self.postMessage({
        id,
        ok: false,
        error: error?.message || String(error)
      });
    }
  };
}
