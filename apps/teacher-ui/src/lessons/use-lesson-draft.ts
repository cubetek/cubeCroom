'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  updateLessonSchema,
  type LessonBlock,
  type TeacherLessonDetail,
} from '@cubecroom/contracts';
import { bridge } from '../lib/bridge';
import { createSaveQueue } from '../lib/save-queue';
import { useFlushOnExit } from '../lib/useFlushOnExit';

type Draft = { title: string; blocks: LessonBlock[] };
export type LessonSaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'failed';

export function useLessonDraft(initial: TeacherLessonDetail) {
  const [lesson, setLesson] = useState(initial);
  const [draft, setDraft] = useState<Draft>({ title: initial.title, blocks: initial.blocks });
  const latestDraft = useRef(draft);
  const [save, setSave] = useState<LessonSaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const queue = useMemo(
    () =>
      createSaveQueue<Draft>(async (value) => {
        setSave('saving');
        try {
          const checked = updateLessonSchema.safeParse({ id: initial.id, ...value });
          if (!checked.success)
            throw new Error(checked.error.issues[0]?.message ?? 'راجع محتوى الدرس.');
          setLesson(await bridge().lessonUpdate(checked.data));
          setError(null);
        } catch (cause) {
          setSave('failed');
          setError(cause instanceof Error ? cause.message : 'تعذّر حفظ الدرس.');
          throw cause;
        }
      }),
    [initial.id],
  );
  const flush = useCallback(async () => {
    if (!queue.dirty) return;
    await queue.flush();
    setSave('saved');
  }, [queue]);
  const edit = useCallback(
    (change: Draft | ((current: Draft) => Draft)) => {
      const value = typeof change === 'function' ? change(latestDraft.current) : change;
      latestDraft.current = value;
      queue.set(value);
      setDraft(value);
      setSave('pending');
    },
    [queue],
  );
  /** Adopt a server-side transaction only after outstanding local edits have been saved. */
  const resetBaseline = useCallback(
    (next: TeacherLessonDetail) => {
      if (queue.dirty) throw new Error('احفظ تعديلات الدرس قبل استبدال صفحته.');
      const nextDraft = { title: next.title, blocks: next.blocks };
      latestDraft.current = nextDraft;
      setDraft(nextDraft);
      setLesson(next);
      setSave('saved');
      setError(null);
    },
    [queue],
  );
  useEffect(() => {
    if (!queue.dirty) return;
    const timer = setTimeout(() => {
      void flush().catch(() => undefined);
    }, 1000);
    return () => clearTimeout(timer);
  }, [draft, flush, queue]);
  useFlushOnExit(flush, `lesson:${initial.id}`, draft.title.trim() || 'درس دون عنوان');
  return { lesson, draft, edit, flush, save, error, setError, setLesson, resetBaseline };
}
