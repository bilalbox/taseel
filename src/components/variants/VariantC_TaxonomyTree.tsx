import React, { useState, useMemo } from 'react';
import {
  FolderTree,
  GitBranch,
  ChevronRight,
  ChevronDown,
  BookOpen,
  Award,
  Layers,
  Sparkles,
  Search,
  ExternalLink,
  Bookmark
} from 'lucide-react';
import { Fatwa, Principle, FatwaPrinciple, UserState, PrincipleCategory, DistractorItem } from '../../types';
import { AudioPlayerStub } from '../AudioPlayerStub';
import { matchesSearch, CATEGORY_LABELS } from '../../utils/arabic';

interface VariantCProps {
  fatwas: Fatwa[];
  principles: Principle[];
  fatwaPrinciples: FatwaPrinciple[];
  userState: UserState;
  onRecordQuizAttempt: (fatwaId: string, principleId: string, selectedId: string, isCorrect: boolean, timeSpentMs: number) => void;
  onToggleBookmark: (fatwaId: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

export const VariantC_TaxonomyTree: React.FC<VariantCProps> = ({
  fatwas,
  principles,
  fatwaPrinciples,
  userState,
  onRecordQuizAttempt,
  onToggleBookmark
}) => {
  const [selectedPrincipleId, setSelectedPrincipleId] = useState<string>(principles[0]?.id || '');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    fiqhiyyah_kubra: true,
    usuliyyah: true,
    dabit: true
  });
  const [taxonomySearch, setTaxonomySearch] = useState('');
  const [activeChallengeStep, setActiveChallengeStep] = useState<number>(0);
  const [challengeChoice, setChallengeChoice] = useState<string | null>(null);
  const [challengeAnswered, setChallengeAnswered] = useState<boolean>(false);

