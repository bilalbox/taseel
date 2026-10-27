import {
  BrowseFatwasParams,
  BrowseFatwasResult,
  Fatwa,
  FatwaDetail,
  FatwaPrinciple,
  Principle,
  PrincipleTreeNode,
  QuizQuestionItem,
  RandomQuizQuestionParams,
  UserQuizHistoryItem,
} from '../types';
import type { ManifestData } from '../workers/sqlite.worker';
import { mockArchiveAdapter } from '../data/mockArchiveAdapter';

export interface BootProgressEvent {
  stage: string;
  bytesProcessed: number;
  totalExpected: number;
  detail: string;
}

export interface WorkerInitPayload {
  vfs: string;
  bootMs: number;
  manifest: ManifestData | null;
  totalFatwasCount: number;
  totalGroundedCount: number;
  principles?: Principle[];
  fatwas?: Fatwa[];
  fatwaPrinciples?: FatwaPrinciple[];
  userState: {
    bookmarks: string[];
    history: UserQuizHistoryItem[];
  };
}

class SqliteWorkerClient {
  private worker: Worker | null = null;
  private reqId = 0;
  private pending = new Map<number, { resolve: (val: any) => void; reject: (err: Error) => void }>();
  private progressListeners = new Set<(ev: BootProgressEvent) => void>();

  private ensureWorker(): Worker {
    if (!this.worker) {
      if (typeof Worker === 'undefined') {
        throw new Error('Worker environment is not available');
      }
      this.worker = new Worker(new URL('../workers/sqlite.worker.ts', import.meta.url), {
        type: 'module'
      });
      this.worker.onmessage = (event: MessageEvent) => {
        const data = event.data;
        if (data?.type === 'BOOT_PROGRESS') {
          this.progressListeners.forEach(cb => cb(data as BootProgressEvent));
          return;
        }
        const { id, ok, result, error } = data;
        const handler = this.pending.get(id);
        if (handler) {
          this.pending.delete(id);
          if (ok) {
            handler.resolve(result);
          } else {
            handler.reject(new Error(error || 'Worker RPC failed'));
          }
        }
      };
    }
    return this.worker;
  }

  public onBootProgress(cb: (ev: BootProgressEvent) => void): () => void {
    this.progressListeners.add(cb);
    return () => this.progressListeners.delete(cb);
  }

  private call<T>(action: string, payload: Record<string, any> = {}): Promise<T> {
    if (typeof Worker === 'undefined') {
      return Promise.reject(new Error('Web Worker environment unavailable'));
    }
    const worker = this.ensureWorker();
    const id = ++this.reqId;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ id, action, payload });
    });
  }

  public init(): Promise<WorkerInitPayload> {
    return this.call<WorkerInitPayload>('INIT');
  }

  public getPrinciplesTree(): Promise<PrincipleTreeNode[]> {
    if (typeof Worker === 'undefined') {
      return mockArchiveAdapter.getPrinciplesTree();
    }
    return this.call<PrincipleTreeNode[]>('GET_PRINCIPLES_TREE');
  }

  public browseFatwas(params: BrowseFatwasParams = {}): Promise<BrowseFatwasResult> {
    if (typeof Worker === 'undefined') {
      return mockArchiveAdapter.browseFatwas(params);
    }
    return this.call<BrowseFatwasResult>('BROWSE_FATWAS', params);
  }

  public getFatwaDetail(id: string): Promise<FatwaDetail | null> {
    if (typeof Worker === 'undefined') {
      return mockArchiveAdapter.getFatwaDetail(id);
    }
    return this.call<FatwaDetail | null>('GET_FATWA_DETAIL', { id });
  }

  public getRandomQuizQuestion(
    params: RandomQuizQuestionParams = {}
  ): Promise<QuizQuestionItem | null> {
    if (typeof Worker === 'undefined') {
      return mockArchiveAdapter.getRandomQuizQuestion(params);
    }
    return this.call<QuizQuestionItem | null>('GET_RANDOM_QUIZ_QUESTION', params);
  }

  public getArchiveChapters(): Promise<string[]> {
    if (typeof Worker === 'undefined') {
      return mockArchiveAdapter.getArchiveChapters();
    }
    return this.call<string[]>('GET_ARCHIVE_CHAPTERS');
  }

  public loadUserState(): Promise<{ bookmarks: string[]; history: UserQuizHistoryItem[]; xp: number }> {
    if (typeof Worker === 'undefined') {
      return Promise.resolve({ bookmarks: [], history: [], xp: 0 });
    }
    return this.call<{ bookmarks: string[]; history: UserQuizHistoryItem[]; xp: number }>('LOAD_USER_STATE');
  }

  public toggleBookmark(fatwaId: string): Promise<boolean> {
    if (typeof Worker === 'undefined') {
      return Promise.resolve(true);
    }
    return this.call<boolean>('TOGGLE_BOOKMARK', { fatwaId });
  }

  public recordQuizAttempt(
    item: UserQuizHistoryItem,
    newXp?: number
  ): Promise<boolean> {
    if (typeof Worker === 'undefined') {
      return Promise.resolve(true);
    }
    return this.call<boolean>('RECORD_QUIZ_ATTEMPT', { item, newXp });
  }

  public clearQuizAttempts(): Promise<boolean> {
    if (typeof Worker === 'undefined') {
      return Promise.resolve(true);
    }
    return this.call<boolean>('CLEAR_QUIZ_ATTEMPTS');
  }
}

export const sqliteClient = new SqliteWorkerClient();
