/// <reference lib="webworker" />
import sqlite3InitModule, {
	type Database,
	type SAHPoolUtil,
} from "@sqlite.org/sqlite-wasm";
import {
	executeBrowseFatwas,
	executeGetRandomQuizQuestion,
	mapCategory,
	usableAudioUrl,
} from "../data/archiveQuery";
import { mockArchiveAdapter } from "../data/mockArchiveAdapter";
import type {
	BrowseFatwasParams,
	BrowseFatwasResult,
	Fatwa,
	FatwaDetail,
	FatwaPrinciple,
	Principle,
	PrincipleTreeNode,
} from "../types";
import { normalizeArabic } from "../utils/arabic";

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
let currentVfs = "opfs-sahpool";

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

function postProgress(
	stage: string,
	bytesProcessed = 0,
	totalExpected = 0,
	detail = "",
) {
	if (typeof self !== "undefined" && self.postMessage) {
		self.postMessage({
			type: "BOOT_PROGRESS",
			stage,
			bytesProcessed,
			totalExpected,
			detail,
		});
	}
}

function fatwasHasAudioUrlColumn(database: Database): boolean {
	const cols = database.selectObjects("PRAGMA table_info(fatwas)");
	return cols.some((c: any) => String(c.name) === "audio_url");
}

async function initEngines() {
	const t0 = performance.now();
	postProgress("INIT_WASM", 0, 0, "جاري تحميل محرك SQLite WASM...");

	const sqlite3 = await sqlite3InitModule();

	postProgress(
		"MOUNT_OPFS",
		0,
		0,
		"جاري تهيئة نظام الملفات الخاص (opfs-sahpool)...",
	);

	try {
		poolUtil = await sqlite3.installOpfsSAHPoolVfs({
			name: "taseel-opfs-pool",
			initialCapacity: 8,
		});
		currentVfs = "opfs-sahpool";
	} catch (_err) {
		poolUtil = null;
		currentVfs = "memory-vfs";
	}

	let manifest: ManifestData | null = null;
	try {
		const res = await fetch("/manifest.json", { cache: "no-cache" });
		if (res.ok) {
			manifest = await res.json();
		}
	} catch (_err) {}

	if (poolUtil) {
		// 1. Initialize persistent user_state.sqlite3 first
		const userDb = new poolUtil.OpfsSAHPoolDb("/user_state.sqlite3");
		userDb.exec(USER_SCHEMA_SQL);

		let installedSha = "";
		const shaRows = userDb.selectObjects(
			"SELECT value FROM kv_meta WHERE key = 'content_sha256'",
		);
		const firstSha = shaRows[0];
		if (firstSha && typeof firstSha.value === "string") {
			installedSha = firstSha.value;
		}

		const existingFiles = poolUtil.getFileNames();
		const hasContentDb =
			existingFiles.includes("/content.sqlite3") ||
			existingFiles.includes("content.sqlite3");

		// Older OPFS installs predate fatwas.audio_url; querying them throws SQLITE_ERROR.
		let schemaStale = false;
		if (hasContentDb) {
			try {
				const probe = new poolUtil.OpfsSAHPoolDb("/content.sqlite3");
				schemaStale = !fatwasHasAudioUrlColumn(probe);
				probe.close();
			} catch (_err) {
				schemaStale = true;
			}
		}

		const needsDownload =
			!hasContentDb ||
			schemaStale ||
			Boolean(manifest?.sha256 && installedSha !== manifest.sha256);

		if (needsDownload && manifest) {
			// Close userDb temporarily while streaming content.sqlite3 into SAHPool
			userDb.close();

			if (hasContentDb) {
				try {
					poolUtil.unlink("/content.sqlite3");
				} catch {
					try {
						poolUtil.unlink("content.sqlite3");
					} catch {
						/* importDb will overwrite when possible */
					}
				}
			}

			postProgress(
				"DECOMPRESSING_OPFS",
				0,
				manifest.uncompressed_bytes,
				schemaStale
					? "جاري تحديث قاعدة البيانات (مخطط جديد يتضمن روابط الصوت)..."
					: "جاري فك ضغط أرشيف نور على الدرب (19,301 فتوى) مباشرة إلى OPFS...",
			);

			const response = await fetch(manifest.url);
			if (!response.ok || !response.body) {
				throw new Error(`Failed to fetch ${manifest.url}: ${response.status}`);
			}

			const decompressedStream = response.body.pipeThrough(
				new DecompressionStream("gzip"),
			);
			const reader = decompressedStream.getReader();
			let bytesWritten = 0;
			let lastReportBytes = 0;

			await poolUtil.importDb("/content.sqlite3", async () => {
				const { done, value } = await reader.read();
				if (done) {
					return undefined;
				}
				bytesWritten += value.byteLength;
				if (bytesWritten - lastReportBytes >= 1_500_000) {
					lastReportBytes = bytesWritten;
					postProgress(
						"DECOMPRESSING_OPFS",
						bytesWritten,
						manifest.uncompressed_bytes,
						`جاري كتابة قاعدة البيانات في OPFS (${(bytesWritten / (1024 * 1024)).toFixed(1)} MB)...`,
					);
				}
				return value;
			});

			const userDbUpdate = new poolUtil.OpfsSAHPoolDb("/user_state.sqlite3");
			userDbUpdate.exec({
				sql: "INSERT OR REPLACE INTO kv_meta (key, value) VALUES ('content_sha256', ?)",
				bind: [manifest.sha256],
			});
			userDbUpdate.close();
		} else if (schemaStale) {
			userDb.close();
			throw new Error(
				"Content DB is missing fatwas.audio_url and manifest.json is unavailable for re-download.",
			);
		} else {
			userDb.close();
		}

		// 2. Open content.sqlite3 as primary connection & ATTACH user_state.sqlite3 AS user_db
		postProgress(
			"ATTACHING_USER_DB",
			0,
			0,
			"جاري ربط قاعدة بيانات المستخدم (ATTACH user_db)...",
		);
		db = new poolUtil.OpfsSAHPoolDb("/content.sqlite3");
		db.exec("ATTACH DATABASE '/user_state.sqlite3' AS user_db;");
	} else {
		throw new Error(
			"OPFS SyncAccessHandle Pool requires a modern browser Worker environment.",
		);
	}

	const bootMs = Math.round(performance.now() - t0);
	const payload = loadInitialUiPayload(manifest, bootMs);
	postProgress(
		"READY",
		manifest?.uncompressed_bytes ?? 0,
		manifest?.uncompressed_bytes ?? 0,
		"جاهز للعمل بدون اتصال (100% Offline)",
	);
	return payload;
}

