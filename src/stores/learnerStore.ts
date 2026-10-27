import { MockArchiveAdapter } from "../data/mockArchiveAdapter";
import {
	FATWA_PRINCIPLES_DATA,
	FATWAS_DATA,
	PRINCIPLES_DATA,
} from "../data/mockData";
import { sqliteClient } from "../services/sqliteClient";
import type {
	ArchiveQueryAdapter,
	Fatwa,
	FatwaPrinciple,
	Principle,
	QuizQuestionItem,
	Scholar,
	UserQuizHistoryItem,
	UserState,
} from "../types";

export interface LearnerStorageData {
	bookmarks: string[];
	history: UserQuizHistoryItem[];
	xp?: number;
}

export interface LearnerStorageAdapter {
	loadData(): Promise<LearnerStorageData>;
	saveBookmark(fatwaId: string, isBookmarked: boolean): Promise<void>;
	saveAttempt(attempt: UserQuizHistoryItem, newXp?: number): Promise<void>;
	clearAttempts(): Promise<void>;
	clearAll?(): Promise<void>;
}

export interface CurrentQuizQuestion {
	fatwa: Fatwa;
	principle: Principle;
	fatwaPrinciple: FatwaPrinciple;
	isAnswered: boolean;
	lastAttempt?: {
		isCorrect: boolean;
		selectedId: string;
		timestamp: number;
	};
	quizItem?: QuizQuestionItem;
}

export interface LearnerStats {
	answeredCount: number;
	totalGroundedCount: number;
	correctCount: number;
	xp: number;
}

export interface LearnerStoreOptions {
	storageAdapter?: LearnerStorageAdapter;
	archiveAdapter?: ArchiveQueryAdapter;
	fatwas?: Fatwa[];
	principles?: Principle[];
	fatwaPrinciples?: FatwaPrinciple[];
	initialFatwaId?: string | null;
	filter?: { scholar?: Scholar | "ALL"; chapter?: string };
}

export class InMemoryLearnerStorageAdapter implements LearnerStorageAdapter {
	private bookmarks = new Set<string>();
	private history: UserQuizHistoryItem[] = [];
	private xp = 0;

	constructor(initialData?: Partial<LearnerStorageData>) {
		if (initialData?.bookmarks) {
			this.bookmarks = new Set(initialData.bookmarks);
		}
		if (initialData?.history) {
			this.history = [...initialData.history];
		}
		if (initialData?.xp !== undefined) {
			this.xp = initialData.xp;
		}
	}

	async loadData(): Promise<LearnerStorageData> {
		return {
			bookmarks: Array.from(this.bookmarks),
			history: [...this.history],
			xp: this.xp,
		};
	}

	async saveBookmark(fatwaId: string, isBookmarked: boolean): Promise<void> {
		if (isBookmarked) {
			this.bookmarks.add(fatwaId);
		} else {
			this.bookmarks.delete(fatwaId);
		}
	}

	async saveAttempt(
		attempt: UserQuizHistoryItem,
		newXp?: number,
	): Promise<void> {
		this.history.push(attempt);
		if (newXp !== undefined) {
			this.xp = newXp;
		}
	}

	async clearAttempts(): Promise<void> {
		this.history = [];
		this.xp = 0;
	}

	async clearAll(): Promise<void> {
		this.bookmarks.clear();
		this.history = [];
		this.xp = 0;
	}
}

export class SqliteLocalStorageAdapter implements LearnerStorageAdapter {
	private storageKey = "taseel_learner_progress_v1";
	private legacyStateKey = "taseel_user_state_v1";
	private legacyTrackerKey = "taseel_quiz_answered_v1";

