import React, { useMemo, useState, useEffect } from 'react';
import { BookOpen, CheckCircle, HelpCircle } from 'lucide-react';
import { Fatwa, Principle, FatwaPrinciple, DistractorItem } from '../types';
import { CATEGORY_LABELS } from '../utils/arabic';

interface QuizPaneProps {
  fatwa: Fatwa | undefined;
  principle: Principle | undefined;
  fatwaPrinciple: FatwaPrinciple | undefined;
  onRecordQuizAttempt: (
    fatwaId: string,
    principleId: string,
    selectedId: string,
    isCorrect: boolean,
    timeSpentMs: number
  ) => void;
}

export const QuizPane: React.FC<QuizPaneProps> = ({
  fatwa,
  principle,
  fatwaPrinciple,
  onRecordQuizAttempt,
}) => {
  const [selectedQuizChoice, setSelectedQuizChoice] = useState<string | null>(null);
  const [hasSubmittedQuiz, setHasSubmittedQuiz] = useState(false);
  const [quizStartTime, setQuizStartTime] = useState(() => Date.now());

  useEffect(() => {
    setSelectedQuizChoice(null);
    setHasSubmittedQuiz(false);
    setQuizStartTime(Date.now());
  }, [fatwa?.id, principle?.id]);

  const distractors: DistractorItem[] = useMemo(() => {
    if (!fatwaPrinciple) return [];
    try {
      return JSON.parse(fatwaPrinciple.distractor_principles_json);
    } catch {
      return [];
    }
  }, [fatwaPrinciple]);

  const quizChoices = useMemo(() => {
    if (!principle || !fatwaPrinciple) return [];
    const all = [
      {
        id: principle.id,
        text: principle.canonical_text_ar,
        category: principle.category,
        is_correct: true,
        reason: fatwaPrinciple.application_explanation_ar,
      },
      ...distractors.map(d => ({
        id: d.id,
        text: d.canonical_text_ar,
        category: d.category,
        is_correct: false,
        reason: d.reason_incorrect,
      })),
    ];
    return all.sort((a, b) => a.text.localeCompare(b.text, 'ar'));
  }, [principle, distractors, fatwaPrinciple]);

  const handleChoiceSelect = (choiceId: string) => {
    if (hasSubmittedQuiz) return;
    setSelectedQuizChoice(choiceId);
  };

  const handleSubmit = () => {
    if (hasSubmittedQuiz || !selectedQuizChoice || !fatwa || !principle) return;
    setHasSubmittedQuiz(true);
    onRecordQuizAttempt(
      fatwa.id,
      principle.id,
      selectedQuizChoice,
      selectedQuizChoice === principle.id,
      Date.now() - quizStartTime
    );
  };

  const handleRetry = () => {
    setSelectedQuizChoice(null);
    setHasSubmittedQuiz(false);
    setQuizStartTime(Date.now());
  };

  if (!principle || !fatwaPrinciple) {
    return (
      <div className="bg-page-raised border border-page-line rounded-lg p-6 text-center text-ink-muted text-sm animate-fade-pane">
        لا توجد قاعدة مربوطة بهذه الفتوى للاختبار بعد
      </div>
    );
  }

  const difficultyLabel =
    fatwaPrinciple.difficulty === 'beginner'
      ? 'مبتدئ'
      : fatwaPrinciple.difficulty === 'intermediate'
        ? 'متوسط'
        : 'متقدم';

  return (
    <div className="bg-page-raised border border-page-line rounded-lg p-5 space-y-4 animate-fade-pane">
      <div className="font-semibold text-sm text-ink flex items-center gap-1.5">
        <HelpCircle className="w-4 h-4 text-accent shrink-0" />
        <span>ما القاعدة التي بُني عليها الحكم في هذه الفتوى؟</span>
      </div>

      <div className="space-y-2">
        {quizChoices.map(choice => {
          const isSelected = selectedQuizChoice === choice.id;
          let btnStyle =
            'bg-page border-page-line text-ink hover:border-accent/40 hover:bg-accent-soft/40';

          if (hasSubmittedQuiz) {
            if (choice.is_correct) {
              btnStyle = 'bg-accent-soft border-accent/40 text-accent-deep font-semibold';
            } else if (isSelected && !choice.is_correct) {
              btnStyle = 'bg-rose-50 border-rose-200 text-rose-950';
            } else {
              btnStyle = 'opacity-50 bg-page-sunken border-page-line text-ink-muted';
            }
          } else if (isSelected) {
            btnStyle = 'bg-accent-soft/50 border-accent/40 text-ink ring-1 ring-accent/30';
          }

          return (
            <div key={choice.id} className="space-y-1">
              <button
                type="button"
                onClick={() => handleChoiceSelect(choice.id)}
                disabled={hasSubmittedQuiz}
                aria-pressed={isSelected}
                className={`w-full text-right p-2.5 rounded-md text-sm border transition ${btnStyle}`}
              >
                <span className="font-amiri text-[15px] block">{choice.text}</span>
              </button>

              {hasSubmittedQuiz && (isSelected || choice.is_correct) && (
                <div
                  className={`p-2 rounded-md text-[12px] leading-relaxed animate-reveal-answer overflow-hidden ${
                    choice.is_correct
                      ? 'bg-accent-soft text-accent-deep'
                      : 'bg-rose-50 text-rose-900'
                  }`}
                >
                  <strong>{choice.is_correct ? 'صواب: ' : 'وجه الخطأ: '}</strong>
                  {choice.reason}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!hasSubmittedQuiz && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!selectedQuizChoice}
          className="w-full px-3 py-2.5 rounded-md text-sm font-semibold bg-accent text-white hover:bg-accent-mid disabled:opacity-40 disabled:hover:bg-accent transition"
        >
          تأكيد الإجابة
        </button>
      )}

      {hasSubmittedQuiz && (
        <div className="space-y-3 pt-3 border-t border-page-line animate-fade-pane">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span
              className={`text-[11px] font-medium px-2 py-0.5 rounded border ${CATEGORY_LABELS[principle.category]?.color}`}
            >
              {CATEGORY_LABELS[principle.category]?.badge}
            </span>
            <span className="text-[11px] text-ink-faint">{difficultyLabel}</span>
          </div>

          <h3 className="font-amiri text-xl font-bold text-ink leading-snug">
            «{principle.canonical_text_ar}»
          </h3>

          <div className="bg-page-sunken/60 p-3 rounded-md border border-page-line text-sm text-ink-soft leading-relaxed">
            <div className="font-semibold text-ink mb-1 flex items-center gap-1.5 text-xs">
              <BookOpen className="w-3.5 h-3.5 text-accent" />
              <span>بيان القاعدة</span>
            </div>
            <p className="font-amiri text-[15px] leading-relaxed">
              {principle.general_explanation_ar}
            </p>
          </div>

          <div className="bg-accent-soft/70 p-3 rounded-md border border-accent/20 text-sm text-accent-deep leading-relaxed">
            <div className="font-semibold mb-1 flex items-center gap-1.5 text-xs">
              <CheckCircle className="w-3.5 h-3.5 text-accent" />
              <span>تخريج هذه المسألة</span>
            </div>
            <p className="font-amiri text-[15px] leading-relaxed">
              {fatwaPrinciple.application_explanation_ar}
            </p>
            <p className="mt-2 text-[11px] text-accent-mid">
              {fatwaPrinciple.explicitly_stated
                ? 'مصرّح بها في كلام الشيخ'
                : 'مستنبطة من تعليل الحكم'}
            </p>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-xs text-ink-muted">حُفظت محاولتك محلياً</span>
            <button
              type="button"
              onClick={handleRetry}
              className="px-3 py-1.5 bg-ink text-page-raised rounded-md text-xs hover:bg-ink-soft transition"
            >
              إعادة المحاولة
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
