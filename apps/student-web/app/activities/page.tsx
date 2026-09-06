import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ar, when } from '@cubecroom/contracts';
import { BrandMark, cn } from '@cubecroom/ui';
import { currentStudent } from '@/lib/session';
import { readActivities } from '@/lib/activities';
import { StudentNav } from '../StudentNav';

/**
 * قائمة أنشطة الطالب.
 *
 * تتقاسم أنماطها مع قائمة الدروس عمداً: هما قائمتان في التطبيق نفسه على الجهاز
 * نفسه، وفرقٌ بصريّ بينهما يجعل الطالب يظن أنه انتقل إلى مكان آخر.
 *
 * **والأصناف أدناه منسوخة حرفياً عن `lessons/page.tsx`** — فما يتغيّر في
 * إحداهما يتغيّر في الأخرى. وشرحُ الأرقام (٤٦٠ · ٧٠٠ · ٩٠٠ · ١٠٤٠) هناك.
 */
export const dynamic = 'force-dynamic';

const PAGE = cn(
  'mx-auto flex min-h-svh max-w-[460px] flex-col gap-3 px-4 pt-5 pb-8 wrap-anywhere',
  '[--student-frame:100%]',
  'tablet:max-w-[700px]',
  'wide:max-w-[1040px] wide:px-6 wide:pt-6 wide:[--student-frame:760px]',
);

const CARDS =
  'flex flex-col gap-3 tablet:grid tablet:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]';

const CARD = 'block rounded-lg border border-hairline bg-surface px-4.5 py-4';

/** وسم الحالة — سطرٌ عاديّ لا `Badge`؛ السبب في `lessons/page.tsx`. */
const PILL = 'shrink-0 rounded-full border px-2.5 py-0.5 text-s-caption font-bold';

export default async function Page() {
  const list = await headers();
  const cookie = list.get('cookie');
  const identity = currentStudent(
    new Request('http://local/', { headers: cookie === null ? {} : { cookie } }),
  );
  if (identity === null) redirect('/join');

  const activities = readActivities(identity);
  if (activities === null) redirect('/join');

  const pending = activities.filter((activity) => activity.submittedAt === null);

  return (
    <main className={PAGE}>
      <header className="flex items-center gap-3 border-b border-hairline pb-3">
        <BrandMark />
        <div className="min-w-0">
          <h1 className="text-s-h1">الأنشطة</h1>
          <div className="text-s-caption text-text-muted">
            {activities.length === 0
              ? 'لم يطلب معلمك نشاطاً بعد'
              : pending.length === 0
                ? 'أرسلت كل ما طُلب منك'
                : `${ar(pending.length)} ${pending.length === 1 ? 'نشاط مطلوب منك' : 'أنشطة مطلوبة منك'}`}
          </div>
        </div>
      </header>

      <div className={CARDS}>
        {activities.map((activity) => (
          <Link key={activity.id} href={`/activities/${activity.id}`} className={CARD}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="grow text-s-body font-bold">{activity.title}</span>
              {activity.submittedAt === null ? (
                <span className={cn(PILL, 'border-ok-border bg-ok-bg text-ok-text')}>مطلوب</span>
              ) : (
                <span className={cn(PILL, 'border-hairline bg-canvas text-text-muted')}>أُرسلت</span>
              )}
            </div>
            <div className="mt-1.5 text-s-caption text-text-muted">
              {activity.questionCount === 0
                ? 'بلا أسئلة'
                : `${ar(activity.questionCount)} ${activity.questionCount === 1 ? 'سؤال' : 'أسئلة'}`}
              {activity.submittedAt === null ? '' : ` · أُرسلت ${when(activity.submittedAt)}`}
            </div>
          </Link>
        ))}
      </div>

      <StudentNav />
    </main>
  );
}
