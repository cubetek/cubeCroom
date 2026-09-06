'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Icon,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ar,
  cn,
} from '@cubecroom/ui';
import {
  QUESTION_COUNTS,
  type ActiveModel,
  type GeneratedQuestions,
  type QuestionType,
  type TeacherLessonSummary,
  type TeacherQuestion,
} from '@cubecroom/contracts';
import { bridge } from '../lib/bridge';

/**
 * T16AiGenerate — توليد أسئلة من الدرس.
 *
 * **نشاطك لم يتغيّر.** الأسئلة تُعرض مقترحاتٍ ولا تُكتب: القناة التي تولّدها
 * لا تكتب في القاعدة أصلاً، والإدراج يمرّ بمسار الحفظ نفسه الذي يمرّ به ما
 * يكتبه المعلم بيده. وهذا هو معيار الإنجاز: **يُدرج ما يُحدَّده هو وحده.**
 *
 * والتحديد يبدأ **مفتوحاً** لا مغلقاً: اللوح يعرض «٣ من ٥ محدَّدة» — أي أن
 * المولَّد محدَّدٌ ابتداءً وللمعلم أن ينزع ما لا يريد. وهذا أقلّ عملاً منه في
 * الحالة الغالبة: أن يقبل أكثرها.
 *
 * وسؤالٌ سقط في الطريق يُقال عدده صراحة — نموذجٌ ردّ بخمسة وقُرئ ثلاثة يجب أن
 * يعرف المعلم أن اثنين ضاعا، لا أن يظنّ أن هذا كل ما وجده في درسه.
 */

/**
 * اللوحة نفسها لوحة `T14` هيكلاً ولوناً: هي المساعدة نفسها في مكان آخر من
 * الشاشة، ولوحةٌ ثانية بشكل مختلف كانت ستُقرأ ميزةً أخرى.
 *
 * **والنصف الثاني من تصادم `ActivityBuilder` هنا**: اللوحة تدخل صفّ الجسد
 * عموداً ثالثاً بعرض 380px لا ينكمش، فتزاحم العمود الجانبي الثابت وتصفّر
 * الورقة بينهما عند 1024×768. وعند نقطة الكسر نفسها (1300px، وهي فوق مقاس
 * الأساس 1280 لأنه داخل التصادم) تأخذ اللوحة سطراً كاملاً تحت الورقة. ولا
 * تُمسّ 380px الأساسية: فوق 1300 السلوك الحالي مقصود.
 *
 * و`self-start` مع `max-h-full` تُبقيان اللوحة عند رأس الصفّ ولا تمدّانها
 * بطول أطول عمود فيه.
 */
const PANEL = cn(
  'flex w-95 shrink-0 flex-col self-start overflow-hidden max-h-full',
  'rounded-lg border border-hairline bg-surface',
  'max-[1300px]:w-full',
);

const BODY = 'flex flex-col gap-2.5 overflow-auto p-4';
const TEXT = 'text-t-label text-text-2';
/** عناوين الحقول: بعضها `<label>` لحقلٍ، وبعضها اسمُ مجموعةٍ لا حقل لها. */
const FIELD = 'mt-1 text-t-label font-semibold text-text-2';
const CHOICE = 'cursor-pointer rounded-full border border-hairline bg-surface px-3 py-2 text-t-label text-text-2';
const CHOICE_ON = 'border-primary bg-primary-soft font-semibold text-primary-on-soft';
const ACTIONS = 'mt-1 flex flex-wrap items-start gap-1.5';
/** «تحديد الكل» و«تغيير» — فعلان ثانويّان لا يستحقّان إطار زرّ في لوحة ضيّقة. */
const LINK = 'cursor-pointer text-t-caption text-primary underline';

export type QuestionGeneratorProps = {
  readonly activityId: string;
  readonly lessons: readonly TeacherLessonSummary[];
  readonly defaultLessonId: string | null;
  readonly onClose: () => void;
  readonly onInsert: (questions: TeacherQuestion[]) => void;
  readonly onOpenSettings: () => void;
};