	public loadDataFromLocal(): LearnerStorageData {
		if (typeof window === "undefined" || typeof localStorage === "undefined") {
			return { bookmarks: [], history: [], xp: 0 };
		}
		try {
			// 1. Try single canonical fallback store
			const raw = localStorage.getItem(this.storageKey);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (parsed && typeof parsed === "object") {
					return {
						bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
						history: Array.isArray(parsed.history) ? parsed.history : [],
						xp: typeof parsed.xp === "number" ? parsed.xp : 0,
					};
				}
			}

			// 2. Try migrating legacy key
			const legacyRaw = localStorage.getItem(this.legacyStateKey);
			if (legacyRaw) {
				const parsedLegacy = JSON.parse(legacyRaw);
				if (parsedLegacy && typeof parsedLegacy === "object") {
					const bookmarks = Array.isArray(parsedLegacy.bookmarks)
						? parsedLegacy.bookmarks
						: [];
					const history = Array.isArray(parsedLegacy.history)
						? parsedLegacy.history
						: [];
					const xp = typeof parsedLegacy.xp === "number" ? parsedLegacy.xp : 0;
					this.persistLocal({ bookmarks, history, xp });
					try {
						localStorage.removeItem(this.legacyTrackerKey);
					} catch {}
					return { bookmarks, history, xp };
				}
			}
		} catch {
			// Gracefully handle private browsing / quota
		}
		return { bookmarks: [], history: [], xp: 0 };
	}

	async loadData(): Promise<LearnerStorageData> {
		try {
			const sqliteData = await sqliteClient.loadUserState();
			if (
				sqliteData &&
				(sqliteData.bookmarks.length > 0 ||
					sqliteData.history.length > 0 ||
					sqliteData.xp > 0)
			) {
				this.persistLocal(sqliteData);
				return sqliteData;
			}
		} catch {
			// Worker not ready or running in SSR/mock test environment
		}
		return this.loadDataFromLocal();
	}

	private persistLocal(data: LearnerStorageData): void {
		if (typeof window === "undefined" || typeof localStorage === "undefined")
			return;
		try {
			localStorage.setItem(this.storageKey, JSON.stringify(data));
			localStorage.setItem(this.legacyStateKey, JSON.stringify(data));
			// Remove legacy separate quiz answered key to resolve desynchronization
			localStorage.removeItem(this.legacyTrackerKey);
		} catch {
			// Ignore quota / private browsing errors
		}
	}

	async saveBookmark(fatwaId: string, isBookmarked: boolean): Promise<void> {
		try {
			await sqliteClient.toggleBookmark(fatwaId);
		} catch {}

		const current = this.loadDataFromLocal();
		const set = new Set(current.bookmarks);
		if (isBookmarked) {
			set.add(fatwaId);
		} else {
			set.delete(fatwaId);
		}
		this.persistLocal({ ...current, bookmarks: Array.from(set) });
	}

	async saveAttempt(
		attempt: UserQuizHistoryItem,
		newXp?: number,
	): Promise<void> {
		try {
			await sqliteClient.recordQuizAttempt(attempt, newXp);
		} catch {}

		const current = this.loadDataFromLocal();
		const updatedHistory = [...current.history, attempt];
		const updatedXp =
			newXp !== undefined
				? newXp
				: (current.xp || 0) + (attempt.is_correct ? 20 : 5);
		this.persistLocal({
			...current,
			history: updatedHistory,
			xp: updatedXp,
		});
	}

	async clearAttempts(): Promise<void> {
		try {
			await sqliteClient.clearQuizAttempts();
		} catch {}

		const current = this.loadDataFromLocal();
		this.persistLocal({
			...current,
			history: [],
			xp: 0,
		});
	}
}

export class LearnerProgressStore {
	private storageAdapter: LearnerStorageAdapter;
	private archiveAdapter: ArchiveQueryAdapter;
	private fatwas: Fatwa[];
	private principles: Principle[];
	private fatwaPrinciples: FatwaPrinciple[];
	private bookmarks = new Set<string>();
	private history: UserQuizHistoryItem[] = [];
	private xp = 0;
	private activeFatwaId: string | null = null;
	private activePrincipleId: string | null = null;
	private activeQuizItem: QuizQuestionItem | null = null;
	private filter: { scholar?: Scholar | "ALL"; chapter?: string } = {
		scholar: "ALL",
		chapter: "ALL",
	};
	private listeners = new Set<() => void>();
	private version = 0;

