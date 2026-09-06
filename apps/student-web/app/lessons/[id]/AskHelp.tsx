'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  STUDENT_TUTOR_LIMITS,
  STUDENT_TUTOR_MODES,
  STUDENT_TUTOR_MODE_LABELS,
  studentAiRequestSchema,
  studentAiResponseSchema,
  type StudentAiResponse,
  type StudentTutorMode,
  type StudentTutorTurn,
} from '@cubecroom/contracts';
import { Label, Textarea, buttonVariants, cn } from '@cubecroom/ui';

const PANEL = cn(
  'flex flex-col gap-4 rounded-lg border border-hairline bg-surface px-4.5 py-4',
  'wide:max-w-[760px]',
);
const NOTICE = cn(
  'rounded-sm border border-pending-border bg-pending-bg px-2.75 py-2.25',
  'text-s-caption text-pending-text',
);
const SUGGESTION = cn(
  buttonVariants({ variant: 'secondary' }),
  'h-auto min-h-11 rounded-full px-3.5 py-2.5 text-s-caption text-text-2',
);
const ASK = cn(
  buttonVariants({ variant: 'primary' }),
  'h-auto min-h-[52px] w-full text-s-body font-semibold',
  'tablet:max-w-[320px] tablet:self-start',
);

export type AskHelpProps = {
  readonly lessonId: string;
  /** Checked on the server; only lesson content is automatically supplied to the model. */
  readonly activityId?: string;
  readonly notice: string;
};

type TutorAnswer = { response: StudentAiResponse; mode: StudentTutorMode };

export function AskHelp({ lessonId, activityId, notice }: AskHelpProps) {
  // A new lesson/activity starts a fresh, ephemeral conversation.
  return (
    <StudentTutor
      key={`${lessonId}:${activityId ?? ''}`}
      lessonId={lessonId}
      {...(activityId === undefined ? {} : { activityId })}
      notice={notice}
    />
  );
}

