import { Fatwa, FatwaPrinciple, Scholar, UserQuizHistoryItem } from '../types';

export const QUIZ_TRACKER_STORAGE_KEY = 'taseel_quiz_answered_v1';

export interface AnsweredQuestionRecord {
  fatwaId: string;
  principleId: string;
  isCorrect: boolean;
  selectedId: string;
  timestamp: number;
  attemptsCount: number;
}

export type AnsweredQuestionsMap = Record<string, AnsweredQuestionRecord>;

/**
 * Creates a normalized unique question key combining fatwa and principle IDs.
 */
export function makeQuestionKey(fatwaId: string, principleId?: string | null): string {
  return principleId ? `${fatwaId}:${principleId}` : fatwaId;
}

/**
 * Loads answered questions map from local storage.
 */
export function loadAnsweredQuestions(): AnsweredQuestionsMap {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return {};
  }
  try {
    const raw = localStorage.getItem(QUIZ_TRACKER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return parsed as AnsweredQuestionsMap;
      }
    }
  } catch {
    // Gracefully handle private browsing / quota errors
  }
  return {};
}

/**
 * Saves answered questions map to local storage.
 */
export function saveAnsweredQuestions(data: AnsweredQuestionsMap): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return;
  }
  try {
    localStorage.setItem(QUIZ_TRACKER_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Gracefully handle private browsing / quota errors
  }
}

/**
 * Merges previous quiz history items into the answered questions map,
 * ensuring historical attempts in SQLite or UserState are marked answered.
 */
export function syncHistoryWithAnswered(
  answered: AnsweredQuestionsMap,
  history: UserQuizHistoryItem[]
): AnsweredQuestionsMap {
  if (!history || history.length === 0) return answered;
  let changed = false;
  const next: AnsweredQuestionsMap = { ...answered };

  for (const item of history) {
    const key = makeQuestionKey(item.fatwa_id, item.principle_id);
    if (!next[key]) {
      next[key] = {
        fatwaId: item.fatwa_id,
        principleId: item.principle_id,
        isCorrect: item.is_correct,
        selectedId: item.selected_principle_id,
        timestamp: item.timestamp,
        attemptsCount: 1,
      };
      changed = true;
    }
  }

  if (changed) {
    saveAnsweredQuestions(next);
  }
  return changed ? next : answered;
}

/**
 * Records a quiz attempt into local storage and returns the updated map.
 */
export function recordAnsweredQuestion(
  fatwaId: string,
  principleId: string,
  selectedId: string,
  isCorrect: boolean
): AnsweredQuestionsMap {
  const current = loadAnsweredQuestions();
  const key = makeQuestionKey(fatwaId, principleId);
  const prev = current[key];
  current[key] = {
    fatwaId,
    principleId,
    isCorrect,
    selectedId,
    timestamp: Date.now(),
    attemptsCount: (prev?.attemptsCount ?? 0) + 1,
  };
  saveAnsweredQuestions(current);
  return current;
}

/**
 * Checks whether a question (or any question for this fatwa) has been answered.
 */
export function isQuestionAnswered(
  answered: AnsweredQuestionsMap,
  fatwaId: string,
  principleId?: string | null
): boolean {
  if (!answered) return false;
  if (principleId) {
    const key = makeQuestionKey(fatwaId, principleId);
    if (answered[key]) return true;
  }
  return Object.values(answered).some(entry => entry.fatwaId === fatwaId);
}

/**
 * Gets the recorded attempt details for a question, if answered.
 */
export function getAnsweredRecord(
  answered: AnsweredQuestionsMap,
  fatwaId: string,
  principleId?: string | null
): AnsweredQuestionRecord | undefined {
  if (!answered) return undefined;
  if (principleId) {
    const key = makeQuestionKey(fatwaId, principleId);
    if (answered[key]) return answered[key];
  }
  return Object.values(answered).find(entry => entry.fatwaId === fatwaId);
}

/**
 * Resets the answered questions tracker in local storage.
 */
export function resetAnsweredQuestions(): AnsweredQuestionsMap {
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(QUIZ_TRACKER_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
  return {};
}

export interface QuizCandidate {
  fatwa: Fatwa;
  fatwaPrinciple: FatwaPrinciple;
}

/**
 * Collects all fatwas that have an associated fatwaPrinciple (eligible for quiz).
 */
export function getGroundedQuizCandidates(
  fatwas: Fatwa[],
  fatwaPrinciples: FatwaPrinciple[],
  filter?: { scholar?: Scholar | 'ALL'; chapter?: string }
): QuizCandidate[] {
  const fpByFatwa = new Map<string, FatwaPrinciple>();
  for (const fp of fatwaPrinciples) {
    if (!fpByFatwa.has(fp.fatwa_id)) {
      fpByFatwa.set(fp.fatwa_id, fp);
    }
  }

  const list: QuizCandidate[] = [];
  for (const fatwa of fatwas) {
    if (filter?.scholar && filter.scholar !== 'ALL' && fatwa.scholar_name !== filter.scholar) {
      continue;
    }
    if (filter?.chapter && filter.chapter !== 'ALL' && fatwa.topic_chapter !== filter.chapter) {
      continue;
    }
    const fp = fpByFatwa.get(fatwa.id);
    if (fp) {
      list.push({ fatwa, fatwaPrinciple: fp });
    }
  }
  return list;
}

/**
 * Picks a random question from available grounded fatwas.
 * - Prioritizes UNANSWERED questions.
 * - If all questions in the candidate pool are answered, smoothly cycles among all candidates.
 * - Excludes `excludeFatwaId` when multiple options exist so moving to next question never repeats.
 */
export function pickRandomQuizQuestion({
  fatwas,
  fatwaPrinciples,
  answered,
  excludeFatwaId,
  filter,
}: {
  fatwas: Fatwa[];
  fatwaPrinciples: FatwaPrinciple[];
  answered: AnsweredQuestionsMap;
  excludeFatwaId?: string;
  filter?: { scholar?: Scholar | 'ALL'; chapter?: string };
}): QuizCandidate | null {
  // Pool matching current filter
  let pool = getGroundedQuizCandidates(fatwas, fatwaPrinciples, filter);

  // If active filter yielded no candidates, relax filter to all grounded fatwas
  if (pool.length === 0 && filter && (filter.scholar !== 'ALL' || filter.chapter !== 'ALL')) {
    pool = getGroundedQuizCandidates(fatwas, fatwaPrinciples);
  }

  if (pool.length === 0) return null;

  // Unanswered candidates in pool
  const unanswered = pool.filter(c => {
    const key = makeQuestionKey(c.fatwa.id, c.fatwaPrinciple.principle_id);
    return !answered[key] && !isQuestionAnswered(answered, c.fatwa.id, c.fatwaPrinciple.principle_id);
  });

  // Prioritize unanswered questions, otherwise fall back to all candidates
  const sourcePool = unanswered.length > 0 ? unanswered : pool;

  // Exclude current fatwa if pool size > 1
  const candidatePool =
    sourcePool.length > 1 && excludeFatwaId
      ? sourcePool.filter(c => c.fatwa.id !== excludeFatwaId)
      : sourcePool;

  const finalPool = candidatePool.length > 0 ? candidatePool : sourcePool;
  const index = Math.floor(Math.random() * finalPool.length);
  return finalPool[index] || null;
}
