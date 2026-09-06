/** One fence for all desktop work. Acquisition and admission are synchronous to avoid races. */
export function createUpdateFence() {
  let phase: 'open' | 'flushing' | 'sealed' = 'open';
  let active = 0;
  const waiters = new Set<() => void>();
  return {
    get phase() { return phase; },
    get active() { return active; },
    enter(allowDuringFlush = false): () => void {
      if (phase === 'sealed' || (phase === 'flushing' && !allowDuringFlush)) throw new Error('نجهّز التحديث. انتظر حتى يكتمل الحفظ.');
      active += 1;
      let done = false;
      return () => {
        if (done) return;
        done = true;
        active -= 1;
        if (active === 0) for (const notify of waiters) notify();
      };
    },
    begin() {
      if (phase !== 'open') throw new Error('التحديث قيد التجهيز بالفعل.');
      phase = 'flushing';
    },
    seal() { phase = 'sealed'; },
    release() { phase = 'open'; },
    waitForIdle(timeoutMs = 30_000): Promise<void> {
      if (active === 0) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const finish = () => { clearTimeout(timer); waiters.delete(finish); resolve(); };
        const timer = setTimeout(() => { waiters.delete(finish); reject(new Error('انتظر اكتمال العمليات الجارية ثم أعد محاولة التحديث.')); }, timeoutMs);
        waiters.add(finish);
      });
    },
  };
}
