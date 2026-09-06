import { parseReleaseCatalog, validateReleaseSource, type ReleaseCatalog, type ReleaseSource } from './data';

type Failure = 'rate-limit' | 'unavailable';
export type ReleaseState =
  | { status: 'loading' }
  | { status: 'error'; failure: Failure }
  | { status: 'ready'; catalog: ReleaseCatalog; stale: boolean };
export const INITIAL_RELEASE_STATE: ReleaseState = { status: 'loading' };
const CACHE_MS = 5 * 60_000;
type Cache = { savedAt: number; history: unknown; stable: unknown | null };
type Options = { fetch?: typeof fetch; now?: () => number; storage?: Pick<Storage, 'getItem' | 'setItem'>; timeoutMs?: number };

/** One cache and one in-flight request per repository, shared by all release views. */
export function createReleaseStore(source: ReleaseSource, options: Options = {}) {
  validateReleaseSource(source);
  const fetcher = options.fetch ?? globalThis.fetch;
  const now = options.now ?? Date.now;
  const storage = options.storage;
  const key = `cubecroom:releases:1:${source.apiUrl}`;
  const listeners = new Set<() => void>();
  let state: ReleaseState = INITIAL_RELEASE_STATE;
  let savedAt = 0;
  let pending: Promise<void> | null = null;
  const update = (next: ReleaseState) => { state = next; listeners.forEach(listener => listener()); };
  try {
    const cached: Cache = JSON.parse(storage?.getItem(key) ?? 'null');
    if (cached && Number.isFinite(cached.savedAt) && cached.savedAt <= now() && now() - cached.savedAt < CACHE_MS) {
      state = { status: 'ready', catalog: parseReleaseCatalog(cached.history, cached.stable, source), stale: false };
      savedAt = cached.savedAt;
    }
  } catch { /* Invalid or unavailable browser storage never supplies download links. */ }
  const refresh = (force = false): Promise<void> => {
    if (pending) return pending;
    if (!force && state.status === 'ready' && !state.stale && now() - savedAt < CACHE_MS) return Promise.resolve();
    if (state.status !== 'ready') update(INITIAL_RELEASE_STATE);
    pending = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
      let failure: Failure = 'unavailable';
      try {
        const read = async (url: string, allowMissing = false): Promise<unknown | null> => {
          const response = await fetcher(url, { signal: controller.signal, credentials: 'omit', headers: { Accept: 'application/vnd.github+json' } });
          if (allowMissing && response.status === 404) return null;
          if (response.status === 403 || response.status === 429) failure = 'rate-limit';
          if (!response.ok) throw new Error('Release lookup failed.');
          return response.json();
        };
        const [history, stable] = await Promise.all([read(`${source.apiUrl}?per_page=100`), read(`${source.apiUrl}/latest`, true)]);
        const catalog = parseReleaseCatalog(history, stable, source);
        savedAt = now();
        try { storage?.setItem(key, JSON.stringify({ savedAt, history, stable } satisfies Cache)); } catch { /* Storage is optional. */ }
        update({ status: 'ready', catalog, stale: false });
      } catch {
        update(state.status === 'ready' ? { ...state, stale: true } : { status: 'error', failure });
      } finally {
        clearTimeout(timer);
        controller.abort();
        pending = null;
      }
    })();
    return pending;
  };
  return { getSnapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, refresh };
}

const stores = new Map<string, ReturnType<typeof createReleaseStore>>();
export function releaseStore(source: ReleaseSource) {
  let store = stores.get(source.apiUrl);
  if (!store) {
    let storage: Storage | undefined;
    try { if (typeof window !== 'undefined') storage = window.sessionStorage; } catch { /* Private browsing may deny storage. */ }
    store = createReleaseStore(source, { storage });
    stores.set(source.apiUrl, store);
  }
  return store;
}
