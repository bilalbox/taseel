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
	QuizQuestionMode,
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

function selectQuizCandidate(
	db: any,
	conditions: string[],
	baseBindings: any[],
	cleanExclude: string[],
	seed?: number,
): any {
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

	if (cleanExclude.length > 0) {
		const placeholders = cleanExclude.map(() => "?").join(",");
		const unansweredConds = [...conditions, `f.id NOT IN (${placeholders})`];
		const whereUnanswered = `WHERE ${unansweredConds.join(" AND ")}`;
		const bindingsUnanswered = [...baseBindings, ...cleanExclude];

		const rows = db.selectObjects(
			`${selectCandidateSql} ${whereUnanswered} ${
				seed !== undefined
					? "ORDER BY f.rowid ASC"
					: "ORDER BY RANDOM() LIMIT 1"
			}`,
			bindingsUnanswered,
		);
		if (rows.length > 0) {
			if (seed !== undefined) {
				const rng = mulberry32(seed);
				return rows[Math.floor(rng() * rows.length)];
			}
			return rows[0];
		}
	}

	const whereAll =
		conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
	const rows = db.selectObjects(
		`${selectCandidateSql} ${whereAll} ${
			seed !== undefined ? "ORDER BY f.rowid ASC" : "ORDER BY RANDOM() LIMIT 1"
		}`,
		baseBindings,
	);
	if (rows.length > 0) {
		if (seed !== undefined) {
			const rng = mulberry32(seed);
			return rows[Math.floor(rng() * rows.length)];
		}
		return rows[0];
	}

	return null;
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
	const selectedCandidate = selectQuizCandidate(
		db,
		conditions,
		baseBindings,
		cleanExclude,
		seed,
	);

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

	const { rootKubra, usulFoundation } = resolvePrincipleLineage(
		db,
		targetPrincipleId,
	);

	const { effectiveMode, questionTitleAr } = resolveQuestionModeAndTitle(
		params.mode,
		correct_principle.science || "fiqh",
		Boolean(rootKubra),
		Boolean(usulFoundation),
	);

	let choices: QuizQuestionChoice[];
	if (effectiveMode === "compound_hierarchy" && rootKubra) {
		choices = buildCompoundHierarchyChoices(
			db,
			correct_principle,
			rootKubra,
			fatwa,
			fatwa_principle,
			seed,
		);
	} else if (effectiveMode === "usul_foundation" && usulFoundation) {
		choices = buildUsulFoundationChoices(
			db,
			usulFoundation,
			rootKubra,
			correct_principle,
			fatwa_principle,
			seed,
		);
	} else {
		choices = buildIdentifyPrincipleChoices(
			db,
			correct_principle,
			fatwa,
			fatwa_principle,
			seed,
		);
	}

	return {
		fatwa,
		correct_principle,
		fatwa_principle,
		choices,
		question_mode: effectiveMode,
		question_title_ar: questionTitleAr,
		root_kubra: rootKubra,
		usul_foundation: usulFoundation,
	};
}

