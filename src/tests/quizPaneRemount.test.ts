import { describe, expect, it } from "vitest";
import { quizPaneRemountKey } from "../components/QuizPane";

/**
 * Regression guard for: after submit + "next question", later questions looked
 * already answered. Biome emptied a QuizPane reset-effect dep list; remount via
 * keyed QuizPane is the intentional fix.
 */
describe("QuizPane remount-on-question-change contract", () => {
	it("quizPaneRemountKey changes when fatwa or principle id changes", () => {
		const a = quizPaneRemountKey("fatwa-1", "fiqh.yaqeen");
		const b = quizPaneRemountKey("fatwa-2", "fiqh.yaqeen");
		const c = quizPaneRemountKey("fatwa-1", "fiqh.darar");
		expect(a).not.toBe(b);
		expect(a).not.toBe(c);
		expect(b).not.toBe(c);
	});

	it("AppShell remounts QuizPane with quizPaneRemountKey", async () => {
		// @ts-expect-error node:fs is available under vitest/vite
		const fs = await import(/* @vite-ignore */ "node:fs");
		const source = fs.readFileSync(
			new URL("../components/AppShell.tsx", import.meta.url),
			"utf-8",
		);
		expect(source).toContain("quizPaneRemountKey(");
		expect(source).toMatch(/<QuizPane[\s\S]*?key=\{quizPaneRemountKey\(/);
	});

	it("QuizPane does not rely on a fatwa/principle id useEffect reset", async () => {
		// @ts-expect-error node:fs is available under vitest/vite
		const fs = await import(/* @vite-ignore */ "node:fs");
		const source = fs.readFileSync(
			new URL("../components/QuizPane.tsx", import.meta.url),
			"utf-8",
		);
		expect(source).not.toMatch(/useEffect\(\(\) => \{[\s\S]*?\}, \[\]\)/);
		expect(source).not.toMatch(
			/useEffect\(\(\) => \{[\s\S]*?\}, \[fatwa\?\.id, principle\?\.id\]\)/,
		);
	});
});
