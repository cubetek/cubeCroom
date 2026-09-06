import { apiError, type StudentActivitySummary } from '@cubecroom/contracts';
import { fail, ok } from '@/lib/respond';
import { currentStudent } from '@/lib/session';
import { readActivities } from '@/lib/activities';

/**
 * GET /api/student/activities — «أنشطة مطلوبة منك» في S04 (FR-012).
 *
 * الحارس أولاً كما في كل مسار للطالب: بلا جلسة حيّة لا يُعاد شيء، ولا فرق بين
 * «لم يدخل بعد» و«أُنهيت حصّته» — الرسالة واحدة فلا تكشف أيّ الحالتين هي.
 */
export async function GET(request: Request): Promise<Response> {
  const identity = currentStudent(request);
  if (identity === null) {
    return fail(
      apiError('forbidden', 'انتهت جلستك أو لم تُقبل بعد. افتح رابط الدخول وأرسل طلبك من جديد.'),
    );
  }

  const activities: StudentActivitySummary[] | null = readActivities(identity);
  if (activities === null) {
    return fail(apiError('session_ended', 'أنهى معلمك جلسة الدخول.'));
  }

  return ok(activities);
}
