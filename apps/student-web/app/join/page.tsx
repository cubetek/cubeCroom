import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { JoinFlow } from './JoinFlow';
import { currentStudent } from '@/lib/session';
import { store, storeFailure } from '@/lib/store';

/**
 * `/join` — S01 · S02 · S03: المسار الذي يحمله الرابط والرمز المربّع في T09.
 *
 * **يُقرأ من القاعدة في كل طلب لا يُبنى مرة واحدة.** اسم الفصل واسم المعلم
 * يتغيّران بين حصة وأخرى، وصفحةٌ مبنيّة سلفاً تعرض فصل الأمس لطالب اليوم —
 * أو لا تعرض شيئاً أصلاً حين تُبنى ولا حصة مفتوحة.
 *
 * ومن معه كعكة صحيحة لا يُسأل اسمه من جديد: هو داخلٌ فعلاً، فيُحوَّل إلى فصله.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const list = await headers();
  const cookie = list.get('cookie');
  const identity = currentStudent(
    new Request('http://local/', { headers: cookie === null ? {} : { cookie } }),
  );

  const repositories = store();
  const context = repositories?.sessions.activeContext();

  // طالبٌ مقبول عاد إلى `/join` — يُعاد إلى فصله لا يُطلب منه طلبٌ ثانٍ.
  if (identity !== null && context !== undefined) redirect('/');

  /*
   * بلا حصة مفتوحة تُعرض S01 برسالتها الخاصة — لا خطأ ولا صفحة فارغة.
   * `className === null` هي ما تقرؤه `JoinFlow` علامةً على ذلك.
   */
  return (
    <JoinFlow
      className={context?.className ?? null}
      teacherName={context?.teacherName ?? null}
      /*
       * **الفرق بين «لم يفتح بعد» و«البوابة معطوبة» فرقُ ما يفعله الطالب.**
       *
       * الأولى تُنتظر؛ والثانية لا يُصلحها انتظار — ويجب أن يُخبَر بها المعلم.
       * وقد عُرضت الأولى مكان الثانية فعلاً حين فشل فتح القاعدة بصمت.
       */
      broken={repositories === null && storeFailure() !== null}
    />
  );
}
