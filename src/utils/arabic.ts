/**
 * Arabic text normalization utilities for FTS5 simulation & search matching.
 * Matches the backend Python compilation pipeline normalization rules.
 */

export function normalizeArabic(text: string): string {
  if (!text) return '';
  return text
    // Remove Arabic diacritics (tashkeel)
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // Remove Tatweel (kashida)
    .replace(/\u0640/g, '')
    // Normalize Alefs (أ, إ, آ, ٱ -> ا)
    .replace(/[أإآٱ]/g, 'ا')
    // Normalize Taa Marbuta (ة -> ه)
    .replace(/ة/g, 'ه')
    // Normalize Alif Maqsura (ى -> ي)
    .replace(/ى/g, 'ي')
    // Normalize Hamzas on carriers (ؤ, ئ -> ء or unified)
    .replace(/[ؤئ]/g, 'ء')
    // Collapse multiple whitespaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if search query tokens match target normalized text
 */
export function matchesSearch(query: string, targetNorm: string): boolean {
  if (!query.trim()) return true;
  const normQuery = normalizeArabic(query);
  const tokens = normQuery.split(' ').filter(Boolean);
  return tokens.every(token => targetNorm.includes(token));
}

/**
 * Highlights matches in text based on query
 */
export function highlightArabicMatches(rawText: string, query: string): string {
  if (!query.trim()) return rawText;
  const normQuery = normalizeArabic(query);
  const tokens = normQuery.split(' ').filter(t => t.length > 1);
  if (tokens.length === 0) return rawText;

  // Simple safe regex pattern matching tokens ignoring diacritics where possible
  const pattern = new RegExp(`(${tokens.join('|')})`, 'gi');
  return rawText.replace(pattern, '<mark class="bg-accent-soft text-ink rounded px-0.5">$1</mark>');
}

export const CATEGORY_LABELS: Record<string, { title: string; badge: string; color: string }> = {
  fiqhiyyah: {
    title: 'قاعدة فقهية',
    badge: 'قاعدة فقهية',
    color: 'bg-accent-soft text-accent-deep border-accent/25',
  },
  usuliyyah: {
    title: 'قاعدة أصولية',
    badge: 'قاعدة أصولية',
    color: 'bg-slate-100 text-slate-800 border-slate-300',
  },
  dabit: {
    title: 'ضابط فقهي',
    badge: 'ضابط فقهي',
    color: 'bg-page-sunken text-ink-soft border-page-line',
  },
};

const CHAPTER_AR: Record<string, string> = {
  Taharah: 'الطهارة',
  Salat: 'الصلاة',
  Zakat: 'الزكاة',
  Sawm: 'الصيام',
  Hajj: 'الحج',
  Muamalat: 'المعاملات',
  Nikah: 'النكاح',
  Talaq: 'الطلاق',
  Jinayat: 'الجنايات',
  Aqidah: 'العقيدة',
  Adab: 'الآداب',
};

export function chapterLabelAr(chapter: string): string {
  return CHAPTER_AR[chapter] || chapter;
}