export function QuestionGenerator({
  activityId,
  lessons,
  defaultLessonId,
  onClose,
  onInsert,
  onOpenSettings,
}: QuestionGeneratorProps) {
  const [model, setModel] = useState<ActiveModel>(null);
  const [ready, setReady] = useState(false);
  const [lessonId, setLessonId] = useState<string | null>(defaultLessonId ?? lessons[0]?.id ?? null);
  const [count, setCount] = useState<(typeof QUESTION_COUNTS)[number]>(5);
  const [type, setType] = useState<QuestionType>('choice');
  const [result, setResult] = useState<GeneratedQuestions | null>(null);
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [running, setRunning] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const active = await bridge().aiActiveModel();
        if (alive) setModel(active);
      } catch {
        if (alive) setModel(null);
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const run = async () => {
    if (lessonId === null) return;
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    setRunning(requestId);
    setResult(null);
    setChosen(new Set());
    try {
      const generated = await bridge().activityGenerate({
        requestId,
        activityId,
        lessonId,
        count,
        type,
      });
      setResult(generated);
      if (generated.status === 'ok') {
        setChosen(new Set(generated.questions.map((question) => question.id)));
      }
    } catch (cause) {
      setResult({
        status: 'failed',
        reason: 'provider_error',
        message: cause instanceof Error ? cause.message : 'لم يُكمل مزوّدك الطلب.',
        action: 'retry',
      });
    } finally {
      setRunning(null);
    }
  };

  const cancel = async () => {
    if (running === null) return;
    await bridge().aiCancel({ requestId: running });
  };

  const toggle = (id: string) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!ready) {
    return (
      <aside className={PANEL} aria-label="توليد أسئلة من الدرس">
        <p className={TEXT}>…</p>
      </aside>
    );
  }

  return (
    <aside className={PANEL} aria-label="توليد أسئلة من الدرس">
      <header className="flex items-center gap-2 border-b border-hairline bg-ai-bg px-4 py-3 text-ai-text">
        <Icon name="sparkles" size={18} />
        <span className="font-bold">توليد أسئلة من الدرس</span>
        <div className="grow" />
        <button
          type="button"
          className="flex cursor-pointer rounded-sm p-1"
          onClick={onClose}
          aria-label="إغلاق اللوحة"
        >
          <Icon name="x" size={16} />
        </button>
      </header>

      {model === null ? (
        <div className={BODY}>
          <h3 className="text-t-h3 font-bold">لم تربط الذكاء الاصطناعي بعد</h3>
          <p className={TEXT}>
            اربط مفتاحك مرة واحدة، ثم يقترح عليك أسئلة من درسك تراجعها وتُدرج ما يعجبك منها.
          </p>
          <p className={TEXT}>وكل شيء آخر يعمل بدونه — بما فيه كتابة الأسئلة بنفسك.</p>
          <div className={ACTIONS}>
            <Button variant="primary" onClick={onOpenSettings}>
              إعداد الذكاء الاصطناعي
            </Button>
            <Button variant="ghost" onClick={onClose}>
              لاحقاً
            </Button>
          </div>
        </div>
      ) : lessons.length === 0 ? (
        <div className={BODY}>
          <h3 className="text-t-h3 font-bold">لا درس في هذا الفصل بعد</h3>
          <p className={TEXT}>
            الأسئلة تُولَّد من درس. اكتب درساً أولاً، ثم عُد لتولّد منه أسئلة هذا النشاط.
          </p>
          <div className={ACTIONS}>
            <Button variant="secondary" onClick={onClose}>
              إغلاق
            </Button>
          </div>
        </div>
      ) : (
        <div className={BODY}>
          <Label className={FIELD} htmlFor="generate-source">
            المصدر
          </Label>
          <Select value={lessonId ?? ''} onValueChange={(next) => setLessonId(next)}>
            <SelectTrigger id="generate-source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {lessons.map((lesson) => (
                <SelectItem key={lesson.id} value={lesson.id}>
                  {lesson.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className={FIELD}>عدد الأسئلة</div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="عدد الأسئلة">
            {QUESTION_COUNTS.map((one) => (
              <button
                key={one}
                type="button"
                role="radio"
                aria-checked={count === one}
                className={cn(CHOICE, count === one && CHOICE_ON)}
                onClick={() => setCount(one)}
              >
                {ar(one)}
              </button>
            ))}
          </div>

          <div className={FIELD}>النوع</div>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="نوع الأسئلة">
            <button
              type="button"
              role="radio"
              aria-checked={type === 'choice'}
              className={cn(CHOICE, type === 'choice' && CHOICE_ON)}
              onClick={() => setType('choice')}
            >
              اختيار من متعدد
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={type === 'text'}
              className={cn(CHOICE, type === 'text' && CHOICE_ON)}
              onClick={() => setType('text')}
            >
              إجابة قصيرة
            </button>
          </div>

          {running !== null ? (
            <>
              <p className={TEXT}>جارٍ التوليد…</p>
              <div className={ACTIONS}>
                <Button variant="secondary" onClick={() => void cancel()}>
                  إلغاء
                </Button>
              </div>
            </>
          ) : result?.status === 'ok' ? (
            <>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className={FIELD}>النتيجة</span>
                <span className="text-t-caption tabular-nums text-text-muted">
                  {ar(chosen.size)} من {ar(result.questions.length)} محدَّدة
                </span>
                <div className="grow" />
                <button
                  type="button"
                  className={LINK}
                  onClick={() =>
                    setChosen(
                      chosen.size === result.questions.length
                        ? new Set()
                        : new Set(result.questions.map((question) => question.id)),
                    )
                  }
                >
                  {chosen.size === result.questions.length ? 'إلغاء التحديد' : 'تحديد الكل'}
                </button>
              </div>

              {/*
                بطاقة الاقتراح `<label>` تلفّ مربّعها: النقر على البطاقة كلّها
                يقلب التحديد — وهي في لوحة ضيّقة يصعب فيها قصد مربّعٍ بحجم ١٦px.
                والحدّ يقول محدَّدة أو لا، والنصّ يقولها أيضاً.
              */}
              {result.questions.map((question) => (
                <label
                  key={question.id}
                  className={cn(
                    'flex cursor-pointer items-start gap-2 rounded-md border border-hairline bg-surface px-3.5 py-3',
                    chosen.has(question.id) && 'border-primary bg-primary-soft',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={chosen.has(question.id)}
                    onChange={() => toggle(question.id)}
                  />
                  <div className="min-w-0 grow">
                    <div className="text-t-label font-semibold">{question.prompt}</div>
                    <div className="mt-1 text-t-caption text-text-muted">
                      {question.type === 'choice'
                        ? `الإجابة: ${correctText(question)} · ${ar(question.options.length)} خيارات`
                        : question.expectedAnswer === null
                          ? 'بلا إجابة متوقَّعة'
                          : `الإجابة: ${question.expectedAnswer}`}
                    </div>
                    {chosen.has(question.id) ? null : (
                      <div className="mt-1 text-t-caption text-text-muted">لم تُحدَّد</div>
                    )}
                  </div>
                </label>
              ))}

              {/* ما سقط يُقال بنبرة تنبيه لا خطر: النتيجة صالحة، لكنها أقلّ ممّا طُلب. */}
              {result.dropped > 0 ? (
                <Alert tone="pending">
                  سقط {ar(result.dropped)} من الأسئلة لأن إجاباتها لم تكن واضحة، ولم نخترها عنك.
                </Alert>
              ) : null}

              <Alert tone="ok">
                راجِع كل سؤال وإجابته قبل الإدراج — يمكنك تعديلها بعد ذلك كأي سؤال كتبته بنفسك.
              </Alert>

              <div className={ACTIONS}>
                <Button
                  variant="primary"
                  onClick={() =>
                    onInsert(result.questions.filter((question) => chosen.has(question.id)))
                  }
                  {...(chosen.size === 0
                    ? { disabled: true as const, disabledReason: 'لم تحدّد سؤالاً بعد.' }
                    : {})}
                >
                  إدراج المحدَّد ({ar(chosen.size)})
                </Button>
                <Button variant="ghost" onClick={() => void run()}>
                  إعادة التوليد
                </Button>
              </div>
            </>
          ) : result?.status === 'failed' ? (
            <>
              <Alert tone="error" live>
                {result.message}
              </Alert>
              <div className={ACTIONS}>
                {result.action === 'open_settings' ? (
                  <Button variant="primary" onClick={onOpenSettings}>
                    فتح إعدادات الذكاء الاصطناعي
                  </Button>
                ) : (
                  <Button variant="primary" onClick={() => void run()}>
                    إعادة المحاولة
                  </Button>
                )}
              </div>
              <p className={TEXT}>لم يتغيّر شيء في نشاطك.</p>
            </>
          ) : (
            <>
              {result?.status === 'empty' ? (
                <Alert tone="error" live>
                  {result.message}
                </Alert>
              ) : result?.status === 'cancelled' ? (
                <p className={TEXT}>أُلغي الطلب. لم يتغيّر شيء في نشاطك.</p>
              ) : result?.status === 'no_provider' ? (
                <p className={TEXT}>لم تربط الذكاء الاصطناعي بعد.</p>
              ) : null}

              <div className={ACTIONS}>
                <Button variant="primary" onClick={() => void run()}>
                  توليد
                </Button>
              </div>
            </>
          )}

          {/* `mt-auto` يدفع سطر المزوّد إلى قاع اللوحة مهما قصر ما فوقه. */}
          <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
            <span className="text-t-caption text-text-muted">المزوّد والنموذج</span>
            <span className="ltr-island wrap-anywhere text-t-mono text-text-2" dir="ltr">
              {model.label} · {model.model}
            </span>
            <div className="grow" />
            <button type="button" className={LINK} onClick={onOpenSettings}>
              تغيير
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

/** «الإجابة: التكاثف» في اللوح — يُقرأ من المفتاح الذي وصل المعلمَ وحده. */
function correctText(question: Extract<TeacherQuestion, { type: 'choice' }>): string {
  return question.options.find((option) => option.isCorrect)?.text ?? '—';
}
