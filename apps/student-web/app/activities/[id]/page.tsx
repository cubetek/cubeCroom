import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { currentStudent } from '@/lib/session';
import { readActivity } from '@/lib/activities';
import { buttonVariants, cn } from '@cubecroom/ui';
import { ActivityRunner } from './ActivityRunner';
import { Submitted } from './Submitted';
import { LinkWatch } from '../../LinkWatch';
import { AskHelp } from '../../lessons/[id]/AskHelp';
import { STUDENT_AI_NOTICE } from '@cubecroom/core';

/**
 * S07 · S08 — النشاط عند الطالب.
 *
 * **الخادم هو من يقرّر أيّ الشاشتين تُعرض**، لا الصفحة: طالبٌ أرسل ثم أعاد فتح
 * الرابط يرى إيصاله، لا نموذجاً فارغاً يملؤه مرة ثانية. والقرار مبنيّ على صفّ
 * التسليم في القاعدة — وهو المصدر نفسه الذي يمنع الإرسال المكرر.
 */
export const dynamic = 'force-dynamic';

/**
 * عمود الطالب — نسخةٌ عن `lessons/page.tsx`، وشرحُ أرقامه هناك.
 *
 * و`--student-frame` هنا ليس زينة: `StudentActivityView` داخل `ActivityRunner`
 * يقرؤه ليعرف عرضه. وبلا هذا السطر يسري احتياطيُّه — ٣٦٠px المرسومة لمعاينة
 * المعلم — فتبقى بطاقة الأسئلة شريطاً ملتصقاً بحافة عمودٍ عرضه ٩٩٢px.
 */
const PAGE = cn(
  'mx-auto flex min-h-svh max-w-[460px] flex-col gap-3 px-4 pt-5 pb-8 wrap-anywhere',
  '[--student-frame:100%]',
  'tablet:max-w-[700px]',
  'wide:max-w-[1040px] wide:px-6 wide:pt-6 wide:[--student-frame:760px]',
);

const BACK = cn(buttonVariants({ variant: 'secondary' }), 'self-start text-s-caption');

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
  const state = readActivity(identity, id);
  if (state === null) notFound();

  /*
   * الإيصال يُلفّ كذلك — وهو أشدّ الحالات لبساً: الطالب أرسل إجابته للتوّ
   * وينظر إلى تأكيدها، فإن نقر «العودة إلى الفصل» بعد انتهاء الحصة رأى خطأ
   * متصفّح مكان الطمأنة.
   */
  if (state.status === 'submitted') {
    return (
      <LinkWatch>
        <Submitted activity={state.activity} receipt={state.receipt} />
      </LinkWatch>
    );
  }

  return (
    <LinkWatch>
      <main className={PAGE}>
        <Link href="/activities" className={BACK}>
          الأنشطة
        </Link>
        <ActivityRunner activity={state.activity} />
        {/*
          مخفيّة تماماً لا معطّلة (§23 · D10): البوّابات الثلاث تُحسب في
          الخادم، وهذا يعرض ما سمحت به. والمراجعة على الدرس المرتبط — فما
          يصل النموذج هو ما كتبه المعلم، لا أسئلة النشاط ولا مفتاحها.
        */}
        {state.activity.helpLessonId === null ? null : (
          <AskHelp
            lessonId={state.activity.helpLessonId}
            activityId={state.activity.id}
            notice={STUDENT_AI_NOTICE}
          />
        )}
      </main>
    </LinkWatch>
  );
}
