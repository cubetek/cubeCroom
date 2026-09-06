import { apiError } from '@cubecroom/contracts';
import { fail, ok } from '@/lib/respond';
import { currentStudent } from '@/lib/session';

/**
 * GET /api/student/ping — «هل ما زال جهاز معلمك هناك؟»
 *
 * أرخص طلب في الخادم: يتحقق من الجلسة ولا يقرأ درساً ولا نشاطاً — ولذلك
 * يُحتمل إيقاعه (كل ثلاث ثوانٍ). تسأله كل
 * صفحة يفتحها الطالب ويطول بقاؤه عليها — عارضُ الدرس، وصفحةُ النشاط،
 * والإيصال — فتعرف أن الحصة انتهت بدل أن تبقى جامدة حتى ينقر الطالب رابطاً
 * فيرى **صفحة خطأ من متصفّحه** لا رسالة عربية.
 *
 * وهو نبضة الحضور نفسها: `currentStudent` تُحدّث «آخر ظهور»، فعدّاد
 * «متصلون الآن» في `T09` صار يعدّ الطالب وهو يقرأ درساً — لا وهو يفتح
 * القوائم وحدها.
 *
 * ولا يُعيد شيئاً عن الطالب: نعم أو لا. فلا يصير مسارَ تسريب.
 */
export async function GET(request: Request): Promise<Response> {
  const identity = currentStudent(request);
  if (identity === null) {
    return fail(apiError('forbidden', 'انتهت جلستك أو لم تُقبل بعد.'));
  }
  return ok({ live: true });
}