function StudentTutor({ lessonId, activityId, notice }: AskHelpProps) {
  const fieldId = useId();
  const [question, setQuestion] = useState('');
  const [attempt, setAttempt] = useState('');
  const [mode, setMode] = useState<StudentTutorMode>('hint');
  const [answer, setAnswer] = useState<TutorAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const history = useRef<StudentTutorTurn[]>([]);

  useEffect(
    () => () => {
      const controller = activeRequest.current;
      activeRequest.current = null;
      controller?.abort();
    },
    [],
  );

  const cancel = () => {
    const controller = activeRequest.current;
    activeRequest.current = null;
    controller?.abort();
    setBusy(false);
  };

  const ask = async (nextMode: StudentTutorMode = mode) => {
    // The ref closes the same-tick double-click gap before React renders disabled controls.
    if (activeRequest.current !== null) return;
    const parsed = studentAiRequestSchema.safeParse({
      lessonId,
      ...(activityId === undefined ? {} : { activityId }),
      question,
      attempt,
      mode: nextMode,
      history: history.current,
    });
    if (!parsed.success) {
      setError('اكتب سؤالاً من 3 أحرف على الأقل، والتزم بالطول المحدد للمحاولة.');
      return;
    }

    const controller = new AbortController();
    activeRequest.current = controller;
    setMode(nextMode);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/student/ai', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
        signal: controller.signal,
      });
      const body = (await response.json()) as {
        data?: unknown;
        error?: { message?: unknown };
      };
      if (activeRequest.current !== controller) return;
      const result = studentAiResponseSchema.safeParse(body.data);
      if (!response.ok || !result.success) {
        setError(
          typeof body.error?.message === 'string'
            ? body.error.message
            : 'المساعدة لا تعمل الآن. اسأل معلمك.',
        );
        return;
      }
      history.current = [
        ...parsed.data.history,
        {
          question: parsed.data.question,
          mode: nextMode,
          answer: result.data.answer,
        },
      ].slice(-STUDENT_TUTOR_LIMITS.history);
      setAnswer({ response: result.data, mode: nextMode });
    } catch {
      if (activeRequest.current === controller && !controller.signal.aborted) {
        setError('تعذّر الوصول إلى جهاز معلمك. تأكد أنك على شبكة Wi-Fi نفسها.');
      }
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setBusy(false);
      }
    }
  };

  return (
    <section className={PANEL} aria-labelledby={`${fieldId}-heading`}>
      <div className="space-y-1.5">
        <h2 id={`${fieldId}-heading`} className="text-s-label font-semibold">
          نفهمها خطوة بخطوة
        </h2>
        <p className="text-s-caption text-text-muted">
          اسأل عن درسك واكتب ما جرّبته. تساعدك التلميحات على التفكير والوصول إلى الإجابة بنفسك.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-s-caption text-text-muted" htmlFor={`${fieldId}-question`}>
          ما الذي تريد فهمه؟
        </Label>
        <Textarea
          id={`${fieldId}-question`}
          className="px-3.25 py-2.75 text-s-body"
          rows={2}
          maxLength={STUDENT_TUTOR_LIMITS.question}
          disabled={busy}
          value={question}
          onChange={(event) => {
            setQuestion(event.target.value);
            if (history.current.length > 0) setAttempt('');
            history.current = [];
            setAnswer(null);
            setError(null);
          }}
          placeholder="لماذا تتكوّن الغيوم؟"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-s-caption text-text-muted" htmlFor={`${fieldId}-attempt`}>
          محاولتي أو ما فهمته حتى الآن (اختياري)
        </Label>
        <Textarea
          id={`${fieldId}-attempt`}
          className="px-3.25 py-2.75 text-s-body"
          rows={2}
          maxLength={STUDENT_TUTOR_LIMITS.attempt}
          disabled={busy}
          value={attempt}
          onChange={(event) => setAttempt(event.target.value)}
          placeholder="أظن أن بخار الماء يبرد…"
        />
        <p className="text-s-caption text-text-muted">
          اكتب عن الفكرة فقط، دون اسمك أو معلوماتك الشخصية.
        </p>
      </div>

      <fieldset disabled={busy} className="space-y-2">
        <legend className="mb-2 text-s-caption text-text-muted">كيف أساعدك؟</legend>
        <div className="flex flex-wrap gap-2">
          {STUDENT_TUTOR_MODES.map((value) => (
            <button
              key={value}
              type="button"
              className={cn(
                SUGGESTION,
                mode === value && 'border-primary bg-primary-soft text-primary-on-soft',
              )}
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {STUDENT_TUTOR_MODE_LABELS[value]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={ASK}
          onClick={() => void ask()}
          disabled={busy || question.trim().length < 3}
        >
          {busy ? 'أحضّر لك خطوة تساعدك…' : 'ساعدني على الفهم'}
        </button>
        {busy ? (
          <button type="button" className={SUGGESTION} onClick={cancel}>
            إيقاف الطلب
          </button>
        ) : null}
      </div>

      <div aria-live="polite" aria-busy={busy} className="space-y-3">
        {answer !== null ? (
          <>
            <div className="space-y-2 rounded-md border border-hairline bg-canvas px-3.75 py-3.25">
              <h3 className="text-s-caption font-semibold text-text-muted">
                {STUDENT_TUTOR_MODE_LABELS[answer.mode]}
              </h3>
              <p className="text-s-reading whitespace-pre-wrap">{answer.response.answer}</p>
              {answer.response.groundedIn ? (
                <p className="text-s-caption text-text-muted">{answer.response.groundedIn}</p>
              ) : null}
            </div>
            <p className="text-s-caption text-text-muted">
              فكّر في سؤال التحقق، ثم اكتب إجابتك في خانة المحاولة واطلب «تحقق من فهمي».
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={SUGGESTION}
                disabled={busy}
                onClick={() => void ask('explain')}
              >
                اشرح لي أبسط
              </button>
              <button
                type="button"
                className={SUGGESTION}
                disabled={busy}
                onClick={() => void ask('example')}
              >
                أعطني مثالاً مشابهاً
              </button>
              <button
                type="button"
                className={SUGGESTION}
                disabled={busy}
                onClick={() => void ask('check')}
              >
                تحقق من فهمي
              </button>
              <button
                type="button"
                className={SUGGESTION}
                disabled={busy}
                onClick={() => {
                  setQuestion('');
                  setAttempt('');
                  setAnswer(null);
                  setError(null);
                  setMode('hint');
                  history.current = [];
                }}
              >
                سؤال جديد
              </button>
            </div>
            <p className={NOTICE}>{answer.response.notice}</p>
          </>
        ) : (
          <p className={NOTICE}>{notice}</p>
        )}
      </div>

      {error !== null ? (
        <p className={NOTICE} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
