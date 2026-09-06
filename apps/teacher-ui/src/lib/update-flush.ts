type Flush = () => void | Promise<void>;
export type UpdateFlushIssue = {
  id: string;
  label: string;
  message: string;
  canRetry: boolean;
  canDiscard: boolean;
};
type Registration = {
  documentKey: string;
  label: () => string;
  flush: Flush;
};
type Entry = Registration & {
  id: string;
  active: boolean;
  superseded: boolean;
  failed: boolean;
  pending: Promise<void> | null;
};

/** Failed unmount saves retain their queue reference until saved or explicitly discarded. */
export function createUpdateFlushRegistry() {
  let sequence = 0;
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  const removeIfFinished = (entry: Entry) => {
    if (!entry.active && !entry.failed && entry.pending === null) entries.delete(entry.id);
  };

  function run(entry: Entry): Promise<void> {
    if (entry.pending !== null) return entry.pending;
    if (entry.superseded) return Promise.reject(new Error('أُعيد فتح المستند. لن نحفظ مسودة قديمة فوق نسخته الحالية.'));
    // Start the flush before unmount returns, while retaining its Promise centrally.
    // Deferring the callback could let a new document replace a shared component ref.
    let started: void | Promise<void>;
    try { started = entry.flush(); } catch (error) { started = Promise.reject(error); }
    const work = Promise.resolve(started).then(
      () => { entry.failed = false; },
      (error: unknown) => { entry.failed = true; throw error; },
    ).finally(() => {
      entry.pending = null;
      removeIfFinished(entry);
      notify();
    });
    entry.pending = work;
    notify();
    return work;
  }

  return {
    register(input: Registration) {
      // A newer editor may contain newer changes. Its success cannot silently clear
      // an earlier failed draft, and the older queue must never be retried over it.
      for (const old of entries.values()) {
        if (old.documentKey === input.documentKey) old.superseded = true;
      }
      const entry: Entry = { ...input, id: `flush-${++sequence}`, active: true, superseded: false, failed: false, pending: null };
      entries.set(entry.id, entry);
      notify();
      return {
        flush: () => run(entry),
        unregister: () => {
          entry.active = false;
          removeIfFinished(entry);
          notify();
        },
      };
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    issues(): UpdateFlushIssue[] {
      return [...entries.values()].filter((entry) => entry.failed).map((entry) => ({
        id: entry.id,
        label: entry.label(),
        message: entry.pending !== null
          ? 'نحاول حفظ التعديلات المعلقة…'
          : entry.superseded
            ? 'أُعيد فتح هذا المستند بعد فشل الحفظ. لن نحفظ المسودة القديمة فوق النسخة الحالية؛ راجع العمل قبل تجاهل المحاولة القديمة.'
            : 'لم تُحفظ آخر التعديلات. عالج سبب فشل الحفظ ثم أعد المحاولة، أو تجاهل هذه التعديلات صراحةً قبل التحديث.',
        canRetry: !entry.superseded && entry.pending === null,
        canDiscard: !entry.active && entry.pending === null,
      }));
    },
    async retry(id: string): Promise<void> {
      const entry = entries.get(id);
      if (!entry?.failed) throw new Error('لم تعد محاولة الحفظ هذه معلقة.');
      if (entry.superseded) throw new Error('أُعيد فتح المستند. لن نحفظ مسودة قديمة فوق نسخته الحالية.');
      await run(entry);
    },
    discard(id: string): void {
      const entry = entries.get(id);
      if (!entry?.failed) throw new Error('لم تعد محاولة الحفظ هذه معلقة.');
      if (entry.pending !== null || entry.active) throw new Error('انتظر اكتمال الحفظ وغادر المحرر قبل تجاهل محاولته.');
      // Drop only the retained draft/callback. Never delete or modify stored data.
      entries.delete(id);
      notify();
    },
    async flush(): Promise<void> {
      const started = [...entries.values()].filter((entry) => entry.active && !entry.superseded).map(run);
      await Promise.allSettled(started);
      // An editor can unmount during preparation. Drain saves it has already started,
      // including work registered while an earlier save was finishing.
      while (true) {
        const pending = [...entries.values()].flatMap((entry) => entry.pending === null ? [] : [entry.pending]);
        if (pending.length === 0) break;
        await Promise.allSettled(pending);
      }
      // Archived failures are deliberately not retried automatically by OTA.
      if ([...entries.values()].some((entry) => entry.failed)) {
        throw new Error('توجد تعديلات لم تُحفظ. راجع محاولات الحفظ المعلقة في إعدادات التحديث.');
      }
    },
  };
}

const registry = createUpdateFlushRegistry();
export const registerUpdateFlush = registry.register;
export const flushBeforeUpdate = registry.flush;
export const getUpdateFlushIssues = registry.issues;
export const subscribeUpdateFlushIssues = registry.subscribe;
export const retryUpdateFlushIssue = registry.retry;
export const discardUpdateFlushIssue = registry.discard;