	constructor(options: LearnerStoreOptions = {}) {
		this.storageAdapter =
			options.storageAdapter || new SqliteLocalStorageAdapter();
		this.fatwas = options.fatwas || FATWAS_DATA;
		this.principles = options.principles || PRINCIPLES_DATA;
		this.fatwaPrinciples = options.fatwaPrinciples || FATWA_PRINCIPLES_DATA;
		this.archiveAdapter =
			options.archiveAdapter ||
			(options.fatwas
				? new MockArchiveAdapter(
						this.fatwas,
						this.principles,
						this.fatwaPrinciples,
					)
				: sqliteClient);
		if (options.filter) {
			this.filter = options.filter;
		}

		// Initialize initial question
		if (options.initialFatwaId) {
			this.selectQuestion(options.initialFatwaId);
		} else {
			this.pickInitialQuestion();
		}

		// Hydrate from storage adapter asynchronously
		this.storageAdapter
			.loadData()
			.then((data) => {
				if (data.bookmarks.length > 0 || data.history.length > 0 || data.xp) {
					this.hydrate(data);
				}
			})
			.catch(() => {});
	}

	public subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	public getVersion(): number {
		return this.version;
	}

	private notify(): void {
		this.version++;
		for (const listener of this.listeners) {
			listener();
		}
	}

	public setFilter(filter?: {
		scholar?: Scholar | "ALL";
		chapter?: string;
	}): void {
		this.filter = {
			scholar: filter?.scholar || "ALL",
			chapter: filter?.chapter || "ALL",
		};
		this.notify();
	}

	public setCorpus(
		fatwas: Fatwa[],
		principles: Principle[],
		fatwaPrinciples: FatwaPrinciple[],
	): void {
		this.fatwas = fatwas;
		this.principles = principles;
		this.fatwaPrinciples = fatwaPrinciples;

		if (
			!this.activeFatwaId ||
			!this.fatwas.some((f) => f.id === this.activeFatwaId)
		) {
			this.pickInitialQuestion();
		} else {
			this.notify();
		}
	}

	public hydrate(data: Partial<LearnerStorageData>): void {
		let changed = false;
		if (data.bookmarks) {
			this.bookmarks = new Set([...this.bookmarks, ...data.bookmarks]);
			changed = true;
		}
		if (data.history && data.history.length > 0) {
			// Merge unique attempts by id
			const seen = new Set(this.history.map((h) => h.id));
			const additions = data.history.filter((h) => !seen.has(h.id));
			if (additions.length > 0) {
				this.history = [...this.history, ...additions];
				changed = true;
			}
		}
		if (typeof data.xp === "number") {
			this.xp = Math.max(this.xp, data.xp);
			changed = true;
		}
		if (changed) {
			this.notify();
		}
	}

	public getGroundedCandidates(filter?: {
		scholar?: Scholar | "ALL";
		chapter?: string;
	}): { fatwa: Fatwa; fatwaPrinciple: FatwaPrinciple; principle: Principle }[] {
		const activeFilter = filter || this.filter;
		const fpByFatwa = new Map<string, FatwaPrinciple>();
		for (const fp of this.fatwaPrinciples) {
			if (!fpByFatwa.has(fp.fatwa_id)) {
				fpByFatwa.set(fp.fatwa_id, fp);
			}
		}

		const principleMap = new Map<string, Principle>(
			this.principles.map((p) => [p.id, p]),
		);
		const candidates: {
			fatwa: Fatwa;
			fatwaPrinciple: FatwaPrinciple;
			principle: Principle;
		}[] = [];

		for (const fatwa of this.fatwas) {
			if (
				activeFilter.scholar &&
				activeFilter.scholar !== "ALL" &&
				fatwa.scholar_name !== activeFilter.scholar
			) {
				continue;
			}
			if (
				activeFilter.chapter &&
				activeFilter.chapter !== "ALL" &&
				fatwa.topic_chapter !== activeFilter.chapter
			) {
				continue;
			}
			const fp = fpByFatwa.get(fatwa.id);
			if (fp) {
				const principle = principleMap.get(fp.principle_id);
				if (principle) {
					candidates.push({ fatwa, fatwaPrinciple: fp, principle });
				}
			}
		}

		return candidates;
	}

