'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { INITIAL_RELEASE_STATE, releaseStore } from './client';
import type { ReleaseSource } from './data';

export function useReleases(source: ReleaseSource) {
  const store = releaseStore(source);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, () => INITIAL_RELEASE_STATE);
  useEffect(() => {
    const refresh = () => { void store.refresh(); };
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [store]);
  return { state, refresh: () => store.refresh(true) };
}