function resolvePrincipleLineage(
	db: any,
	targetPrincipleId: string,
): {
	rootKubra?: Principle;
	usulFoundation?: Principle;
} {
	const lineageRows = db.selectObjects(
		`WITH RECURSIVE lineage AS (
			SELECT id, parent_id, depth, science, domain_section, kind,
			       canonical_text_ar, canonical_text_norm, summary_ar, textual_evidence_ar
			FROM principles
			WHERE id = ?
			UNION ALL
			SELECT p.id, p.parent_id, p.depth, p.science, p.domain_section, p.kind,
			       p.canonical_text_ar, p.canonical_text_norm, p.summary_ar, p.textual_evidence_ar
			FROM principles p
			JOIN lineage l ON p.id = l.parent_id
		)
		SELECT * FROM lineage ORDER BY depth ASC`,
		[targetPrincipleId],
	);

	const rootRow = lineageRows.find((r: any) => r.depth === 0) || lineageRows[0];
	const rootKubra: Principle | undefined =
		rootRow && String(rootRow.id) !== targetPrincipleId
			? {
					id: String(rootRow.id),
					parent_id: rootRow.parent_id ? String(rootRow.parent_id) : null,
					depth: Number(rootRow.depth || 0),
					science: String(rootRow.science),
					domain_section: String(rootRow.domain_section),
					kind: String(rootRow.kind),
					canonical_text_ar: String(rootRow.canonical_text_ar),
					canonical_text_norm: String(rootRow.canonical_text_norm),
					category: mapCategory(String(rootRow.science), String(rootRow.kind)),
					general_explanation_ar: String(rootRow.summary_ar),
				}
			: undefined;

	const usulFoundationRows = db.selectObjects(
		`WITH RECURSIVE lineage(id, parent_id) AS (
			SELECT id, parent_id FROM principles WHERE id = ?
			UNION ALL
			SELECT p.id, p.parent_id FROM principles p JOIN lineage l ON p.id = l.parent_id
		)
		SELECT pr.source_id, pr.target_id, pr.relation_type, pr.explanation_ar,
		       p.id, p.parent_id, p.depth, p.science, p.domain_section, p.kind,
		       p.canonical_text_ar, p.canonical_text_norm, p.summary_ar, p.textual_evidence_ar
		FROM lineage l
		JOIN principle_relations pr ON (pr.source_id = l.id OR pr.target_id = l.id)
		JOIN principles p ON (p.id = CASE WHEN pr.source_id = l.id THEN pr.target_id ELSE pr.source_id END)
		WHERE pr.relation_type = 'usul_foundation'
		  AND p.science = 'usul'
		LIMIT 1`,
		[targetPrincipleId],
	);

	const usulRow = usulFoundationRows[0];
	const usulFoundation: Principle | undefined = usulRow
		? {
				id: String(usulRow.id),
				parent_id: usulRow.parent_id ? String(usulRow.parent_id) : null,
				depth: Number(usulRow.depth || 0),
				science: String(usulRow.science),
				domain_section: String(usulRow.domain_section),
				kind: String(usulRow.kind),
				canonical_text_ar: String(usulRow.canonical_text_ar),
				canonical_text_norm: String(usulRow.canonical_text_norm),
				category: "usuliyyah",
				general_explanation_ar: usulRow.explanation_ar
					? String(usulRow.explanation_ar)
					: String(usulRow.summary_ar),
			}
		: undefined;

	return { rootKubra, usulFoundation };
}

function resolveQuestionModeAndTitle(
	requestedMode: QuizQuestionMode | undefined,
	science: string,
	hasRootKubra: boolean,
	hasUsulFoundation: boolean,
): { effectiveMode: QuizQuestionMode; questionTitleAr: string } {
	if (requestedMode === "compound_hierarchy" && hasRootKubra) {
		return {
			effectiveMode: "compound_hierarchy",
			questionTitleAr:
				science === "usul"
					? "ما الضابط الأصولي المطبق في هذه الفتوى، وتحت أي أصل كلي يندرج؟"
					: "ما الضابط الفقهي المباشر المطبق في هذه الفتوى، وتحت أي قاعدة كبرى يندرج؟",
		};
	}

	if (requestedMode === "usul_foundation" && hasUsulFoundation) {
		return {
			effectiveMode: "usul_foundation",
			questionTitleAr:
				"بُني الحكم في هذه الفتوى على قاعدة فقهية؛ فما الأصل الأصولي الكلي (الدليل الإجمالي) الذي تستند إليه هذه القاعدة؟",
		};
	}

	if (requestedMode === "auto") {
		if (hasRootKubra) {
			return {
				effectiveMode: "compound_hierarchy",
				questionTitleAr:
					science === "usul"
						? "ما الضابط الأصولي المطبق في هذه الفتوى، وتحت أي أصل كلي يندرج؟"
						: "ما الضابط الفقهي المباشر المطبق في هذه الفتوى، وتحت أي قاعدة كبرى يندرج؟",
			};
		}
		if (hasUsulFoundation) {
			return {
				effectiveMode: "usul_foundation",
				questionTitleAr:
					"بُني الحكم في هذه الفتوى على قاعدة فقهية؛ فما الأصل الأصولي الكلي (الدليل الإجمالي) الذي تستند إليه هذه القاعدة؟",
			};
		}
	}

	return {
		effectiveMode: "identify_principle",
		questionTitleAr: "ما القاعدة التي بُني عليها الحكم في هذه الفتوى؟",
	};
}

function buildIdentifyPrincipleChoices(
	db: any,
	correct_principle: Principle,
	fatwa: Fatwa,
	fatwa_principle: FatwaPrinciple,
	seed?: number,
): QuizQuestionChoice[] {
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
		correct_principle.id,
		correct_principle.id,
		correct_principle.id,
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

	return shuffleChoices([correctChoice, ...distractorChoices], seed);
}

