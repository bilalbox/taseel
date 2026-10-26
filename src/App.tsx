import React, { useState, useEffect, useMemo } from 'react';
import { AppShell } from './components/AppShell';
import { StateSurfaceDrawer } from './components/StateSurfaceDrawer';
import {
  FATWAS_DATA,
  PRINCIPLES_DATA,
  FATWA_PRINCIPLES_DATA,
} from './data/mockData';
import { Fatwa, Principle, FatwaPrinciple } from './types';
import { sqliteClient, BootProgressEvent } from './services/sqliteClient';
import { learnerStore } from './stores/learnerStore';
import { useLearnerProgress } from './hooks/useLearnerProgress';

function useDebugMode(): boolean {
  return useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('debug') === '1';
  }, []);
}

export function App() {
  const debugMode = useDebugMode();
  const { userState } = useLearnerProgress();
  const [searchQuery, setSearchQuery] = useState('');

  const [fatwas, setFatwas] = useState<Fatwa[]>(FATWAS_DATA);
  const [principles, setPrinciples] = useState<Principle[]>(PRINCIPLES_DATA);
  const [fatwaPrinciples, setFatwaPrinciples] =
    useState<FatwaPrinciple[]>(FATWA_PRINCIPLES_DATA);
  const [opfsReady, setOpfsReady] = useState(false);
  const [bootProgress, setBootProgress] = useState<BootProgressEvent | null>(null);
  const [totalArchiveCount, setTotalArchiveCount] = useState(19301);
  const [lastFtsLatencyMs, setLastFtsLatencyMs] = useState(1.2);

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

        // Update corpus and hydrate store from canonical SQLite user_db
        learnerStore.setCorpus(
          payload.fatwas.length > 0 ? payload.fatwas : FATWAS_DATA,
          payload.principles.length > 0 ? payload.principles : PRINCIPLES_DATA,
          payload.fatwaPrinciples.length > 0 ? payload.fatwaPrinciples : FATWA_PRINCIPLES_DATA
        );

        if (
          payload.userState.bookmarks.length > 0 ||
          payload.userState.history.length > 0
        ) {
          learnerStore.hydrate(payload.userState);
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
            const merged = additions.length > 0 ? [...prev, ...additions] : prev;
            learnerStore.setCorpus(merged, principles, fatwaPrinciples);
            return merged;
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [searchQuery, opfsReady, principles, fatwaPrinciples]);

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
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        bootLabel={bootLabel}
        opfsReady={opfsReady}
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
