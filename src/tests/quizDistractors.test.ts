import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createInMemoryArchiveDb,
	executeGetRandomQuizQuestion,
	shuffleChoices,
} from "../data/archiveQuery";
import { mockArchiveAdapter } from "../data/mockArchiveAdapter";
import {
	EPISODES_DATA,
	FATWA_PRINCIPLES_DATA,
	FATWAS_DATA,
	PRINCIPLES_DATA,
} from "../data/mockData";
import { sqliteClient } from "../services/sqliteClient";
import {
	InMemoryLearnerStorageAdapter,
	LearnerProgressStore,
} from "../stores/learnerStore";

describe("Server/Worker-side Distractor Generation & Quiz Query Engine (Ticket #5)", () => {
	let sqlite3: any;
	let db: any;

	beforeEach(async () => {
		sqlite3 = await sqlite3InitModule();
		db = createInMemoryArchiveDb(sqlite3, {
			episodes: EPISODES_DATA,
			fatwas: FATWAS_DATA,
			principles: PRINCIPLES_DATA,
			fatwaPrinciples: FATWA_PRINCIPLES_DATA,
		});
	});

	afterEach(() => {
		if (db) {
			try {
				db.close();
			} catch {}
		}
	});

	describe("executeGetRandomQuizQuestion (Direct SQLite SQL Execution)", () => {
		it("always returns 4 distinct options with exactly one correct option", () => {
			for (let i = 0; i < 10; i++) {
				const item = executeGetRandomQuizQuestion(db);
				expect(item).not.toBeNull();
				if (!item) return;

				expect(item.choices).toHaveLength(4);

				// Distinct option IDs
				const ids = item.choices.map((c) => c.id);
				const uniqueIds = new Set(ids);
				expect(uniqueIds.size).toBe(4);

				// Exactly one correct option
				const correctChoices = item.choices.filter((c) => c.is_correct);
				expect(correctChoices).toHaveLength(1);
				expect(correctChoices[0]?.id).toBe(item.correct_principle.id);

				// Exactly 3 distractors
				const distractors = item.choices.filter((c) => !c.is_correct);
				expect(distractors).toHaveLength(3);

				// Each choice has required fields
				for (const choice of item.choices) {
					expect(choice.id).toBeTruthy();
					expect(choice.text).toBeTruthy();
					expect(["fiqhiyyah", "usuliyyah", "dabit"]).toContain(
						choice.category,
					);
					expect(choice.explanation).toBeTruthy();
				}
			}
		});

		it("ensures distractors share the same science/category or are valid contrast pairs", () => {
			// Contrast pairs map
			const knownContrastPairs = new Set([
				"principle-ibaha:principle-tawqeef",
				"principle-tawqeef:principle-ibaha",
				"fiqh.yaqeen.baqaa.taharah:fiqh.yaqeen.baqaa.hadath",
				"fiqh.yaqeen.baqaa.hadath:fiqh.yaqeen.baqaa.taharah",
				"fiqh.yaqeen.baqaa:fiqh.yaqeen.baraa",
				"fiqh.yaqeen.baraa:fiqh.yaqeen.baqaa",
			]);

			for (let i = 0; i < 15; i++) {
				const item = executeGetRandomQuizQuestion(db);
				expect(item).not.toBeNull();
				if (!item) return;

				const correct = item.correct_principle;
				const distractors = item.choices.filter((c) => !c.is_correct);

				for (const distractor of distractors) {
					const pairKey = `${correct.id}:${distractor.id}`;
					const isContrastPair = knownContrastPairs.has(pairKey);
					const isSameCategory = distractor.category === correct.category;
					const isSameScience =
						(correct.science === "fiqh" &&
							["fiqhiyyah", "dabit"].includes(distractor.category)) ||
						(correct.science === "usul" && distractor.category === "usuliyyah");

					expect(
						isContrastPair || isSameCategory || isSameScience,
						`Distractor "${distractor.id}" (${distractor.category}) must share science/category with correct "${correct.id}" (${correct.category}) or be a contrast pair`,
					).toBe(true);
				}
			}
		});

		it("selects contrast pair as top-priority distractor when available in principle_relations", () => {
			// fatwa-102 is grounded in principle-tawqeef, which has contrast pair principle-ibaha
			const item = executeGetRandomQuizQuestion(db, {
				chapter: "Salat", // fatwa-102
			});

			expect(item).not.toBeNull();
			expect(item?.correct_principle.id).toBe("principle-tawqeef");

			const choiceIds = item!.choices.map((c) => c.id);
			expect(choiceIds).toContain("principle-ibaha");

			const ibahaChoice = item!.choices.find((c) => c.id === "principle-ibaha");
			expect(ibahaChoice?.is_correct).toBe(false);
			expect(ibahaChoice?.explanation).toContain("قاعدة مقابلة");
		});

		it("respects scholar filter constraints", () => {
			const ibnBazQuestions = Array.from({ length: 6 }).map(() =>
				executeGetRandomQuizQuestion(db, { scholar: "ابن باز" }),
			);

			for (const q of ibnBazQuestions) {
				expect(q).not.toBeNull();
				expect(q?.fatwa.scholar_name).toBe("ابن باز");
			}

			const uthaymeenQuestions = Array.from({ length: 6 }).map(() =>
				executeGetRandomQuizQuestion(db, { scholar: "ابن عثيمين" }),
			);

			for (const q of uthaymeenQuestions) {
				expect(q).not.toBeNull();
				expect(q?.fatwa.scholar_name).toBe("ابن عثيمين");
			}
		});

		it("respects topic chapter filter constraints", () => {
			const taharahQ = executeGetRandomQuizQuestion(db, { chapter: "Taharah" });
			expect(taharahQ).not.toBeNull();
			expect(taharahQ?.fatwa.topic_chapter).toBe("Taharah");

			const muamalatQ = executeGetRandomQuizQuestion(db, {
				chapter: "Muamalat",
			});
			expect(muamalatQ).not.toBeNull();
			expect(muamalatQ?.fatwa.topic_chapter).toBe("Muamalat");

			// Unmatched chapter returns null
			const nonExistent = executeGetRandomQuizQuestion(db, {
				chapter: "NonExistentChapterXYZ",
			});
			expect(nonExistent).toBeNull();
		});

		it("prioritizes excludeFatwaIds so unanswered questions are served first", () => {
			// Exclude 4 of 5 grounded fatwas: fatwa-101, fatwa-102, fatwa-103, fatwa-104
			// Only fatwa-105 remains unanswered
			const exclude = ["fatwa-101", "fatwa-102", "fatwa-103", "fatwa-104"];
			const q = executeGetRandomQuizQuestion(db, { excludeFatwaIds: exclude });

			expect(q).not.toBeNull();
			expect(q?.fatwa.id).toBe("fatwa-105");
		});

		it("gracefully cycles when all fatwas are in excludeFatwaIds instead of failing", () => {
			const allFatwaIds = FATWAS_DATA.map((f) => f.id);
			const q = executeGetRandomQuizQuestion(db, {
				excludeFatwaIds: allFatwaIds,
			});

			expect(q).not.toBeNull();
			expect(allFatwaIds).toContain(q?.fatwa.id);
		});

		it("shuffles choices with a stable random seed", () => {
			const seed = 98765;
			const q1 = executeGetRandomQuizQuestion(db, { seed });
			const q2 = executeGetRandomQuizQuestion(db, { seed });

			expect(q1).not.toBeNull();
			expect(q2).not.toBeNull();

			expect(q1?.fatwa.id).toBe(q2?.fatwa.id);
			expect(q1?.choices.map((c) => c.id)).toEqual(
				q2?.choices.map((c) => c.id),
			);
		});
	});

	describe("shuffleChoices Utility", () => {
		it("produces identical order with the same seed and different order with different seed", () => {
			const items = ["A", "B", "C", "D"];
			const shuffled1 = shuffleChoices(items, 42);
			const shuffled2 = shuffleChoices(items, 42);
			const shuffled3 = shuffleChoices(items, 9999);

			expect(shuffled1).toEqual(shuffled2);
			expect(shuffled1.sort()).toEqual([...items].sort());
			// Different seed should generally differ in arrangement
			expect(shuffled1).not.toEqual(shuffled3);
		});
	});

	describe("mockArchiveAdapter.getRandomQuizQuestion", () => {
		it("returns a complete QuizQuestionItem matching filters", async () => {
			const item = await mockArchiveAdapter.getRandomQuizQuestion({
				scholar: "ابن باز",
			});
			expect(item).not.toBeNull();
			expect(item?.fatwa.scholar_name).toBe("ابن باز");
			expect(item?.choices).toHaveLength(4);
			expect(item?.choices.filter((c) => c.is_correct)).toHaveLength(1);
		});

		it("serves unanswered questions by respecting excludeFatwaIds", async () => {
			const item = await mockArchiveAdapter.getRandomQuizQuestion({
				excludeFatwaIds: ["fatwa-101", "fatwa-102", "fatwa-103", "fatwa-105"],
			});

			expect(item).not.toBeNull();
			expect(item?.fatwa.id).toBe("fatwa-104");
		});
	});

	describe("sqliteClient.getRandomQuizQuestion RPC Dispatch", () => {
		let originalWorker: any;

		beforeEach(() => {
			originalWorker = (globalThis as any).Worker;
			(sqliteClient as any).worker = null;
		});

		afterEach(() => {
			(globalThis as any).Worker = originalWorker;
			(sqliteClient as any).worker = null;
		});

		it("falls back to mockArchiveAdapter when Worker is unavailable", async () => {
			delete (globalThis as any).Worker;
			const question = await sqliteClient.getRandomQuizQuestion();
			expect(question).not.toBeNull();
			expect(question?.choices).toHaveLength(4);
		});

		it("dispatches GET_RANDOM_QUIZ_QUESTION RPC message in Worker environment", async () => {
			const postMessageSpy = vi.fn();
			class FakeWorker {
				public onmessage: ((e: any) => void) | null = null;
				public postMessage(msg: any) {
					postMessageSpy(msg);
					setTimeout(() => {
						this.onmessage?.({
							data: {
								id: msg.id,
								ok: true,
								result: {
									fatwa: FATWAS_DATA[0],
									correct_principle: PRINCIPLES_DATA[0],
									fatwa_principle: FATWA_PRINCIPLES_DATA[0],
									choices: [
										{
											id: "principle-yaqeen",
											text: "اليقين",
											category: "fiqhiyyah",
											is_correct: true,
										},
										{
											id: "principle-ibaha",
											text: "الإباحة",
											category: "usuliyyah",
											is_correct: false,
										},
										{
											id: "principle-mashaqqah",
											text: "المشقة",
											category: "fiqhiyyah",
											is_correct: false,
										},
										{
											id: "principle-darar",
											text: "الضرر",
											category: "fiqhiyyah",
											is_correct: false,
										},
									],
								},
							},
						});
					}, 0);
				}
			}

			(globalThis as any).Worker = FakeWorker;
			const res = await sqliteClient.getRandomQuizQuestion({
				scholar: "ابن باز",
				excludeFatwaIds: ["fatwa-101"],
			});

			expect(postMessageSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					action: "GET_RANDOM_QUIZ_QUESTION",
					payload: { scholar: "ابن باز", excludeFatwaIds: ["fatwa-101"] },
				}),
			);
			expect(res?.choices).toHaveLength(4);
			expect(res?.correct_principle.id).toBe("principle-yaqeen");
		});
	});

	describe("LearnerProgressStore Coordination with Quiz Query Engine", () => {
		it("passes tracked list of answered Fatwa IDs to getRandomQuizQuestion", async () => {
			const storage = new InMemoryLearnerStorageAdapter();
			const store = new LearnerProgressStore({
				storageAdapter: storage,
			});

			// Initially no answered fatwas
			expect(store.getAnsweredFatwaIds()).toEqual([]);

			// Answer question 1
			store.selectQuestion("fatwa-101");
			await store.recordAttempt("principle-yaqeen", 1200);

			expect(store.getAnsweredFatwaIds()).toEqual(["fatwa-101"]);

			// Answer question 2
			store.selectQuestion("fatwa-102");
			await store.recordAttempt("principle-tawqeef", 1500);

			expect(store.getAnsweredFatwaIds()).toEqual(["fatwa-101", "fatwa-102"]);

			// Fetch next random question passes excludeFatwaIds
			const nextQ = await store.fetchNextRandomQuestion();
			expect(nextQ).not.toBeNull();
			// Must not be fatwa-101 or fatwa-102 since 3 other unanswered fatwas exist
			expect(["fatwa-101", "fatwa-102"]).not.toContain(nextQ?.fatwa.id);
		});

		it("end-to-end quiz loop: displays question, validates choice, reveals rationale, records in store, advances to next question", async () => {
			const storage = new InMemoryLearnerStorageAdapter();
			const store = new LearnerProgressStore({ storageAdapter: storage });

			// 1. Fetch initial quiz question
			const q1 = await store.fetchNextRandomQuestion({ chapter: "Taharah" });
			expect(q1).not.toBeNull();
			expect(q1?.choices).toHaveLength(4);

			// Verify store state updated
			const activeCurrent = store.getCurrentQuestion();
			expect(activeCurrent).not.toBeNull();
			expect(activeCurrent?.fatwa.id).toBe(q1?.fatwa.id);
			expect(activeCurrent?.quizItem).toBeDefined();
			expect(activeCurrent?.isAnswered).toBe(false);

			// 2. Select correct option and record attempt
			const correctChoice = q1!.choices.find((c) => c.is_correct)!;
			const attempt = await store.recordAttempt(correctChoice.id, 2400);

			expect(attempt).not.toBeNull();
			expect(attempt?.is_correct).toBe(true);
			expect(attempt?.fatwa_id).toBe(q1?.fatwa.id);
			expect(store.getStats().answeredCount).toBe(1);
			expect(store.getStats().correctCount).toBe(1);
			expect(store.getStats().xp).toBe(20);

			// Verify question is now marked answered
			expect(store.isQuestionAnswered(q1!.fatwa.id)).toBe(true);

			// 3. Advance to next question
			const q2 = await store.fetchNextRandomQuestion({ chapter: "Taharah" });
			expect(q2).not.toBeNull();
			// q2 must not repeat q1 because another Taharah fatwa (fatwa-104) is unanswered
			expect(q2?.fatwa.id).not.toBe(q1?.fatwa.id);
		});
	});
});