function buildCompoundHierarchyChoices(
	db: any,
	correct_principle: Principle,
	rootKubra: Principle,
	fatwa: Fatwa,
	fatwa_principle: FatwaPrinciple,
	seed?: number,
): QuizQuestionChoice[] {
	const correctChoice: QuizQuestionChoice = {
		id: correct_principle.id,
		text: `الضابط: «${correct_principle.canonical_text_ar}» ⇠ يندرج تحت: «${rootKubra.canonical_text_ar}»`,
		category: correct_principle.category,
		science: correct_principle.science,
		is_correct: true,
		explanation: `قرر الشيخ أن الحكم مبني على ضابط «${correct_principle.canonical_text_ar}» المندرج تحت قاعدة «${rootKubra.canonical_text_ar}».`,
	};

	// Distractor 1: Same Dabit + WRONG Kubra
	const altKubraRows = db.selectObjects(
		`SELECT id, canonical_text_ar FROM principles
		 WHERE depth = 0 AND id != ? AND science = ?
		 ORDER BY ${seed !== undefined ? "rowid ASC" : "RANDOM()"} LIMIT 1`,
		[rootKubra.id, correct_principle.science],
	);
	const altKubra = altKubraRows[0];
	const altKubraText = altKubra
		? String(altKubra.canonical_text_ar)
		: "المشقة تجلب التيسير";
	const altKubraId = altKubra ? String(altKubra.id) : "alt-kubra";

	const distractor1: QuizQuestionChoice = {
		id: `${correct_principle.id}__wrong_${altKubraId}`,
		text: `الضابط: «${correct_principle.canonical_text_ar}» ⇠ يندرج تحت: «${altKubraText}»`,
		category: correct_principle.category,
		science: correct_principle.science,
		is_correct: false,
		explanation: `الضابط المذكور صحيح، لكنه لا يتفرع عن قاعدة «${altKubraText}»، بل يندرج تحت قاعدة «${rootKubra.canonical_text_ar}».`,
	};

	// Distractor 2: Contrast Dabit or Sibling Dabit under correct Kubra
	const siblingRows = db.selectObjects(
		`SELECT p.id, p.canonical_text_ar, pr.explanation_ar AS contrast_exp
		 FROM principles p
		 LEFT JOIN principle_relations pr ON (
		   ((pr.source_id = ? AND pr.target_id = p.id) OR (pr.target_id = ? AND pr.source_id = p.id))
		   AND pr.relation_type = 'contrast_pair'
		 )
		 WHERE p.id != ?
		   AND (pr.relation_type = 'contrast_pair' OR p.parent_id = ? OR p.kind LIKE '%dabit%')
		   AND p.id NOT IN (SELECT fp2.principle_id FROM fatwa_principles fp2 WHERE fp2.fatwa_id = ?)
		 ORDER BY (CASE WHEN pr.relation_type = 'contrast_pair' THEN 0 ELSE 1 END) ASC,
		          ${seed !== undefined ? "p.rowid ASC" : "RANDOM()"}
		 LIMIT 1`,
		[
			correct_principle.id,
			correct_principle.id,
			correct_principle.id,
			rootKubra.id,
			fatwa.id,
		],
	);
	const sibling = siblingRows[0];
	const distractor2: QuizQuestionChoice = sibling
		? {
				id: String(sibling.id),
				text: `الضابط: «${sibling.canonical_text_ar}» ⇠ يندرج تحت: «${rootKubra.canonical_text_ar}»`,
				category: correct_principle.category,
				science: correct_principle.science,
				is_correct: false,
				explanation: sibling.contrast_exp
					? `قاعدة مقابلة: ${sibling.contrast_exp}`
					: `هذا الضابط (${sibling.canonical_text_ar}) يندرج تحت نفس القاعدة الكبرى لكنه لا ينطبق على مسألة هذه الفتوى.`,
			}
		: {
				id: "alt-sibling-dabit",
				text: `الضابط: «الأصل في الصفات العارضة العدم» ⇠ يندرج تحت: «${rootKubra.canonical_text_ar}»`,
				category: correct_principle.category,
				science: correct_principle.science,
				is_correct: false,
				explanation: `ضابط لا ينطبق على مسألة هذه الفتوى.`,
			};

	// Distractor 3: Another Dabit from another branch + another Kubra
	const otherDabitRows = db.selectObjects(
		`SELECT p.id, p.canonical_text_ar, p.kind, p.science,
		        COALESCE(parent.canonical_text_ar, 'قاعدة كلية أخرى') AS parent_text
		 FROM principles p
		 LEFT JOIN principles parent ON parent.id = p.parent_id
		 WHERE p.id != ? AND p.id != ?
		   AND (p.parent_id != ? OR p.parent_id IS NULL)
		   AND p.kind LIKE '%dabit%'
		 ORDER BY ${seed !== undefined ? "p.rowid ASC" : "RANDOM()"}
		 LIMIT 1`,
		[correct_principle.id, distractor2.id, rootKubra.id],
	);
	const otherDabit = otherDabitRows[0];
	const distractor3: QuizQuestionChoice = otherDabit
		? {
				id: String(otherDabit.id),
				text: `الضابط: «${otherDabit.canonical_text_ar}» ⇠ يندرج تحت: «${otherDabit.parent_text}»`,
				category: mapCategory(
					String(otherDabit.science),
					String(otherDabit.kind),
				),
				science: String(otherDabit.science),
				is_correct: false,
				explanation: `هذا الضابط وقاعدته يتعلقان بباب آخر (${otherDabit.canonical_text_ar})، وليس مناط الحكم في هذه الفتوى.`,
			}
		: {
				id: "alt-other-dabit",
				text: `الضابط: «كل قرض جر نفعاً مشروطاً فهو ربا» ⇠ يندرج تحت: «الضرر يزال»`,
				category: "dabit",
				science: "fiqh",
				is_correct: false,
				explanation: `ضابط مالي مخصوص بباب القرض والمعاملات لا صلة له بهذه المسألة.`,
			};

	const distractorChoices = [distractor1, distractor2, distractor3];

	fatwa_principle.distractor_principles_json = JSON.stringify(
		distractorChoices.map((d) => ({
			id: d.id,
			canonical_text_ar: d.text,
			category: d.category,
			reason_incorrect: d.explanation || "",
		})),
	);

	return shuffleChoices([correctChoice, ...distractorChoices], seed);
}