	private pickInitialQuestion(): void {
		const candidates = this.getGroundedCandidates();
		if (candidates.length > 0) {
			const pick = candidates[Math.floor(Math.random() * candidates.length)];
			if (pick) {
				this.activeFatwaId = pick.fatwa.id;
				this.activePrincipleId = pick.fatwaPrinciple.principle_id;
				this.notify();
			}
		}
	}

	public isQuestionAnswered(
		fatwaId: string,
		principleId?: string | null,
	): boolean {
		if (principleId) {
			return this.history.some(
				(h) => h.fatwa_id === fatwaId && h.principle_id === principleId,
			);
		}
		return this.history.some((h) => h.fatwa_id === fatwaId);
	}

	public getAnsweredRecord(
		fatwaId: string,
		principleId?: string | null,
	): { isCorrect: boolean; selectedId: string; timestamp: number } | undefined {
		let attempt: UserQuizHistoryItem | undefined;
		if (principleId) {
			attempt = this.history
				.slice()
				.reverse()
				.find((h) => h.fatwa_id === fatwaId && h.principle_id === principleId);
		}
		if (!attempt) {
			attempt = this.history
				.slice()
				.reverse()
				.find((h) => h.fatwa_id === fatwaId);
		}
		if (!attempt) return undefined;
		return {
			isCorrect: attempt.is_correct,
			selectedId: attempt.selected_principle_id,
			timestamp: attempt.timestamp,
		};
	}

	public getCurrentQuestion(): CurrentQuizQuestion | null {
		if (!this.activeFatwaId) return null;
		const fatwa = this.fatwas.find((f) => f.id === this.activeFatwaId);
		if (!fatwa) return null;

		const fps = this.fatwaPrinciples.filter((fp) => fp.fatwa_id === fatwa.id);
		if (fps.length === 0) {
			return null;
		}

		const targetFp =
			fps.find((fp) => fp.principle_id === this.activePrincipleId) ?? fps[0];
		if (!targetFp) return null;
		const principle = this.principles.find(
			(p) => p.id === targetFp.principle_id,
		);
		if (!principle) return null;

		const isAnswered = this.isQuestionAnswered(fatwa.id, targetFp.principle_id);
		const lastAttempt = this.getAnsweredRecord(fatwa.id, targetFp.principle_id);

		return {
			fatwa,
			principle,
			fatwaPrinciple: targetFp,
			isAnswered,
			lastAttempt,
			quizItem:
				this.activeQuizItem && this.activeQuizItem.fatwa.id === fatwa.id
					? this.activeQuizItem
					: undefined,
		};
	}

	public getAnsweredFatwaIds(): string[] {
		return Array.from(new Set(this.history.map((h) => h.fatwa_id)));
	}

	public setCurrentQuizItem(item: QuizQuestionItem): void {
		this.activeFatwaId = item.fatwa.id;
		this.activePrincipleId = item.correct_principle.id;
		this.activeQuizItem = item;

		if (!this.fatwas.some((f) => f.id === item.fatwa.id)) {
			this.fatwas = [...this.fatwas, item.fatwa];
		}
		if (!this.principles.some((p) => p.id === item.correct_principle.id)) {
			this.principles = [...this.principles, item.correct_principle];
		}
		if (!this.fatwaPrinciples.some((fp) => fp.id === item.fatwa_principle.id)) {
			this.fatwaPrinciples = [...this.fatwaPrinciples, item.fatwa_principle];
		}
		this.notify();
	}

	public async fetchNextRandomQuestion(filter?: {
		scholar?: Scholar | "ALL";
		chapter?: string;
	}): Promise<QuizQuestionItem | null> {
		const activeFilter = filter || this.filter;
		const answeredIds = this.getAnsweredFatwaIds();
		const excludeFatwaIds = this.activeFatwaId
			? Array.from(new Set([...answeredIds, this.activeFatwaId]))
			: answeredIds;

		try {
			const item = await this.archiveAdapter.getRandomQuizQuestion({
				scholar: activeFilter.scholar,
				chapter: activeFilter.chapter,
				excludeFatwaIds,
			});

			if (item) {
				this.setCurrentQuizItem(item);
				return item;
			}
		} catch (_err) {}
		return null;
	}

