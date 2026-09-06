import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ar, when } from '@cubecroom/contracts';
import { BrandMark, cn } from '@cubecroom/ui';
import { currentStudent } from '@/lib/session';
import { readLessons } from '@/lib/lessons';
import { StudentNav } from '../StudentNav';

/**
 * S05 — دروس الفصل.
 *
 * صفحة خادم: القائمة تُقرأ من القاعدة عند الطلب، فلا ينتظر الطالب نداءً
 * ثانياً ليرى ما نُشر له. والوسم «مقروء» أثرٌ حقيقي من `lesson_reads` لا
 * تخمين من تخزين المتصفح.
 */
export const dynamic = 'force-dynamic';

/**
 * عمود الطالب — **وهو نفسه في شاشاته الأربع**: القائمتان، وعارض الدرس، وصفحة
 * النشاط. طالبٌ ينتقل من قائمة إلى ما تفتحه لا يتغيّر عرض العمود تحته.
 *
 * ٤٦٠px قاعدةً: الألواح رُسمت على مقاس هاتف، ولا تمرير أفقيّ إطلاقاً —
 * `wrap-anywhere` تكسر الكلمة الطويلة والرابط داخل حدّهما بدل أن يجرّا
 * الصفحة كلّها.
 *
 * **٧٠٠px لا ٧٦٨px** عند التوسّع الأول: اللوحيّ الرأسي عرضه ٧٦٨px بالجهاز،
 * وشريط التمرير يقتطع منه فلا تتحقّق `768px` على بعض المتصفّحات — أي أن
 * اللوحيّ الذي ينصّ عليه `D15` يسقط من الاستعلام المكتوب على مقاسه هو. وبلا
 * هذه الخطوة يقفز العمود من ٤٦٠px إلى ١٠٤٠px بفارق بكسل واحد عند ٩٠٠px.
 *
 * **و`--student-frame` يُضبط هنا لا في `StudentActivityView`**: المكوّن مشترك
 * بين الطالب ومعاينة المعلم، فعرضه يتبع الصفحة التي تحويه. وقيمته ٧٦٠px فوق
 * ٩٠٠px لتوافق عرض القراءة أدناه، فلا يتجاور عمودان بعرضين مختلفين.
 */
const PAGE = cn(
  'mx-auto flex min-h-svh max-w-[460px] flex-col gap-3 px-4 pt-5 pb-8 wrap-anywhere',
  '[--student-frame:100%]',
  'tablet:max-w-[700px]',
  'wide:max-w-[1040px] wide:px-6 wide:pt-6 wide:[--student-frame:760px]',
);

/**
 * الدروس شبكةً فوق ٧٠٠px: الطالب يرى ما عنده دفعةً واحدة لا بالتمرير.
 * و`auto-fill` لا عددُ أعمدة ثابت — عمودان على اللوحيّ وثلاثة على الحاسوب،
 * بلا نقطة توقّف ثالثة لكلّ حالة.
 */
const CARDS =
  'flex flex-col gap-3 tablet:grid tablet:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]';

const CARD = 'block rounded-lg border border-hairline bg-surface px-4.5 py-4';

/**
 * وسم الحالة — سطرٌ عاديّ لا `Badge`.
 *
 * `Badge` يفرض أيقونةً ثابتة لكلّ درجة: علامةَ صحّ مع `ok` وقلماً مع `draft`.
 * و«جديد» بعلامة صحّ تقول للطالب إنه أنهى ما لم يبدأه — والأيقونة تكذب أشدّ
 * ممّا يفعل غيابها. والمعنى محمولٌ في النصّ نفسه هنا لا في اللون وحده.
 */
const PILL = 'shrink-0 rounded-full border px-2.5 py-0.5 text-s-caption font-bold';

export default async function Page() {
  const list = await headers();
  const cookie = list.get('cookie');
  const identity = currentStudent(
    new Request('http://local/', { headers: cookie === null ? {} : { cookie } }),
  );
  if (identity === null) redirect('/join');

  const data = readLessons(identity);
  if (data === null) redirect('/join');

  return (
    <main className={PAGE}>
      <header className="flex items-center gap-3 border-b border-hairline pb-3">
        <BrandMark />
        <div className="min-w-0">
          <h1 className="text-s-h1">الدروس</h1>
          <div className="text-s-caption text-text-muted">{data.className}</div>
        </div>
      </header>

      <p className="text-s-caption text-text-muted">
        {data.lessons.length === 0
          ? 'لم يُنشر أي درس بعد'
          : `${ar(data.lessons.length)} ${data.lessons.length === 1 ? 'درس منشور' : 'دروس منشورة'}`}
      </p>

      <div className={CARDS}>
        {data.lessons.map((lesson) => (
          <Link key={lesson.id} href={`/lessons/${lesson.id}`} className={CARD}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="grow text-s-body font-bold">{lesson.title}</span>
              {lesson.read ? (
                <span className={cn(PILL, 'border-hairline bg-canvas text-text-muted')}>مقروء</span>
              ) : (
                <span className={cn(PILL, 'border-ok-border bg-ok-bg text-ok-text')}>جديد</span>
              )}
            </div>
            {lesson.excerpt !== '' ? (
              <p className="mt-1.5 text-s-body text-text-2">{lesson.excerpt}</p>
            ) : null}
            <div className="mt-1.5 text-s-caption text-text-muted">
              نُشر {when(lesson.publishedAt, { time: 'never' })}
              {lesson.attachments > 0 ? ` · ${attachments(lesson.attachments)}` : ''}
            </div>
          </Link>
        ))}
      </div>

      <StudentNav />
    </main>
  );
}

function attachments(count: number): string {
  if (count === 1) return 'مرفق واحد';
  if (count === 2) return 'مرفقان';
  return `${ar(count)} مرفقات`;
}