function loadInitialUiPayload(manifest: ManifestData | null, bootMs: number) {
	if (!db) throw new Error("Database not initialized");

	// Load UserState from attached `user_db`
	const bookmarkRows = db.selectObjects(
		"SELECT fatwa_id FROM user_db.bookmarks ORDER BY created_at DESC",
	);
	const historyRows = db.selectObjects(
		"SELECT * FROM user_db.quiz_attempts ORDER BY timestamp DESC LIMIT 100",
	);

	const totalFatwasCount = Number(
		db.selectValue("SELECT COUNT(*) FROM fatwas") ||
			manifest?.counts.fatwas ||
			19301,
	);
	const totalGroundedCount = Number(
		db.selectValue("SELECT COUNT(*) FROM fatwa_principles") ||
			manifest?.counts.fatwa_principles ||
			831,
	);

	return {
		vfs: currentVfs,
		bootMs,
		manifest,
		totalFatwasCount,
		totalGroundedCount,
		principles: [],
		fatwas: [],
		fatwaPrinciples: [],
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
				difficulty: String(h.difficulty) as any,
			})),
		},
	};
}

function getPrinciplesTreeWorker(): PrincipleTreeNode[] {
	if (!db) throw new Error("Database not initialized");
	const rows = db.selectObjects(`
    SELECT p.id, p.parent_id, p.depth, p.science, p.domain_section, p.kind,
           p.canonical_text_ar, p.canonical_text_norm, p.summary_ar, p.textual_evidence_ar,
           (SELECT COUNT(*) FROM fatwa_principles fp WHERE fp.principle_id = p.id) AS fatwas_count
    FROM principles p
    ORDER BY p.depth ASC, p.id ASC
  `);

	const nodeMap = new Map<string, PrincipleTreeNode>();
	const roots: PrincipleTreeNode[] = [];

	for (const r of rows) {
		const node: PrincipleTreeNode = {
			id: String(r.id),
			parent_id: r.parent_id ? String(r.parent_id) : null,
			depth: Number(r.depth || 0),
			science: String(r.science || ""),
			domain_section: String(r.domain_section || ""),
			kind: String(r.kind || ""),
			canonical_text_ar: String(r.canonical_text_ar),
			canonical_text_norm: String(r.canonical_text_norm),
			category: mapCategory(String(r.science), String(r.kind)),
			general_explanation_ar:
				String(r.summary_ar) +
				(r.textual_evidence_ar ? ` — الدليل: «${r.textual_evidence_ar}»` : ""),
			fatwas_count: Number(r.fatwas_count || 0),
			children: [],
		};
		nodeMap.set(node.id, node);
	}

	for (const node of nodeMap.values()) {
		if (node.parent_id && nodeMap.has(node.parent_id)) {
			nodeMap.get(node.parent_id)!.children.push(node);
		} else {
			roots.push(node);
		}
	}

	return roots;
}

