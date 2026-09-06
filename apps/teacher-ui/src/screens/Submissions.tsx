'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  Icon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ar,
  cn,
} from '@cubecroom/ui';
import type {
  ActivitySubmissions,
  ChoiceBreakdownResult,
  ExportedResults,
  SubmissionRow,
} from '@cubecroom/contracts';
import { bridge } from '../lib/bridge';
import { Review } from './Review';
import { when } from './Lessons';

/**
 * T17Submissions · T17Empty — إجابات النشاط.
 *
 * الجدول يعدّ **الفصل كلّه** لا المسلِّمين وحدهم: «لم يرسل بعد» صفٌّ مثل غيره.
 * معلمٌ يرى قائمة المسلِّمين وحدها لا يعرف من ينقصه إلا بمقارنتها بكشفه —
 * وذلك عملٌ يدويّ يفعله في كل حصة.
 *
 * والصفحة تُحدَّث كل خمس ثوانٍ ما دامت الحصة تجري: اللوح يَعِد نصّاً بأن
 * «كل إجابة ستظهر هنا فور وصولها — لا حاجة لتحديث الصفحة»، والوعد يُنفَّذ لا
 * يُكتب فقط.
 */

/*
 * عرض الأعمدة الثلاثة الضيّقة — 150px، وتنكمش إلى 130px تحت 1180px.
 *
 * على الحاسوب المدرسيّ الضيّق يبقى للجدول 719px، فتحجز أعمدة «وقت الإرسال»
 * و«الحالة» و«الدرجة» 450px منها ولا يبقى لاسم الطالب إلا 106px بعد الصورة
 * والحشوة: «عبدالرحمن الشمراني» يحتاج 122px فيلتفّ سطرين، ويرتفع كل صفّ في
 * كشف الفصل. و130px تكفي أعرض محتوى في هذه الأعمدة — شارة «بانتظار المراجعة»
 * 101px مع 28px حشوة الخلية.
 */
const NARROW = 'w-37.5 max-[1180px]:w-32.5';

type Filter = 'pending' | 'reviewed' | 'missing';

export type SubmissionsProps = {
  readonly activityId: string;
  readonly onBack: () => void;
};