function buildUsulFoundationChoices(
	db: any,
	usulFoundation: Principle,
	rootKubra: Principle | undefined,
	correct_principle: Principle,
	fatwa_principle: FatwaPrinciple,
	seed?: number,
): QuizQuestionChoice[] {
	const governingPrincipleText = rootKubra
		? rootKubra.canonical_text_ar
		: correct_principle.canonical_text_ar;

	const correctChoice: QuizQuestionChoice = {
		id: usulFoundation.id,
		text: `دليل «الاستصحاب»: «${usulFoundation.canonical_text_ar}»`,
		category: "usuliyyah",
		science: "usul",
		is_correct: true,
		explanation:
			usulFoundation.general_explanation_ar ||
			`الاستصحاب هو الدليل الأصولي الإجمالي الذي تتفرع عنه قاعدة «${governingPrincipleText}».`,
	};

	const distractorRows = db.selectObjects(
		`SELECT id, canonical_text_ar, summary_ar, kind, science
		 FROM principles
		 WHERE science = 'usul' AND id != ?
		 ORDER BY ${seed !== undefined ? "rowid ASC" : "RANDOM()"}
		 LIMIT 3`,
		[usulFoundation.id],
	);

	const distractorChoices: QuizQuestionChoice[] = distractorRows.map(
		(d: any) => ({
			id: String(d.id),
			text: `«${d.canonical_text_ar}»`,
			category: "usuliyyah" as const,
			science: "usul",
			is_correct: false,
			explanation: `هذا الأصل الأصولي (${d.canonical_text_ar}) دليل أصولي معتبر في بابه، لكن الاستدلال في هذه الفتوى مبني على استصحاب الحكم الثابت بيقين.`,
		}),
	);

	fatwa_principle.distractor_principles_json = JSON.stringify(
		distractorChoices.map((d) => ({
			id: d.id,
			canonical_text_ar: d.text,
			category: d.category,
			reason_incorrect: d.explanation || "",
		})),
	);

	return shuffleChoices([correctChoice, ...distractorChoices], seed);
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
			{
				source_id: "fiqh.yaqeen",
				target_id: "usul.adillah.istishab",
				relation_type: "usul_foundation",
				explanation_ar:
					"قاعدة «اليقين لا يزول بالشك» وفروعها هي التطبيق الفقهي لدليل «الاستصحاب» الأصولي.",
			},
			{
				source_id: "principle-yaqeen",
				target_id: "usul.adillah.istishab",
				relation_type: "usul_foundation",
				explanation_ar:
					"قاعدة «اليقين لا يزول بالشك» وفروعها هي التطبيق الفقهي لدليل «الاستصحاب» الأصولي.",
			},
			{
				source_id: "principle-dabit-taharah",
				target_id: "principle-dabit-hadath",
				relation_type: "contrast_pair",
				explanation_ar:
					"التمييز الدقيق بين كون المتيقن السابق هو الطهارة أم الحدث.",
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
