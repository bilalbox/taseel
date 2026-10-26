import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookmarkCheck, CheckCircle2, Filter, Layers, Search, Shuffle } from 'lucide-react';
import {
  AppMode,
  Fatwa,
  FatwaPrinciple,
  Principle,
  Scholar,
  UserState,
} from '../types';
import { matchesSearch, chapterLabelAr } from '../utils/arabic';
import {
  AnsweredQuestionsMap,
  getAnsweredRecord,
  getGroundedQuizCandidates,
  isQuestionAnswered,
  pickRandomQuizQuestion,
} from '../utils/quizTracker';
import { FatwaReader } from './FatwaReader';
import { QuizPane } from './QuizPane';
import { BrowseIndex } from './BrowseIndex';

interface AppShellProps {
  fatwas: Fatwa[];
  principles: Principle[];
  fatwaPrinciples: FatwaPrinciple[];
  userState: UserState;
  answeredQuestions: AnsweredQuestionsMap;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  bootLabel?: string | null;
  opfsReady: boolean;
  onRecordQuizAttempt: (
    fatwaId: string,
    principleId: string,
    selectedId: string,
    isCorrect: boolean,
    timeSpentMs: number
  ) => void;
  onToggleBookmark: (fatwaId: string) => void;
  onResetQuizProgress?: () => void;
}