function browseFatwasWorker(
	params: BrowseFatwasParams = {},
): BrowseFatwasResult {
	if (!db) throw new Error("Database not initialized");
	return executeBrowseFatwas(db, params);
}

function getFatwaDetailWorker(id: string): FatwaDetail | null {
	if (!db) throw new Error("Database not initialized");

	const fatwaRows = db.selectObjects(
		`
    SELECT f.id, f.episode_id, f.scholar_name, f.question_text, f.answer_text,
           f.topic_domain, f.topic_chapter, f.topic_subtopic, f.audio_start_sec,
           f.audio_url AS fatwa_audio_url,
           e.episode_number, e.audio_url AS episode_audio_url, e.source_url
    FROM fatwas f
    JOIN episodes e ON e.id = f.episode_id
    WHERE f.id = ?
    LIMIT 1
    `,
		[id],
	);

	const r = fatwaRows[0];
	if (!r) {
		return null;
	}
	const clip = usableAudioUrl(r.fatwa_audio_url, r.episode_audio_url);
	const fatwa: Fatwa = {
		id: String(r.id),
		episode_id: String(r.episode_id),
		question_text: String(r.question_text),
		answer_text: String(r.answer_text),
		question_norm: normalizeArabic(String(r.question_text)),
		answer_norm: normalizeArabic(String(r.answer_text)),
		topic_domain: String(r.topic_domain) as any,
		topic_chapter: String(r.topic_chapter),
		topic_subtopic: String(r.topic_subtopic || "فتاوى نور على الدرب"),
		scholar_name: String(r.scholar_name) as any,
		episode_number: Number(r.episode_number || 1),
		audio_url: clip,
		audio_timestamp: Number(r.audio_start_sec || 0),
	};

	const fpRows = db.selectObjects(
		`
    SELECT fp.id, fp.fatwa_id, fp.principle_id, fp.invocation_type,
           fp.evidence_quote_ar, fp.application_explanation_ar, fp.confidence_score, fp.difficulty,
           p.id AS p_id, p.parent_id, p.depth, p.science, p.domain_section, p.kind,
           p.canonical_text_ar, p.canonical_text_norm, p.summary_ar, p.textual_evidence_ar
    FROM fatwa_principles fp
    JOIN principles p ON p.id = fp.principle_id
    WHERE fp.fatwa_id = ?
    `,
		[id],
	);

	const principles: Principle[] = [];
	const fatwaPrinciples: FatwaPrinciple[] = [];

	for (const fpRow of fpRows) {
		const principle: Principle = {
			id: String(fpRow.p_id),
			parent_id: fpRow.parent_id ? String(fpRow.parent_id) : null,
			depth: Number(fpRow.depth || 0),
			science: String(fpRow.science),
			domain_section: String(fpRow.domain_section),
			kind: String(fpRow.kind),
			canonical_text_ar: String(fpRow.canonical_text_ar),
			canonical_text_norm: String(fpRow.canonical_text_norm),
			category: mapCategory(String(fpRow.science), String(fpRow.kind)),
			general_explanation_ar:
				String(fpRow.summary_ar) +
				(fpRow.textual_evidence_ar
					? ` — الدليل: «${fpRow.textual_evidence_ar}»`
					: ""),
		};
		principles.push(principle);

		const distractorRows = db.selectObjects(
			`
      SELECT id, canonical_text_ar, science, kind, summary_ar
      FROM principles
      WHERE id != ?
      ORDER BY (CASE WHEN science = ? THEN 0 ELSE 1 END), RANDOM()
      LIMIT 3
      `,
			[fpRow.p_id, fpRow.science],
		);

		const distractors = distractorRows.map((d: any) => ({
			id: String(d.id),
			canonical_text_ar: String(d.canonical_text_ar),
			category: mapCategory(String(d.science), String(d.kind)),
			reason_incorrect: `هذه القاعدة (${d.canonical_text_ar}) تتعلق بـ: ${String(d.summary_ar).slice(0, 95)}... وليست مناط الحكم في هذه الفتوى.`,
		}));

		fatwaPrinciples.push({
			id: String(fpRow.id),
			fatwa_id: String(fpRow.fatwa_id),
			principle_id: String(fpRow.principle_id),
			explicitly_stated: fpRow.invocation_type !== "implicit_application",
			application_explanation_ar: `${fpRow.application_explanation_ar} — محل الشاهد: «${fpRow.evidence_quote_ar}»`,
			distractor_principles_json: JSON.stringify(distractors),
			difficulty: (fpRow.difficulty ||
				(principle.depth && principle.depth >= 2
					? "advanced"
					: principle.depth === 1
						? "intermediate"
						: "beginner")) as any,
		});
	}

	return {
		...fatwa,
		principles,
		fatwaPrinciples,
	};
}

