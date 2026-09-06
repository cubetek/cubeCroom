import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { currentStudent } from '@/lib/session';
import { STUDENT_AI_NOTICE } from '@cubecroom/core';
import { formatBytes, when } from '@cubecroom/contracts';
import { buttonVariants, cn } from '@cubecroom/ui';
import { LessonContent } from '@cubecroom/ui/components/lesson-content';
import { AskHelp } from './AskHelp';
import { markRead, readLesson } from '@/lib/lessons';
import { LinkWatch } from '../../LinkWatch';

/**
 * S06 — عارض الدرس.
 *
 * الكتل تُرسَم عناصرَ مصنَّفة، لا HTML يُحقن في الصفحة: محتوى الدرس يكتبه
 * المعلم ويُعرض على جهاز الطالب، وأي مسار يمرّ فيه نصّ حرّ إلى `innerHTML`
 * يفتح باب تنفيذ شيفرة في متصفّحه.
 *
 * وفتحُ الصفحة هو حدث القراءة نفسه: لا زرّ «علّمه مقروءاً» في اللوح، والطالب
 * لا يُطلب منه أن يعلن ما فعله.
 */
export const dynamic = 'force-dynamic';

/** عمود الطالب — نسخةٌ عن `lessons/page.tsx`، وشرحُ أرقامه هناك. */
const PAGE = cn(
  'mx-auto flex min-h-svh max-w-[460px] flex-col gap-3 px-4 pt-5 pb-8 wrap-anywhere',
  '[--student-frame:100%]',
  'tablet:max-w-[700px]',
  'wide:max-w-[1040px] wide:px-6 wide:pt-6 wide:[--student-frame:760px]',
);

/** رابط الخروج من الدرس — يبدو زرّاً ثانوياً، ويبقى `<a>` في شجرة الوثيقة. */
const BACK = cn(buttonVariants({ variant: 'secondary' }), 'self-start text-s-caption');

/**
 * **عرض القراءة يبقى محدوداً ولو اتّسعت الصفحة إلى ١٠٤٠px** (القرار D15):
 * سطرٌ يمتدّ ألف بكسل يفقد القارئ موضعه في نهايته — وهذا نصّ يقرؤه طفل.
 * والألواح الثلاثة تتقاسم الحدّ نفسه فلا تتدرّج حوافّها.
 */
const READING_COLUMN = 'wide:max-w-[760px]';

const SURFACE = 'rounded-lg border border-hairline bg-surface';

/** هدف لمس مريح على لوحيّ — أكبر من ارتفاع الحقل المعتاد. */
const TOUCH_ROW = 'block min-h-[52px]';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const list = await headers();
  const cookie = list.get('cookie');
  const identity = currentStudent(
    new Request('http://local/', {
      headers: cookie === null ? {} : { cookie },
    }),
  );
  if (identity === null) redirect('/join');

  const { id } = await params;
  const lesson = readLesson(identity, id);
  if (lesson === null) notFound();

  markRead(identity, lesson.id);

  /*
   * الحارس يلفّ الصفحة كلها: الطالب يطول بقاؤه على درسٍ يقرؤه، وهو أطول ما
   * يبقى عليه بلا أن يسأل الخادم شيئاً — فكان أوّل من يرى خطأ المتصفّح.
   */
  return (
    <LinkWatch>
      <main className={PAGE}>
        <Link href="/lessons" className={BACK}>
          الدروس
        </Link>

        <article className={cn(SURFACE, READING_COLUMN, 'px-5 py-5.5')}>
          <h1 className="text-s-h1">{lesson.title}</h1>
          <div className="mt-1.5 text-s-caption text-text-muted">
            نُشر {when(lesson.publishedAt, { time: 'never' })}
            {lesson.teacherName !== '' ? ` · أ. ${lesson.teacherName}` : ''}
          </div>

          {lesson.blocks.length === 0 ? (
            <p className="mt-2.5 text-s-reading">لم يكتب معلمك محتوى هذا الدرس بعد.</p>
          ) : null}

          <LessonContent blocks={lesson.blocks} />
        </article>

        {lesson.attachmentList.length > 0 ? (
          <section className={cn(SURFACE, READING_COLUMN, 'flex flex-col gap-2.5 px-4.5 py-4')}>
            <h2 className="text-s-label font-semibold">المرفقات</h2>
            {lesson.attachmentList.map((file) => (
              <a
                key={file.id}
                className={cn(
                  TOUCH_ROW,
                  'rounded-md border border-hairline bg-canvas px-3.5 py-3',
                )}
                href={`/api/student/files/${file.id}`}
              >
                <span className="block font-semibold">{file.name}</span>
                <span className="text-s-caption text-text-muted">
                  {file.kind} · {formatBytes(file.sizeBytes)}
                </span>
              </a>
            ))}
          </section>
        ) : null}

        {/*
        «نشاط مرتبط بهذا الدرس» — اللوح يضعه أسفل المرفقات: الطالب يقرأ ثم
        يُطلب منه، لا العكس.

        وبلون أساسي لا محايد: هو الإجراء الوحيد المطلوب منه في هذه الصفحة،
        والمرفقات حوله مجرّد ملفات يفتحها إن شاء.
      */}
        {lesson.activityId === undefined ? null : (
          <Link
            href={`/activities/${lesson.activityId}`}
            className={cn(
              TOUCH_ROW,
              READING_COLUMN,
              'rounded-lg border border-primary bg-primary-soft px-4 py-3.5 text-primary-on-soft',
            )}
          >
            <span className="block font-semibold">نشاط مرتبط بهذا الدرس</span>
            <span className="text-s-caption">ابدأ النشاط</span>
          </Link>
        )}

        {/* لا تُعرض معطّلة: مخفيّة تماماً حين لا تكون مسموحة (§23 · D10). */}
        {lesson.aiEnabled ? <AskHelp lessonId={lesson.id} notice={STUDENT_AI_NOTICE} /> : null}
      </main>
    </LinkWatch>
  );
}
