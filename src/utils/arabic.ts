/**
 * Arabic text normalization utilities for FTS5 simulation & search matching.
 * Matches the backend Python compilation pipeline normalization rules.
 */

export function normalizeArabic(text: string): string {
	if (!text) return "";
	return (
		text
			// Remove Arabic diacritics (tashkeel)
			.replace(/[\u064B-\u065F\u0670]/g, "")
			// Remove Tatweel (kashida)
			.replace(/\u0640/g, "")
			// Normalize Alefs (أ, إ, آ, ٱ -> ا)
			.replace(/[أإآٱ]/g, "ا")
			// Normalize Taa Marbuta (ة -> ه)
			.replace(/ة/g, "ه")
			// Normalize Alif Maqsura (ى -> ي)
			.replace(/ى/g, "ي")
			// Normalize Hamzas on carriers (ؤ, ئ -> ء or unified)
			.replace(/[ؤئ]/g, "ء")
			// Collapse multiple whitespaces
			.replace(/\s+/g, " ")
			.trim()
	);
}

/**
 * Checks if search query tokens match target normalized text
 */
export function matchesSearch(query: string, targetNorm: string): boolean {
	if (!query.trim()) return true;
	const normQuery = normalizeArabic(query);
	const tokens = normQuery.split(" ").filter(Boolean);
	return tokens.every((token) => targetNorm.includes(token));
}

/**
 * Highlights matches in text based on query
 */
export function highlightArabicMatches(rawText: string, query: string): string {
	if (!query.trim()) return rawText;
	const normQuery = normalizeArabic(query);
	const tokens = normQuery.split(" ").filter((t) => t.length > 1);
	if (tokens.length === 0) return rawText;

	// Simple safe regex pattern matching tokens ignoring diacritics where possible
	const pattern = new RegExp(`(${tokens.join("|")})`, "gi");
	return rawText.replace(
		pattern,
		'<mark class="bg-accent-soft text-ink rounded px-0.5">$1</mark>',
	);
}

export const CATEGORY_LABELS: Record<
	string,
	{ title: string; badge: string; color: string }
> = {
	fiqhiyyah: {
		title: "قاعدة فقهية",
		badge: "قاعدة فقهية",
		color: "bg-accent-soft text-accent-deep border-accent/25",
	},
	usuliyyah: {
		title: "قاعدة أصولية",
		badge: "قاعدة أصولية",
		color: "bg-slate-100 text-slate-800 border-slate-300",
	},
	dabit: {
		title: "ضابط فقهي",
		badge: "ضابط فقهي",
		color: "bg-page-sunken text-ink-soft border-page-line",
	},
};

export function getPrincipleKindBadge(p: {
	kind?: string;
	science?: string;
	category?: string;
}): { label: string; color: string } {
	switch (p.kind) {
		case "qa_idah_kubra":
			return {
				label: "قاعدة كبرى",
				color:
					"bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25",
			};
		case "qa_idah_kulliyyah":
			return {
				label: "قاعدة كلية",
				color: "bg-accent-soft text-accent-deep border-accent/25",
			};
		case "dabit_fiqhi":
			return {
				label: "ضابط فقهي",
				color: "bg-page-sunken text-ink-muted border-page-line",
			};
		case "asl_kulli":
			return {
				label: "أصل كلي",
				color: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/25",
			};
		case "qa_idah_usuliyyah":
			return {
				label: "قاعدة أصولية",
				color:
					"bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/25",
			};
		case "dabit_usuli":
			return {
				label: "ضابط أصولي",
				color:
					"bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/25",
			};
		default:
			return {
				label: p.science === "usul" ? "قاعدة أصولية" : "قاعدة فقهية",
				color: "bg-page-sunken text-ink-muted border-page-line",
			};
	}
}

const CHAPTER_AR: Record<string, string> = {
	Taharah: "الطهارة",
	Salat: "الصلاة",
	Zakat: "الزكاة",
	Sawm: "الصيام",
	Hajj: "الحج",
	Muamalat: "المعاملات",
	Nikah: "النكاح",
	Talaq: "الطلاق",
	Jinayat: "الجنايات",
	Aqidah: "العقيدة",
	Adab: "الآداب",
};

export function chapterLabelAr(chapter: string): string {
	return CHAPTER_AR[chapter] || chapter;
}
