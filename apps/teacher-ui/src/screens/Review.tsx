'use client';

import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, CardContent, Icon, Textarea, ar, cn } from '@cubecroom/ui';
import {
  REVIEW_QUICK_COMMENTS,
  type ActiveModel,
  type SubmissionDetail,
} from '@cubecroom/contracts';
import { bridge } from '../lib/bridge';
import { when } from './Lessons';

/**
 * T17Review — مراجعة الإجابات بتنقّل متسلسل.
 *
 * **هذا هو معيار الإنجاز حرفياً: «مراجعة دفعة كاملة دون العودة إلى القائمة».**
 * الطابور يُبنى مرة واحدة عند البدء، و«حفظ والانتقال للتالي» يحفظ ويجلب
 * التالي في نداء واحد — فمعلمٌ أمام إحدى وعشرين ورقة لا يعود إلى الجدول إحدى
 * وعشرين مرة.
 *
 * والطابور **يُثبَّت عند لحظة البدء ولا ينمو تحت اليد**: إجابةٌ تصل أثناء
 * المراجعة تنتظر الجولة التالية. عدّادٌ يقول «٣ من ٧» ثم يصير «٣ من ٩» يجعل
 * المعلم يشعر أنه لا يتقدّم.
 *
 * والدرجة والتعليق يُحفظان معاً (قرار `D5`): الرقم وحده لا يقول للطالب ما
 * ينقصه، ولذلك التعليق حاضر في الشاشة لا مخفيّاً خلف زرّ.
 */

/*
 * عرض عمود أدوات التصحيح — 320px، وينكمش إلى 280px تحت 1180px.
 *
 * عند 1024×768 تحجز أدوات التصحيح 334px من 719px، فلا يبقى لنصّ الإجابة
 * (18px بمقياس القراءة) إلا 331px ⇦ ~42 حرفاً في السطر بدل ~75، فتتضاعف
 * أسطر الفقرة التي يقرؤها المعلم. 280px تعيده إلى ~47 حرفاً، والأدوات لا
 * تتضرّر: أزرار الدرجة الخمسة تبقى ~44px للزرّ داخل 242px.
 */
const SIDE = 'w-80 max-[1180px]:w-70';

export type ReviewProps = {
  readonly queue: readonly string[];
  readonly activityTitle: string;
  readonly onClose: () => void;
};

