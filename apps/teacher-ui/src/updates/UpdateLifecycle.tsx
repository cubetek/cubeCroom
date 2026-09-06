'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { UpdateState } from '@cubecroom/contracts';
import { bridge, hasBridge } from '../lib/bridge';
import { flushBeforeUpdate } from '../lib/update-flush';

export function UpdateLifecycle({ children }: { children: ReactNode }) {
  const [state, setState] = useState<UpdateState | null>(null);
  useEffect(() => {
    if (!hasBridge()) return;
    const api = bridge();
    let preparing = false;
    let alive = true;
    const blockInput = (event: Event) => { if (preparing) { event.preventDefault(); event.stopImmediatePropagation(); } };
    const events = ['keydown', 'pointerdown', 'beforeinput', 'paste', 'drop'] as const;
    for (const event of events) document.addEventListener(event, blockInput, true);
    const unsubscribeState = api.onUpdateState((next) => {
      preparing = next.phase === 'preparing' || next.phase === 'installing';
      if (alive) setState(next);
    });
    const unsubscribePrepare = api.onUpdatePrepare(({ token }) => {
      preparing = true;
      void flushBeforeUpdate().then(
        () => api.updatePrepared({ token, saved: true }),
        () => api.updatePrepared({ token, saved: false }),
      ).catch(() => undefined);
    });
    void api.updateState().then((next) => { if (alive) setState(next); }).catch(() => undefined);
    return () => {
      alive = false;
      unsubscribeState(); unsubscribePrepare();
      for (const event of events) document.removeEventListener(event, blockInput, true);
    };
  }, []);
  const frozen = state?.phase === 'preparing' || state?.phase === 'installing';
  return <>
    <div className="contents" inert={frozen}>{children}</div>
    {frozen ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/90 p-8" role="status" aria-live="polite">
      <p className="max-w-md rounded-xl border border-border bg-surface p-6 text-center text-t-body text-text-1">{state.message}</p>
    </div> : null}
  </>;
}
