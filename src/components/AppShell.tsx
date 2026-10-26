import React, { useEffect, useMemo, useState } from 'react';
import { BookmarkCheck, Filter, Layers, Search } from 'lucide-react';
import {
  AppMode,
  Fatwa,
  FatwaPrinciple,
  Principle,
  Scholar,
  UserState,
} from '../types';
import { matchesSearch, chapterLabelAr } from '../utils/arabic';
import { FatwaReader } from './FatwaReader';
import { QuizPane } from './QuizPane';
import { BrowseIndex } from './BrowseIndex';

interface AppShellProps {
  fatwas: Fatwa[];
  principles: Principle[];
  fatwaPrinciples: FatwaPrinciple[];
  userState: UserState;
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
}

export const AppShell: React.FC<AppShellProps> = ({
  fatwas,
  principles,
  fatwaPrinciples,
  userState,
  searchQuery,
  setSearchQuery,
  bootLabel,
  opfsReady,
  onRecordQuizAttempt,
  onToggleBookmark,
}) => {
  const [mode, setMode] = useState<AppMode>('quiz');
  const [selectedScholar, setSelectedScholar] = useState<Scholar | 'ALL'>('ALL');
  const [selectedChapter, setSelectedChapter] = useState<string>('ALL');
  const [activeFatwaId, setActiveFatwaId] = useState<string>(fatwas[0]?.id || '');
  const [activePrincipleId, setActivePrincipleId] = useState<string | null>(null);

  useEffect(() => {
    if (!activeFatwaId && fatwas[0]?.id) {
      setActiveFatwaId(fatwas[0].id);
    }
  }, [fatwas, activeFatwaId]);

  const chapters = useMemo(
    () => Array.from(new Set(fatwas.map(f => f.topic_chapter))).sort(),
    [fatwas]
  );

  const filteredFatwas = useMemo(() => {
    return fatwas.filter(f => {
      if (selectedScholar !== 'ALL' && f.scholar_name !== selectedScholar) return false;
      if (selectedChapter !== 'ALL' && f.topic_chapter !== selectedChapter) return false;
      if (!searchQuery.trim()) return true;
      return (
        matchesSearch(searchQuery, f.question_norm) || matchesSearch(searchQuery, f.answer_norm)
      );
    });
  }, [fatwas, selectedScholar, selectedChapter, searchQuery]);

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

  return (
    <div className="min-h-screen bg-page text-ink pb-10">
      <header className="sticky top-0 z-30 bg-page-raised/95 backdrop-blur border-b border-page-line">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-amiri text-3xl sm:text-4xl font-bold text-ink tracking-wide leading-none">
                تأصيل
              </h1>
              <p className="text-xs sm:text-sm text-ink-muted mt-1 text-balance">
                قواعد الفقه والأصول من فتاوى نور على الدرب — ابن باز وابن عثيمين
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div
                role="tablist"
                aria-label="وضع الواجهة"
                className="inline-flex p-0.5 rounded-lg border border-page-line bg-page-sunken"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'quiz'}
                  onClick={() => setMode('quiz')}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition ${
                    mode === 'quiz'
                      ? 'bg-page-raised text-accent shadow-sm'
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
                  className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition ${
                    mode === 'browse'
                      ? 'bg-page-raised text-accent shadow-sm'
                      : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  تصفح
                </button>
              </div>

              {userState.bookmarks.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted px-2 py-1">
                  <BookmarkCheck className="w-3.5 h-3.5 text-accent" />
                  {userState.bookmarks.length}
                </span>
              )}

              <span
                className={`text-[11px] px-2 py-1 rounded-md border ${
                  opfsReady
                    ? 'border-accent/25 text-accent bg-accent-soft/50'
                    : 'border-page-line text-ink-muted bg-page-sunken'
                }`}
                title={bootLabel || undefined}
              >
                {opfsReady ? 'جاهز دون اتصال' : bootLabel || 'تهيئة الأرشيف…'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="relative min-w-[200px] flex-1 max-w-md">
              <Search className="w-4 h-4 absolute right-2.5 top-2 text-ink-faint" />
              <input
                type="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="بحث في الأسئلة والأجوبة…"
                className="w-full bg-page border border-page-line rounded-md pr-8 pl-3 py-1.5 text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent"
              />
            </div>

            <div className="inline-flex items-center gap-0.5 p-0.5 rounded-md border border-page-line bg-page">
              <Filter className="w-3.5 h-3.5 text-ink-faint mx-1" />
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
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
        <aside aria-label="فهرس الفتاوى" className="lg:col-span-3 order-3 lg:order-1">
          <div className="bg-page-raised border border-page-line rounded-lg p-3">
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-page-line">
              <h2 className="font-semibold text-xs text-ink flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-accent" />
                الفتاوى
                <span className="text-ink-faint font-normal">({filteredFatwas.length})</span>
              </h2>
            </div>
            <div className="space-y-1 max-h-[calc(100vh-14rem)] overflow-y-auto">
              {filteredFatwas.map(fatwa => {
                const isActive = fatwa.id === activeFatwa?.id;
                const isSaved = userState.bookmarks.includes(fatwa.id);
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
                      <span className="inline-flex items-center gap-1">
                        #{fatwa.episode_number}
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
                <p className="text-center text-ink-faint text-xs py-6">لا نتائج مطابقة</p>
              )}
            </div>
          </div>
        </aside>

        <div className="lg:col-span-5 space-y-4 order-1 lg:order-2">
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
          className="lg:col-span-4 order-2 lg:order-3"
        >
          {mode === 'quiz' ? (
            <QuizPane
              fatwa={activeFatwa}
              principle={currentPrinciple}
              fatwaPrinciple={selectedFatwaPrinciple}
              onRecordQuizAttempt={onRecordQuizAttempt}
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