export function Review({ queue, activityTitle, onClose }: ReviewProps) {
  const [at, setAt] = useState(0);
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  /**
   * مساعد المراجعة — مسوّدة تملأ الحقلين ولا تحفظ شيئاً.
   *
   * `model` يبقى `null` حين لا مفتاح مضبوط، وعندها **يختفي الزرّ تماماً**
   * لا يظهر معطّلاً: زرٌّ لا يعمل يجعل المعلم يظنّ أن شيئاً تعطّل.
   */
  const [model, setModel] = useState<ActiveModel>(null);
  const [suggesting, setSuggesting] = useState<string | null>(null);
  const [suggestNote, setSuggestNote] = useState<string | null>(null);

  useEffect(() => {
    void bridge()
      .aiActiveModel()
      .then(setModel)
      .catch(() => setModel(null));
  }, []);

  /**
   * يطلب مسوّدة تقييم لإجابة نصّية.
   *
   * **ولا يحفظ.** يملأ الدرجة والتعليق في الحقلين اللذين يعدّلهما المعلم، ثم
   * يضغط هو «حفظ» كما كان يفعل. فالدرجة التي تصل الطالب يكتبها معلمه.
   */
  const suggest = async (questionId: string) => {
    if (detail === null) return;
    setSuggesting(questionId);
    setSuggestNote(null);
    try {
      const result = await bridge().activitySuggestReview({
        requestId: `review-${detail.submissionId}-${questionId}-${Date.now()}`,
        submissionId: detail.submissionId,
        questionId,
      });

      if (result.status === 'ok') {
        if (result.grade !== null) setScore(Math.round(result.grade));
        if (result.comment !== null) setComment(result.comment);
        setSuggestNote(
          result.grade === null
            ? 'اقتُرح تعليق بلا درجة — ضع الدرجة بنفسك. راجِع قبل الحفظ.'
            : 'مسوّدة — راجِعها وعدّلها، ثم احفظ.',
        );
      } else if (result.status === 'no_provider') {
        setSuggestNote('لا مفتاح ذكاء اصطناعي مضبوط. افتح «الذكاء الاصطناعي» في الإعدادات.');
      } else if (result.status === 'cancelled') {
        setSuggestNote(null);
      } else {
        setSuggestNote(result.message);
      }
    } catch {
      setSuggestNote('تعذّر طلب الاقتراح. أعد المحاولة.');
    } finally {
      setSuggesting(null);
    }
  };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);

  const current = queue[at];

  useEffect(() => {
    if (current === undefined) return;
    let alive = true;
    setDetail(null);
    void (async () => {
      try {
        const found = await bridge().submissionGet({ id: current });
        if (!alive) return;
        setDetail(found);
        setScore(found.score);
        setComment(found.comment ?? '');
        setError(null);
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : 'تعذّر فتح هذه الإجابة.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [current]);

  const save = async (advance: boolean) => {
    if (detail === null || score === null) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await bridge().submissionReview({
        submissionId: detail.submissionId,
        score,
        comment: comment.trim() === '' ? null : comment.trim(),
      });
      setDone((count) => count + 1);
      if (advance && at < queue.length - 1) {
        setAt((index) => index + 1);
      } else {
        setDetail(saved);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر حفظ التصحيح.');
    } finally {
      setBusy(false);
    }
  };

  if (current === undefined) {
    return (
      <div className="m-auto flex flex-col items-center gap-3 text-text-muted">
        <p>لا إجابة في هذا الطابور.</p>
        <Button variant="secondary" onClick={onClose}>
          العودة إلى الإجابات
        </Button>
      </div>
    );
  }

  const last = at >= queue.length - 1;

  return (
    <div className="flex min-h-0 grow flex-col gap-3">
      <header className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          icon={<Icon name="chevron-next" size={17} />}
          onClick={onClose}
        >
          الإجابات
        </Button>
        <div>
          <div className="text-t-h3">مراجعة الإجابات</div>
          <div className="text-t-label text-text-muted">{activityTitle}</div>
        </div>
        {/*
          «٣ من ٧» — موضع المعلم في الطابور، في الطرف المقابل بـ`ms-auto` مكان
          الفاصل المرن، وعرضه ثابت فلا يقفز بين إجابة وأخرى.
        */}
        <span
          className={cn(
            'ms-auto rounded-full border border-border bg-canvas px-3 py-1.5',
            'text-t-label font-semibold tabular-nums text-text-2',
          )}
        >
          {ar(at + 1)} من {ar(queue.length)}
        </span>
      </header>

      {error !== null ? (
        <Alert tone="error" live>
          {error}
        </Alert>
      ) : null}

      {detail === null ? (
        <div className="m-auto text-text-muted">نفتح الإجابة…</div>
      ) : (
        <div className="flex min-h-0 grow gap-3.5 overflow-auto">
          <Card className="min-w-0 grow">
            <CardContent className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2.5 border-b border-border pb-3.5">
                <span
                  className={cn(
                    'flex size-9.5 shrink-0 items-center justify-center rounded-full',
                    'bg-primary-soft text-t-h2 text-primary-on-soft',
                  )}
                  aria-hidden
                >
                  {detail.studentName.trim().charAt(0)}
                </span>
                <div>
                  <div className="text-t-body font-bold">{detail.studentName}</div>
                  <div className="text-t-label text-text-muted">أرسل {when(detail.submittedAt)}</div>
                </div>
                {/* `ms-auto` تدفع الشارة إلى الطرف المقابل — مكان الفاصل المرن سابقاً. */}
                {detail.status === 'reviewed' ? (
                  <Badge className="ms-auto" tone="ok">
                    صُحّحت
                  </Badge>
                ) : (
                  <Badge className="ms-auto" tone="pending">
                    بانتظار المراجعة
                  </Badge>
                )}
              </div>

              {detail.answers.map((answer) => (
                <section
                  key={answer.questionId}
                  className={cn(
                    'flex flex-col gap-1.5 border-t border-dashed border-border pt-3.5',
                    // أوّل سؤال يلي فاصلَ اسم الطالب، فخطٌّ ثانٍ فوقه ازدواج.
                    '[&:first-of-type]:border-t-0',
                  )}
                >
                  <div className="text-t-label font-semibold text-text-muted">السؤال</div>
                  <p className="text-t-body">{answer.prompt}</p>

                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="text-t-label font-semibold text-text-muted">إجابة الطالب</span>
                    {answer.type === 'text' && answer.studentAnswer !== '' ? (
                      <span className="text-t-label text-text-muted">
                        {ar(words(answer.studentAnswer))} كلمة
                      </span>
                    ) : null}
                    {/* الصواب الآليّ لسؤال الاختيار وحده — والنصّي بلا حكم مسبق. */}
                    {answer.correct === null ? null : answer.correct ? (
                      <Badge tone="ok">صحيحة</Badge>
                    ) : (
                      <Badge tone="error">خاطئة</Badge>
                    )}
                  </div>

                  {answer.studentAnswer === '' ? (
                    <p className="text-t-label text-text-muted">لم يجب عن هذا السؤال.</p>
                  ) : (
                    /*
                     * إجابة الطالب بمقياس القراءة وبأسطرها كما كتبها: المعلم
                     * يقرأ فقرةً كتبها طفل، لا حقلاً في جدول.
                     *
                     * و18px في سلّم المعلّم اسمها `t-h2` — أعلى مقاسٍ فيه دون
                     * العناوين الكبيرة. ووزنُها وسطرُها يُردّان إلى القراءة:
                     * السلّم يعطي هذا المقاس وزنَ عنوانٍ لأنه لم يُصنع لفقرة.
                     * (وسلّم الطالب `s-reading` لا يُستعار هنا — شاشة معلّم.)
                     */
                    <p
                      className={cn(
                        'rounded-md border border-border bg-canvas px-3.5 py-3',
                        'text-t-h2 font-normal leading-relaxed whitespace-pre-wrap',
                      )}
                    >
                      {answer.studentAnswer}
                    </p>
                  )}

                  {/*
                    الاقتراح للإجابة النصّية وحدها: سؤال الاختيار يُصحَّح
                    بمفتاحه (D12)، وطلبُ رأي نموذج فيه إنفاقٌ بلا فائدة.

                    ويُذكر أن إجابة الطالب تُرسَل إلى مزوّد المعلم — هذا أول
                    مسار يخرج فيه نصٌّ كتبه طالب من الجهاز بقرار المعلم، فلا
                    يُفعل صامتاً. والتنويه بجانب الزرّ لا في مكان آخر من
                    الشاشة: ما يُرسَل إلى الخارج يُقال عند لحظة الإرسال، لا في
                    صفحة إعدادات يقرؤها المعلم مرة ثم ينساها.
                  */}
                  {model !== null && answer.type === 'text' && answer.studentAnswer !== '' ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {suggesting === answer.questionId ? (
                        <Button variant="secondary" size="sm" disabled disabledReason="جارٍ الاقتراح…">
                          اقترح تقييماً
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => void suggest(answer.questionId)}
                        >
                          اقترح تقييماً
                        </Button>
                      )}
                      <span className="text-t-label text-text-muted">
                        تُرسَل إجابة الطالب إلى مزوّدك ({model.label}). المسوّدة لا تُحفظ حتى تحفظها.
                      </span>
                    </div>
                  ) : null}

                  {answer.expectedAnswer === null || answer.expectedAnswer === '' ? null : (
                    <>
                      <div className="text-t-label font-semibold text-text-muted">
                        الإجابة المتوقَّعة — للمقارنة فقط
                      </div>
                      {/* بحدّ خافت: مرجعٌ للمقارنة لا معيارٌ حرفيّ يُطابَق عليه. */}
                      <p
                        className={cn(
                          'rounded-sm border border-dashed border-border px-3.5 py-2.5',
                          'text-t-label text-text-2',
                        )}
                      >
                        {answer.expectedAnswer}
                      </p>
                    </>
                  )}
                </section>
              ))}
            </CardContent>
          </Card>

          <aside className={cn('flex shrink-0 flex-col gap-3', SIDE)}>
            <Card>
              <CardContent className="flex flex-col gap-2.5">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-t-body font-semibold">الدرجة</h3>
                  <span className="text-t-label text-text-muted">من ٥</span>
                </div>
                {/* نتيجة الاقتراح فوق أزرار الدرجة — حيث ينظر المعلم بعد الضغط. */}
                {suggestNote === null ? null : (
                  <p
                    className={cn(
                      'rounded-md border border-border bg-surface-2 px-3 py-2.5',
                      'text-t-label text-text-2',
                    )}
                    role="status"
                  >
                    {suggestNote}
                  </p>
                )}
                <div className="flex gap-1.5" role="radiogroup" aria-label="الدرجة من خمسة">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={score === value}
                      /*
                       * 44px لا `--height-control`: خمسة أزرار في صفّ واحد
                       * يصيبها المعلم بالفأرة بسرعة وهو يقرأ الورقة بجانبها.
                       */
                      className={cn(
                        'h-11 grow basis-0 rounded-md border text-t-h2 font-bold',
                        score === value
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-surface text-text-2',
                      )}
                      onClick={() => setScore(value)}
                    >
                      {ar(value)}
                    </button>
                  ))}
                </div>
                {score === 0 ? (
                  <Alert tone="pending">صُحّحت تلقائياً بصفر — اختر درجة إن أردت تعديلها.</Alert>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex flex-col gap-2.5">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-t-body font-semibold">تعليق للطالب</h3>
                  <span className="text-t-label text-text-muted">اختياري</span>
                </div>
                <Textarea
                  rows={4}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="اكتب ما يفيده في المرة القادمة…"
                  aria-label="تعليق للطالب"
                />
                <div className="flex flex-wrap gap-1.5">
                  {REVIEW_QUICK_COMMENTS.map((text) => (
                    <Button
                      key={text}
                      variant="secondary"
                      size="sm"
                      className="rounded-full"
                      // تُدرَج في الحقل ولا تُرسل وحدها: المعلم يراها قبل حفظها.
                      onClick={() => setComment((current) => (current === '' ? text : `${current} ${text}`))}
                    >
                      {text}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col gap-2">
              {score === null || busy ? (
                <Button
                  variant="primary"
                  disabled
                  disabledReason={busy ? 'جارٍ الحفظ…' : 'اختر درجة أولاً.'}
                >
                  {last ? 'حفظ وإنهاء' : 'حفظ والانتقال للتالي'}
                </Button>
              ) : (
                <Button variant="primary" onClick={() => void save(true)}>
                  {last ? 'حفظ وإنهاء' : 'حفظ والانتقال للتالي'}
                </Button>
              )}
              {score === null || busy ? null : (
                <Button variant="secondary" onClick={() => void save(false)}>
                  حفظ والبقاء هنا
                </Button>
              )}
            </div>

            <p className="text-t-label text-text-muted">
              راجعتَ {ar(done)} من {ar(queue.length)} في هذه الجلسة
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}

function words(text: string): number {
  return text.trim().split(/\s+/).filter((word) => word !== '').length;
}