	public getStats(): LearnerStats {
		const allCandidates = this.getGroundedCandidates({
			scholar: "ALL",
			chapter: "ALL",
		});
		let answeredCount = 0;
		for (const c of allCandidates) {
			if (this.isQuestionAnswered(c.fatwa.id, c.fatwaPrinciple.principle_id)) {
				answeredCount++;
			}
		}

		const correctCount = this.history.filter((h) => h.is_correct).length;

		return {
			answeredCount,
			totalGroundedCount: allCandidates.length,
			correctCount,
			xp: this.xp,
		};
	}

	public getUserState(): UserState {
		return {
			bookmarks: Array.from(this.bookmarks),
			history: [...this.history],
			xp: this.xp,
			streak_days: 1,
		};
	}

	public isBookmarked(fatwaId: string): boolean {
		return this.bookmarks.has(fatwaId);
	}

	public async toggleBookmark(fatwaId: string): Promise<boolean> {
		const exists = this.bookmarks.has(fatwaId);
		if (exists) {
			this.bookmarks.delete(fatwaId);
		} else {
			this.bookmarks.add(fatwaId);
		}
		const isNowBookmarked = !exists;
		this.notify();
		await this.storageAdapter.saveBookmark(fatwaId, isNowBookmarked);
		return isNowBookmarked;
	}

	public async recordAttempt(
		selectedId: string,
		timeSpentMs: number,
	): Promise<UserQuizHistoryItem | null> {
		const current = this.getCurrentQuestion();
		if (!current) return null;

		const isCorrect = selectedId === current.principle.id;
		const attempt: UserQuizHistoryItem = {
			id: `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			fatwa_id: current.fatwa.id,
			principle_id: current.fatwaPrinciple.principle_id,
			selected_principle_id: selectedId,
			is_correct: isCorrect,
			timestamp: Date.now(),
			time_spent_ms: timeSpentMs,
			difficulty: current.fatwaPrinciple.difficulty,
		};

		this.history.push(attempt);
		this.xp += isCorrect ? 20 : 5;
		this.notify();

		await this.storageAdapter.saveAttempt(attempt, this.xp);
		return attempt;
	}

	public async nextQuestion(filter?: {
		scholar?: Scholar | "ALL";
		chapter?: string;
	}): Promise<void> {
		const item = await this.fetchNextRandomQuestion(filter);
		if (item) {
			return;
		}

		// Fallback if archiveAdapter fails to return a question
		let pool = this.getGroundedCandidates(filter || this.filter);
		if (pool.length === 0) {
			pool = this.getGroundedCandidates({ scholar: "ALL", chapter: "ALL" });
		}
		if (pool.length === 0) return;

		// Prioritize unanswered questions
		const unanswered = pool.filter(
			(c) =>
				!this.isQuestionAnswered(c.fatwa.id, c.fatwaPrinciple.principle_id),
		);
		const sourcePool = unanswered.length > 0 ? unanswered : pool;

		// Exclude current fatwa when pool has multiple candidates
		const candidatePool =
			sourcePool.length > 1 && this.activeFatwaId
				? sourcePool.filter((c) => c.fatwa.id !== this.activeFatwaId)
				: sourcePool;

		const finalPool = candidatePool.length > 0 ? candidatePool : sourcePool;
		const pick = finalPool[Math.floor(Math.random() * finalPool.length)];

		if (pick) {
			this.activeFatwaId = pick.fatwa.id;
			this.activePrincipleId = pick.fatwaPrinciple.principle_id;
			this.activeQuizItem = null;
			this.notify();
		}
	}

	public selectQuestion(fatwaId: string, principleId?: string | null): void {
		this.activeFatwaId = fatwaId;
		this.activePrincipleId = principleId || null;
		if (this.activeQuizItem && this.activeQuizItem.fatwa.id !== fatwaId) {
			this.activeQuizItem = null;
		}
		this.notify();
	}

	public async resetProgress(): Promise<void> {
		this.history = [];
		this.xp = 0;
		this.activeQuizItem = null;
		this.notify();
		await this.storageAdapter.clearAttempts();
	}
}

export const learnerStore = new LearnerProgressStore();
