import React, { useEffect, useState } from 'react';
import { Bookmark, BookmarkCheck, Flag, Sparkles } from 'lucide-react';
import { Fatwa, FatwaDetail, FatwaPrinciple, Principle } from '../types';
import { AudioPlayerStub } from './AudioPlayerStub';
import { CATEGORY_LABELS, chapterLabelAr } from '../utils/arabic';
import { FeedbackModal } from './FeedbackModal';
import { sqliteClient } from '../services/sqliteClient';
import { useLearnerProgress } from '../hooks/useLearnerProgress';

interface FatwaReaderProps {
  fatwaId?: string;
  fatwa?: Fatwa;
  principles?: Principle[];
  fatwaPrinciples?: FatwaPrinciple[];
  activePrincipleId: string | null;
  isBookmarked?: boolean;
  /** Hide linked-principle chips in quiz mode so they do not spoil the answer. */
  showExtractedPrinciples?: boolean;
  onToggleBookmark?: (fatwaId: string) => void;
  onSelectPrinciple: (principleId: string) => void;
}

export const FatwaReader: React.FC<FatwaReaderProps> = ({
  fatwaId,
  fatwa,
  principles = [],
  fatwaPrinciples = [],
  activePrincipleId,
  isBookmarked: propIsBookmarked,
  showExtractedPrinciples = true,
  onToggleBookmark: propOnToggleBookmark,
  onSelectPrinciple,
}) => {
  const learner = useLearnerProgress();
  const targetId = fatwaId || fatwa?.id;
  const [detail, setDetail] = useState<FatwaDetail | null>(null);

  useEffect(() => {
    if (!targetId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    sqliteClient
      .getFatwaDetail(targetId)
      .then(res => {
        if (!cancelled && res) {
          setDetail(res);
        }
      })
      .catch(err => {
        console.warn("[FatwaReader] Failed to query fatwa detail:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [targetId]);

  const activeFatwa = detail?.fatwa || detail || fatwa;
  const activePrinciples =
    detail?.principles && detail.principles.length > 0 ? detail.principles : principles;
  const activeFatwaPrinciples =
    detail?.fatwaPrinciples && detail.fatwaPrinciples.length > 0
      ? detail.fatwaPrinciples
      : fatwaPrinciples;

  const isBookmarked =
    propIsBookmarked !== undefined
      ? propIsBookmarked
      : activeFatwa
        ? learner.isBookmarked(activeFatwa.id)
        : false;

  const handleToggleBookmark = () => {
    if (!activeFatwa) return;
    if (propOnToggleBookmark) {
      propOnToggleBookmark(activeFatwa.id);
    } else {
      learner.toggleBookmark(activeFatwa.id);
    }
  };

  if (!activeFatwa) {
    return (
      <div className="bg-page-raised border border-page-line rounded-lg p-10 text-center text-ink-muted text-sm">
        لا توجد فتوى معروضة
      </div>
    );
  }

  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const linked = activeFatwaPrinciples.filter(fp => fp.fatwa_id === activeFatwa.id);
  const currentPrincipleId = activePrincipleId || linked[0]?.principle_id;
  const currentPrinciple = activePrinciples.find(p => p.id === currentPrincipleId);
  const currentFP = linked.find(fp => fp.principle_id === currentPrincipleId);

  return (
    <article className="bg-page-raised border border-page-line rounded-lg overflow-hidden animate-fade-pane">
      <div className="border-b border-page-line px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="px-2 py-0.5 rounded bg-accent-soft text-accent-deep border border-accent/20 font-medium">
            كتاب {chapterLabelAr(activeFatwa.topic_chapter)}
          </span>
          <span className="text-ink-muted">{activeFatwa.topic_subtopic}</span>
          <span className="text-ink-faint">·</span>
          <span className="text-ink-muted">الشيخ {activeFatwa.scholar_name}</span>
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

      {Boolean(activeFatwa.audio_url) && (
        <div className="p-3 bg-ink border-b border-ink-soft">
          <AudioPlayerStub
            key={activeFatwa.id}
            fatwaId={activeFatwa.id}
            scholar={activeFatwa.scholar_name}
            episodeNumber={activeFatwa.episode_number}
            initialTimestamp={activeFatwa.audio_timestamp}
            audioUrl={activeFatwa.audio_url}
          />
        </div>
      )}

      <div className="p-5 sm:p-6 space-y-6">
        <div className="bg-page-sunken/40 rounded-lg p-4 sm:p-5 border border-page-line/60">
          <p className="font-amiri text-lg sm:text-xl font-bold text-ink leading-relaxed">
            «{activeFatwa.question_text}»
          </p>
        </div>

        <div className="space-y-3 pt-1">
          <div className="font-amiri text-lg sm:text-[19px] text-ink leading-[2.2] text-justify whitespace-pre-wrap">
            {activeFatwa.answer_text}
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
                const princ = activePrinciples.find(p => p.id === fp.principle_id);
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
        fatwa={activeFatwa as Fatwa}
        principle={currentPrinciple}
        fatwaPrinciple={currentFP}
      />
    </article>
  );
};