export function Submissions({ activityId, onBack }: SubmissionsProps) {
  const [state, setState] = useState<ActivitySubmissions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [queue, setQueue] = useState<string[] | null>(null);
  /**
   * توزيع إجابات الاختيار — يُطلب عند الفتح لا عند التحميل.
   *
   * المعلم يفتحه حين يريد أن يعرف **أين أخطأ صفُّه**، لا مع كل تحديث للجدول
   * كل خمس ثوانٍ. وهو عدٌّ محلّيّ رخيص، لكن طلبه بلا سبب ضجيجٌ في مسار ساخن.
   */
  const [breakdown, setBreakdown] = useState<ChoiceBreakdownResult | null>(null);
  const [breakdownOpen, setBreakdownOpen] = useState(false);
  /** ما بعد التصدير: اسم الملفّ ومكانه — لا «تمّ» مجرَّدة لا تقول أين ذهب. */
  const [exported, setExported] = useState<ExportedResults | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await bridge().activitySubmissions({ id: activityId }));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر فتح إجابات هذا النشاط.');
    }
  }, [activityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportResults = async () => {
    setError(null);
    try {
      setExported(await bridge().activityExportResults({ id: activityId }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر تصدير النتائج.');
    }
  };

  const openBreakdown = async () => {
    setBreakdownOpen(true);
    try {
      setBreakdown(await bridge().activityChoiceBreakdown({ id: activityId }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر قراءة توزيع الإجابات.');
      setBreakdownOpen(false);
    }
  };

  // التحديث يتوقّف أثناء المراجعة: تغيّر الجدول تحت يد المعلم يربكه لا يفيده.
  useEffect(() => {
    if (queue !== null) return;
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load, queue]);

  if (queue !== null && state !== null) {
    return (
      <Review
        queue={queue}
        activityTitle={state.title}
        onClose={() => {
          setQueue(null);
          void load();
        }}
      />
    );
  }

  if (state === null) {
    return <div className="m-auto text-text-muted">{error ?? 'نقرأ الإجابات…'}</div>;
  }

  const visible =
    filter === null ? state.rows : state.rows.filter((row) => row.status === filter);
  const pendingIds = state.rows
    .filter((row) => row.status === 'submitted' && row.submissionId !== null)
    .map((row) => row.submissionId as string);

  return (
    <div className="flex min-h-0 grow flex-col gap-3 overflow-auto">
      <header className="flex flex-wrap items-center gap-2.5">
        <Button
          variant="secondary"
          size="sm"
          icon={<Icon name="chevron-next" size={17} />}
          onClick={onBack}
        >
          الأنشطة
        </Button>
        <h3 className="text-t-h3">{state.title}</h3>
        {state.status === 'published' ? (
          <Badge tone="ok">منشور للطلاب</Badge>
        ) : (
          <Badge tone="draft">مسودة</Badge>
        )}
        {/* `ms-auto` تدفع الزرّ إلى الطرف المقابل — مكان الفاصل المرن سابقاً. */}
        {pendingIds.length > 0 ? (
          <Button variant="primary" className="ms-auto" onClick={() => setQueue(pendingIds)}>
            بدء المراجعة ({ar(pendingIds.length)})
          </Button>
        ) : null}
      </header>

      {error !== null ? (
        <Alert tone="error" live>
          {error}
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Stat label="أرسلوا إجاباتهم" value={state.submitted} note={`من ${ar(state.roster)} طالباً`} />
        <Stat label="بانتظار مراجعتك" value={state.pending} />
        <Stat label="لم يرسلوا بعد" value={state.missing} />
      </div>

      {/*
        «أين أخطأ صفّي؟» — سؤالٌ لم يكن للمعلم طريقٌ إليه.
        التصحيح الآليّ يعطيه درجاتٍ ولا يقول أين اشترك الصفّ في الخطأ، فيقرأ
        ثلاثين ورقة ليكتشف ذلك، أو لا يقرأ فيمضي ولا يعرف.
      */}
      {/*
        الملفّ يخرج إلى مجلدٍ معلوم ثم يُفتح — لا نافذة حفظ تسأل معلماً غير
        تقنيّ عن مسار، فيحفظ حيث لا يجده. وهو نمط النسخ الاحتياطي نفسه.
      */}
      {exported !== null ? (
        <Alert tone="ok" className="mb-4">
          {/*
            زرّ «إخفاء» ظاهر بنصّه لا بأيقونة `onDismiss`: الفحص البصريّ ينقر
            بالنصّ المرئي، وأيقونةٌ باسمٍ مسموع وحده لا يبلغها.
          */}
          <div className="flex flex-wrap items-center gap-3">
            <span>
              صُدِّر {ar(exported.rows)} صفّاً إلى «{exported.fileName}».
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void bridge().activityOpenExports()}
            >
              فتح المجلد
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setExported(null)}>
              إخفاء
            </Button>
          </div>
        </Alert>
      ) : null}

      {state.submitted > 0 && !breakdownOpen ? (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => void openBreakdown()}>
            أين أخطأ صفّي؟
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void exportResults()}>
            تصدير النتائج
          </Button>
          <span className="text-t-label text-text-muted">
            التوزيع والتصدير كلاهما على جهازك — بلا إنترنت ولا مفتاح.
          </span>
        </div>
      ) : null}

      {/*
        لوحة توزيع إجابات الاختيار — تُفتح بطلب المعلم ولا تُعرض دائماً:
        الجدول أسفلها هو عمله اليومي، وهذه نظرةٌ يأخذها حين يسأل عن الصفّ ككلّ
        لا عن طالب بعينه.
      */}
      {breakdownOpen && breakdown !== null ? (
        <Card className="mb-5">
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-t-h2">أين أخطأ صفّك</h3>
              <Button variant="ghost" size="sm" onClick={() => setBreakdownOpen(false)}>
                إخفاء
              </Button>
            </div>

            {breakdown.questions.length === 0 ? (
              <p className="text-t-label text-text-muted">
                لا أسئلة اختيار في هذا النشاط — والأسئلة النصّية تُقرأ في المراجعة.
              </p>
            ) : (
              breakdown.questions.map((question) => (
                <div
                  key={question.questionId}
                  className="flex flex-col gap-1.5 border-t border-border pt-4"
                >
                  <p className="text-t-body font-semibold">{question.prompt}</p>
                  <div className="text-t-label tabular-nums text-text-muted">
                    أجاب {ar(question.answered)} · أصاب {ar(question.correctCount)}
                  </div>

                  {question.topWrong === null ? (
                    <p className="text-t-label text-text-muted">لا خطأ متكرّر في هذا السؤال.</p>
                  ) : (
                    /* الخطأ الأكثر تكراراً هو سطر اللوحة كلها — يُقرأ قبل الجدول تحته. */
                    <p className="rounded-md border border-border bg-surface-2 px-3 py-2.5 text-t-body">
                      أكثر خطأ تكراراً: «{question.topWrong.text}» — اختاره{' '}
                      {ar(question.topWrong.picked)} من {ar(question.answered)}
                    </p>
                  )}

                  <ul className="mt-1 flex flex-col gap-1">
                    {question.options.map((option) => (
                      <li
                        key={option.optionId}
                        className="flex items-center gap-3 text-t-label"
                      >
                        {/*
                          شارتان بلا أيقونة ولا درجة من درجات `Badge`: «خطأ» هنا
                          ليست حالة خطأ بل خيارٌ غير صحيح، وحمرتُها على أربعة
                          خيارات في كل سؤال تصرخ بما لا معنى له. والعرض الأدنى
                          يصفّ النصوص تحت بعضها بين سؤال وآخر.
                        */}
                        <span
                          className={cn(
                            'min-w-11 shrink-0 rounded-full border px-2 py-0.5',
                            'text-center text-t-badge',
                            option.isCorrect
                              ? 'border-ok-border bg-ok-bg text-ok-text'
                              : 'border-border bg-surface-2 text-text-muted',
                          )}
                        >
                          {option.isCorrect ? 'الصحيح' : 'خطأ'}
                        </span>
                        <span className="flex-1">{option.text}</span>
                        {/* العدد بعرض ثابت فلا تهتزّ الأعمدة بين سؤال وآخر. */}
                        <span className="min-w-[2ch] shrink-0 text-end tabular-nums text-text-2">
                          {ar(option.picked)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))
            )}

            {/*
              إجاباتٌ فقدت خيارها تُقال ولا تُطوى في الصفر: «لا أخطاء شائعة» عن
              إجاباتٍ فُقدت كذبٌ مطمئن.
            */}
            {breakdown.staleAnswers > 0 ? (
              <p className="text-t-label text-text-muted">
                {ar(breakdown.staleAnswers)} إجابة لم يعد خيارها موجوداً — حُذف من النشاط بعد
                وصولها، فلا تُحسب أعلاه.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {state.submitted === 0 ? (
        <div className="m-auto flex w-130 max-w-full flex-col items-center gap-2.5 text-center">
          <h3 className="text-t-h1">لم يرسل أحد إجابته بعد</h3>
          <p className="text-t-body text-text-2">
            {state.status === 'published'
              ? 'النشاط ظاهر الآن لطلاب الفصل. ستظهر كل إجابة هنا فور وصولها — لا حاجة لتحديث الصفحة.'
              : 'النشاط مسودة، فلا يراه أحد من طلابك. انشره ليصلهم.'}
          </p>
          <p className="text-t-caption text-text-muted">
            يجد الطلاب النشاط في صفحتهم الرئيسية وفي أسفل الدرس المرتبط.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="ترشيح الإجابات">
            <Chip active={filter === null} onClick={() => setFilter(null)} count={state.roster}>
              الكل
            </Chip>
            <Chip
              active={filter === 'pending'}
              onClick={() => setFilter('pending')}
              count={state.pending}
            >
              بانتظار المراجعة
            </Chip>
            <Chip
              active={filter === 'reviewed'}
              onClick={() => setFilter('reviewed')}
              count={state.reviewed}
            >
              صُحّحت
            </Chip>
            <Chip
              active={filter === 'missing'}
              onClick={() => setFilter('missing')}
              count={state.missing}
            >
              لم يرسلوا
            </Chip>
          </div>

          <Table label="جدول إجابات الطلاب">
            <TableHeader>
              <TableRow>
                <TableHead>الطالب</TableHead>
                <TableHead className={NARROW}>وقت الإرسال</TableHead>
                <TableHead className={NARROW}>الحالة</TableHead>
                <TableHead className={NARROW}>الدرجة</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => (
                <TableRow key={row.studentId}>
                  <TableCell>
                    <div className="flex items-center gap-2.5 font-semibold text-text">
                      <span
                        className={cn(
                          'flex size-7.5 shrink-0 items-center justify-center rounded-full',
                          'bg-primary-soft font-bold text-primary-on-soft',
                        )}
                        aria-hidden
                      >
                        {row.studentName.trim().charAt(0)}
                      </span>
                      {row.studentName}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums text-text-2">
                    {row.submittedAt === null ? '—' : when(row.submittedAt)}
                  </TableCell>
                  <TableCell>{statusBadge(row)}</TableCell>
                  <TableCell className="tabular-nums text-text-2">
                    {row.score === null ? '—' : `${ar(row.score)} / ٥`}
                  </TableCell>
                  <TableCell>
                    {row.submissionId === null ? null : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setQueue([row.submissionId as string])}
                      >
                        {row.status === 'reviewed' ? 'فتح' : 'مراجعة'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}

/**
 * «صُحّحت تلقائياً» تُقال حين تكون كذلك: تسليمٌ صار `reviewed` بلا تعليق ولا
 * مرور بشاشة المراجعة صحّحته الآلة — والمعلم يستحق أن يعرف أيّ درجة كتبها هو.
 */
function statusBadge(row: SubmissionRow) {
  if (row.status === 'missing') return <span className="text-text-muted">لم يرسل بعد</span>;
  if (row.status === 'reviewed') return <Badge tone="ok">صُحّحت</Badge>;
  return <Badge tone="pending">بانتظار المراجعة</Badge>;
}

/** البطاقة تنكمش إلى 180px ثم تلتفّ — ثلاثٌ في سطر على الشاشة الواسعة. */
function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <Card className="flex-1 basis-45">
      <CardContent className="flex flex-col gap-0.5">
        <div className="text-t-label text-text-muted">{label}</div>
        {/* عرض ثابت حتى لا يهتزّ الرقم مع كل تحديث تلقائي. */}
        <div className="min-w-[2ch] text-t-display tabular-nums">{ar(value)}</div>
        {note === undefined ? null : (
          <div className="text-t-caption tabular-nums text-text-muted">{note}</div>
        )}
      </CardContent>
    </Card>
  );
}

function Chip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      /*
       * زرٌّ خامّ لا `TabsTrigger`: الترشيح لا يفتح لوحاً، والرقائق الأربع
       * تكتب `aria-selected` بنفسها. وRadix يفرض `aria-controls` ولوحاً لكلّ
       * رقيقة — بنيةٌ لا يحتاجها جدولٌ واحد يُرشَّح في مكانه.
       */
      className={cn(
        'h-(--height-control-sm) rounded-full border px-3 text-t-label',
        active
          ? 'border-primary bg-primary-soft font-semibold text-primary-on-soft'
          : 'border-border bg-surface text-text-2',
      )}
      onClick={onClick}
    >
      {children} <span className="tabular-nums opacity-75">{ar(count)}</span>
    </button>
  );
}
