import { describe, it, expect, beforeEach } from 'vitest';
import {
  LearnerProgressStore,
  InMemoryLearnerStorageAdapter,
  CurrentQuizQuestion,
  LearnerStats,
} from '../stores/learnerStore';
import type { Fatwa, Principle, FatwaPrinciple } from '../types';

describe('LearnerProgressStore (Ticket #3)', () => {
  const mockFatwas: Fatwa[] = [
    {
      id: 'fatwa-1',
      episode_id: 'ep-1',
      question_text: 'ما حكم الشك في الوضوء؟',
      answer_text: 'اليقين لا يزول بالشك',
      question_norm: 'ما حكم الشك في الوضوء',
      answer_norm: 'اليقين لا يزول بالشك',
      topic_domain: 'Fiqh',
      topic_chapter: 'طهارة',
      topic_subtopic: 'وضوء',
      scholar_name: 'ابن باز',
      episode_number: 10,
    },
    {
      id: 'fatwa-2',
      episode_id: 'ep-1',
      question_text: 'ما حكم المشقة في السفر؟',
      answer_text: 'المشقة تجلب التيسير',
      question_norm: 'ما حكم المشقة في السفر',
      answer_norm: 'المشقة تجلب التيسير',
      topic_domain: 'Fiqh',
      topic_chapter: 'صلاة',
      topic_subtopic: 'سفر',
      scholar_name: 'ابن عثيمين',
      episode_number: 25,
    },
    {
      id: 'fatwa-3',
      episode_id: 'ep-2',
      question_text: 'ما حكم الضرر؟',
      answer_text: 'الضرر يزال',
      question_norm: 'ما حكم الضرر',
      answer_norm: 'الضرر يزال',
      topic_domain: 'Fiqh',
      topic_chapter: 'معاملات',
      topic_subtopic: 'ضرر',
      scholar_name: 'ابن باز',
      episode_number: 30,
    },
  ];

  const mockPrinciples: Principle[] = [
    {
      id: 'principle-1',
      canonical_text_ar: 'اليقين لا يزول بالشك',
      canonical_text_norm: 'اليقين لا يزول بالشك',
      category: 'fiqhiyyah',
      general_explanation_ar: 'الأصل بقاء ما كان على ما كان',
      depth: 0,
    },
    {
      id: 'principle-2',
      canonical_text_ar: 'المشقة تجلب التيسير',
      canonical_text_norm: 'المشقة تجلب التيسير',
      category: 'fiqhiyyah',
      general_explanation_ar: 'تخفيف الأحكام عند وجود الحرج',
      depth: 0,
    },
    {
      id: 'principle-3',
      canonical_text_ar: 'الضرر يزال',
      canonical_text_norm: 'الضرر يزال',
      category: 'fiqhiyyah',
      general_explanation_ar: 'رفع الضرر عن المكلفين',
      depth: 0,
    },
  ];

  const mockFatwaPrinciples: FatwaPrinciple[] = [
    {
      id: 'fp-1',
      fatwa_id: 'fatwa-1',
      principle_id: 'principle-1',
      explicitly_stated: true,
      application_explanation_ar: 'بنى الحكم على قاعدة اليقين',
      distractor_principles_json: JSON.stringify([
        { id: 'principle-2', canonical_text_ar: 'المشقة تجلب التيسير', category: 'fiqhiyyah', reason_incorrect: 'ليست مناط المسألة' }
      ]),
      difficulty: 'beginner',
    },
    {
      id: 'fp-2',
      fatwa_id: 'fatwa-2',
      principle_id: 'principle-2',
      explicitly_stated: true,
      application_explanation_ar: 'بنى الحكم على التيسير للمسافر',
      distractor_principles_json: JSON.stringify([
        { id: 'principle-1', canonical_text_ar: 'اليقين لا يزول بالشك', category: 'fiqhiyyah', reason_incorrect: 'ليست مناط المسألة' }
      ]),
      difficulty: 'intermediate',
    },
    {
      id: 'fp-3',
      fatwa_id: 'fatwa-3',
      principle_id: 'principle-3',
      explicitly_stated: true,
      application_explanation_ar: 'بنى الحكم على درء المفاسد والضرر',
      distractor_principles_json: JSON.stringify([
        { id: 'principle-1', canonical_text_ar: 'اليقين لا يزول بالشك', category: 'fiqhiyyah', reason_incorrect: 'ليست مناط المسألة' }
      ]),
      difficulty: 'advanced',
    },
  ];

  let adapter: InMemoryLearnerStorageAdapter;
  let store: LearnerProgressStore;

  beforeEach(() => {
    adapter = new InMemoryLearnerStorageAdapter();
    store = new LearnerProgressStore({
      storageAdapter: adapter,
      fatwas: mockFatwas,
      principles: mockPrinciples,
      fatwaPrinciples: mockFatwaPrinciples,
    });
  });

  describe('Initial State & Candidate Detection', () => {
    it('initializes stats with zero answers and correct grounded count', () => {
      const stats = store.getStats();
      expect(stats.totalGroundedCount).toBe(3);
      expect(stats.answeredCount).toBe(0);
      expect(stats.correctCount).toBe(0);
      expect(stats.xp).toBe(0);
    });

    it('presents an initial grounded question', () => {
      const q = store.getCurrentQuestion();
      expect(q).not.toBeNull();
      expect(['fatwa-1', 'fatwa-2', 'fatwa-3']).toContain(q?.fatwa.id);
      expect(q?.isAnswered).toBe(false);
      expect(q?.lastAttempt).toBeUndefined();
    });
  });

  describe('Attempt Recording', () => {
    it('records a correct attempt, increments correctCount & xp by 20, and persists via adapter', async () => {
      store.selectQuestion('fatwa-1');
      const q = store.getCurrentQuestion();
      expect(q?.fatwa.id).toBe('fatwa-1');

      const attempt = await store.recordAttempt('principle-1', 3500);

      expect(attempt).not.toBeNull();
      expect(attempt?.is_correct).toBe(true);
      expect(attempt?.fatwa_id).toBe('fatwa-1');
      expect(attempt?.principle_id).toBe('principle-1');
      expect(attempt?.selected_principle_id).toBe('principle-1');
      expect(attempt?.time_spent_ms).toBe(3500);

      // Check in-store stats
      const stats = store.getStats();
      expect(stats.answeredCount).toBe(1);
      expect(stats.correctCount).toBe(1);
      expect(stats.xp).toBe(20);

      // Check currentQuestion reflects answered state
      const updatedQ = store.getCurrentQuestion();
      expect(updatedQ?.isAnswered).toBe(true);
      expect(updatedQ?.lastAttempt?.isCorrect).toBe(true);
      expect(updatedQ?.lastAttempt?.selectedId).toBe('principle-1');

      // Verify adapter persistence
      const persisted = await adapter.loadData();
      expect(persisted.history).toHaveLength(1);
      expect(persisted.history[0].fatwa_id).toBe('fatwa-1');
      expect(persisted.history[0].is_correct).toBe(true);
    });

    it('records an incorrect attempt, increments answeredCount & xp by 5, but not correctCount', async () => {
      store.selectQuestion('fatwa-2');
      const attempt = await store.recordAttempt('principle-1', 4000); // Correct is principle-2

      expect(attempt?.is_correct).toBe(false);
      expect(attempt?.selected_principle_id).toBe('principle-1');

      const stats = store.getStats();
      expect(stats.answeredCount).toBe(1);
      expect(stats.correctCount).toBe(0);
      expect(stats.xp).toBe(5);

      const updatedQ = store.getCurrentQuestion();
      expect(updatedQ?.isAnswered).toBe(true);
      expect(updatedQ?.lastAttempt?.isCorrect).toBe(false);
      expect(updatedQ?.lastAttempt?.selectedId).toBe('principle-1');
    });
  });

  describe('Bookmark Toggling', () => {
    it('toggles bookmarks and persists via adapter', async () => {
      expect(store.isBookmarked('fatwa-1')).toBe(false);

      const isNowBookmarked = await store.toggleBookmark('fatwa-1');
      expect(isNowBookmarked).toBe(true);
      expect(store.isBookmarked('fatwa-1')).toBe(true);

      const persisted = await adapter.loadData();
      expect(persisted.bookmarks).toContain('fatwa-1');

      const unbookmarked = await store.toggleBookmark('fatwa-1');
      expect(unbookmarked).toBe(false);
      expect(store.isBookmarked('fatwa-1')).toBe(false);

      const persistedAfter = await adapter.loadData();
      expect(persistedAfter.bookmarks).not.toContain('fatwa-1');
    });
  });

  describe('Progress Reset', () => {
    it('resets attempts and xp while preserving bookmarks', async () => {
      await store.toggleBookmark('fatwa-2');
      store.selectQuestion('fatwa-1');
      await store.recordAttempt('principle-1', 2000);

      expect(store.getStats().answeredCount).toBe(1);
      expect(store.getStats().xp).toBe(20);
      expect(store.isBookmarked('fatwa-2')).toBe(true);

      await store.resetProgress();

      const statsAfter = store.getStats();
      expect(statsAfter.answeredCount).toBe(0);
      expect(statsAfter.correctCount).toBe(0);
      expect(statsAfter.xp).toBe(0);
      expect(store.getCurrentQuestion()?.isAnswered).toBe(false);

      // Bookmarks remain preserved
      expect(store.isBookmarked('fatwa-2')).toBe(true);

      // Adapter attempts cleared
      const persisted = await adapter.loadData();
      expect(persisted.history).toHaveLength(0);
      expect(persisted.bookmarks).toContain('fatwa-2');
    });
  });

  describe('Unanswered Question Rotation', () => {
    it('prioritizes unanswered questions on nextQuestion()', async () => {
      // Answer fatwa-1 and fatwa-2
      store.selectQuestion('fatwa-1');
      await store.recordAttempt('principle-1', 1000);

      store.selectQuestion('fatwa-2');
      await store.recordAttempt('principle-2', 1000);

      expect(store.getStats().answeredCount).toBe(2);

      // nextQuestion must select the only remaining unanswered question: fatwa-3
      store.nextQuestion();
      expect(store.getCurrentQuestion()?.fatwa.id).toBe('fatwa-3');
    });

    it('avoids repeating the current question when multiple candidates exist', () => {
      store.selectQuestion('fatwa-1');
      store.nextQuestion();
      expect(store.getCurrentQuestion()?.fatwa.id).not.toBe('fatwa-1');
    });

    it('cycles among candidates smoothly when all questions are answered', async () => {
      store.selectQuestion('fatwa-1');
      await store.recordAttempt('principle-1', 1000);
      store.selectQuestion('fatwa-2');
      await store.recordAttempt('principle-2', 1000);
      store.selectQuestion('fatwa-3');
      await store.recordAttempt('principle-3', 1000);

      expect(store.getStats().answeredCount).toBe(3);

      // Rotating when all are answered should cycle without throwing or null
      store.nextQuestion();
      const nextQ = store.getCurrentQuestion();
      expect(nextQ).not.toBeNull();
      expect(['fatwa-1', 'fatwa-2', 'fatwa-3']).toContain(nextQ?.fatwa.id);
    });

    it('respects scholar and chapter filters during rotation', () => {
      // Rotation with Ibn Uthaymeen filter should pick fatwa-2
      store.nextQuestion({ scholar: 'ابن عثيمين' });
      expect(store.getCurrentQuestion()?.fatwa.scholar_name).toBe('ابن عثيمين');
      expect(store.getCurrentQuestion()?.fatwa.id).toBe('fatwa-2');

      // Rotation with chapter 'معاملات' should pick fatwa-3
      store.nextQuestion({ chapter: 'معاملات' });
      expect(store.getCurrentQuestion()?.fatwa.topic_chapter).toBe('معاملات');
      expect(store.getCurrentQuestion()?.fatwa.id).toBe('fatwa-3');
    });
  });

  describe('Store Subscription and Hydration', () => {
    it('notifies subscribers whenever state changes', async () => {
      let notifyCount = 0;
      const unsubscribe = store.subscribe(() => {
        notifyCount++;
      });

      await store.toggleBookmark('fatwa-1');
      expect(notifyCount).toBe(1);

      store.selectQuestion('fatwa-1');
      expect(notifyCount).toBe(2);

      await store.recordAttempt('principle-1', 1200);
      expect(notifyCount).toBe(3);

      unsubscribe();
      await store.toggleBookmark('fatwa-2');
      expect(notifyCount).toBe(3); // No notification after unsubscribe
    });

    it('hydrates historical bookmarks and attempts without duplicating existing ones', () => {
      store.hydrate({
        bookmarks: ['fatwa-1', 'fatwa-3'],
        history: [
          {
            id: 'h-1',
            fatwa_id: 'fatwa-1',
            principle_id: 'principle-1',
            selected_principle_id: 'principle-1',
            is_correct: true,
            timestamp: 123456,
            time_spent_ms: 2000,
            difficulty: 'beginner',
          },
        ],
        xp: 150,
      });

      expect(store.isBookmarked('fatwa-1')).toBe(true);
      expect(store.isBookmarked('fatwa-3')).toBe(true);
      expect(store.getStats().xp).toBe(150);
      expect(store.getStats().answeredCount).toBe(1);

      // Re-hydrating with the same attempt id should not duplicate history entries
      store.hydrate({
        history: [
          {
            id: 'h-1',
            fatwa_id: 'fatwa-1',
            principle_id: 'principle-1',
            selected_principle_id: 'principle-1',
            is_correct: true,
            timestamp: 123456,
            time_spent_ms: 2000,
            difficulty: 'beginner',
          },
        ],
      });
      expect(store.getUserState().history).toHaveLength(1);
    });
  });

  describe('SqliteLocalStorageAdapter Seam & Desync Resolution', () => {
    it('migrates legacy taseel_user_state_v1 and cleans up taseel_quiz_answered_v1', async () => {
      const mockStorage: Record<string, string> = {
        taseel_user_state_v1: JSON.stringify({
          bookmarks: ['fatwa-101'],
          history: [
            {
              id: 'hist-legacy-1',
              fatwa_id: 'fatwa-101',
              principle_id: 'principle-1',
              selected_principle_id: 'principle-1',
              is_correct: true,
              timestamp: 10000,
              time_spent_ms: 3000,
              difficulty: 'intermediate',
            },
          ],
          xp: 120,
        }),
        taseel_quiz_answered_v1: JSON.stringify({
          'fatwa-101:principle-1': {
            fatwaId: 'fatwa-101',
            principleId: 'principle-1',
            isCorrect: true,
            selectedId: 'principle-1',
            timestamp: 10000,
            attemptsCount: 1,
          },
        }),
      };

      const originalLocalStorage = globalThis.localStorage;
      const fakeLocalStorage = {
        getItem: (k: string) => mockStorage[k] || null,
        setItem: (k: string, v: string) => {
          mockStorage[k] = v;
        },
        removeItem: (k: string) => {
          delete mockStorage[k];
        },
        clear: () => {
          for (const k of Object.keys(mockStorage)) delete mockStorage[k];
        },
        length: Object.keys(mockStorage).length,
        key: (i: number) => Object.keys(mockStorage)[i] || null,
      };

      (globalThis as any).localStorage = fakeLocalStorage;
      (globalThis as any).window = globalThis;

      const { SqliteLocalStorageAdapter } = await import('../stores/learnerStore');
      const prodAdapter = new SqliteLocalStorageAdapter();

      const loaded = await prodAdapter.loadData();
      expect(loaded.bookmarks).toEqual(['fatwa-101']);
      expect(loaded.history).toHaveLength(1);
      expect(loaded.xp).toBe(120);

      // Verify that legacy dual-storage key was removed to prevent desynchronization
      expect(mockStorage['taseel_quiz_answered_v1']).toBeUndefined();
      expect(mockStorage['taseel_learner_progress_v1']).toBeDefined();

      // Test clearing attempts through adapter
      await prodAdapter.clearAttempts();
      const cleared = await prodAdapter.loadData();
      expect(cleared.history).toHaveLength(0);
      expect(cleared.xp).toBe(0);
      expect(cleared.bookmarks).toEqual(['fatwa-101']); // bookmarks kept

      // Restore original
      (globalThis as any).localStorage = originalLocalStorage;
    });
  });
});
