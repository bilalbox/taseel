import sqlite3InitModule, { type Database } from "@sqlite.org/sqlite-wasm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
	buildBrowseFatwasQuery,
	createInMemoryArchiveDb,
	executeBrowseFatwas,
} from "../data/archiveQuery";
import { mockArchiveAdapter } from "../data/mockArchiveAdapter";
import {
	EPISODES_DATA,
	FATWA_PRINCIPLES_DATA,
	FATWAS_DATA,
	PRINCIPLES_DATA,
} from "../data/mockData";
import { normalizeArabic } from "../utils/arabic";

describe("Archive Search & Filtering Subsystem (Ticket #4 / ADR-0002)", () => {
	describe("FTS5 Query Composition (buildBrowseFatwasQuery)", () => {
		it("composes FTS5 query joining fatwas_fts on fatwas.rowid when search query is provided", () => {
			const q = buildBrowseFatwasQuery({ query: "الوضوء" });

			expect(q.pageSql).toContain("FROM fatwas_fts fts");
			expect(q.pageSql).toContain("JOIN fatwas f ON f.rowid = fts.rowid");
			expect(q.pageSql).toContain("fatwas_fts MATCH ?");
			expect(q.countSql).toContain("FROM fatwas_fts fts");
			expect(q.countSql).toContain("JOIN fatwas f ON f.rowid = fts.rowid");
			expect(q.countSql).toContain("fatwas_fts MATCH ?");

			// countSql should not unnecessarily join episodes table
			expect(q.countSql).not.toContain("episodes");

			// Bindings should contain the prefix-tokenized FTS query
			expect(q.bindings[0]).toBe('"الوضوء"*');
		});

		it("splits multi-token queries into prefix terms joined with AND", () => {
			const q = buildBrowseFatwasQuery({ query: "الوضوء الصلاة" });

			expect(q.ftsQuery).toBe('"الوضوء"* AND "الصلاه"*');
			expect(q.bindings[0]).toBe('"الوضوء"* AND "الصلاه"*');
		});

		it("sanitizes special FTS5 syntax characters to prevent injection and syntax errors", () => {
			const q = buildBrowseFatwasQuery({ query: 'الوضوء" *() :^' });

			expect(q.ftsQuery).toBe('"الوضوء"*');
			expect(q.ftsQuery).not.toContain("(");
			expect(q.ftsQuery).not.toContain(")");
			expect(q.ftsQuery).not.toContain(":");
		});

		it("omits fatwas_fts virtual table join and MATCH clause when query is empty", () => {
			const q = buildBrowseFatwasQuery({});

			expect(q.pageSql).not.toContain("fatwas_fts");
			expect(q.pageSql).not.toContain("MATCH");
			expect(q.countSql).not.toContain("fatwas_fts");
			expect(q.countSql).toBe("SELECT COUNT(*) FROM fatwas f");
			expect(q.ftsQuery).toBeUndefined();
			expect(q.bindings).toHaveLength(0);
		});

		it("omits fatwas_fts join when query contains only punctuation or whitespace", () => {
			const q = buildBrowseFatwasQuery({ query: '   *** """ :::   ' });

			expect(q.pageSql).not.toContain("fatwas_fts");
			expect(q.ftsQuery).toBeUndefined();
			expect(q.bindings).toHaveLength(0);
		});
	});

	describe("Arabic Normalization in Search Terms", () => {
		it("normalizes Arabic diacritics (tashkeel) in search query", () => {
			const qWithTashkeel = buildBrowseFatwasQuery({ query: "الْوُضُوءُ" });
			const qNormalized = buildBrowseFatwasQuery({ query: "الوضوء" });

			expect(qWithTashkeel.ftsQuery).toBe('"الوضوء"*');
			expect(qWithTashkeel.ftsQuery).toBe(qNormalized.ftsQuery);
		});

		it("normalizes all Alef forms (أ, إ, آ, ٱ -> ا)", () => {
			const q1 = buildBrowseFatwasQuery({ query: "أصل" });
			const q2 = buildBrowseFatwasQuery({ query: "اصل" });
			const q3 = buildBrowseFatwasQuery({ query: "إباحة" });

			expect(q1.ftsQuery).toBe('"اصل"*');
			expect(q2.ftsQuery).toBe('"اصل"*');
			expect(q3.ftsQuery).toBe('"اباحه"*');
		});

		it("normalizes Taa Marbuta (ة -> ه) and Alif Maqsura (ى -> ي)", () => {
			const q = buildBrowseFatwasQuery({ query: "طهارة الصلاة فتوى" });

			expect(q.ftsQuery).toBe('"طهاره"* AND "الصلاه"* AND "فتوي"*');
		});

		it("normalizes Hamzas on carriers (ؤ, ئ -> ء)", () => {
			const norm = normalizeArabic("يؤثر سيئة");
			expect(norm).toBe("يءثر سيءه");
		});
	});

	describe("Scholar and Chapter Filtering with Parameter Binding", () => {
		it("binds scholar filter as a parameterized value and does not string-concatenate", () => {
			const q = buildBrowseFatwasQuery({ scholar: "ابن باز" });

			expect(q.pageSql).toContain("f.scholar_name = ?");
			expect(q.pageSql).not.toContain("'ابن باز'");
			expect(q.bindings).toContain("ابن باز");
		});

		it("omits scholar filter when scholar is ALL or undefined", () => {
			const q1 = buildBrowseFatwasQuery({ scholar: "ALL" });
			const q2 = buildBrowseFatwasQuery({});

			expect(q1.pageSql).not.toContain("f.scholar_name = ?");
			expect(q1.countSql).not.toContain("f.scholar_name = ?");
			expect(q2.pageSql).not.toContain("f.scholar_name = ?");
			expect(q2.countSql).not.toContain("f.scholar_name = ?");
		});

		it("binds chapter filter as a parameterized value", () => {
			const q = buildBrowseFatwasQuery({ chapter: "Taharah" });

			expect(q.pageSql).toContain("f.topic_chapter = ?");
			expect(q.pageSql).not.toContain("'Taharah'");
			expect(q.bindings).toContain("Taharah");
		});

		it("omits chapter filter when chapter is ALL or undefined", () => {
			const q = buildBrowseFatwasQuery({ chapter: "ALL" });
			expect(q.pageSql).not.toContain("f.topic_chapter = ?");
			expect(q.countSql).not.toContain("f.topic_chapter = ?");
		});

		it("binds subtopic and principleId filters when provided", () => {
			const q = buildBrowseFatwasQuery({
				subtopic: "الشك في الحدث",
				principleId: "principle-yaqeen",
			});

			expect(q.pageSql).toContain("f.topic_subtopic = ?");
			expect(q.pageSql).toContain(
				"EXISTS (SELECT 1 FROM fatwa_principles fp WHERE fp.fatwa_id = f.id AND fp.principle_id = ?)",
			);
			expect(q.bindings).toContain("الشك في الحدث");
			expect(q.bindings).toContain("principle-yaqeen");
		});

		it("combines FTS5 MATCH with scholar and chapter in a single WHERE clause", () => {
			const q = buildBrowseFatwasQuery({
				query: "الوضوء",
				scholar: "ابن باز",
				chapter: "Taharah",
			});

			expect(q.pageSql).toContain(
				"fatwas_fts MATCH ? AND f.scholar_name = ? AND f.topic_chapter = ?",
			);
			expect(q.bindings).toEqual(['"الوضوء"*', "ابن باز", "Taharah"]);
			expect(q.pageBindings).toEqual([
				'"الوضوء"*',
				"ابن باز",
				"Taharah",
				20,
				0,
			]);
		});
	});

	describe("Pagination Support", () => {
		it("uses default limit of 20 and offset of 0 when omitted", () => {
			const q = buildBrowseFatwasQuery({});

			expect(q.pageSql).toContain("LIMIT ? OFFSET ?");
			expect(q.pageBindings).toEqual([20, 0]);
		});

		it("binds custom limit and offset parameters", () => {
			const q = buildBrowseFatwasQuery({ limit: 50, offset: 100 });

			expect(q.pageBindings).toEqual([50, 100]);
		});

		it("places pagination parameters at the end of pageBindings after filter bindings", () => {
			const q = buildBrowseFatwasQuery({
				query: "طهارة",
				scholar: "ابن عثيمين",
				limit: 10,
				offset: 30,
			});

			expect(q.pageBindings).toEqual(['"طهاره"*', "ابن عثيمين", 10, 30]);
		});
	});

	describe("End-to-End SQLite FTS5 Execution", () => {
		let db: Database;

		beforeAll(async () => {
			const sqlite3 = await sqlite3InitModule();
			db = createInMemoryArchiveDb(sqlite3, {
				episodes: EPISODES_DATA,
				fatwas: FATWAS_DATA,
				principles: PRINCIPLES_DATA,
				fatwaPrinciples: FATWA_PRINCIPLES_DATA,
			});
		});

		afterAll(() => {
			if (db) db.close();
		});

		it("executes full-text search against fatwas_fts joined on fatwas.rowid", () => {
			// Warm up statement caching/JIT
			executeBrowseFatwas(db, { query: "الوضوء" });
			const res = executeBrowseFatwas(db, { query: "الوضوء" });

			expect(res.total).toBeGreaterThan(0);
			expect(res.fatwas.length).toBeGreaterThan(0);
			expect(res.fatwas.some((f) => f.id === "fatwa-101")).toBe(true);
			expect(typeof res.latencyMs).toBe("number");
			expect(res.latencyMs).toBeLessThan(25);
		});

		it("matches normalized Arabic search terms with diacritics against indexed normalized texts", () => {
			const resWithTashkeel = executeBrowseFatwas(db, { query: "الْوُضُوءُ" });
			const resPlain = executeBrowseFatwas(db, { query: "الوضوء" });

			expect(resWithTashkeel.total).toBe(resPlain.total);
			expect(resWithTashkeel.fatwas[0]?.id).toBe(resPlain.fatwas[0]?.id);
		});

		it("filters fatwas by scholar in SQL query", () => {
			const bazRes = executeBrowseFatwas(db, { scholar: "ابن باز" });
			const uthRes = executeBrowseFatwas(db, { scholar: "ابن عثيمين" });

			expect(bazRes.total).toBeGreaterThan(0);
			expect(bazRes.fatwas.every((f) => f.scholar_name === "ابن باز")).toBe(
				true,
			);

			expect(uthRes.total).toBeGreaterThan(0);
			expect(uthRes.fatwas.every((f) => f.scholar_name === "ابن عثيمين")).toBe(
				true,
			);
		});

		it("filters fatwas by chapter in SQL query", () => {
			const taharahRes = executeBrowseFatwas(db, { chapter: "Taharah" });
			const muamalatRes = executeBrowseFatwas(db, { chapter: "Muamalat" });

			expect(taharahRes.total).toBeGreaterThan(0);
			expect(
				taharahRes.fatwas.every((f) => f.topic_chapter === "Taharah"),
			).toBe(true);

			expect(muamalatRes.total).toBeGreaterThan(0);
			expect(
				muamalatRes.fatwas.every((f) => f.topic_chapter === "Muamalat"),
			).toBe(true);
		});

		it("combines search text query, scholar filter, and chapter filter in SQL", () => {
			const res = executeBrowseFatwas(db, {
				query: "الوضوء",
				scholar: "ابن باز",
				chapter: "Taharah",
			});

			expect(res.total).toBeGreaterThan(0);
			expect(res.fatwas.every((f) => f.scholar_name === "ابن باز")).toBe(true);
			expect(res.fatwas.every((f) => f.topic_chapter === "Taharah")).toBe(true);
		});

		it("handles pagination with limit and offset correctly", () => {
			const page1 = executeBrowseFatwas(db, { limit: 2, offset: 0 });
			const page2 = executeBrowseFatwas(db, { limit: 2, offset: 2 });

			expect(page1.fatwas).toHaveLength(2);
			expect(page2.fatwas).toHaveLength(2);
			expect(page1.fatwas[0]?.id).not.toBe(page2.fatwas[0]?.id);
			expect(page1.hasMore).toBe(true);
			expect(page1.total).toBe(FATWAS_DATA.length);
		});

		it("returns empty array when search query yields no matches without error", () => {
			const res = executeBrowseFatwas(db, { query: "كلمةغيرموجودةأبدا" });

			expect(res.total).toBe(0);
			expect(res.fatwas).toHaveLength(0);
			expect(res.hasMore).toBe(false);
		});

		it("runs browseFatwas through mockArchiveAdapter using SQLite FTS5", async () => {
			const res = await mockArchiveAdapter.browseFatwas({ query: "الوضوء" });

			expect(res.total).toBeGreaterThan(0);
			expect(res.fatwas.some((f) => f.id === "fatwa-101")).toBe(true);
			expect(res.fatwas[0]).toHaveProperty("linked_principles_count");
		});
	});

	describe("Elimination of Client-Side In-Memory Search & Unbounded State (ADR-0002)", () => {
		it("verifies src/App.tsx does not import or use matchesSearch", async () => {
			// @ts-expect-error
			const fs = await import(/* @vite-ignore */ "node:fs");
			const appFile = fs.readFileSync(
				new URL("../App.tsx", import.meta.url),
				"utf-8",
			);
			expect(appFile).not.toContain("matchesSearch");
		});

		it("verifies src/App.tsx does not perform unbounded array concatenation for fatwas", async () => {
			// @ts-expect-error
			const fs = await import(/* @vite-ignore */ "node:fs");
			const appFile = fs.readFileSync(
				new URL("../App.tsx", import.meta.url),
				"utf-8",
			);
			expect(appFile).not.toContain("setFatwas(prev =>");
			expect(appFile).not.toContain("[...prev, ...additions]");
		});

		it("verifies src/components/AppShell.tsx does not import or use matchesSearch", async () => {
			// @ts-expect-error
			const fs = await import(/* @vite-ignore */ "node:fs");
			const appShellFile = fs.readFileSync(
				new URL("../components/AppShell.tsx", import.meta.url),
				"utf-8",
			);
			expect(appShellFile).not.toContain("matchesSearch");
			expect(appShellFile).not.toContain("filteredFatwas");
		});
	});
});
