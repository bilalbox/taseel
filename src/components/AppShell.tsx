import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BookmarkCheck, CheckCircle2, Filter, Layers, Search, Shuffle } from 'lucide-react';
import {
  AppMode,
  Fatwa,
  FatwaDetail,
  FatwaPrinciple,
  FatwaSummary,
  Principle,
  Scholar,
  UserState,
} from '../types';
import { matchesSearch, chapterLabelAr } from '../utils/arabic';
import { AnsweredQuestionsMap } from '../utils/quizTracker';
import { FatwaReader } from './FatwaReader';
import { QuizPane } from './QuizPane';
import { BrowseIndex } from './BrowseIndex';
import { sqliteClient } from '../services/sqliteClient';
import { useLearnerProgress } from '../hooks/useLearnerProgress';

export interface AppShellProps {
  fatwas: Fatwa[];
  principles: Principle[];
  fatwaPrinciples: FatwaPrinciple[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  bootLabel?: string | null;
  opfsReady: boolean;
  userState?: UserState;
  answeredQuestions?: AnsweredQuestionsMap;
  onRecordQuizAttempt?: (
    fatwaId: string,
    principleId: string,
    selectedId: string,
    isCorrect: boolean,
    timeSpentMs: number
  ) => void;
  onToggleBookmark?: (fatwaId: string) => void;
  onResetQuizProgress?: () => void;
}

export const AppShell: React.FC<AppShellProps> = ({
  fatwas,
  principles,
  fatwaPrinciples,
  searchQuery,
  setSearchQuery,
  bootLabel,
  opfsReady,
  onRecordQuizAttempt,
  onToggleBookmark,
  onResetQuizProgress,
}) => {
  const learner = useLearnerProgress();
  const [mode, setMode] = useState<AppMode>('quiz');
  const [selectedScholar, setSelectedScholar] = useState<Scholar | 'ALL'>('ALL');
  const [selectedChapter, setSelectedChapter] = useState<string>('ALL');
  const [filterUnansweredOnly, setFilterUnansweredOnly] = useState(false);
  const [showSidebarInQuiz, setShowSidebarInQuiz] = useState(false);

  // Parse optional ?fatwa= query parameter from URL
  const requestedFatwaId = useMemo(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('fatwa');
  }, []);

  const [activeFatwaId, setActiveFatwaId] = useState<string>(() => {
    if (requestedFatwaId && fatwas.some(f => f.id === requestedFatwaId)) {
      return requestedFatwaId;
    }
    return learner.currentQuestion?.fatwa.id || fatwas[0]?.id || '';
  });

  const [activePrincipleId, setActivePrincipleId] = useState<string | null>(() => {
    return learner.currentQuestion?.principle.id || null;
  });

  // Synchronize with URL parameter or learner store's initial selection
  useEffect(() => {
    if (requestedFatwaId && fatwas.some(f => f.id === requestedFatwaId)) {
      setActiveFatwaId(requestedFatwaId);
      learner.selectQuestion(requestedFatwaId);
    }
  }, [requestedFatwaId, fatwas, learner]);

  // Synchronize when store's current question changes
  useEffect(() => {
    if (learner.currentQuestion) {
      setActiveFatwaId(learner.currentQuestion.fatwa.id);
      setActivePrincipleId(learner.currentQuestion.principle.id);
    }
  }, [learner.currentQuestion]);

  const chapters = useMemo(
    () => Array.from(new Set(fatwas.map(f => f.topic_chapter))).sort(),
    [fatwas]
  );

