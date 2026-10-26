import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AppShell } from './components/AppShell';
import { StateSurfaceDrawer } from './components/StateSurfaceDrawer';
import {
  FATWAS_DATA,
  PRINCIPLES_DATA,
  FATWA_PRINCIPLES_DATA,
  INITIAL_USER_STATE,
} from './data/mockData';
import { Fatwa, Principle, FatwaPrinciple, UserState } from './types';
import { sqliteClient, BootProgressEvent } from './services/sqliteClient';

function useDebugMode(): boolean {
  return useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('debug') === '1';
  }, []);
}

export function App() {
  const debugMode = useDebugMode();
  const [searchQuery, setSearchQuery] = useState('');

  const [fatwas, setFatwas] = useState<Fatwa[]>(FATWAS_DATA);
  const [principles, setPrinciples] = useState<Principle[]>(PRINCIPLES_DATA);
  const [fatwaPrinciples, setFatwaPrinciples] =
    useState<FatwaPrinciple[]>(FATWA_PRINCIPLES_DATA);
  const [opfsReady, setOpfsReady] = useState(false);
  const [bootProgress, setBootProgress] = useState<BootProgressEvent | null>(null);
  const [totalArchiveCount, setTotalArchiveCount] = useState(19301);
  const [lastFtsLatencyMs, setLastFtsLatencyMs] = useState(1.2);

  const [userState, setUserState] = useState<UserState>(() => {
    const local = localStorage.getItem('taseel_user_state_v1');
    if (local) {
      try {
        return JSON.parse(local);
      } catch {
        return INITIAL_USER_STATE;
      }
    }
    return INITIAL_USER_STATE;
  });

  useEffect(() => {
    localStorage.setItem('taseel_user_state_v1', JSON.stringify(userState));
  }, [userState]);

  useEffect(() => {
    const unsub = sqliteClient.onBootProgress(ev => {
      setBootProgress(ev);
    });

    sqliteClient
      .init()
      .then(payload => {
        if (payload.principles.length > 0) {
          setPrinciples(payload.principles);
        }
        if (payload.fatwas.length > 0) {
          setFatwas(payload.fatwas);
        }
        if (payload.fatwaPrinciples.length > 0) {
          setFatwaPrinciples(payload.fatwaPrinciples);
        }
        setTotalArchiveCount(payload.totalFatwasCount);
        setOpfsReady(true);
        setBootProgress(null);

        if (
          payload.userState.bookmarks.length > 0 ||
          payload.userState.history.length > 0
        ) {
          setUserState(prev => ({
            ...prev,
            bookmarks: Array.from(
              new Set([...prev.bookmarks, ...payload.userState.bookmarks])
            ),
            history:
              payload.userState.history.length > 0
                ? payload.userState.history
                : prev.history,
            spaced_repetition: {
              ...prev.spaced_repetition,
              ...payload.userState.spaced_repetition,
            },
          }));
        }
      })
      .catch(err => {
        console.warn("[Ta'seel] Using seed dataset while OPFS initializes:", err);
        setBootProgress(null);
      });

    return unsub;
  }, []);

  useEffect(() => {
    if (!opfsReady || searchQuery.trim().length < 2) return;
    let cancelled = false;
    sqliteClient
      .searchFatwas(searchQuery, 60)
      .then(({ fatwas: ftsResults, latencyMs }) => {
        if (cancelled) return;
        setLastFtsLatencyMs(latencyMs);
        if (ftsResults.length > 0) {
          setFatwas(prev => {
            const seen = new Set(prev.map(f => f.id));
            const additions = ftsResults.filter(f => !seen.has(f.id));
            return additions.length > 0 ? [...prev, ...additions] : prev;
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [searchQuery, opfsReady]);

  const handleToggleBookmark = useCallback((fatwaId: string) => {
    sqliteClient.toggleBookmark(fatwaId).catch(() => {});
    setUserState(prev => {
      const exists = prev.bookmarks.includes(fatwaId);
      return {
        ...prev,
        bookmarks: exists
          ? prev.bookmarks.filter(id => id !== fatwaId)
          : [...prev.bookmarks, fatwaId],
      };
    });
  }, []);

  const handleRecordQuizAttempt = useCallback(
    (
      fatwaId: string,
      principleId: string,
      selectedId: string,
      isCorrect: boolean,
      timeSpentMs: number
    ) => {
      setUserState(prev => {
        const newHistoryItem = {
          id: `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          fatwa_id: fatwaId,
          principle_id: principleId,
          selected_principle_id: selectedId,
          is_correct: isCorrect,
          timestamp: Date.now(),
          time_spent_ms: timeSpentMs,
          difficulty: 'intermediate' as const,
        };

        const currentSR = prev.spaced_repetition[principleId] || {
          principle_id: principleId,
          level: 1,
          streak: 0,
          last_reviewed: Date.now(),
          next_review: Date.now() + 86400000,
          correct_count: 0,
          total_attempts: 0,
        };

        const updatedSR = {
          ...currentSR,
          level: isCorrect ? currentSR.level + 1 : Math.max(1, currentSR.level - 1),
          streak: isCorrect ? currentSR.streak + 1 : 0,
          last_reviewed: Date.now(),
          next_review: isCorrect
            ? Date.now() + (currentSR.level + 1) * 86400000
            : Date.now() + 3600000 * 2,
          correct_count: isCorrect ? currentSR.correct_count + 1 : currentSR.correct_count,
          total_attempts: currentSR.total_attempts + 1,
        };

        sqliteClient.recordQuizAttempt(newHistoryItem, updatedSR).catch(() => {});

        return {
          ...prev,
          history: [...prev.history, newHistoryItem],
          spaced_repetition: {
            ...prev.spaced_repetition,
            [principleId]: updatedSR,
          },
          xp: prev.xp + (isCorrect ? 20 : 5),
        };
      });
    },
    []
  );

  const bootLabel =
    bootProgress?.stage === 'DECOMPRESSING_OPFS'
      ? bootProgress.detail || 'تحميل الأرشيف…'
      : bootProgress
        ? bootProgress.detail
        : null;

  const databaseStatus = {
    contentDb: {
      name: 'content.sqlite3',
      tables: 7,
      vfs: 'opfs-sahpool',
      status: opfsReady
        ? `OPFS Active (${lastFtsLatencyMs}ms FTS5)`
        : 'Streaming to OPFS...',
      records: totalArchiveCount,
    },
    userDb: {
      name: 'user_state.sqlite3',
      attached: true,
      vfs: 'opfs-sahpool',
      status: 'Attached as user_db',
      bookmarks: userState.bookmarks.length,
    },
  };

  return (
    <>
      <AppShell
        fatwas={fatwas}
        principles={principles}
        fatwaPrinciples={fatwaPrinciples}
        userState={userState}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        bootLabel={bootLabel}
        opfsReady={opfsReady}
        onRecordQuizAttempt={handleRecordQuizAttempt}
        onToggleBookmark={handleToggleBookmark}
      />

      {debugMode && (
        <StateSurfaceDrawer
          userState={userState}
          activeVariant="A"
          activeSearchQuery={searchQuery}
          databaseStatus={databaseStatus}
        />
      )}
    </>
  );
}

export default App;