function getArchiveChaptersWorker(): string[] {
	if (!db) throw new Error("Database not initialized");
	const rows = db.selectObjects(
		"SELECT DISTINCT topic_chapter FROM fatwas WHERE topic_chapter IS NOT NULL AND topic_chapter != '' ORDER BY topic_chapter",
	);
	return rows.map((r: any) => String(r.topic_chapter));
}

function loadUserStateWorker(): {
	bookmarks: string[];
	history: any[];
	xp: number;
} {
	if (!db) throw new Error("Database not initialized");
	const bookmarkRows = db.selectObjects(
		"SELECT fatwa_id FROM user_db.bookmarks ORDER BY created_at DESC",
	);
	const historyRows = db.selectObjects(
		"SELECT * FROM user_db.quiz_attempts ORDER BY timestamp ASC",
	);
	const xpVal = db.selectValue(
		"SELECT value FROM user_db.kv_meta WHERE key = 'xp'",
	);

	const history = historyRows.map((h: any) => ({
		id: String(h.id),
		fatwa_id: String(h.fatwa_id),
		principle_id: String(h.principle_id),
		selected_principle_id: String(h.selected_principle_id),
		is_correct: Boolean(h.is_correct),
		timestamp: Number(h.timestamp),
		time_spent_ms: Number(h.time_spent_ms),
		difficulty: String(h.difficulty) as any,
	}));

	const calculatedXp = history.reduce(
		(acc, h) => acc + (h.is_correct ? 20 : 5),
		0,
	);
	const xp = xpVal != null ? Number(xpVal) : calculatedXp;

	return {
		bookmarks: bookmarkRows.map((b: any) => String(b.fatwa_id)),
		history,
		xp,
	};
}

