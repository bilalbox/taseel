import sqlite3InitModule, { type Database } from "@sqlite.org/sqlite-wasm";
import type {
	ArchiveQueryAdapter,
	BrowseFatwasParams,
	BrowseFatwasResult,
	Fatwa,
	FatwaDetail,
	FatwaPrinciple,
	FatwaSummary,
	Principle,
	PrincipleTreeNode,
	QuizQuestionChoice,
	QuizQuestionItem,
	RandomQuizQuestionParams,
} from "../types";
import { normalizeArabic } from "../utils/arabic";
import {
	createInMemoryArchiveDb,
	executeBrowseFatwas,
	executeGetRandomQuizQuestion,
	mulberry32,
	shuffleChoices,
} from "./archiveQuery";
import {
	EPISODES_DATA,
	FATWA_PRINCIPLES_DATA,
	FATWAS_DATA,
	PRINCIPLES_DATA,
} from "./mockData";

export function buildPrinciplesTree(
	principles: Principle[],
	fatwaPrinciples: FatwaPrinciple[] = [],
): PrincipleTreeNode[] {
	const linkedCounts = new Map<string, number>();
	for (const fp of fatwaPrinciples) {
		linkedCounts.set(
			fp.principle_id,
			(linkedCounts.get(fp.principle_id) || 0) + 1,
		);
	}

	const nodeMap = new Map<string, PrincipleTreeNode>();
	const roots: PrincipleTreeNode[] = [];

	for (const p of principles) {
		const node: PrincipleTreeNode = {
			...p,
			depth: p.depth ?? 0,
			parent_id: p.parent_id ?? null,
			fatwas_count: linkedCounts.get(p.id) || 0,
			children: [],
		};
		nodeMap.set(p.id, node);
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

export function flattenPrinciplesTree(
	nodes: PrincipleTreeNode[],
): PrincipleTreeNode[] {
	const result: PrincipleTreeNode[] = [];
	function traverse(list: PrincipleTreeNode[]) {
		for (const node of list) {
			result.push(node);
			if (node.children && node.children.length > 0) {
				traverse(node.children);
			}
		}
	}
	traverse(nodes);
	return result;
}

export function toFatwaSummary(
	fatwa: Fatwa,
	fatwaPrinciples: FatwaPrinciple[] = FATWA_PRINCIPLES_DATA,
): FatwaSummary {
	const linkedCount = fatwaPrinciples.filter(
		(fp) => fp.fatwa_id === fatwa.id,
	).length;
	return {
		id: fatwa.id,
		episode_id: fatwa.episode_id,
		scholar_name: fatwa.scholar_name,
		episode_number: fatwa.episode_number,
		question_text: fatwa.question_text,
		topic_domain: fatwa.topic_domain,
		topic_chapter: fatwa.topic_chapter,
		topic_subtopic: fatwa.topic_subtopic,
		audio_url: fatwa.audio_url,
		audio_timestamp: fatwa.audio_timestamp,
		linked_principles_count: linkedCount,
	};
}

export class MockArchiveAdapter implements ArchiveQueryAdapter {
	private fatwas: Fatwa[];
	private principles: Principle[];
	private fatwaPrinciples: FatwaPrinciple[];
	private db: Database | null = null;
	private dbInitPromise: Promise<Database | null> | null = null;

	constructor(
		fatwas: Fatwa[] = FATWAS_DATA,
		principles: Principle[] = PRINCIPLES_DATA,
		fatwaPrinciples: FatwaPrinciple[] = FATWA_PRINCIPLES_DATA,
	) {
		this.fatwas = fatwas;
		this.principles = principles;
		this.fatwaPrinciples = fatwaPrinciples;
	}

	private async ensureDb(): Promise<Database | null> {
		if (this.db) return this.db;
		if (this.dbInitPromise) return this.dbInitPromise;

		this.dbInitPromise = (async () => {
			try {
				const sqlite3 = await sqlite3InitModule();
				this.db = createInMemoryArchiveDb(sqlite3, {
					episodes: EPISODES_DATA,
					fatwas: this.fatwas,
					principles: this.principles,
					fatwaPrinciples: this.fatwaPrinciples,
				});
				return this.db;
			} catch (_err) {
				return null;
			}
		})();

		return this.dbInitPromise;
	}

	public async getPrinciplesTree(): Promise<PrincipleTreeNode[]> {
		return buildPrinciplesTree(this.principles, this.fatwaPrinciples);
	}

	public async browseFatwas(
		params: BrowseFatwasParams = {},
	): Promise<BrowseFatwasResult> {
		const db = await this.ensureDb();
		if (db) {
			return executeBrowseFatwas(db, params);
		}

		// Pure in-memory fallback without matchesSearch
		const t0 = performance.now();
		const {
			query,
			scholar = "ALL",
			chapter = "ALL",
			subtopic,
			principleId,
			limit = 20,
			offset = 0,
		} = params;

		let filtered = this.fatwas;

		if (scholar !== "ALL") {
			filtered = filtered.filter((f) => f.scholar_name === scholar);
		}

		if (chapter !== "ALL") {
			filtered = filtered.filter((f) => f.topic_chapter === chapter);
		}

		if (subtopic) {
			filtered = filtered.filter((f) => f.topic_subtopic === subtopic);
		}

		if (principleId) {
			const linkedFatwaIds = new Set(
				this.fatwaPrinciples
					.filter((fp) => fp.principle_id === principleId)
					.map((fp) => fp.fatwa_id),
			);
			filtered = filtered.filter((f) => linkedFatwaIds.has(f.id));
		}

		if (query?.trim()) {
			const normTokens = normalizeArabic(query.trim())
				.split(/\s+/)
				.map((t) => t.replace(/["*(){}:^]/g, "").trim())
				.filter(Boolean);

			if (normTokens.length > 0) {
				filtered = filtered.filter((f) => {
					const haystack = `${f.question_norm} ${f.answer_norm} ${normalizeArabic(f.topic_subtopic || "")}`;
					return normTokens.every((tok) => haystack.includes(tok));
				});
			}
		}

		const total = filtered.length;
		const paged = filtered.slice(offset, offset + limit);
		const fatwas = paged.map((f) => toFatwaSummary(f, this.fatwaPrinciples));
		const hasMore = offset + limit < total;
		const latencyMs = Number((performance.now() - t0).toFixed(2));

		return {
			fatwas,
			total,
			hasMore,
			latencyMs,
		};
	}

	public async getFatwaDetail(id: string): Promise<FatwaDetail | null> {
		const fatwa = this.fatwas.find((f) => f.id === id);
		if (!fatwa) {
			return null;
		}

		const linkedFp = this.fatwaPrinciples.filter((fp) => fp.fatwa_id === id);
		const linkedPrincipleIds = new Set(linkedFp.map((fp) => fp.principle_id));
		const principles = this.principles.filter((p) =>
			linkedPrincipleIds.has(p.id),
		);

		return {
			...fatwa,
			principles,
			fatwaPrinciples: linkedFp,
		};
	}

	public async getRandomQuizQuestion(
		params: RandomQuizQuestionParams = {},
	): Promise<QuizQuestionItem | null> {
		const db = await this.ensureDb();
		if (db) {
			return executeGetRandomQuizQuestion(db, params);
		}

		const {
			scholar = "ALL",
			chapter = "ALL",
			excludeFatwaIds = [],
			seed,
		} = params;

		const fpByFatwa = new Map<string, FatwaPrinciple>();
		for (const fp of this.fatwaPrinciples) {
			if (!fpByFatwa.has(fp.fatwa_id)) {
				fpByFatwa.set(fp.fatwa_id, fp);
			}
		}

		const principleMap = new Map<string, Principle>(
			this.principles.map((p) => [p.id, p]),
		);
		const grounded: {
			fatwa: Fatwa;
			fp: FatwaPrinciple;
			principle: Principle;
		}[] = [];

		for (const fatwa of this.fatwas) {
			if (scholar !== "ALL" && fatwa.scholar_name !== scholar) continue;
			if (chapter !== "ALL" && fatwa.topic_chapter !== chapter) continue;
			const fp = fpByFatwa.get(fatwa.id);
			if (fp) {
				const p = principleMap.get(fp.principle_id);
				if (p) {
					grounded.push({ fatwa, fp, principle: p });
				}
			}
		}

		if (grounded.length === 0) return null;

		const cleanExclude = new Set((excludeFatwaIds || []).filter(Boolean));
		const unanswered = grounded.filter((g) => !cleanExclude.has(g.fatwa.id));
		const candidatePool = unanswered.length > 0 ? unanswered : grounded;

		const rng = seed !== undefined ? mulberry32(seed) : Math.random;
		const selected = candidatePool[Math.floor(rng() * candidatePool.length)];
		if (!selected) return null;

		const correct_principle = selected.principle;
		const fatwa_principle = selected.fp;
		const fatwa = selected.fatwa;

		const contrastPairsMap: Record<string, string> = {
			"principle-ibaha": "principle-tawqeef",
			"principle-tawqeef": "principle-ibaha",
		};
		const contrastId = contrastPairsMap[correct_principle.id];

		const linkedPrincipleIds = new Set(
			this.fatwaPrinciples
				.filter((fp) => fp.fatwa_id === fatwa.id)
				.map((fp) => fp.principle_id),
		);
		const otherPrinciples = this.principles.filter(
			(p) => !linkedPrincipleIds.has(p.id),
		);
		otherPrinciples.sort((a, b) => {
			const aPriority =
				a.id === contrastId
					? 0
					: a.category === correct_principle.category
						? 1
						: 2;
			const bPriority =
				b.id === contrastId
					? 0
					: b.category === correct_principle.category
						? 1
						: 2;
			return aPriority - bPriority;
		});

		const distractorRows = otherPrinciples.slice(0, 3);
		const distractorChoices: QuizQuestionChoice[] = distractorRows.map((d) => ({
			id: d.id,
			text: d.canonical_text_ar,
			category: d.category,
			science: d.science || (d.category === "usuliyyah" ? "usul" : "fiqh"),
			is_correct: false,
			explanation:
				d.id === contrastId
					? "قاعدة مقابلة: التفريق بين باب العبادات التوقيف وباب المعاملات الإباحة"
					: `هذه القاعدة (${d.canonical_text_ar}) تتعلق بـ: ${String(d.general_explanation_ar).slice(0, 95)}... وليست مناط الحكم في هذه الفتوى.`,
		}));

		const correctChoice: QuizQuestionChoice = {
			id: correct_principle.id,
			text: correct_principle.canonical_text_ar,
			category: correct_principle.category,
			science:
				correct_principle.science ||
				(correct_principle.category === "usuliyyah" ? "usul" : "fiqh"),
			is_correct: true,
			explanation: fatwa_principle.application_explanation_ar,
		};

		const choices = shuffleChoices([correctChoice, ...distractorChoices], seed);

		return {
			fatwa,
			correct_principle,
			fatwa_principle,
			choices,
		};
	}

	public async getArchiveChapters(): Promise<string[]> {
		const db = await this.ensureDb();
		if (db) {
			const rows = db.selectObjects(
				"SELECT DISTINCT topic_chapter FROM fatwas WHERE topic_chapter IS NOT NULL AND topic_chapter != '' ORDER BY topic_chapter",
			);
			return rows.map((r: any) => String(r.topic_chapter));
		}
		return Array.from(
			new Set(
				this.fatwas
					.map((f) => f.topic_chapter)
					.filter((ch) => Boolean(ch?.trim())),
			),
		).sort();
	}
}

export const mockArchiveAdapter = new MockArchiveAdapter();
