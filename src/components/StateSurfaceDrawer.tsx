import React, { useState } from 'react';
import { Database, HardDrive, Bookmark, Award, Clock, ChevronUp, ChevronDown, CheckCircle2, XCircle, Code2 } from 'lucide-react';
import { UserState } from '../types';

interface StateSurfaceDrawerProps {
  userState: UserState;
  activeVariant: string;
  activeSearchQuery: string;
  databaseStatus: {
    contentDb: { name: string; tables: number; vfs: string; status: string; records: number };
    userDb: { name: string; attached: boolean; vfs: string; status: string; bookmarks: number };
  };
}

export const StateSurfaceDrawer: React.FC<StateSurfaceDrawerProps> = ({
  userState,
  activeVariant,
  activeSearchQuery,
  databaseStatus
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showJson, setShowJson] = useState(false);

  const totalQuizzes = userState.history.length;
  const correctCount = userState.history.filter(h => h.is_correct).length;
  const accuracy = totalQuizzes > 0 ? Math.round((correctCount / totalQuizzes) * 100) : 100;

  return (
    <aside aria-label="حالة المحرك وقاعدة البيانات" className="fixed top-3 left-3 z-40 max-w-sm sm:max-w-md">
      <div className="bg-stone-900/90 backdrop-blur-md text-stone-200 border border-stone-700/80 rounded-xl shadow-xl overflow-hidden transition-all text-xs font-mono">
        {/* Header Bar */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full px-3 py-2 flex items-center justify-between gap-3 bg-stone-800/80 hover:bg-stone-800 transition-colors text-right"
        >
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-semibold text-stone-100 flex items-center gap-1.5 font-sans">
              <Database className="w-3.5 h-3.5 text-amber-400" />
              حالة محرك OPFS SQLite المزدوج
            </span>
            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-sans font-bold">
              النموذج {activeVariant}
            </span>
          </div>
          <div className="flex items-center gap-1 text-stone-400">
            <span className="text-[10px] hidden sm:inline">إظهار الحالة</span>
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {/* Collapsed quick pill bar */}
        {!isOpen && (
          <div className="px-3 py-1.5 flex items-center gap-3 text-[11px] text-stone-300 font-sans border-t border-stone-800/60 justify-between">
            <span className="flex items-center gap-1">
              <HardDrive className="w-3 h-3 text-emerald-400" />
              <span>OPFS: متصل (0.8ms)</span>
            </span>
            <span className="flex items-center gap-1">
              <Bookmark className="w-3 h-3 text-amber-400" />
              <span>المحفوظات: {userState.bookmarks.length}</span>
            </span>
            <span className="flex items-center gap-1">
              <Award className="w-3 h-3 text-cyan-400" />
              <span>الدقة: {accuracy}%</span>
            </span>
          </div>
        )}

        {/* Expanded Panel */}
        {isOpen && (
          <div className="p-3.5 space-y-3 max-h-[75vh] overflow-y-auto text-stone-300 font-sans">
            {/* DB Architecture Notice */}
            <div className="p-2.5 rounded-lg bg-stone-950/70 border border-stone-800 space-y-1.5">
              <div className="flex items-center justify-between text-stone-100 font-medium">
                <span className="flex items-center gap-1.5 text-amber-300">
                  <Database className="w-3.5 h-3.5" />
                  Dual-Database OPFS Architecture
                </span>
                <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/50">
                  opfs-sahpool VFS
                </span>
              </div>
              <div className="text-[11px] space-y-1 text-stone-300 leading-relaxed font-mono">
                <div className="flex justify-between items-center bg-stone-900/60 px-2 py-1 rounded">
                  <span>1. {databaseStatus.contentDb.name} [قراءة فقط]</span>
                  <span className="text-emerald-400 font-sans font-semibold">مفهرس FTS5</span>
                </div>
                <div className="flex justify-between items-center bg-stone-900/60 px-2 py-1 rounded">
                  <span>2. {databaseStatus.userDb.name} [ATTACH DATABASE]</span>
                  <span className="text-cyan-400 font-sans font-semibold">تخزين محلي آمن</span>
                </div>
              </div>
            </div>

            {/* Live Search Token Watcher */}
            <div className="flex items-center justify-between bg-stone-800/40 px-2.5 py-1.5 rounded-lg border border-stone-700/50 text-[11px]">
              <span className="text-stone-400">استعلام البحث الحالي:</span>
              <span className="font-mono text-amber-300">
                {activeSearchQuery ? `"${activeSearchQuery}"` : '<خامل / الكل>'}
              </span>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2 rounded-lg bg-stone-800/50 border border-stone-700/40">
                <div className="text-[10px] text-stone-400">نقاط الاستيعاب</div>
                <div className="text-base font-bold text-amber-400">{userState.xp} XP</div>
              </div>
              <div className="p-2 rounded-lg bg-stone-800/50 border border-stone-700/40">
                <div className="text-[10px] text-stone-400">أيام التتابع</div>
                <div className="text-base font-bold text-emerald-400">{userState.streak_days} أيام</div>
              </div>
              <div className="p-2 rounded-lg bg-stone-800/50 border border-stone-700/40">
                <div className="text-[10px] text-stone-400">نسبة الإتقان</div>
                <div className="text-base font-bold text-cyan-400">{accuracy}%</div>
              </div>
            </div>

            {/* Recent Quiz Attempts */}
            <div>
              <div className="text-[11px] font-semibold text-stone-200 mb-1.5 flex items-center justify-between">
                <span>سجل الاختبارات الأخير في user_state:</span>
                <span className="text-[10px] text-stone-400">({userState.history.length} محاولات)</span>
              </div>
              <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                {userState.history.slice(-3).reverse().map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between p-1.5 rounded bg-stone-950/60 border border-stone-800 text-[11px]"
                  >
                    <div className="flex items-center gap-1.5">
                      {h.is_correct ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      )}
                      <span className="truncate max-w-[170px]">{h.principle_id}</span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-stone-400 font-mono">
                      <Clock className="w-2.5 h-2.5" />
                      {(h.time_spent_ms / 1000).toFixed(1)}ث
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Toggle Raw State JSON */}
            <div className="pt-2 border-t border-stone-800 flex justify-between items-center">
              <button
                onClick={() => setShowJson(!showJson)}
                className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-mono"
              >
                <Code2 className="w-3 h-3" />
                {showJson ? 'إخفاء كائن الحالة الخام' : 'فحص كائن الحالة SQLite'}
              </button>
            </div>

            {showJson && (
              <pre className="p-2.5 rounded bg-black/80 text-[10px] text-emerald-400 font-mono overflow-x-auto max-h-40 leading-tight">
                {JSON.stringify(
                  {
                    database: databaseStatus,
                    activeVariant,
                    userState
                  },
                  null,
                  2
                )}
              </pre>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