  const [browsedFatwas, setBrowsedFatwas] = useState<FatwaSummary[]>([]);
  const [browseTotal, setBrowseTotal] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    sqliteClient
      .browseFatwas({
        scholar: selectedScholar,
        chapter: selectedChapter,
        query: searchQuery,
        limit: 80,
      })
      .then(res => {
        if (!cancelled && res.fatwas.length > 0) {
          setBrowsedFatwas(res.fatwas);
          setBrowseTotal(res.total);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedScholar, selectedChapter, searchQuery, opfsReady]);

  const [activeDetail, setActiveDetail] = useState<FatwaDetail | null>(null);

  useEffect(() => {
    if (!activeFatwaId) return;
    let cancelled = false;
    sqliteClient
      .getFatwaDetail(activeFatwaId)
      .then(detail => {
        if (!cancelled && detail) {
          setActiveDetail(detail);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeFatwaId]);

  const filteredFatwas = useMemo(() => {
    return fatwas.filter(f => {
      if (selectedScholar !== 'ALL' && f.scholar_name !== selectedScholar) return false;
      if (selectedChapter !== 'ALL' && f.topic_chapter !== selectedChapter) return false;
      if (filterUnansweredOnly && learner.isQuestionAnswered(f.id)) return false;
      if (!searchQuery.trim()) return true;
      return (
        matchesSearch(searchQuery, f.question_norm) || matchesSearch(searchQuery, f.answer_norm)
      );
    });
  }, [fatwas, selectedScholar, selectedChapter, filterUnansweredOnly, learner, searchQuery]);

  const displayFatwas = useMemo(() => {
    const base = browsedFatwas.length > 0 ? browsedFatwas : filteredFatwas;
    if (filterUnansweredOnly) {
      return base.filter(f => !learner.isQuestionAnswered(f.id));
    }
    return base;
  }, [browsedFatwas, filteredFatwas, filterUnansweredOnly, learner]);

  const activeFatwa =
    activeDetail?.fatwa ||
    fatwas.find(f => f.id === activeFatwaId) ||
    (displayFatwas[0] as Fatwa) ||
    filteredFatwas[0] ||
    fatwas[0];

  const currentFatwaPrinciples = useMemo(() => {
    if (activeDetail?.fatwaPrinciples && activeDetail.fatwaPrinciples.length > 0) {
      return activeDetail.fatwaPrinciples;
    }
    return fatwaPrinciples.filter(fp => fp.fatwa_id === activeFatwa?.id);
  }, [activeDetail, fatwaPrinciples, activeFatwa]);

  const selectedFatwaPrinciple =
    currentFatwaPrinciples.find(
      fp => fp.principle_id === (activePrincipleId || currentFatwaPrinciples[0]?.principle_id)
    ) || currentFatwaPrinciples[0];

  const currentPrinciple =
    activeDetail?.principles.find(p => p.id === selectedFatwaPrinciple?.principle_id) ||
    principles.find(p => p.id === selectedFatwaPrinciple?.principle_id);

  const answeredCount = learner.stats.answeredCount;

  const handleNextRandomQuestion = useCallback(() => {
    learner.nextQuestion({
      scholar: selectedScholar,
      chapter: selectedChapter,
    });
  }, [learner, selectedScholar, selectedChapter]);

  const handleFatwaSelect = (fatwaId: string) => {
    setActiveFatwaId(fatwaId);
    setActivePrincipleId(null);
    learner.selectQuestion(fatwaId);
  };

  const handlePrincipleSelect = (principleId: string) => {
    setActivePrincipleId(principleId);
    if (activeFatwa) {
      learner.selectQuestion(activeFatwa.id, principleId);
    }
  };

  const handleBrowsePrinciple = (principleId: string) => {
    setActivePrincipleId(principleId);
    if (activeFatwa) {
      learner.selectQuestion(activeFatwa.id, principleId);
    }
  };

  const isSidebarVisible = mode === 'browse' || showSidebarInQuiz;
  const readerColSpan = isSidebarVisible ? 'lg:col-span-5' : 'lg:col-span-7';
  const actionColSpan = isSidebarVisible ? 'lg:col-span-4' : 'lg:col-span-5';

  return (
    <div className="min-h-screen bg-page text-ink pb-10">
      <header className="sticky top-0 z-30 bg-page-raised/95 backdrop-blur border-b border-page-line">
        <div className="max-w-7xl mx-auto px-4 py-2.5 sm:py-3 space-y-2.5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <h1 className="font-amiri text-2xl sm:text-3xl font-bold text-ink tracking-wide leading-none">
                تأصيل
              </h1>
              <span className="hidden sm:inline-block text-xs text-ink-muted border-r border-page-line pr-3">
                محرك القواعد الفقهية والأصولية · نور على الدرب
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex bg-page-sunken p-0.5 rounded-lg border border-page-line text-xs font-medium">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'quiz'}
                  onClick={() => setMode('quiz')}
                  className={`px-3.5 py-1 rounded-md transition ${
                    mode === 'quiz'
                      ? 'bg-page-raised text-accent shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  اختبار التخريج
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'browse'}
                  onClick={() => setMode('browse')}
                  className={`px-3.5 py-1 rounded-md transition ${
                    mode === 'browse'
                      ? 'bg-page-raised text-accent shadow-xs'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  تصفح
                </button>
              </div>

              {learner.userState.bookmarks.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted px-2 py-0.5 bg-page-sunken rounded-md border border-page-line">
                  <BookmarkCheck className="w-3.5 h-3.5 text-accent" />
                  <span>{learner.userState.bookmarks.length}</span>
                </span>
              )}

              <span
                className={`text-[10px] sm:text-[11px] px-2 py-0.5 rounded-md border ${
                  opfsReady
                    ? 'border-accent/20 text-accent bg-accent-soft/40'
                    : 'border-page-line text-ink-muted bg-page-sunken'
                }`}
                title={bootLabel || undefined}
              >
                {opfsReady ? 'متصل محلياً' : bootLabel || 'تهيئة…'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-page-line/60 flex-wrap sm:flex-nowrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="ابحث في نص الفتوى أو السؤال (FTS5 محلي سريع)..."
                className="w-full pl-3 pr-9 py-1.5 bg-page text-ink placeholder-ink-faint border border-page-line rounded-lg text-xs sm:text-sm focus:outline-none focus:border-accent"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={selectedScholar}
                onChange={e => setSelectedScholar(e.target.value as any)}
                aria-label="تصفية حسب الشيخ"
                className="px-2.5 py-1.5 bg-page text-ink border border-page-line rounded-lg text-xs focus:outline-none focus:border-accent"
              >
                <option value="ALL">جميع المشايخ</option>
                <option value="ابن باز">الشيخ ابن باز</option>
                <option value="ابن عثيمين">الشيخ ابن عثيمين</option>
              </select>

              <select
                value={selectedChapter}
                onChange={e => setSelectedChapter(e.target.value)}
                aria-label="تصفية حسب الكتاب الفقهي"
                className="px-2.5 py-1.5 bg-page text-ink border border-page-line rounded-lg text-xs focus:outline-none focus:border-accent max-w-[140px] truncate"
              >
                <option value="ALL">جميع الأبواب</option>
                {chapters.map(ch => (
                  <option key={ch} value={ch}>
                    كتاب {chapterLabelAr(ch)}
                  </option>
                ))}
              </select>

              {mode === 'quiz' && (
                <button
                  type="button"
                  onClick={() => setShowSidebarInQuiz(prev => !prev)}
                  title={showSidebarInQuiz ? 'إخفاء قائمة الفتاوى' : 'إظهار قائمة الفتاوى'}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs transition ${
                    showSidebarInQuiz
                      ? 'bg-accent text-white border-accent'
                      : 'bg-page text-ink-muted border-page-line hover:text-ink'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">القائمة</span>
                </button>
              )}

              {mode === 'quiz' && (
                <button
                  type="button"
                  onClick={handleNextRandomQuestion}
                  title="عرض سؤال عشوائي جديد"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-semibold hover:bg-accent-mid shadow-xs transition"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">سؤال عشوائي</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 pt-4 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {isSidebarVisible && (
          <aside
            aria-label="قائمة الفتاوى"
            className="lg:col-span-3 order-3 lg:order-1 transition-all"
          >
            <div className="bg-page-raised border border-page-line rounded-lg p-3">
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-page-line gap-2 flex-wrap">
                <h2 className="font-semibold text-xs text-ink flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-accent" />
                  الفتاوى
                  <span className="text-ink-faint font-normal">
                    ({browseTotal > 0 ? browseTotal : displayFatwas.length})
                  </span>
                </h2>

                {answeredCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilterUnansweredOnly(prev => !prev)}
                    title={filterUnansweredOnly ? 'إظهار جميع الفتاوى' : 'إظهار غير المُجاب فقط'}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border transition ${
                      filterUnansweredOnly
                        ? 'bg-accent text-white border-accent'
                        : 'bg-page text-ink-muted border-page-line hover:text-ink'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    <span>{answeredCount} مُجاب</span>
                  </button>
                )}
              </div>
              <div className="space-y-1 max-h-[calc(100vh-14rem)] overflow-y-auto">
                {displayFatwas.map(fatwa => {
                  const isActive = fatwa.id === activeFatwa?.id;
                  const isSaved = learner.isBookmarked(fatwa.id);
                  const isAnswered = learner.isQuestionAnswered(fatwa.id);
                  return (
                    <button
                      key={fatwa.id}
                      type="button"
                      onClick={() => handleFatwaSelect(fatwa.id)}
                      className={`w-full text-right p-2.5 rounded-md text-xs transition border ${
                        isActive
                          ? 'bg-accent-soft border-accent/30 text-ink'
                          : 'bg-transparent border-transparent hover:bg-page-sunken text-ink-soft'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] text-ink-faint mb-1">
                        <span className="font-medium text-accent-mid">{fatwa.scholar_name}</span>
                        <span className="inline-flex items-center gap-1.5">
                          #{fatwa.episode_number}
                          {isAnswered && (
                            <span title="تمت الإجابة على سؤال هذه الفتوى">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            </span>
                          )}
                          {isSaved && <BookmarkCheck className="w-3 h-3 text-accent" />}
                        </span>
                      </div>
                      <div className="line-clamp-2 font-amiri text-sm leading-snug text-ink">
                        {fatwa.question_text}
                      </div>
                    </button>
                  );
                })}
                {displayFatwas.length === 0 && (
                  <p className="text-center text-ink-faint text-xs py-6">
                    {filterUnansweredOnly ? 'أجبت على جميع الفتاوى المطابقة!' : 'لا نتائج مطابقة'}
                  </p>
                )}
              </div>
            </div>
          </aside>
        )}

        <div className={`${readerColSpan} space-y-4 order-1 lg:order-2 transition-all`}>
          <FatwaReader
            fatwaId={activeFatwaId}
            fatwa={activeFatwa}
            principles={principles}
            fatwaPrinciples={currentFatwaPrinciples}
            activePrincipleId={activePrincipleId}
            showExtractedPrinciples={mode === 'browse'}
            onSelectPrinciple={handlePrincipleSelect}
          />
        </div>

        <aside
          aria-label={mode === 'quiz' ? 'لوحة الاختبار' : 'فهرس التصفح'}
          className={`${actionColSpan} order-2 lg:order-3 transition-all`}
        >
          {mode === 'quiz' ? (
            <QuizPane
              fatwa={activeFatwa}
              principle={currentPrinciple}
              fatwaPrinciple={selectedFatwaPrinciple}
              onNextQuestion={handleNextRandomQuestion}
            />
          ) : (
            <BrowseIndex
              fatwas={displayFatwas}
              principles={principles}
              fatwaPrinciples={fatwaPrinciples}
              activeFatwaId={activeFatwa?.id}
              onSelectFatwa={handleFatwaSelect}
              onSelectPrinciple={handleBrowsePrinciple}
            />
          )}
        </aside>
      </main>
    </div>
  );
};
