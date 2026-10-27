import type {
	BrowseFatwasParams,
	BrowseFatwasResult,
	Episode,
	Fatwa,
	FatwaPrinciple,
	FatwaSummary,
	Principle,
	PrincipleCategory,
	QuizQuestionChoice,
	QuizQuestionItem,
	RandomQuizQuestionParams,
	Scholar,
} from "../types";
import { normalizeArabic } from "../utils/arabic";

export function mapCategory(
	science: string,
	kind: string = "",
): PrincipleCategory {
	if (kind?.startsWith("dabit")) return "dabit";
	if (science === "usul") return "usuliyyah";
	return "fiqhiyyah";
}

export function mulberry32(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function shuffleChoices<T>(items: T[], seed?: number): T[] {
	const result = [...items];
	const rng = seed !== undefined ? mulberry32(seed) : Math.random;
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		const itemI = result[i];
		const itemJ = result[j];
		if (itemI !== undefined && itemJ !== undefined) {
			result[i] = itemJ;
			result[j] = itemI;
		}
	}
	return result;
}

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
		if (!s || s.includes("archive.org")) continue;
		return s;
	}
	return undefined;
}

export function buildBrowseFatwasQuery(
	params: BrowseFatwasParams = {},
): BrowseFatwasQuery {
	const {
		query,
		scholar = "ALL",
		chapter = "ALL",
		subtopic,
		principleId,
		limit = 20,
		offset = 0,
	} = params;

	const conditions: string[] = [];
	const bindings: any[] = [];

	const rawQuery = (query || "").trim();
	const norm = normalizeArabic(rawQuery);

	let fromClause = "";
	let countFromClause = "";
	let ftsQuery: string | undefined;

	if (norm) {
		const tokens = norm
			.split(/\s+/)
			.map((tok) => tok.replace(/["*(){}:^]/g, "").trim())
			.filter(Boolean);

		if (tokens.length > 0) {
			ftsQuery = tokens.map((tok) => `"${tok}"*`).join(" AND ");
			fromClause = `
        FROM fatwas_fts fts
        JOIN fatwas f ON f.rowid = fts.rowid
        LEFT JOIN episodes e ON e.id = f.episode_id
      `;
			countFromClause = `
        FROM fatwas_fts fts
        JOIN fatwas f ON f.rowid = fts.rowid
      `;
			conditions.push("fatwas_fts MATCH ?");
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

	if (scholar && scholar !== "ALL") {
		conditions.push("f.scholar_name = ?");
		bindings.push(scholar);
	}

	if (chapter && chapter !== "ALL") {
		conditions.push("f.topic_chapter = ?");
		bindings.push(chapter);
	}

	if (subtopic) {
		conditions.push("f.topic_subtopic = ?");
		bindings.push(subtopic);
	}

	if (principleId) {
		conditions.push(
			"EXISTS (SELECT 1 FROM fatwa_principles fp WHERE fp.fatwa_id = f.id AND fp.principle_id = ?)",
		);
		bindings.push(principleId);
	}

	const whereClause =
		conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

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

export function executeBrowseFatwas(
	db: any,
	params: BrowseFatwasParams = {},
): BrowseFatwasResult {
	const t0 = performance.now();
	const { countSql, pageSql, bindings, pageBindings } =
		buildBrowseFatwasQuery(params);

	const total = Number(
		(bindings.length > 0
			? db.selectValue(countSql, bindings)
			: db.selectValue(countSql)) || 0,
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
			topic_subtopic: String(r.topic_subtopic || "فتاوى نور على الدرب"),
			audio_url: clip,
			audio_timestamp: Number(r.audio_start_sec || 0),
			linked_principles_count: Number(r.linked_principles_count || 0),
		};
	});

	const limit = typeof params.limit === "number" ? params.limit : 20;
	const offset = typeof params.offset === "number" ? params.offset : 0;
	const hasMore = offset + limit < total;
	const latencyMs = Number((performance.now() - t0).toFixed(2));

	return {
		fatwas,
		total,
		hasMore,
		latencyMs,
	};
}

export function executeGetRandomQuizQuestion(
	db: any,
	params: RandomQuizQuestionParams = {},
): QuizQuestionItem | null {
	const {
		scholar = "ALL",
		chapter = "ALL",
		excludeFatwaIds = [],
		seed,
	} = params;

	const conditions: string[] = [];
	const baseBindings: any[] = [];

	if (scholar && scholar !== "ALL") {
		conditions.push("f.scholar_name = ?");
		baseBindings.push(scholar);
	}

	if (chapter && chapter !== "ALL") {
		conditions.push("f.topic_chapter = ?");
		baseBindings.push(chapter);
	}

	const cleanExclude = (excludeFatwaIds || []).filter(Boolean);
	let selectedCandidate: any = null;

	const selectCandidateSql = `
    SELECT f.id, f.episode_id, f.scholar_name, f.question_text, f.answer_text,
           f.topic_domain, f.topic_chapter, f.topic_subtopic, f.audio_start_sec,
           f.audio_url AS fatwa_audio_url,
           e.episode_number, e.audio_url AS episode_audio_url,
           fp.id AS fp_id, fp.principle_id, fp.invocation_type, fp.evidence_quote_ar,
           fp.application_explanation_ar, fp.difficulty
    FROM fatwas f
    LEFT JOIN episodes e ON e.id = f.episode_id
    JOIN fatwa_principles fp ON fp.fatwa_id = f.id
  `;

	// 1. Prioritize unanswered questions by excluding cleanExclude
	if (cleanExclude.length > 0) {
		const placeholders = cleanExclude.map(() => "?").join(",");
		const unansweredConds = [...conditions, `f.id NOT IN (${placeholders})`];
		const whereUnanswered =
			unansweredConds.length > 0
				? `WHERE ${unansweredConds.join(" AND ")}`
				: "";
		const bindingsUnanswered = [...baseBindings, ...cleanExclude];

		if (seed !== undefined) {
			const rows = db.selectObjects(
				`${selectCandidateSql} ${whereUnanswered} ORDER BY f.rowid ASC`,
				bindingsUnanswered,
			);
			if (rows.length > 0) {
				const rng = mulberry32(seed);
				selectedCandidate = rows[Math.floor(rng() * rows.length)];
			}
		} else {
			const rows = db.selectObjects(
				`${selectCandidateSql} ${whereUnanswered} ORDER BY RANDOM() LIMIT 1`,
				bindingsUnanswered,
			);
			if (rows.length > 0) {
				selectedCandidate = rows[0];
			}
		}
	}

	// 2. Fallback to any matching grounded fatwa if all are answered (or cleanExclude was empty)
	if (!selectedCandidate) {
		const whereAll =
			conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
		if (seed !== undefined) {
			const rows = db.selectObjects(
				`${selectCandidateSql} ${whereAll} ORDER BY f.rowid ASC`,
				baseBindings,
			);
			if (rows.length > 0) {
				const rng = mulberry32(seed);
				selectedCandidate = rows[Math.floor(rng() * rows.length)];
			}
		} else {
			const rows = db.selectObjects(
				`${selectCandidateSql} ${whereAll} ORDER BY RANDOM() LIMIT 1`,
				baseBindings,
			);
			if (rows.length > 0) {
				selectedCandidate = rows[0];
			}
		}
	}

	if (!selectedCandidate) {
		return null;
	}

	const clip = usableAudioUrl(
		selectedCandidate.fatwa_audio_url,
		selectedCandidate.episode_audio_url,
	);
	const fatwa: Fatwa = {
		id: String(selectedCandidate.id),
		episode_id: String(selectedCandidate.episode_id),
		scholar_name: String(selectedCandidate.scholar_name) as Scholar,
		episode_number: Number(selectedCandidate.episode_number || 1),
		question_text: String(selectedCandidate.question_text),
		answer_text: String(selectedCandidate.answer_text),
		question_norm: normalizeArabic(String(selectedCandidate.question_text)),
		answer_norm: normalizeArabic(String(selectedCandidate.answer_text)),
		topic_domain: String(selectedCandidate.topic_domain) as any,
		topic_chapter: String(selectedCandidate.topic_chapter),
		topic_subtopic: String(
			selectedCandidate.topic_subtopic || "فتاوى نور على الدرب",
		),
		audio_url: clip,
		audio_timestamp: Number(selectedCandidate.audio_start_sec || 0),
	};

	const targetPrincipleId = String(selectedCandidate.principle_id);
	const pRows = db.selectObjects(
		`SELECT id, parent_id, depth, science, domain_section, kind,
            canonical_text_ar, canonical_text_norm, summary_ar, textual_evidence_ar
     FROM principles
     WHERE id = ?
     LIMIT 1`,
		[targetPrincipleId],
	);

	if (pRows.length === 0) {
		return null;
	}

	const pRow = pRows[0];
	const correct_principle: Principle = {
		id: String(pRow.id),
		parent_id: pRow.parent_id ? String(pRow.parent_id) : null,
		depth: Number(pRow.depth || 0),
		science: String(pRow.science),
		domain_section: String(pRow.domain_section),
		kind: String(pRow.kind),
		canonical_text_ar: String(pRow.canonical_text_ar),
		canonical_text_norm: String(pRow.canonical_text_norm),
		category: mapCategory(String(pRow.science), String(pRow.kind)),
		general_explanation_ar:
			String(pRow.summary_ar) +
			(pRow.textual_evidence_ar
				? ` — الدليل: «${pRow.textual_evidence_ar}»`
				: ""),
	};

	const fatwa_principle: FatwaPrinciple = {
		id: String(selectedCandidate.fp_id),
		fatwa_id: String(selectedCandidate.id),
		principle_id: targetPrincipleId,
		explicitly_stated:
			selectedCandidate.invocation_type !== "implicit_application",
		application_explanation_ar: selectedCandidate.evidence_quote_ar
			? `${selectedCandidate.application_explanation_ar} — محل الشاهد: «${selectedCandidate.evidence_quote_ar}»`
			: selectedCandidate.application_explanation_ar || "",
		distractor_principles_json: "[]",
		difficulty: (selectedCandidate.difficulty ||
			(correct_principle.depth && correct_principle.depth >= 2
				? "advanced"
				: correct_principle.depth === 1
					? "intermediate"
					: "beginner")) as any,
	};

	// 3. Select 3 high-contrast distractors directly in SQL:
	// Priority 0: contrast_pair in principle_relations
	// Priority 1: same science and same kind
	// Priority 2: same science
	// Priority 3: same depth
	// Priority 4: others
	const distractorQuery = `
    SELECT p.id, p.parent_id, p.depth, p.science, p.domain_section, p.kind,
           p.canonical_text_ar, p.canonical_text_norm, p.summary_ar, p.textual_evidence_ar,
           pr.explanation_ar AS contrast_explanation,
           CASE
             WHEN pr.relation_type = 'contrast_pair' THEN 0
             WHEN p.science = ? AND p.kind = ? THEN 1
             WHEN p.science = ? THEN 2
             WHEN p.depth = ? THEN 3
             ELSE 4
           END AS priority
    FROM principles p
    LEFT JOIN principle_relations pr ON (
      ((pr.source_id = ? AND pr.target_id = p.id) OR (pr.target_id = ? AND pr.source_id = p.id))
      AND pr.relation_type = 'contrast_pair'
    )
    WHERE p.id != ?
      AND p.id NOT IN (SELECT fp2.principle_id FROM fatwa_principles fp2 WHERE fp2.fatwa_id = ?)
    ORDER BY priority ASC, ${seed !== undefined ? "p.rowid ASC" : "RANDOM()"}
    LIMIT 3
  `;

	const distractorBindings = [
		correct_principle.science,
		correct_principle.kind || "",
		correct_principle.science,
		correct_principle.depth ?? 0,
		targetPrincipleId,
		targetPrincipleId,
		targetPrincipleId,
		fatwa.id,
	];

	const distractorRows = db.selectObjects(distractorQuery, distractorBindings);

	const distractorChoices: QuizQuestionChoice[] = distractorRows.map(
		(d: any) => ({
			id: String(d.id),
			text: String(d.canonical_text_ar),
			category: mapCategory(String(d.science), String(d.kind)),
			science: String(d.science),
			is_correct: false,
			explanation: d.contrast_explanation
				? `قاعدة مقابلة: ${d.contrast_explanation}`
				: `هذه القاعدة (${d.canonical_text_ar}) تتعلق بـ: ${String(d.summary_ar).slice(0, 95)}... وليست مناط الحكم في هذه الفتوى.`,
		}),
	);

	const correctChoice: QuizQuestionChoice = {
		id: correct_principle.id,
		text: correct_principle.canonical_text_ar,
		category: correct_principle.category,
		science: correct_principle.science,
		is_correct: true,
		explanation: fatwa_principle.application_explanation_ar,
	};

	fatwa_principle.distractor_principles_json = JSON.stringify(
		distractorRows.map((d: any) => ({
			id: String(d.id),
			canonical_text_ar: String(d.canonical_text_ar),
			category: mapCategory(String(d.science), String(d.kind)),
			reason_incorrect: d.contrast_explanation
				? `قاعدة مقابلة: ${d.contrast_explanation}`
				: `هذه القاعدة (${d.canonical_text_ar}) تتعلق بـ: ${String(d.summary_ar).slice(0, 95)}... وليست مناط الحكم في هذه الفتوى.`,
		})),
	);

	const rawChoices = [correctChoice, ...distractorChoices];
	const choices = shuffleChoices(rawChoices, seed);

	return {
		fatwa,
		correct_principle,
		fatwa_principle,
		choices,
	};
}

export interface PrincipleRelationItem {
	source_id: string;
	target_id: string;
	relation_type: string;
	explanation_ar: string;
}

export function createInMemoryArchiveDb(
	sqlite3: any,
	options: {
		episodes?: Episode[];
		fatwas?: Fatwa[];
		principles?: Principle[];
		fatwaPrinciples?: FatwaPrinciple[];
		principleRelations?: PrincipleRelationItem[];
	} = {},
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

    CREATE TABLE IF NOT EXISTS principle_relations (
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      explanation_ar TEXT NOT NULL,
      PRIMARY KEY (source_id, target_id, relation_type)
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

	const {
		episodes = [],
		fatwas = [],
		principles = [],
		fatwaPrinciples = [],
		principleRelations = [
			{
				source_id: "fiqh.yaqeen.baqaa.taharah",
				target_id: "fiqh.yaqeen.baqaa.hadath",
				relation_type: "contrast_pair",
				explanation_ar:
					"التمييز الدقيق بين كون المتيقن السابق هو الطهارة أم الحدث.",
			},
			{
				source_id: "fiqh.yaqeen.baqaa",
				target_id: "fiqh.yaqeen.baraa",
				relation_type: "contrast_pair",
				explanation_ar:
					"الأول استصحاب لوصف وجودي أو حكم ثبت سابقاً، والثاني استصحاب لعدم شغل الذمة ابتداءً.",
			},
			{
				source_id: "usul.adillah.istishab.tawqeef_ibadat",
				target_id: "usul.adillah.istishab.ibaha_muamalat",
				relation_type: "contrast_pair",
				explanation_ar:
					"التفريق الأصولي الجوهري بين باب العبادات (التوقيف والمنع إلا بدليل) وباب المعاملات والعادات (الإباحة إلا بدليل).",
			},
			{
				source_id: "principle-ibaha",
				target_id: "principle-tawqeef",
				relation_type: "contrast_pair",
				explanation_ar:
					"التفريق الأصولي بين باب العبادات (التوقيف والمنع إلا بدليل) وباب المعاملات والعادات (الإباحة إلا بدليل).",
			},
		],
	} = options;

	for (const rel of principleRelations) {
		db.exec({
			sql: `INSERT OR REPLACE INTO principle_relations (source_id, target_id, relation_type, explanation_ar)
            VALUES (?, ?, ?, ?)`,
			bind: [
				rel.source_id,
				rel.target_id,
				rel.relation_type,
				rel.explanation_ar,
			],
		});
	}

	for (const ep of episodes) {
		db.exec({
			sql: `INSERT OR REPLACE INTO episodes (id, scholar_name, episode_number, source_url, audio_url)
            VALUES (?, ?, ?, ?, ?)`,
			bind: [
				ep.id,
				ep.scholar_name,
				ep.episode_number,
				ep.source_url || null,
				ep.audio_url || null,
			],
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
				p.science || (p.category === "usuliyyah" ? "usul" : "fiqh"),
				p.domain_section || "",
				p.kind ||
					(p.category === "dabit" ? "dabit_fiqhi" : "qa_idah_kulliyyah"),
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
				normalizeArabic(f.topic_subtopic || ""),
			],
		});
	}

	for (const fp of fatwaPrinciples) {
		db.exec({
			sql: `INSERT OR REPLACE INTO fatwa_principles (id, fatwa_id, principle_id, invocation_type, evidence_quote_ar, application_explanation_ar, difficulty)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
			bind: [
				fp.id,
				fp.fatwa_id,
				fp.principle_id,
				(fp as any).invocation_type ||
					(fp.explicitly_stated ? "explicit_verbatim" : "implicit_application"),
				(fp as any).evidence_quote_ar || "",
				fp.application_explanation_ar || "",
				fp.difficulty || null,
			],
		});
	}

	return db;
}