function getRandomQuizQuestionWorker(params: any = {}) {
	if (!db) throw new Error("Database not initialized");
	return executeGetRandomQuizQuestion(db, params);
}

if (typeof self !== "undefined") {
	self.onmessage = async (event: MessageEvent) => {
		const { id, action, payload } = event.data;
		try {
			if (action === "INIT") {
				const result = await initEngines();
				self.postMessage({ id, ok: true, result });
			} else if (action === "GET_PRINCIPLES_TREE") {
				const result = db
					? getPrinciplesTreeWorker()
					: await mockArchiveAdapter.getPrinciplesTree();
				self.postMessage({ id, ok: true, result });
			} else if (action === "BROWSE_FATWAS") {
				const result = db
					? browseFatwasWorker(payload)
					: await mockArchiveAdapter.browseFatwas(payload);
				self.postMessage({ id, ok: true, result });
			} else if (action === "GET_FATWA_DETAIL") {
				const result = db
					? getFatwaDetailWorker(payload?.id)
					: await mockArchiveAdapter.getFatwaDetail(payload?.id);
				self.postMessage({ id, ok: true, result });
			} else if (action === "GET_RANDOM_QUIZ_QUESTION") {
				const result = db
					? getRandomQuizQuestionWorker(payload)
					: await mockArchiveAdapter.getRandomQuizQuestion(payload);
				self.postMessage({ id, ok: true, result });
			} else if (action === "GET_ARCHIVE_CHAPTERS") {
				const result = db
					? getArchiveChaptersWorker()
					: await mockArchiveAdapter.getArchiveChapters();
				self.postMessage({ id, ok: true, result });
			} else if (action === "LOAD_USER_STATE") {
				const result = db
					? loadUserStateWorker()
					: { bookmarks: [], history: [], xp: 0 };
				self.postMessage({ id, ok: true, result });
			} else if (action === "TOGGLE_BOOKMARK") {
				if (db) {
					const { fatwaId } = payload;
					const exists = db.selectValue(
						"SELECT 1 FROM user_db.bookmarks WHERE fatwa_id = ?",
						[fatwaId],
					);
					if (exists) {
						db.exec({
							sql: "DELETE FROM user_db.bookmarks WHERE fatwa_id = ?",
							bind: [fatwaId],
						});
					} else {
						db.exec({
							sql: "INSERT OR REPLACE INTO user_db.bookmarks (fatwa_id, created_at) VALUES (?, ?)",
							bind: [fatwaId, Date.now()],
						});
					}
				}
				self.postMessage({ id, ok: true, result: true });
			} else if (action === "RECORD_QUIZ_ATTEMPT") {
				if (db) {
					const { item, newXp } = payload;
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
							item.difficulty,
						],
					});
					if (typeof newXp === "number") {
						db.exec({
							sql: "INSERT OR REPLACE INTO user_db.kv_meta (key, value) VALUES ('xp', ?)",
							bind: [String(newXp)],
						});
					}
				}
				self.postMessage({ id, ok: true, result: true });
			} else if (action === "CLEAR_QUIZ_ATTEMPTS") {
				if (db) {
					db.exec("DELETE FROM user_db.quiz_attempts;");
					db.exec("DELETE FROM user_db.kv_meta WHERE key = 'xp';");
				}
				self.postMessage({ id, ok: true, result: true });
			}
		} catch (error: any) {
			self.postMessage({
				id,
				ok: false,
				error: error?.message || String(error),
			});
		}
	};
}
