'use client';
import { useState } from 'react';
import {
  LEARNING_METHODS,
  type StudentLearningItem,
  type LearningMethod,
  type LearningFeedback,
  type LearningResponse,
} from '@cubecroom/contracts';
import { Button } from '#components/button';
import { Textarea } from '#components/textarea';
import { cn } from '#lib/utils';

export function LearningInteraction({
  item,
  method,
  onSubmit,
  feedback = null,
  busy = false,
  frozen = false,
}: {
  item: StudentLearningItem;
  method: LearningMethod;
  onSubmit?: (
    answer: string[],
    confidence: LearningResponse['confidence'],
    usedHint: boolean,
    initialAnswer: string[] | null,
  ) => void;
  feedback?: LearningFeedback | null;
  busy?: boolean;
  frozen?: boolean;
}) {
  const [answer, setAnswer] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<LearningResponse['confidence']>('partly');
  const [hinted, setHinted] = useState(false);
  const [example, setExample] = useState(false);
  const [initialAnswer, setInitialAnswer] = useState<string[] | null>(null);
  const [discussed, setDiscussed] = useState(false);
  const methodInfo = LEARNING_METHODS.find((m) => m.id === method)!;
  const locked = busy || frozen || feedback !== null;
  const complete = ['order', 'match'].includes(item.kind)
    ? item.options.every((_, i) => !!answer[i]) &&
      (item.kind !== 'order' || new Set(answer).size === item.options.length)
    : !!answer[0]?.trim();
  return (
    <section className="space-y-5 rounded-2xl border border-hairline bg-surface p-5 text-start shadow-sm sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-primary-soft px-3 py-1 text-sm font-bold text-primary-on-soft">
          {methodInfo.title}
        </span>
        <span className="text-sm text-text-muted">{item.objective}</span>
      </div>
      <h2 className="whitespace-pre-wrap text-xl font-bold leading-relaxed">{item.prompt}</h2>
      {method === 'peer' && (
        <div className="space-y-3 rounded-xl bg-canvas p-3 text-sm">
          <p>
            {!initialAnswer
              ? 'فكّر وحدك وحدد إجابتك الأولى؛ لن نكشف الحل بعد.'
              : 'ناقش السبب مع زميل، ثم راجع إجابتك قبل التحقق. تُرسل المحاولتان إلى المعلم معاً.'}
          </p>
          {initialAnswer && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={discussed}
                disabled={locked}
                onChange={(e) => setDiscussed(e.target.checked)}
              />
              ناقشت تفسيري وأنا جاهز للإجابة الثانية
            </label>
          )}
        </div>
      )}
      {method === 'diagram' && item.kind === 'order' && (
        <ol
          aria-label="مخطط المراحل"
          className="flex flex-wrap items-center justify-center gap-3 rounded-xl bg-canvas p-5"
        >
          {item.options.map((o, i) => (
            <li key={o.id} className="flex items-center gap-3">
              <span className="rounded-xl border-2 border-primary bg-surface p-3 text-center text-sm">
                <span className="block text-xs text-text-muted">المرحلة {i + 1}</span>
                {item.options.find((x) => x.id === answer[i])?.text ?? '؟'}
              </span>
              {i < item.options.length - 1 && <span aria-hidden="true">←</span>}
            </li>
          ))}
        </ol>
      )}
      {method === 'concepts' && item.kind === 'match' && (
        <div className="rounded-2xl border-2 border-primary-soft p-4">
          <p className="mx-auto mb-4 w-fit rounded-full bg-primary-soft px-5 py-2 font-bold">
            {item.objective}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {item.options.map((o, i) => (
              <li key={o.id} className="rounded-xl border border-hairline p-3 text-sm">
                {o.text} ←{' '}
                {item.targets.find((t) => t.id === answer[i])?.text ?? 'رابط ينتظر إجابتك'}
              </li>
            ))}
          </ul>
        </div>
      )}
      {item.example && (
        <div>
          <Button
            variant="secondary"
            onClick={() => {
              setExample(!example);
              setHinted(true);
            }}
          >
            {example ? 'إخفاء المثال' : 'اقرأ المثال المساعد'}
          </Button>
          {example && (
            <p className="mt-3 whitespace-pre-wrap rounded-xl bg-canvas p-4">{item.example}</p>
          )}
        </div>
      )}
      {item.kind === 'choice' ? (
        <div role="radiogroup" aria-label="إجابتك" className="grid gap-3">
          {item.options.map((option, i) => (
            <button
              key={option.id}
              role="radio"
              aria-checked={answer[0] === option.id}
              disabled={locked}
              onClick={() => setAnswer([option.id])}
              className={cn(
                'flex min-h-14 items-center gap-3 rounded-xl border p-4 text-start transition-colors disabled:cursor-default',
                answer[0] === option.id
                  ? 'border-primary bg-primary-soft text-primary-on-soft'
                  : 'border-hairline hover:bg-canvas',
              )}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-canvas text-sm">
                {i + 1}
              </span>
              {option.text}
            </button>
          ))}
        </div>
      ) : item.kind === 'order' || item.kind === 'match' ? (
        <div
          className={cn(
            'grid gap-3',
            ['diagram', 'concepts'].includes(method) ? 'sm:grid-cols-2' : '',
          )}
        >
          {item.options.map((option, i) => (
            <label
              key={option.id}
              className="flex flex-col gap-2 rounded-xl border border-hairline bg-canvas p-4"
            >
              <span className="font-medium">
                {item.kind === 'order' ? `الخطوة ${i + 1}` : option.text}
              </span>
              <select
                aria-label={item.kind === 'order' ? `الخطوة ${i + 1}` : `المقابل: ${option.text}`}
                className="min-h-11 rounded-lg border border-hairline bg-surface px-3"
                value={answer[i] ?? ''}
                disabled={locked}
                onChange={(e) =>
                  setAnswer((current) =>
                    Array.from({ length: item.options.length }, (_, j) =>
                      j === i ? e.target.value : (current[j] ?? ''),
                    ),
                  )
                }
              >
                <option value="">اختر…</option>
                {(item.kind === 'order' ? item.options : item.targets).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.text}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      ) : (
        <Textarea
          aria-label="إجابتك"
          rows={4}
          value={answer[0] ?? ''}
          disabled={locked}
          placeholder={
            item.kind === 'explain' ? 'اشرح الفكرة والسبب، وأضف مثالاً…' : 'حاول تذكر الإجابة…'
          }
          onChange={(e) => setAnswer([e.target.value])}
        />
      )}
      {item.rubric.length > 0 && (
        <div className="rounded-xl bg-canvas p-4 text-sm">
          <p className="mb-2 font-bold">ما الذي نبحث عنه في تفسيرك؟</p>
          <ul className="list-inside list-disc space-y-1">
            {item.rubric.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {item.hint && !feedback && (
        <div>
          <Button variant="ghost" onClick={() => setHinted(true)}>
            أحتاج تلميحاً
          </Button>
          {hinted && (
            <p className="mt-2 whitespace-pre-wrap rounded-xl bg-primary-soft p-3 text-primary-on-soft">
              {item.hint}
            </p>
          )}
        </div>
      )}
      {!feedback && (
        <>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">ما مدى ثقتك بإجابتك؟</legend>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['unsure', 'أحتاج مراجعة'],
                  ['partly', 'متأكد جزئياً'],
                  ['sure', 'متأكد'],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm',
                    confidence === value ? 'border-primary bg-primary-soft' : 'border-hairline',
                  )}
                >
                  <input
                    type="radio"
                    name={`confidence-${item.id}`}
                    value={value}
                    checked={confidence === value}
                    onChange={() => setConfidence(value)}
                    disabled={locked}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <Button
            variant="primary"
            aria-disabled={
              !complete || locked || (method === 'peer' && !!initialAnswer && !discussed)
            }
            onClick={() => {
              if (!complete || locked) return;
              if (method === 'peer' && !initialAnswer) {
                setInitialAnswer([...answer]);
                return;
              }
              if (method === 'peer' && !discussed) return;
              onSubmit?.(answer, confidence, hinted, initialAnswer);
            }}
          >
            {busy
              ? 'نحفظ محاولتك…'
              : method === 'peer' && !initialAnswer
                ? 'ثبّت الإجابة الأولى وناقش'
                : onSubmit
                  ? 'احفظ المحاولة وتحقق'
                  : 'معاينة الطالب'}
          </Button>
        </>
      )}
      {feedback && (
        <div
          role="status"
          className={cn(
            'space-y-2 rounded-xl border p-4',
            feedback.correct === true
              ? 'border-ok-border bg-ok-bg text-ok-text'
              : 'border-hairline bg-canvas',
          )}
        >
          <p className="font-bold">
            {feedback.correct === true
              ? 'أحسنت! استرجعت الفكرة.'
              : feedback.correct === null
                ? 'وصل تفسيرك إلى المعلم للمراجعة.'
                : 'محاولتك خطوة للتعلم. راجع التفسير ثم تابع.'}
          </p>
          <p className="whitespace-pre-wrap">{feedback.explanation}</p>
          {feedback.dueAt && (
            <p className="text-sm">
              مراجعة لاحقة: {new Date(feedback.dueAt).toLocaleDateString('ar')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
