import React, { useEffect } from 'react';
import { ChevronRight, ChevronLeft, Eye, Sparkles } from 'lucide-react';

interface PrototypeSwitcherProps {
  variants: { id: string; name: string; description: string }[];
  current: string;
  onSelect: (id: string) => void;
}

export const PrototypeSwitcher: React.FC<PrototypeSwitcherProps> = ({
  variants,
  current,
  onSelect
}) => {
  const currentIndex = variants.findIndex(v => v.id === current);
  const activeVariant = variants[currentIndex] || variants[0];

  const goToPrev = () => {
    const nextIdx = (currentIndex - 1 + variants.length) % variants.length;
    onSelect(variants[nextIdx].id);
  };

  const goToNext = () => {
    const nextIdx = (currentIndex + 1) % variants.length;
    onSelect(variants[nextIdx].id);
  };

  // Keyboard navigation: Left and Right arrow keys cycle variants
  // Avoid intercepting if an input, textarea, or contenteditable is active
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'TEXTAREA' ||
        activeEl?.getAttribute('contenteditable') === 'true';

      if (isInput) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        // In RTL, ArrowRight moves backward in flow, but let's make it intuitive:
        if (e.key === 'ArrowLeft') {
          goToNext();
        } else if (e.key === 'ArrowRight') {
          goToPrev();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, variants]);

  return (
    <aside aria-label="شريط تبديل نماذج واجهة المستخدم" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 bg-stone-900/95 text-stone-100 backdrop-blur-md px-3.5 py-2 rounded-full shadow-2xl border border-amber-500/30 text-xs select-none transition-all duration-200">
      <div className="flex items-center gap-1.5 pl-2 border-l border-stone-700 text-amber-400 font-semibold">
        <Sparkles className="w-3.5 h-3.5 animate-pulse" />
        <span className="tracking-wide">نموذج واجهة (Prototype)</span>
      </div>

      {/* Prev button */}
      <button
        onClick={goToPrev}
        title="النموذج السابق (مفتاح السهم الأيمن)"
        className="p-1 rounded-full hover:bg-stone-800 text-stone-300 hover:text-white transition-colors active:scale-95"
      >
        <ChevronRight className="w-4 h-4" />
      </button>

      {/* Variant Pills */}
      <div className="flex items-center gap-1">
        {variants.map(v => {
          const isActive = v.id === current;
          return (
            <button
              key={v.id}
              onClick={() => onSelect(v.id)}
              className={`px-2.5 py-1 rounded-full font-medium transition-all ${
                isActive
                  ? 'bg-amber-500 text-stone-950 font-bold shadow'
                  : 'text-stone-400 hover:text-stone-200 hover:bg-stone-800'
              }`}
            >
              <span>{v.id}</span>
              <span className="hidden md:inline mr-1 text-[11px] opacity-90">({v.name})</span>
            </button>
          );
        })}
      </div>

      {/* Next button */}
      <button
        onClick={goToNext}
        title="النموذج التالي (مفتاح السهم الأيسر)"
        className="p-1 rounded-full hover:bg-stone-800 text-stone-300 hover:text-white transition-colors active:scale-95"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {/* Description tag on desktop */}
      <div className="hidden lg:flex items-center gap-1 pr-2 border-r border-stone-700 text-stone-400 text-[11px]">
        <Eye className="w-3.5 h-3.5 text-amber-400/80" />
        <span className="max-w-[280px] truncate">{activeVariant.description}</span>
      </div>
    </aside>
  );
};
