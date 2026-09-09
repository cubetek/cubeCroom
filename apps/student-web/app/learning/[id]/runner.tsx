'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button, LearningInteraction } from '@cubecroom/ui';
import type {
  LearningSession,
  LearningFeedback,
  LearningResponse,
  LearningHistory,
} from '@cubecroom/contracts';

async function request<T>(body: unknown, action = 'answer'): Promise<T> {
  const response = await fetch(`/api/student/learning?action=${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || result.error)
    throw new Error(result.error?.message ?? 'تعذر الاتصال بالمعلم.');
  return result.data;
}
export function LearningRunner({ experienceId }: { experienceId: string }) {
  const [session, setSession] = useState<LearningSession | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<LearningFeedback | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = useRef<LearningResponse | null>(null);
  const [history, setHistory] = useState<LearningHistory | null>(null);
  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const found = await request<LearningSession>({ id: experienceId }, 'start');
      setSession(found);
      setItemId(
        found.attempts.length
          ? found.attempts.at(-1)!.feedback.nextItemId
          : (found.experience.material.items[0]?.id ?? null),
      );
      setFeedback(null);
      pending.current = null;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let alive = true;
    void request<LearningSession>({ id: experienceId }, 'start')
      .then((found) => {
        if (alive) {
          setSession(found);
          setItemId(
            found.attempts.length
              ? found.attempts.at(-1)!.feedback.nextItemId
              : (found.experience.material.items[0]?.id ?? null),
          );
        }
      })
      .catch((e) => {
        if (alive) setError(String(e));
      });
    return () => {
      alive = false;
    };
  }, [experienceId]);
  const submit = async (
    answer: string[],
    confidence: LearningResponse['confidence'],
    usedHint: boolean,
    initialAnswer: string[] | null = null,
  ) => {
    if (!session || !itemId || busy) return;
    // Keep the exact request after an uncertain response so retry is idempotent.
    const input = pending.current ?? {
      requestId: `${session.id}:${itemId}`,
      sessionId: session.id,
      itemId,
      answer,
      confidence,
      usedHint,
      initialAnswer,
    };
    pending.current = input;
    setBusy(true);
    setError('');
    try {
      const result = await request<LearningFeedback>(input);
      setFeedback(result);
      pending.current = null;
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : String(e)} إجابتك محفوظة مؤقتاً؛ أعد إرسالها بالزر أدناه.`,
      );
    } finally {
      setBusy(false);
    }
  };
  const item = session?.experience.material.items.find((i) => i.id === itemId);
  return (
    <main className="mx-auto min-h-svh max-w-3xl space-y-5 p-5">
      <Link className="text-sm text-primary" href="/learning">
        → تجارب التعلّم
      </Link>
      {session && (
        <header>
          <h1 className="text-2xl font-bold">{session.experience.material.title}</h1>
          <p className="mt-2 text-text-muted">{session.experience.material.instructions}</p>
        </header>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-error-bg p-4 text-error-text">
          {error}
        </p>
      )}
      {session && (
        <details className="rounded-xl border border-hairline bg-surface p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            محاولاتي وملاحظات المعلم
          </summary>
          <Button
            variant="ghost"
            onClick={() =>
              void request<LearningHistory>({ id: experienceId }, 'history')
                .then(setHistory)
                .catch((e) => setError(String(e)))
            }
          >
            عرض أحدث الملاحظات
          </Button>
          {history?.length === 0 && <p className="text-sm">لا توجد محاولات محفوظة بعد.</p>}
          {history?.map((h, i) => (
            <article
              key={`${h.createdAt}-${i}`}
              className="space-y-2 border-t border-hairline py-3 text-sm"
            >
              <p className="font-bold">{h.prompt}</p>
              {h.initialAnswer && <p>قبل النقاش: {h.initialAnswer.join('، ')}</p>}
              <p>إجابتك: {h.answer.join('، ')}</p>
              <p>
                {h.feedback.score === null
                  ? 'بانتظار مراجعة المعلم'
                  : `النتيجة: ${Math.round(h.feedback.score * 100)}٪`}
              </p>
              <p className="whitespace-pre-wrap text-text-muted">{h.feedback.explanation}</p>
            </article>
          ))}
        </details>
      )}
      {error && pending.current && (
        <Button
          onClick={() =>
            void submit(
              pending.current!.answer,
              pending.current!.confidence,
              pending.current!.usedHint,
              pending.current!.initialAnswer,
            )
          }
          aria-disabled={busy}
        >
          أعد إرسال المحاولة المحفوظة
        </Button>
      )}
      {!session && (
        <p>
          {error ? <Button onClick={() => void start()}>إعادة المحاولة</Button> : 'نفتح تجربتك…'}
        </p>
      )}
      {item && session && (
        <>
          <LearningInteraction
            key={item.id}
            item={item}
            method={session.experience.material.method}
            feedback={feedback}
            busy={busy}
            frozen={pending.current !== null}
            onSubmit={(a, c, h, first) => void submit(a, c, h, first)}
          />
          {feedback && (
            <Button
              variant="primary"
              onClick={() => {
                setItemId(feedback.nextItemId);
                setFeedback(null);
              }}
            >
              {feedback.nextItemId ? 'تابع إلى السؤال التالي' : 'إنهاء الجولة'}
            </Button>
          )}
        </>
      )}
      {session && !itemId && (
        <section className="space-y-4 rounded-2xl border border-ok-border bg-ok-bg p-8 text-center">
          <h2 className="text-2xl font-bold text-ok-text">اكتملت جولتك!</h2>
          <p>محاولاتك محفوظة لدى المعلم. ارجع لاحقاً لتختبر ما بقي في ذاكرتك.</p>
          <Button onClick={() => void start()} aria-disabled={busy}>
            جولة تدريب جديدة
          </Button>
          <p>
            <Link className="text-primary" href="/learning">
              العودة إلى تجاربي
            </Link>
          </p>
        </section>
      )}
    </main>
  );
}