  // Group principles into Taxonomy Nodes
  const treeNodes = useMemo(() => {
    const fiqhiyyahKubra = principles.filter(
      p => p.category === 'fiqhiyyah'
    );
    const usuliyyah = principles.filter(p => p.category === 'usuliyyah');
    const dabit = principles.filter(p => p.category === 'dabit');

    return [
      {
        id: 'fiqhiyyah_kubra',
        title: 'القواعد الفقهية الكبرى الخمس',
        description: 'القواعد الكلية التي تنبني عليها فروع الشريعة الإسلامية كافة',
        items: fiqhiyyahKubra
      },
      {
        id: 'usuliyyah',
        title: 'القواعد الأصولية والاستدلالية',
        description: 'قواعد استنباط الأحكام من الأدلة الشرعية الكلية ومناهج الاستدلال',
        items: usuliyyah
      },
      {
        id: 'dabit',
        title: 'الضوابط الفقهية الخاصة بالأبواب',
        description: 'ما يجمع فروعاً في باب فقهي واحد مخصوص كالبيوع أو الطهارة',
        items: dabit
      }
    ];
  }, [principles]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  const selectedPrinciple = principles.find(p => p.id === selectedPrincipleId) || principles[0];

  // Fatwas linked to this principle
  const linkedFatwaPrinciples = useMemo(() => {
    return fatwaPrinciples.filter(fp => fp.principle_id === selectedPrinciple?.id);
  }, [fatwaPrinciples, selectedPrinciple]);

  const linkedFatwas = useMemo(() => {
    const ids = linkedFatwaPrinciples.map(fp => fp.fatwa_id);
    return fatwas.filter(f => ids.includes(f.id));
  }, [fatwas, linkedFatwaPrinciples]);

  // Scholar Application Matrix (Ibn Baz vs Ibn Uthaymeen)
  const ibnBazFatwas = linkedFatwas.filter(f => f.scholar_name === 'ابن باز');
  const ibnUthaymeenFatwas = linkedFatwas.filter(f => f.scholar_name === 'ابن عثيمين');

  // Calculate mastery percentage for each principle based on userState
  const getPrincipleMastery = (principleId: string) => {
    const attempts = userState.history.filter(h => h.principle_id === principleId);
    if (attempts.length === 0) return 0;
    const correct = attempts.filter(h => h.is_correct).length;
    return Math.round((correct / attempts.length) * 100);
  };

  // Challenge setup for the selected principle
  const currentFP = linkedFatwaPrinciples[0];
  const challengeFatwa = linkedFatwas[0];
  const distractors: DistractorItem[] = useMemo(() => {
    if (!currentFP) return [];
    try {
      return JSON.parse(currentFP.distractor_principles_json);
    } catch {
      return [];
    }
  }, [currentFP]);

  const handleChallengeChoice = (choiceId: string) => {
    if (challengeAnswered) return;
    setChallengeChoice(choiceId);
    setChallengeAnswered(true);
    const isCorrect = choiceId === selectedPrinciple?.id;
    if (challengeFatwa && selectedPrinciple) {
      onRecordQuizAttempt(challengeFatwa.id, selectedPrinciple.id, choiceId, isCorrect, 3500);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 text-stone-900 pb-24 pt-16">
      {/* Top Banner */}
      <header className="bg-sage-900 text-stone-100 border-b border-sage-800 shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-700/40 border border-emerald-500/30 flex items-center justify-center text-emerald-300">
              <FolderTree className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-amiri text-2xl font-bold tracking-wide text-emerald-100">
                شجرة القواعد والمباحث الأصولية | الملاحة المعرفية
              </h1>
              <p className="text-xs text-emerald-200/80 font-sans">
                النموذج (ج): هيكلة شجرية متسلسلة للقواعد الفقهية الكبرى والأصولية مع مقارنة تطبيقات الشيخين
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="bg-sage-800/80 px-3 py-1.5 rounded-lg border border-sage-700 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>إجمالي القواعد المفهرسة: {principles.length}</span>
            </div>
            <div className="bg-sage-800/80 px-3 py-1.5 rounded-lg border border-sage-700 flex items-center gap-2 font-mono text-emerald-300">
              <Award className="w-4 h-4 text-emerald-400" />
              <span>رصيد الإتقان: {userState.xp} XP</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Grid: Left Tree Navigation + Right Comparative Matrix */}
      <main className="max-w-7xl mx-auto px-4 mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Taxonomy Tree Navigator (4 cols) */}
        <aside aria-label="شجرة التصنيف الفقهي والأصولي" className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-4">
            {/* Search within taxonomy */}
            <div className="relative mb-3">
              <Search className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-stone-400" />
              <input
                type="text"
                value={taxonomySearch}
                onChange={(e) => setTaxonomySearch(e.target.value)}
                placeholder="تصفية فروع الشجرة..."
                className="w-full bg-stone-50 border border-stone-200 rounded-lg pr-8 pl-3 py-1.5 text-xs focus:outline-none focus:border-sage-600"
              />
            </div>

            {/* Tree Branch Accordions */}
            <div className="space-y-3">
              {treeNodes.map(node => {
                const isExpanded = expandedSections[node.id] ?? true;
                const filteredItems = node.items.filter(item =>
                  matchesSearch(taxonomySearch, item.canonical_text_norm)
                );

                if (filteredItems.length === 0 && taxonomySearch) return null;

                return (
                  <div key={node.id} className="border border-stone-200 rounded-lg overflow-hidden">
                    {/* Branch Header */}
                    <button
                      onClick={() => toggleSection(node.id)}
                      className="w-full px-3 py-2.5 bg-stone-50 hover:bg-stone-100 flex items-center justify-between text-right text-xs font-bold text-stone-800 transition"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-emerald-700" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-stone-400" />
                        )}
                        <GitBranch className="w-3.5 h-3.5 text-emerald-700" />
                        <span>{node.title}</span>
                      </div>
                      <span className="text-[10px] bg-white px-2 py-0.5 rounded-full border border-stone-200 text-stone-500 font-mono">
                        {node.items.length}
                      </span>
                    </button>

                    {/* Branch Children */}
                    {isExpanded && (
                      <div className="p-1.5 bg-white space-y-1 divide-y divide-stone-50">
                        {filteredItems.map(item => {
                          const isSelected = item.id === selectedPrinciple?.id;
                          const mastery = getPrincipleMastery(item.id);

                          return (
                            <button
                              key={item.id}
                              onClick={() => {
                                setSelectedPrincipleId(item.id);
                                setChallengeAnswered(false);
                                setChallengeChoice(null);
                              }}
                              className={`w-full text-right p-2.5 rounded-lg text-xs transition flex items-center justify-between ${
                                isSelected
                                  ? 'bg-emerald-50 text-emerald-950 font-bold border border-emerald-300'
                                  : 'hover:bg-stone-50 text-stone-700'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate pr-1">
                                <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-emerald-600' : 'bg-stone-400'}`}></span>
                                <span className="font-amiri text-sm truncate">{item.canonical_text_ar}</span>
                              </div>

                              {/* Mastery gauge */}
                              <div className="flex items-center gap-1.5 shrink-0 pl-1">
                                <div className="w-10 bg-stone-100 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className="bg-emerald-600 h-full rounded-full transition-all"
                                    style={{ width: `${mastery}%` }}
                                  ></div>
                                </div>
                                <span className="text-[10px] font-mono text-stone-400">{mastery}%</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Right Side: Scholar Application Matrix & Chapter Challenge (8 cols) */}
        <div className="lg:col-span-8 space-y-5">
          {selectedPrinciple ? (
            <>
              {/* Selected Principle Dossier */}
              <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded border ${CATEGORY_LABELS[selectedPrinciple.category]?.color}`}>
                      {CATEGORY_LABELS[selectedPrinciple.category]?.badge}
                    </span>
                    <span className="text-xs text-stone-400 font-mono">
                      {selectedPrinciple.english_transliteration}
                    </span>
                  </div>

                  <div className="text-xs text-stone-500 flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-emerald-600" />
                    <span>مرتبط بـ {linkedFatwas.length} فتاوى مفرغة</span>
                  </div>
                </div>

                <div>
                  <h2 className="font-amiri text-2xl font-bold text-stone-900 leading-normal">
                    «{selectedPrinciple.canonical_text_ar}»
                  </h2>
                  <p className="mt-2 text-stone-700 font-traditional text-base leading-relaxed bg-stone-50 p-4 rounded-xl border border-stone-200">
                    {selectedPrinciple.general_explanation_ar}
                  </p>
                </div>
              </div>

              {/* Comparative Scholar Application Matrix */}
              <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-stone-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span>مصفوفة التخريج المقارن: تطبيقات الشيخين في «نور على الدرب»</span>
                  </h3>
                  <span className="text-xs text-stone-400 font-mono">Archive Cross-Reference</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Column 1: Shaykh Ibn Baz Applications */}
                  <div className="bg-amber-50/50 rounded-xl border border-amber-200/80 p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-amber-200/60 pb-2">
                      <div className="font-bold text-xs text-amber-950 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-600"></span>
                        <span>سماحة الشيخ عبد العزيز بن باز</span>
                      </div>
                      <span className="text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-mono">
                        {ibnBazFatwas.length} فتاوى
                      </span>
                    </div>

                    {ibnBazFatwas.length > 0 ? (
                      ibnBazFatwas.map(fatwa => {
                        const fp = fatwaPrinciples.find(p => p.fatwa_id === fatwa.id && p.principle_id === selectedPrinciple.id);
                        return (
                          <div key={fatwa.id} className="bg-white p-3 rounded-lg border border-amber-200 shadow-xs space-y-2">
                            <div className="text-[11px] font-bold text-stone-800 flex justify-between items-center">
                              <span>باب {fatwa.topic_chapter} ({fatwa.topic_subtopic})</span>
                              <button
                                onClick={() => onToggleBookmark(fatwa.id)}
                                className="text-stone-400 hover:text-amber-600"
                              >
                                <Bookmark className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <p className="font-amiri text-xs text-stone-700 line-clamp-3">
                              «{fatwa.question_text}»
                            </p>
                            {fp && (
                              <div className="text-[11px] text-amber-900 bg-amber-50 p-2 rounded border border-amber-100 font-traditional leading-relaxed">
                                <strong>طريقة التخريج: </strong>
                                {fp.application_explanation_ar}
                              </div>
                            )}
                            <AudioPlayerStub
                              scholar={fatwa.scholar_name}
                              episodeNumber={fatwa.episode_number}
                              initialTimestamp={fatwa.audio_timestamp}
                            />
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-xs text-stone-500 p-4 text-center">
                        لا توجد فتاوى للشيخ ابن باز مرتبطة بهذه القاعدة في العينة الحالية
                      </div>
                    )}
                  </div>

                  {/* Column 2: Shaykh Ibn Uthaymeen Applications */}
                  <div className="bg-blue-50/40 rounded-xl border border-blue-200/80 p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-blue-200/60 pb-2">
                      <div className="font-bold text-xs text-blue-950 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                        <span>فضيلة الشيخ محمد بن صالح العثيمين</span>
                      </div>
                      <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono">
                        {ibnUthaymeenFatwas.length} فتاوى
                      </span>
                    </div>

                    {ibnUthaymeenFatwas.length > 0 ? (
                      ibnUthaymeenFatwas.map(fatwa => {
                        const fp = fatwaPrinciples.find(p => p.fatwa_id === fatwa.id && p.principle_id === selectedPrinciple.id);
                        return (
                          <div key={fatwa.id} className="bg-white p-3 rounded-lg border border-blue-200 shadow-xs space-y-2">
                            <div className="text-[11px] font-bold text-stone-800 flex justify-between items-center">
                              <span>باب {fatwa.topic_chapter} ({fatwa.topic_subtopic})</span>
                              <button
                                onClick={() => onToggleBookmark(fatwa.id)}
                                className="text-stone-400 hover:text-blue-600"
                              >
                                <Bookmark className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <p className="font-amiri text-xs text-stone-700 line-clamp-3">
                              «{fatwa.question_text}»
                            </p>
                            {fp && (
                              <div className="text-[11px] text-blue-950 bg-blue-50 p-2 rounded border border-blue-100 font-traditional leading-relaxed">
                                <strong>طريقة التخريج: </strong>
                                {fp.application_explanation_ar}
                              </div>
                            )}
                            <AudioPlayerStub
                              scholar={fatwa.scholar_name}
                              episodeNumber={fatwa.episode_number}
                              initialTimestamp={fatwa.audio_timestamp}
                            />
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-xs text-stone-500 p-4 text-center">
                        لا توجد فتاوى للشيخ ابن عثيمين مرتبطة بهذه القاعدة في العينة الحالية
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Chapter Jurisprudential Synthesis Challenge */}
              {challengeFatwa && currentFP && (
                <div className="bg-white rounded-xl shadow-sm border border-stone-200 p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                    <div className="flex items-center gap-2">
                      <Award className="w-5 h-5 text-emerald-600" />
                      <h3 className="font-bold text-sm text-stone-900">
                        تحدي التمييز الأصولي والفقهي (Chapter Synthesis Challenge)
                      </h3>
                    </div>
                    <span className="text-xs font-mono text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded">
                      +25 XP
                    </span>
                  </div>

                  <p className="text-xs text-stone-700 leading-relaxed">
                    بالنظر إلى نازلة الشيخ {challengeFatwa.scholar_name} في باب {challengeFatwa.topic_chapter}:
                    <br />
                    <span className="font-amiri text-sm font-semibold text-stone-900">
                      «{challengeFatwa.question_text}»
                    </span>
                    <br />
                    ما هو التكييف الدقيق للقاعدة المعتمدة من حيث نوعها وتطبيقها؟
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
                    {[
                      {
                        id: selectedPrinciple.id,
                        text: `قاعدة ${CATEGORY_LABELS[selectedPrinciple.category]?.title}: «${selectedPrinciple.canonical_text_ar}»`,
                        is_correct: true,
                        reason: currentFP.application_explanation_ar
                      },
                      ...distractors.slice(0, 3).map(d => ({
                        id: d.id,
                        text: `قاعدة ${CATEGORY_LABELS[d.category]?.title}: «${d.canonical_text_ar}»`,
                        is_correct: false,
                        reason: d.reason_incorrect
                      }))
                    ].map(opt => {
                      const isSelected = challengeChoice === opt.id;
                      let style = 'bg-stone-50 hover:bg-stone-100 border-stone-200 text-stone-800';

                      if (challengeAnswered) {
                        if (opt.is_correct) {
                          style = 'bg-emerald-100 border-emerald-400 text-emerald-950 font-bold';
                        } else if (isSelected && !opt.is_correct) {
                          style = 'bg-rose-100 border-rose-300 text-rose-950';
                        } else {
                          style = 'opacity-50 bg-stone-100 border-stone-200 text-stone-500';
                        }
                      }

                      return (
                        <button
                          key={opt.id}
                          onClick={() => handleChallengeChoice(opt.id)}
                          disabled={challengeAnswered}
                          className={`p-3 rounded-lg text-xs text-right border transition ${style}`}
                        >
                          <div className="font-medium font-amiri text-sm">{opt.text}</div>
                          {challengeAnswered && (isSelected || opt.is_correct) && (
                            <div className="mt-1 text-[11px] leading-snug">
                              {opt.is_correct ? `✓ ${opt.reason}` : `✗ ${opt.reason}`}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-xl p-8 text-center text-stone-400">
              اختر قاعدة من الشجرة لعرض تفاصيلها ومصفوفة التخريج
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
