import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Search,
  Bookmark,
  BookmarkCheck,
  CheckCircle,
  HelpCircle,
  Sparkles,
  Volume2,
  Filter,
  Layers,
  Award
} from 'lucide-react';
import { Fatwa, Principle, FatwaPrinciple, UserState, Scholar, DistractorItem } from '../../types';
import { AudioPlayerStub } from '../AudioPlayerStub';
import { matchesSearch, CATEGORY_LABELS } from '../../utils/arabic';

interface VariantAProps {
  fatwas: Fatwa[];
  principles: Principle[];
  fatwaPrinciples: FatwaPrinciple[];
  userState: UserState;
  onRecordQuizAttempt: (fatwaId: string, principleId: string, selectedId: string, isCorrect: boolean, timeSpentMs: number) => void;
  onToggleBookmark: (fatwaId: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

export const VariantA_ClassicalReader: React.FC<VariantAProps> = ({
  fatwas,
  principles,
  fatwaPrinciples,
  userState,
  onRecordQuizAttempt,
  onToggleBookmark,
  searchQuery,
  setSearchQuery
}) => {
  const [selectedScholar, setSelectedScholar] = useState<Scholar | 'ALL'>('ALL');
  const [selectedChapter, setSelectedChapter] = useState<string>('ALL');
  const [activeFatwaId, setActiveFatwaId] = useState<string>(fatwas[0]?.id || '');
  const [activePrincipleId, setActivePrincipleId] = useState<string | null>(null);

  // Micro-quiz state for the active fatwa
  const [selectedQuizChoice, setSelectedQuizChoice] = useState<string | null>(null);
  const [hasSubmittedQuiz, setHasSubmittedQuiz] = useState<boolean>(false);
  const [quizStartTime] = useState<number>(Date.now());

  // Filter fatwas based on search query, scholar, and chapter
  const filteredFatwas = useMemo(() => {
    return fatwas.filter(f => {
      if (selectedScholar !== 'ALL' && f.scholar_name !== selectedScholar) return false;
      if (selectedChapter !== 'ALL' && f.topic_chapter !== selectedChapter) return false;
      if (!searchQuery.trim()) return true;
      return matchesSearch(searchQuery, f.question_norm) || matchesSearch(searchQuery, f.answer_norm);
    });
  }, [fatwas, selectedScholar, selectedChapter, searchQuery]);

  const activeFatwa = fatwas.find(f => f.id === activeFatwaId) || filteredFatwas[0] || fatwas[0];

  // Linked principles for current fatwa
  const currentFatwaPrinciples = useMemo(() => {
    return fatwaPrinciples.filter(fp => fp.fatwa_id === activeFatwa?.id);
  }, [fatwaPrinciples, activeFatwa]);

  const selectedFatwaPrinciple = currentFatwaPrinciples.find(
    fp => fp.principle_id === (activePrincipleId || currentFatwaPrinciples[0]?.principle_id)
  ) || currentFatwaPrinciples[0];

  const currentPrinciple = principles.find(p => p.id === selectedFatwaPrinciple?.principle_id);

  // Parse distractors for micro-quiz
  const distractors: DistractorItem[] = useMemo(() => {
    if (!selectedFatwaPrinciple) return [];
    try {
      return JSON.parse(selectedFatwaPrinciple.distractor_principles_json);
    } catch {
      return [];
    }
  }, [selectedFatwaPrinciple]);

  // Combine correct principle and distractors
  const quizChoices = useMemo(() => {
    if (!currentPrinciple) return [];
    const all = [
      {
        id: currentPrinciple.id,
        text: currentPrinciple.canonical_text_ar,
        category: currentPrinciple.category,
        is_correct: true,
        reason: selectedFatwaPrinciple.application_explanation_ar
      },
      ...distractors.map(d => ({
        id: d.id,
        text: d.canonical_text_ar,
        category: d.category,
        is_correct: false,
        reason: d.reason_incorrect
      }))
    ];
    // Deterministic shuffle based on fatwa ID
    return all.sort((a, b) => a.text.localeCompare(b.text));
  }, [currentPrinciple, distractors, selectedFatwaPrinciple]);

  const isBookmarked = userState.bookmarks.includes(activeFatwa?.id);

  const handleChoiceSelect = (choiceId: string) => {
    if (hasSubmittedQuiz) return;
    setSelectedQuizChoice(choiceId);
    setHasSubmittedQuiz(true);
    const isCorrect = choiceId === currentPrinciple?.id;
    const timeSpent = Date.now() - quizStartTime;
    if (activeFatwa && currentPrinciple) {
      onRecordQuizAttempt(activeFatwa.id, currentPrinciple.id, choiceId, isCorrect, timeSpent);
    }
  };

  const resetQuiz = () => {
    setSelectedQuizChoice(null);
    setHasSubmittedQuiz(false);
  };

  const handleFatwaSelect = (fatwaId: string) => {
    setActiveFatwaId(fatwaId);
    setActivePrincipleId(null);
    resetQuiz();
  };

  const chapters = Array.from(new Set(fatwas.map(f => f.topic_chapter)));

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 pb-20 pt-16">
      {/* Top Classical Header */}
      <header className="bg-stone-900 text-stone-100 border-b border-amber-800/40 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-600/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-amiri text-2xl font-bold tracking-wide text-amber-200">
                خزانة نور على الدرب | المطالعة والاستنباط
              </h1>
              <p className="text-xs text-stone-400 font-sans">
                النموذج (أ): واجهة دراسية تخصصية تجمع بين نص الفتوى، واستخراج القواعد الفقهية والأصولية
              </p>
            </div>
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs font-sans">
            {/* Search */}
            <div className="relative min-w-[220px]">
              <Search className="w-4 h-4 absolute right-2.5 top-2.5 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث نصي فوري (FTS5)..."
                className="w-full bg-stone-800 border border-stone-700 rounded-lg pr-8 pl-3 py-1.5 text-stone-100 placeholder-stone-500 text-xs focus:outline-none focus:border-amber-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2.5 top-2 text-stone-400 hover:text-white text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Scholar Filter */}
            <div className="flex items-center gap-1 bg-stone-800 p-1 rounded-lg border border-stone-700">
              <Filter className="w-3.5 h-3.5 text-amber-400 mr-1" />
              <button
                onClick={() => setSelectedScholar('ALL')}
                className={`px-2 py-0.5 rounded text-xs transition ${
                  selectedScholar === 'ALL' ? 'bg-amber-600 text-white font-bold' : 'text-stone-300 hover:text-white'
                }`}
              >
                الكل
              </button>
              <button
                onClick={() => setSelectedScholar('ابن باز')}
                className={`px-2 py-0.5 rounded text-xs transition ${
                  selectedScholar === 'ابن باز' ? 'bg-amber-600 text-white font-bold' : 'text-stone-300 hover:text-white'
                }`}
              >
                ابن باز
              </button>
              <button
                onClick={() => setSelectedScholar('ابن عثيمين')}
                className={`px-2 py-0.5 rounded text-xs transition ${
                  selectedScholar === 'ابن عثيمين' ? 'bg-amber-600 text-white font-bold' : 'text-stone-300 hover:text-white'
                }`}
              >
                ابن عثيمين
              </button>
            </div>

            {/* Chapter Filter */}
            <select
              value={selectedChapter}
              onChange={(e) => setSelectedChapter(e.target.value)}
              aria-label="تصفية حسب الباب الفقهي"
              className="bg-stone-800 border border-stone-700 text-stone-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-amber-500"
            >
              <option value="ALL">جميع الأبواب الفقهية</option>
              {chapters.map(ch => (
                <option key={ch} value={ch}>
                  كتاب {ch === 'Taharah' ? 'الطهارة' : ch === 'Salat' ? 'الصلاة' : ch === 'Muamalat' ? 'المعاملات' : ch}
                </option>
              ))}
            </select>
          </div>
        </div>
      </header>

      {/* Main Split Layout */}
      <main className="max-w-7xl mx-auto px-4 mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side (Desktop 4 cols): Fatwa List Index */}
        <aside aria-label="فهرس الفتاوى" className="lg:col-span-3 space-y-3 order-2 lg:order-1">
          <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-3">
            <div className="flex items-center justify-between mb-2 pb-2 border-b border-stone-100">
              <h2 className="font-bold text-xs text-stone-700 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-600" />
                فهرس الفتاوى ({filteredFatwas.length})
              </h2>
              <span className="text-[10px] text-stone-400 font-mono">SQLite VFS</span>
            </div>

            <div className="space-y-1.5 max-h-[calc(100vh-250px)] overflow-y-auto pr-1">
              {filteredFatwas.map(fatwa => {
                const isActive = fatwa.id === activeFatwa?.id;
                const isSaved = userState.bookmarks.includes(fatwa.id);
                return (
                  <button
                    key={fatwa.id}
                    onClick={() => handleFatwaSelect(fatwa.id)}
                    className={`w-full text-right p-2.5 rounded-lg text-xs transition border block ${
                      isActive
                        ? 'bg-amber-50/80 border-amber-300 text-stone-900 shadow-xs'
                        : 'bg-stone-50/70 border-stone-200/80 hover:bg-stone-100 text-stone-700'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] text-stone-500 mb-1">
                      <span className="font-semibold text-amber-800">الشيخ {fatwa.scholar_name}</span>
                      <div className="flex items-center gap-1">
                        <span>حلقة #{fatwa.episode_number}</span>
                        {isSaved && <BookmarkCheck className="w-3 h-3 text-amber-600" />}
                      </div>
                    </div>
                    <div className="line-clamp-2 font-medium font-amiri text-sm leading-snug">
                      {fatwa.question_text}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Center / Manuscript Area (Desktop 5 cols): Fatwa Text & Audio */}
        <div className="lg:col-span-5 space-y-4 order-1 lg:order-2">
          {activeFatwa ? (
            <article className="bg-white rounded-xl shadow-md border border-stone-200 overflow-hidden">
              {/* Manuscript Top Bar */}
              <div className="bg-parchment-100 border-b border-stone-200 px-5 py-3 flex items-center justify-between">
                <div>
                  <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200 ml-2">
                    كتاب {activeFatwa.topic_chapter}
                  </span>
                  <span className="text-xs text-stone-600 font-medium">
                    {activeFatwa.topic_subtopic}
                  </span>
                </div>
                <button
                  onClick={() => onToggleBookmark(activeFatwa.id)}
                  className={`p-1.5 rounded-lg border transition flex items-center gap-1 text-xs ${
                    isBookmarked
                      ? 'bg-amber-500 text-white border-amber-600'
                      : 'bg-white text-stone-600 border-stone-300 hover:bg-stone-50'
                  }`}
                  title={isBookmarked ? 'إزالة من المحفوظات' : 'حفظ الفتوى في user_state'}
                >
                  <Bookmark className="w-3.5 h-3.5 fill-current" />
                  <span>{isBookmarked ? 'محفوظة' : 'حفظ'}</span>
                </button>
              </div>

              {/* Audio Player Stub */}
              <div className="p-4 bg-stone-950/95 border-b border-stone-800">
                <AudioPlayerStub
                  scholar={activeFatwa.scholar_name}
                  episodeNumber={activeFatwa.episode_number}
                  initialTimestamp={activeFatwa.audio_timestamp}
                  audioUrl={activeFatwa.audio_url}
                />
              </div>

              {/* Manuscript Text Content */}
              <div className="p-6 space-y-6">
                {/* Question Section */}
                <div className="relative pl-3 pr-4 py-3 rounded-lg bg-stone-50 border-r-4 border-amber-600">
                  <div className="text-xs font-bold text-amber-800 uppercase tracking-wider mb-1 flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>نص السؤال المستفتى عنه:</span>
                  </div>
                  <p className="font-amiri text-lg text-stone-800 leading-relaxed font-normal">
                    «{activeFatwa.question_text}»
                  </p>
                </div>

                {/* Answer Section */}
                <div className="space-y-3">
                  <div className="text-xs font-bold text-stone-600 flex items-center justify-between border-b pb-1">
                    <span>نص جواب سماحة الشيخ {activeFatwa.scholar_name} (مفرغ ومراجع):</span>
                    <span className="text-[10px] text-stone-400 font-mono">Archive proofread</span>
                  </div>
                  <div className="font-amiri text-lg text-stone-900 leading-loose text-justify font-normal bg-parchment-50 p-4 rounded-lg border border-parchment-200">
                    {activeFatwa.answer_text}
                  </div>
                </div>

                {/* Extracted Principles Badges */}
                <div className="pt-2 border-t border-stone-100">
                  <div className="text-xs font-bold text-stone-700 mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    <span>القواعد والضوابط المستخرجة من هذه الفتوى:</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {currentFatwaPrinciples.map(fp => {
                      const princ = principles.find(p => p.id === fp.principle_id);
                      if (!princ) return null;
                      const isSelected = princ.id === currentPrinciple?.id;
                      const catBadge = CATEGORY_LABELS[princ.category] || CATEGORY_LABELS.fiqhiyyah;

                      return (
                        <button
                          key={fp.id}
                          onClick={() => {
                            setActivePrincipleId(princ.id);
                            resetQuiz();
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-2 transition ${
                            isSelected
                              ? 'bg-amber-600 text-white border-amber-700 shadow-sm ring-2 ring-amber-300'
                              : 'bg-stone-50 hover:bg-stone-100 text-stone-800 border-stone-300'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white' : 'bg-amber-600'}`}></span>
                          <span className="font-amiri text-sm">{princ.canonical_text_ar}</span>
                          <span className="text-[10px] opacity-80 font-sans">({catBadge.title})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </article>
          ) : (
            <div className="bg-white rounded-xl p-8 text-center text-stone-500">
              لا توجد فتاوى مطابقة لبحثك
            </div>
          )}
        </div>

        {/* Right Side (Desktop 4 cols): Exegesis & Applied Micro-Quiz Pane */}
        <aside aria-label="الشرح الفقهي والاختبار الفوري" className="lg:col-span-4 space-y-4 order-3">
          {currentPrinciple && selectedFatwaPrinciple ? (
            <div className="bg-white rounded-xl shadow-md border border-stone-200 p-5 space-y-5">
              {/* Principle Header */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${CATEGORY_LABELS[currentPrinciple.category]?.color}`}>
                    {CATEGORY_LABELS[currentPrinciple.category]?.badge}
                  </span>
                  <span className="text-[11px] text-stone-500 font-mono">
                    صعوبة: {selectedFatwaPrinciple.difficulty === 'beginner' ? 'مبتدئ' : selectedFatwaPrinciple.difficulty === 'intermediate' ? 'متوسط' : 'متقدم'}
                  </span>
                </div>
                <h3 className="font-amiri text-xl font-bold text-stone-900 border-b border-stone-100 pb-2">
                  «{currentPrinciple.canonical_text_ar}»
                </h3>
              </div>

              {/* General Scholarly Explanation */}
              <div className="bg-stone-50 p-3 rounded-lg border border-stone-200/80 text-xs text-stone-700 leading-relaxed">
                <div className="font-bold text-stone-900 mb-1 flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5 text-amber-600" />
                  <span>التعريف والبيان الكلي للقاعدة:</span>
                </div>
                <p className="font-traditional text-sm leading-relaxed">
                  {currentPrinciple.general_explanation_ar}
                </p>
              </div>

              {/* Application to THIS Fatwa */}
              <div className="bg-emerald-50/70 p-3 rounded-lg border border-emerald-200 text-xs text-emerald-950 leading-relaxed">
                <div className="font-bold text-emerald-900 mb-1 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>تخريج المسألة وتطبيق الشيخ للقاعدة:</span>
                </div>
                <p className="font-traditional text-sm leading-relaxed text-emerald-900">
                  {selectedFatwaPrinciple.application_explanation_ar}
                </p>
                <div className="mt-2 text-[10px] text-emerald-700 font-mono">
                  {selectedFatwaPrinciple.explicitly_stated ? '✓ مصرح بها نصاً في كلام الشيخ' : '• مستنبطة ضمناً من تعليل الحكم'}
                </div>
              </div>

              {/* Micro-Quiz Box */}
              <div className="border-t border-stone-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-bold text-xs text-stone-900 flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-amber-600" />
                    <span>فحص استيعاب الدليل والتخريج</span>
                  </div>
                  <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold">
                    +15 XP
                  </span>
                </div>

                <p className="text-xs text-stone-600 mb-3 font-medium">
                  أي القواعد التالية هي العلة المباشرة التي بنى عليها الشيخ الحكم في هذه الواقعة؟
                </p>

                {/* Choices */}
                <div className="space-y-2">
                  {quizChoices.map((choice) => {
                    const isSelected = selectedQuizChoice === choice.id;
                    let btnStyle = 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-800';

                    if (hasSubmittedQuiz) {
                      if (choice.is_correct) {
                        btnStyle = 'bg-emerald-100 border-emerald-400 text-emerald-950 font-bold';
                      } else if (isSelected && !choice.is_correct) {
                        btnStyle = 'bg-rose-100 border-rose-300 text-rose-950';
                      } else {
                        btnStyle = 'opacity-60 bg-stone-100 border-stone-200 text-stone-600';
                      }
                    }

                    return (
                      <div key={choice.id} className="space-y-1">
                        <button
                          onClick={() => handleChoiceSelect(choice.id)}
                          disabled={hasSubmittedQuiz}
                          className={`w-full text-right p-2.5 rounded-lg text-xs border transition flex items-center justify-between ${btnStyle}`}
                        >
                          <span className="font-amiri text-sm">{choice.text}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/80 border border-stone-300 text-stone-600 font-mono shrink-0 mr-2">
                            {CATEGORY_LABELS[choice.category]?.title}
                          </span>
                        </button>

                        {/* Explain why distractors fail if submitted */}
                        {hasSubmittedQuiz && (isSelected || choice.is_correct) && (
                          <div className={`p-2 rounded text-[11px] leading-relaxed ${choice.is_correct ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-900'}`}>
                            <strong>{choice.is_correct ? '✓ صحيح: ' : '✗ وجه الخطأ: '}</strong>
                            {choice.reason}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {hasSubmittedQuiz && (
                  <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-700">
                      تم حفظ النتيجة في user_state.sqlite3
                    </span>
                    <button
                      onClick={resetQuiz}
                      className="px-3 py-1 bg-stone-800 text-stone-100 rounded text-xs hover:bg-stone-700 transition"
                    >
                      إعادة المحاولة
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl p-6 text-center text-stone-400 text-xs">
              حدد قاعدة من نص الفتوى للاطلاع على تخريجها واختبار الفهم
            </div>
          )}
        </aside>
      </main>
    </div>
  );
};