export const AppShell: React.FC<AppShellProps> = ({
  fatwas,
  principles,
  fatwaPrinciples,
  userState,
  answeredQuestions,
  searchQuery,
  setSearchQuery,
  bootLabel,
  opfsReady,
  onRecordQuizAttempt,
  onToggleBookmark,
  onResetQuizProgress,
}) => {
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

  const seededRef = useRef(false);

  // Present a random question on visit/page load (or honor ?fatwa= if provided)
  const [activeFatwaId, setActiveFatwaId] = useState<string>(() => {
    if (requestedFatwaId && fatwas.some(f => f.id === requestedFatwaId)) {
      seededRef.current = true;
      return requestedFatwaId;
    }
    const initialPick = pickRandomQuizQuestion({
      fatwas,
      fatwaPrinciples,
      answered: answeredQuestions,
    });
    if (initialPick) {
      seededRef.current = true;
      return initialPick.fatwa.id;
    }
    return fatwas[0]?.id || '';
  });

  const [activePrincipleId, setActivePrincipleId] = useState<string | null>(() => {
    const initialPick = pickRandomQuizQuestion({
      fatwas,
      fatwaPrinciples,
      answered: answeredQuestions,
    });
    return initialPick?.fatwaPrinciple.principle_id || null;
  });

  // Seed initial random question once pool hydrates if initial pick was empty
  useEffect(() => {
    if (seededRef.current) return;
    if (fatwas.length === 0 || fatwaPrinciples.length === 0) return;

    if (requestedFatwaId && fatwas.some(f => f.id === requestedFatwaId)) {
      setActiveFatwaId(requestedFatwaId);
      seededRef.current = true;
      return;
    }

    const randomPick = pickRandomQuizQuestion({
      fatwas,
      fatwaPrinciples,
      answered: answeredQuestions,
    });
    if (randomPick) {
      setActiveFatwaId(randomPick.fatwa.id);
      setActivePrincipleId(randomPick.fatwaPrinciple.principle_id);
      seededRef.current = true;
    }
  }, [fatwas, fatwaPrinciples, answeredQuestions, requestedFatwaId]);

  // Keep activeFatwaId valid if fatwas array updates from background OPFS
  useEffect(() => {
    if (!activeFatwaId && fatwas[0]?.id) {
      const pick = pickRandomQuizQuestion({
        fatwas,
        fatwaPrinciples,
        answered: answeredQuestions,
      });
      setActiveFatwaId(pick?.fatwa.id || fatwas[0].id);
      if (pick) setActivePrincipleId(pick.fatwaPrinciple.principle_id);
    }
  }, [fatwas, fatwaPrinciples, answeredQuestions, activeFatwaId]);

  const chapters = useMemo(
    () => Array.from(new Set(fatwas.map(f => f.topic_chapter))).sort(),
    [fatwas]
  );

  const filteredFatwas = useMemo(() => {
    return fatwas.filter(f => {
      if (selectedScholar !== 'ALL' && f.scholar_name !== selectedScholar) return false;
      if (selectedChapter !== 'ALL' && f.topic_chapter !== selectedChapter) return false;
      if (filterUnansweredOnly && isQuestionAnswered(answeredQuestions, f.id)) return false;
      if (!searchQuery.trim()) return true;
      return (
        matchesSearch(searchQuery, f.question_norm) || matchesSearch(searchQuery, f.answer_norm)
      );
    });
  }, [fatwas, selectedScholar, selectedChapter, filterUnansweredOnly, answeredQuestions, searchQuery]);

  const activeFatwa =
    fatwas.find(f => f.id === activeFatwaId) || filteredFatwas[0] || fatwas[0];

  const currentFatwaPrinciples = useMemo(
    () => fatwaPrinciples.filter(fp => fp.fatwa_id === activeFatwa?.id),
    [fatwaPrinciples, activeFatwa]
  );

  const selectedFatwaPrinciple =
    currentFatwaPrinciples.find(
      fp => fp.principle_id === (activePrincipleId || currentFatwaPrinciples[0]?.principle_id)
    ) || currentFatwaPrinciples[0];

  const currentPrinciple = principles.find(p => p.id === selectedFatwaPrinciple?.principle_id);

  // Grounded quiz candidates and progress stats
  const groundedCandidates = useMemo(
    () => getGroundedQuizCandidates(fatwas, fatwaPrinciples),
    [fatwas, fatwaPrinciples]
  );

  const answeredCount = useMemo(() => {
    let count = 0;
    for (const c of groundedCandidates) {
      if (isQuestionAnswered(answeredQuestions, c.fatwa.id, c.fatwaPrinciple.principle_id)) {
        count++;
      }
    }
    return count;
  }, [groundedCandidates, answeredQuestions]);

  const isCurrentQuestionAnswered = useMemo(() => {
    if (!activeFatwa) return false;
    return isQuestionAnswered(
      answeredQuestions,
      activeFatwa.id,
      selectedFatwaPrinciple?.principle_id
    );
  }, [answeredQuestions, activeFatwa, selectedFatwaPrinciple]);

  const currentAnsweredRecord = useMemo(() => {
    if (!activeFatwa) return undefined;
    return getAnsweredRecord(
      answeredQuestions,
      activeFatwa.id,
      selectedFatwaPrinciple?.principle_id
    );
  }, [answeredQuestions, activeFatwa, selectedFatwaPrinciple]);

  const handleNextRandomQuestion = useCallback(() => {
    const next = pickRandomQuizQuestion({
      fatwas,
      fatwaPrinciples,
      answered: answeredQuestions,
      excludeFatwaId: activeFatwaId,
      filter: {
        scholar: selectedScholar,
        chapter: selectedChapter,
      },
    });
    if (next) {
      setActiveFatwaId(next.fatwa.id);
      setActivePrincipleId(next.fatwaPrinciple.principle_id);
    }
  }, [
    fatwas,
    fatwaPrinciples,
    answeredQuestions,
    activeFatwaId,
    selectedScholar,
    selectedChapter,
  ]);

  const handleFatwaSelect = (fatwaId: string) => {
    setActiveFatwaId(fatwaId);
    setActivePrincipleId(null);
  };

  const handlePrincipleSelect = (principleId: string) => {
    setActivePrincipleId(principleId);
  };

  const handleBrowsePrinciple = (principleId: string) => {
    setActivePrincipleId(principleId);
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
              <span className="text-[11px] text-ink-faint hidden sm:inline border-r border-page-line pr-3">
                تخريج فتاوى نور على الدرب على القواعد الفقهية والأصولية
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div
                role="tablist"
                aria-label="وضع الواجهة"
                className="inline-flex p-0.5 rounded-lg border border-page-line bg-page-sunken text-xs font-semibold"
              >
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
                  اختبار
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

              {userState.bookmarks.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted px-2 py-0.5 bg-page-sunken rounded-md border border-page-line">
                  <BookmarkCheck className="w-3.5 h-3.5 text-accent" />
                  <span>{userState.bookmarks.length}</span>
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

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="relative min-w-[180px] flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 absolute right-2.5 top-2 text-ink-faint" />
              <input
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="بحث في الأسئلة والأجوبة والقواعد…"
                className="w-full bg-page border border-page-line rounded-md pr-8 pl-3 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent"
              />
            </div>

            <div className="inline-flex items-center gap-0.5 p-0.5 rounded-md border border-page-line bg-page">
              <Filter className="w-3 h-3 text-ink-faint mx-1" />
              {(['ALL', 'ابن باز', 'ابن عثيمين'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSelectedScholar(s)}
                  className={`px-2 py-1 rounded text-xs transition ${
                    selectedScholar === s
                      ? 'bg-accent text-white font-semibold'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {s === 'ALL' ? 'الكل' : s}
                </button>
              ))}
            </div>

            <select
              value={selectedChapter}
              onChange={e => setSelectedChapter(e.target.value)}
              aria-label="تصفية حسب الباب"
              className="bg-page border border-page-line text-ink rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent"
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
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border transition ${
                  showSidebarInQuiz
                    ? 'bg-accent text-white border-accent'
                    : 'bg-page text-ink-muted border-page-line hover:text-ink'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>فهرس الفتاوى</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {isSidebarVisible && (
          <aside aria-label="فهرس الفتاوى" className="lg:col-span-3 order-3 lg:order-1 animate-fade-pane">
            <div className="bg-page-raised border border-page-line rounded-lg p-3">
              <div className="flex items-center justify-between mb-2 pb-2 border-b border-page-line gap-2 flex-wrap">
                <h2 className="font-semibold text-xs text-ink flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-accent" />
                  الفتاوى
                  <span className="text-ink-faint font-normal">({filteredFatwas.length})</span>
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
                {filteredFatwas.map(fatwa => {
                  const isActive = fatwa.id === activeFatwa?.id;
                  const isSaved = userState.bookmarks.includes(fatwa.id);
                  const isAnswered = isQuestionAnswered(answeredQuestions, fatwa.id);
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
                {filteredFatwas.length === 0 && (
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
            fatwa={activeFatwa}
            principles={principles}
            fatwaPrinciples={currentFatwaPrinciples}
            activePrincipleId={activePrincipleId}
            isBookmarked={!!activeFatwa && userState.bookmarks.includes(activeFatwa.id)}
            showExtractedPrinciples={mode === 'browse'}
            onToggleBookmark={onToggleBookmark}
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
              isAnswered={isCurrentQuestionAnswered}
              lastAttempt={currentAnsweredRecord}
              totalGroundedCount={groundedCandidates.length}
              answeredCount={answeredCount}
              onRecordQuizAttempt={onRecordQuizAttempt}
              onNextQuestion={handleNextRandomQuestion}
              onResetProgress={onResetQuizProgress}
            />
          ) : (
            <BrowseIndex
              fatwas={filteredFatwas}
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
