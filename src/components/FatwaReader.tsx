import React, { useState } from 'react';
import { Bookmark, BookmarkCheck, Flag, Sparkles } from 'lucide-react';
import { Fatwa, FatwaPrinciple, Principle } from '../types';
import { AudioPlayerStub } from './AudioPlayerStub';
import { CATEGORY_LABELS, chapterLabelAr } from '../utils/arabic';
import { FeedbackModal } from './FeedbackModal';
import { useLearnerProgress } from '../hooks/useLearnerProgress';

interface FatwaReaderProps {
  fatwa: Fatwa | undefined;
  principles: Principle[];
  fatwaPrinciples: FatwaPrinciple[];
  activePrincipleId: string | null;
  isBookmarked?: boolean;
  /** Hide linked-principle chips in quiz mode so they do not spoil the answer. */
  showExtractedPrinciples?: boolean;
  onToggleBookmark?: (fatwaId: string) => void;
  onSelectPrinciple: (principleId: string) => void;
}

export const FatwaReader: React.FC<FatwaReaderProps> = ({
  fatwa,
  principles,
  fatwaPrinciples,
  activePrincipleId,
  isBookmarked: propIsBookmarked,
  showExtractedPrinciples = true,
  onToggleBookmark: propOnToggleBookmark,
  onSelectPrinciple,
}) => {
  const learner = useLearnerProgress();
  const isBookmarked =
    propIsBookmarked !== undefined
      ? propIsBookmarked
      : fatwa
        ? learner.isBookmarked(fatwa.id)
        : false;

  const handleToggleBookmark = () => {
    if (!fatwa) return;
    if (propOnToggleBookmark) {
      propOnToggleBookmark(fatwa.id);
    } else {
      learner.toggleBookmark(fatwa.id);
    }
  };

  if (!fatwa) {
    return (
      <div className="bg-page-raised border border-page-line rounded-lg p-10 text-center text-ink-muted text-sm">
        لا توجد فتوى معروضة
      </div>
    );
  }

  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const linked = fatwaPrinciples.filter(fp => fp.fatwa_id === fatwa.id);
  const currentPrincipleId = activePrincipleId || linked[0]?.principle_id;
  const currentPrinciple = principles.find(p => p.id === currentPrincipleId);
  const currentFP = linked.find(fp => fp.principle_id === currentPrincipleId);

  return (
    <article className="bg-page-raised border border-page-line rounded-lg overflow-hidden animate-fade-pane">
      <div className="border-b border-page-line px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="px-2 py-0.5 rounded bg-accent-soft text-accent-deep border border-accent/20 font-medium">
            كتاب {chapterLabelAr(fatwa.topic_chapter)}
          </span>
          <span className="text-ink-muted">{fatwa.topic_subtopic}</span>
          <span className="text-ink-faint">·</span>
          <span className="text-ink-muted">الشيخ {fatwa.scholar_name}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsFeedbackOpen(true)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs bg-page text-ink-soft border-page-line hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-800 transition"
            title="إبلاغ عن ملاحظة في هذه الفتوى أو تخريجها"
          >
            <Flag className="w-3.5 h-3.5 text-amber-600" />
            <span className="hidden sm:inline">إبلاغ عن ملاحظة</span>
          </button>
          <button
            type="button"
            onClick={handleToggleBookmark}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs transition ${
              isBookmarked
                ? 'bg-accent text-white border-accent'
                : 'bg-page text-ink-soft border-page-line hover:border-accent/40'
            }`}
          >
            {isBookmarked ? (
              <BookmarkCheck className="w-3.5 h-3.5" />
            ) : (
              <Bookmark className="w-3.5 h-3.5" />
            )}
            {isBookmarked ? 'محفوظة' : 'حفظ'}
          </button>
        </div>
      </div>

      {Boolean(fatwa.audio_url) && (
        <div className="p-3 bg-ink border-b border-ink-soft">
          <AudioPlayerStub
            key={fatwa.id}
            fatwaId={fatwa.id}
            scholar={fatwa.scholar_name}
            episodeNumber={fatwa.episode_number}
            initialTimestamp={fatwa.audio_timestamp}
            audioUrl={fatwa.audio_url}
          />
        </div>
      )}

      <div className="p-5 sm:p-6 space-y-6">
        <div className="bg-page-sunken/40 rounded-lg p-4 sm:p-5 border border-page-line/60">
          <p className="font-amiri text-lg sm:text-xl font-bold text-ink leading-relaxed">
            «{fatwa.question_text}»
          </p>
        </div>

        <div className="space-y-3 pt-1">
          <div className="font-amiri text-lg sm:text-[19px] text-ink leading-[2.2] text-justify whitespace-pre-wrap">
            {fatwa.answer_text}
          </div>
        </div>

        {showExtractedPrinciples && linked.length > 0 && (
          <div className="pt-2 border-t border-page-line">
            <div className="text-xs font-semibold text-ink mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              القواعد المستخرجة
            </div>
            <div className="flex flex-wrap gap-2">
              {linked.map(fp => {
                const princ = principles.find(p => p.id === fp.principle_id);
                if (!princ) return null;
                const selected = princ.id === currentPrincipleId;
                return (
                  <button
                    key={fp.id}
                    type="button"
                    onClick={() => onSelectPrinciple(princ.id)}
                    className={`px-3 py-1.5 rounded-md text-xs border transition ${
                      selected
                        ? 'bg-accent text-white border-accent'
                        : 'bg-page text-ink border-page-line hover:border-accent/40'
                    }`}
                  >
                    <span className="font-amiri text-sm block">{princ.canonical_text_ar}</span>
                    <span className={`text-[10px] ${selected ? 'text-white/80' : 'text-ink-faint'}`}>
                      {CATEGORY_LABELS[princ.category]?.title}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        fatwa={fatwa}
        principle={currentPrinciple}
        fatwaPrinciple={currentFP}
      />
    </article>
  );
};
