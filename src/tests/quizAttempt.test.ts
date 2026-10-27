import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { INITIAL_USER_STATE } from "../data/mockData";
import { sqliteClient } from "../services/sqliteClient";
import type { UserQuizHistoryItem, UserState } from "../types";
import { USER_SCHEMA_SQL } from "../workers/sqlite.worker";

describe("Quiz Attempt Recording & SRS Elimination (ADR-0001)", () => {
	describe("Schema integrity", () => {
		it("creates canonical bookmarks, quiz_attempts, and kv_meta tables", () => {
			expect(USER_SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS bookmarks");
			expect(USER_SCHEMA_SQL).toContain(
				"CREATE TABLE IF NOT EXISTS quiz_attempts",
			);
			expect(USER_SCHEMA_SQL).toContain("CREATE TABLE IF NOT EXISTS kv_meta");
		});

		it("has dropped srs_cards table and any SRS scheduling columns", () => {
			expect(USER_SCHEMA_SQL).not.toContain("srs_cards");
			expect(USER_SCHEMA_SQL).not.toContain("next_review");
			expect(USER_SCHEMA_SQL).not.toContain("last_reviewed");
			expect(USER_SCHEMA_SQL).not.toContain("correct_count");
			expect(USER_SCHEMA_SQL).not.toContain("total_attempts");
		});
	});

	describe("UserState model", () => {
		it("does not contain spaced_repetition in INITIAL_USER_STATE", () => {
			expect("spaced_repetition" in INITIAL_USER_STATE).toBe(false);
			expect((INITIAL_USER_STATE as any).spaced_repetition).toBeUndefined();
		});

		it("maintains clean history items without SRS interval fields", () => {
			expect(INITIAL_USER_STATE.history.length).toBeGreaterThan(0);
			for (const item of INITIAL_USER_STATE.history) {
				expect(item).toHaveProperty("id");
				expect(item).toHaveProperty("fatwa_id");
				expect(item).toHaveProperty("principle_id");
				expect(item).toHaveProperty("selected_principle_id");
				expect(item).toHaveProperty("is_correct");
				expect(item).toHaveProperty("timestamp");
				expect(item).toHaveProperty("time_spent_ms");
				expect(item).toHaveProperty("difficulty");

				// Verify absence of SRS properties
				expect((item as any).level).toBeUndefined();
				expect((item as any).streak).toBeUndefined();
				expect((item as any).next_review).toBeUndefined();
				expect((item as any).ease_factor).toBeUndefined();
			}
		});

		it("records attempt in UserState without mutating or creating SRS records", () => {
			const state: UserState = {
				bookmarks: ["fatwa-101"],
				history: [],
				xp: 100,
				streak_days: 1,
			};

			const newAttempt: UserQuizHistoryItem = {
				id: "quiz-test-1",
				fatwa_id: "fatwa-200",
				principle_id: "principle-yaqeen",
				selected_principle_id: "principle-yaqeen",
				is_correct: true,
				timestamp: Date.now(),
				time_spent_ms: 3200,
				difficulty: "intermediate",
			};

			// Simulating state update as performed in App.tsx
			const updatedState: UserState = {
				...state,
				history: [...state.history, newAttempt],
				xp: state.xp + (newAttempt.is_correct ? 20 : 5),
			};

			expect(updatedState.history).toHaveLength(1);
			expect(updatedState.history[0]).toEqual(newAttempt);
			expect(updatedState.xp).toBe(120);
			expect("spaced_repetition" in updatedState).toBe(false);
			expect((updatedState as any).spaced_repetition).toBeUndefined();
		});
	});

	describe("sqliteClient.recordQuizAttempt RPC", () => {
		let originalWorker: any;

		beforeEach(() => {
			vi.restoreAllMocks();
			originalWorker = (globalThis as any).Worker;
			(sqliteClient as any).worker = null;
		});

		afterEach(() => {
			(globalThis as any).Worker = originalWorker;
			(sqliteClient as any).worker = null;
		});

		it("dispatches RECORD_QUIZ_ATTEMPT with only the item and without srs payload", async () => {
			const postMessageSpy = vi.fn();

			const fakeWorker = {
				postMessage: postMessageSpy,
				onmessage: null as ((ev: any) => void) | null,
			};

			(globalThis as any).Worker = vi.fn().mockImplementation(() => fakeWorker);

			const attemptItem: UserQuizHistoryItem = {
				id: "quiz-rpc-1",
				fatwa_id: "fatwa-300",
				principle_id: "principle-maslaq",
				selected_principle_id: "principle-maslaq",
				is_correct: true,
				timestamp: 1700000000000,
				time_spent_ms: 2500,
				difficulty: "intermediate",
			};

			const promise = sqliteClient.recordQuizAttempt(attemptItem);

			expect(postMessageSpy).toHaveBeenCalledTimes(1);
			const callArg = postMessageSpy.mock.calls[0]?.[0];

			expect(callArg.action).toBe("RECORD_QUIZ_ATTEMPT");
			expect(callArg.payload).toEqual({ item: attemptItem });
			expect(callArg.payload.srs).toBeUndefined();

			// Complete the promise via simulated worker response
			if (fakeWorker.onmessage) {
				fakeWorker.onmessage({
					data: {
						id: callArg.id,
						ok: true,
						result: true,
					},
				});
			}

			const res = await promise;
			expect(res).toBe(true);
		});

		it("rejects with error if worker fails", async () => {
			const postMessageSpy = vi.fn();
			const fakeWorker = {
				postMessage: postMessageSpy,
				onmessage: null as ((ev: any) => void) | null,
			};

			(globalThis as any).Worker = vi.fn().mockImplementation(() => fakeWorker);

			const attemptItem: UserQuizHistoryItem = {
				id: "quiz-rpc-2",
				fatwa_id: "fatwa-301",
				principle_id: "principle-maslaq",
				selected_principle_id: "principle-maslaq",
				is_correct: false,
				timestamp: 1700000000000,
				time_spent_ms: 1500,
				difficulty: "beginner",
			};

			const promise = sqliteClient.recordQuizAttempt(attemptItem);
			const callArg = postMessageSpy.mock.calls[0]?.[0];

			if (fakeWorker.onmessage) {
				fakeWorker.onmessage({
					data: {
						id: callArg.id,
						ok: false,
						error: "DB locked",
					},
				});
			}

			await expect(promise).rejects.toThrow("DB locked");
		});
	});
});
