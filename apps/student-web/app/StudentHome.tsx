'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ar, when } from '@cubecroom/contracts';
import type {
  LessonSummary,
  StudentActivitySummary,
  StudentHome as HomeData,
} from '@cubecroom/contracts';
import { Badge, BrandMark, Card, cn } from '@cubecroom/ui';
import { LinkNotice } from './LinkWatch';
import { StudentNav } from './StudentNav';

/**
 * S04 — رئيسية الطالب.
 *
 * الترويسة والاسم يصلان من الخادم فيراهما الطالب فوراً بلا وميض «جارٍ
 * التحميل». والدروس تُجلب بعدها وتُحدَّث كل خمس ثوانٍ — اللوح يَعِد نصّاً
 * بأن «الصفحة تُحدَّث تلقائياً»، فالوعد ينفَّذ لا يُكتب فقط.
 *
 * وقسم «أنشطة مطلوبة منك» لا يظهر إلا حين يوجد مطلوب فعلاً: قسمٌ فارغ بعنوانه
 * يجعل الطالب يظن أن معلمه نسي أن يطلب منه شيئاً.
 */

/**
 * عمود الصفحة — قاعدته ٤٢٠px على الهاتف، ثمّ يتّسع خطوتين.
 *
 * ٧٠٠px لا ٧٦٨px: شريط التمرير يقتطع من عرض اللوحيّ الرأسي، فحدٌّ مكتوب على
 * ٧٦٨px بعينها لا يتحقّق على الجهاز الذي كُتب له. والخطوة نفسها في صفحة الدروس
 * فتتساوى الصفحتان.
 *
 * وبلا هذه الخطوة يقفز العمود من ٤٢٠px إلى ١٠٤٠px بفارق بكسل واحد عند ٩٠٠px،
 * وتبقى القوائم عموداً واحداً على شاشة تتّسع لعمودين.
 *
 * و`wrap-anywhere` ليست تزيّناً: عناوين المعلم ومقتطفاته تُرسم كما كتبها،
 * فرابطٌ أو اسم ملفّ بلا فراغ يخرج من البطاقة، وما تجاوز الصفحة يُقصّ عند حافة
 * النافذة بلا شريط تمرير — فالذيل لا يُقرأ ولا يُبلَّغ.
 */
const PAGE = cn(
  'mx-auto flex min-h-svh max-w-[420px] flex-col gap-3.5 px-4 pt-5 pb-8 wrap-anywhere',
  'tablet:max-w-[700px] wide:max-w-[1040px]',
);

/**
 * القوائم عمودٌ واحد على الهاتف، ومساراتٌ من ٣٠٠px من ٧٠٠px فصاعداً.
 *
 * و٧٠٠px لا ٦٨٠px: القائمة داخل بطاقة بحشوها وحدّها، فعمود ٦٨٠px يترك لها
 * ٦١٠px — أي مقاس مسارَين من ٣٠٠px بفجوتهما تماماً، فأيّ كسر بكسل يُسقطها إلى
 * مسار واحد.
 *
 * وخطوة ٩٠٠px في المصدر كانت تُعيد هذه الشبكة حرفاً بحرف، وهي سارية أصلاً من
 * ٧٠٠px — فلم يبقَ من تلك الخطوة إلا اتّساعُ العمود في `PAGE` أعلاه.
 */
const ITEMS = cn(
  'flex flex-col gap-2.5',
  'tablet:grid tablet:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]',
);

/** الفاصل بين عنصرين متجاورين — ويسقط عن الأول فلا يبدأ القائمةَ خطّ. */
const ITEM = 'flex flex-col gap-0.5 border-t border-hairline pt-2.5 first:border-t-0 first:pt-0';

/** هدف لمس مريح داخل قائمة كثيفة. */
const ITEM_LINK = 'flex flex-col gap-0.5 py-1.5 text-inherit';

const MUTED = 'text-s-caption text-text-muted';

export type StudentHomeProps = {
  readonly studentName: string;
  readonly className: string;
  readonly teacherName: string;
};

export function StudentHome({ studentName, className, teacherName }: StudentHomeProps) {
  const [lessons, setLessons] = useState<LessonSummary[] | null>(null);
  const [activities, setActivities] = useState<StudentActivitySummary[]>([]);
  const [ended, setEnded] = useState(false);
  /**
   * انقطاعٌ لا نعرف سببه — §17.
   *
   * **ولماذا حالةٌ ثانية غير «انتهت الحصة»:** إنهاء الحصة يُغلق خادم الطلاب
   * كلّه لا الرمز وحده. فلا يصل الطالبَ ٤٠٣ يقرؤها، بل **لا يصله شيء**؛
   * وكان الاستثناء يُبتلع صامتاً فيبقى ينظر إلى دروسٍ لم يعد يملكها.
   *
   * ولا يُقال له «أنهى معلمك الحصة» جزماً: الخروجُ من مدى Wi-Fi يعطي الأثر
   * نفسه بالضبط، وتخمينُ السبب أمام طفلٍ خرج من التغطية يجعله يظنّ أنه أُخرج
   * من صفّه. فيُقال ما نعرفه: انقطع الاتصال، وهذان سببان محتملان.
   */
  const [lost, setLost] = useState(false);

  const misses = useRef(0);

  /** ثلاث محاولات متتالية ≈ خمس عشرة ثانية — لا وميض عند تعثّرة واحدة. */
  const PATIENCE = 3;

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/student/lessons');
      misses.current = 0;
      setLost(false);
      if (response.status === 403 || response.status === 410) {
        setEnded(true);
        return;
      }
      const body = (await response.json()) as { data?: HomeData };
      if (body.data !== undefined) setLessons(body.data.lessons);

      const listed = await fetch('/api/student/activities');
      const activityBody = (await listed.json()) as { data?: StudentActivitySummary[] };
      if (activityBody.data !== undefined) setActivities(activityBody.data);
    } catch {
      /*
       * انقطاع لحظة يمرّ بلا أن يراه أحد؛ وانقطاعٌ يدوم يُقال. والقائمة
       * السابقة تبقى معروضة حتى ذلك الحين — فالطالب لا يفقد مكانه لتعثّرة.
       */
      misses.current += 1;
      if (misses.current >= PATIENCE) setLost(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);

  /*
   * الشاشتان — «انتهت الحصة» و«انقطع الاتصال» — في مكان واحد يشترك فيه كل
   * سطح الطالب. نصٌّ يُقال لطفل في لحظة قلق لا يُكتب في ثلاثة ملفات ثم
   * يُصلَح في واحد منها.
   */
  if (ended || lost) return <LinkNotice state={ended ? 'ended' : 'lost'} />;

  const [latest, ...rest] = lessons ?? [];
  const pending = activities.filter((activity) => activity.submittedAt === null);

  return (
    <main className={PAGE}>
      <header className="flex items-center gap-3 border-b border-hairline pb-3">
        <BrandMark />
        <div className="min-w-0 grow">
          <div className="text-s-body font-bold">{className}</div>
          {teacherName !== '' ? <div className={MUTED}>أ. {teacherName}</div> : null}
        </div>
        {/* الحرف الأول بديل الصورة — زخرفة لا معلومة، فلا يقرؤه قارئ الشاشة. */}
        <span
          className="flex size-9.5 shrink-0 items-center justify-center rounded-full bg-primary-soft text-s-body font-bold text-primary-on-soft"
          aria-hidden
        >
          {studentName.trim().charAt(0)}
        </span>
      </header>

      {lessons === null ? (
        <p className={MUTED}>نفتح فصلك…</p>
      ) : lessons.length === 0 && activities.length === 0 ? (
        <section className="flex flex-col gap-2.5">
          <h1 className="text-s-h1">أهلاً {studentName} — أنت الآن في الفصل</h1>
          <p className="text-s-body text-text-2">وافق معلمك على دخولك.</p>
          {/*
           * حدٌّ متقطّع لا مصمت: الصندوق يقول «هنا سيظهر شيء» لا «هنا شيء».
           * ولونه `border-input` لا `hairline` — الشعريّ يختفي على سطح أبيض
           * حين يتقطّع.
           */}
          <div className="flex flex-col gap-1.5 rounded-lg border border-dashed border-border-input bg-surface p-5">
            <div className="text-s-body font-bold">لم يُنشر أي درس بعد</div>
            <p className="text-s-body text-text-2">
              ستجد دروس معلمك وأنشطته هنا فور نشرها. لا حاجة لتحديث الصفحة.
            </p>
          </div>
          <p className={MUTED}>تُحدَّث الصفحة تلقائياً</p>
        </section>
      ) : (
        <>
          {latest !== undefined ? (
            <Card className="gap-2 px-5">
              <div className={cn('flex items-center gap-2', MUTED)}>
                آخر درس{' '}
                <span className="text-ok-text">نُشر {when(latest.publishedAt, { time: 'never' })}</span>
              </div>
              <h2 className="text-s-h2 font-bold">{latest.title}</h2>
              {latest.excerpt !== '' ? (
                <p className="text-s-body text-text-2">{latest.excerpt}</p>
              ) : null}
              <div className={MUTED}>{attachmentsLabel(latest.attachments)}</div>
              {/*
               * ٥٢px لا `--height-control`: هذا الفعل الأساسي الوحيد في
               * الشاشة، وهدفُه أكبر من هدف أزرار الطالب المعتادة.
               *
               * ولا يتمدّد مع البطاقة من ٧٠٠px: زرٌّ بعرض ٩٧٠px على شاشة
               * ١٣٦٦px عرضُه ثلاثة أضعاف ما رُسم له. و`self-start` منطقية
               * فتتبع RTL.
               */}
              <Link
                href={`/lessons/${latest.id}`}
                className={cn(
                  'mt-1 flex h-13 items-center justify-center rounded-md',
                  'bg-primary text-s-body font-semibold text-primary-foreground',
                  'tablet:max-w-[320px] tablet:self-start',
                )}
              >
                افتح الدرس
              </Link>
            </Card>
          ) : null}

          {pending.length > 0 ? (
            <Card className="gap-2.5 px-5">
              <div className="flex items-baseline gap-2.5">
                {/* العدّاد بجانب العنوان كما في اللوح — ودرجته `pending` لأنه مطلوبٌ لم يُنجَز. */}
                <h3 className="grow text-s-label font-semibold">
                  {/*
                    `text-s-caption` بيده: `Badge` مبنيّ بمقياس المعلّم
                    (`text-t-badge`)، و`sm` يصغر بالحشو لا بالخطّ أصلاً.
                  */}
                  أنشطة مطلوبة منك{' '}
                  <Badge tone="pending" size="sm" className="text-s-caption">
                    {ar(pending.length)}
                  </Badge>
                </h3>
                <Link href="/activities" className={MUTED}>
                  عرض الكل
                </Link>
              </div>
              <ul className={ITEMS}>
                {pending.map((activity) => (
                  <li key={activity.id} className={ITEM}>
                    <Link href={`/activities/${activity.id}`} className={ITEM_LINK}>
                      <span className="text-s-body font-semibold">{activity.title}</span>
                      <span className={MUTED}>
                        {activity.questionCount === 0
                          ? 'بلا أسئلة'
                          : `${ar(activity.questionCount)} ${activity.questionCount === 1 ? 'سؤال' : 'أسئلة'}`}
                        {' · لم تُرسل إجابتك بعد'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {rest.length > 0 ? (
            <Card className="gap-2.5 px-5">
              <div className="flex items-baseline gap-2.5">
                <h3 className="grow text-s-label font-semibold">دروس الفصل</h3>
                <Link href="/lessons" className={MUTED}>
                  عرض الكل
                </Link>
              </div>
              <ul className={ITEMS}>
                {rest.map((lesson) => (
                  <li key={lesson.id} className={ITEM}>
                    <Link href={`/lessons/${lesson.id}`} className={ITEM_LINK}>
                      <span className="text-s-body font-semibold">{lesson.title}</span>
                      <span className={MUTED}>
                        نُشر {when(lesson.publishedAt, { time: 'never' })}
                        {lesson.read ? " · مقروء" : ""}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <p className={MUTED}>تُحدَّث الصفحة تلقائياً</p>
        </>
      )}

      <StudentNav />
    </main>
  );
}

function attachmentsLabel(count: number): string {
  if (count === 0) return 'لا مرفقات';
  if (count === 1) return 'مرفق واحد';
  if (count === 2) return 'مرفقان';
  return `${ar(count)} مرفقات`;
}
