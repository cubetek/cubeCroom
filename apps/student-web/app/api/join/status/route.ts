import { apiError, type JoinStatusResponse } from '@cubecroom/contracts';
import { createStudentToken, hashStudentToken } from '@cubecroom/core';
import { fail, ok } from '@/lib/respond';
import { sessionCookie } from '@/lib/session';
import { store } from '@/lib/store';

/**
 * GET /api/join/status?request=<id> — متابعة حالة الطلب (FR-005 · SEC-007).
 *
 * يُنادى دورياً من `S02`: «تُفتح الصفحة تلقائياً بمجرد موافقة معلمك».
 * لا يعيد شيئاً عن الطلب سوى حالته — لا الاسم ولا المعرّف: من يملك رقم طلب
 * غيره لا يقرأ به بيانات صاحبه.
 *
 * **هنا يُصدَر رمز الدخول** لا عند القبول: القبول يحدث على جهاز المعلم،
 * وتوليد الرمز هناك يعني حفظ نصّه في مكان ما حتى يصل إلى الطالب. أما توليده
 * عند أول استعلام بعد القبول فيجعل النصّ يعيش في هذا الردّ وحده: يُوضع في
 * كعكة `HttpOnly` ولا يُحفظ إلا هاشُه.
 *
 * وانتهاء الحصة يُقرأ من الحصة لا من الطلب: طلبٌ بقي `pending` بعد إغلاق
 * الباب ليس معلّقاً، بل انتهى — وإبقاء الطالب ينتظر شيئاً لن يأتي أسوأ.
 */
export async function GET(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get('request');
  if (id === null || id === '') {
    return fail(apiError('validation', 'لم نعرف أي طلب تتابع. افتح رابط الدخول من جديد.', 'request'));
  }

  const repositories = store();
  if (repositories === null) {
    return fail(apiError('internal', 'تعذّر الوصول إلى بيانات الفصل. أبلغ معلمك.'));
  }

  const found = repositories.sessions.findRequest(id);
  if (found === undefined) {
    return fail(apiError('not_found', 'لم نعثر على طلبك. أرسل طلباً جديداً.'));
  }

  const context = repositories.sessions.activeContext();
  const live = context !== undefined && context.session.id === found.sessionId;

  const body: JoinStatusResponse = {
    className: context?.className ?? '',
    teacherName: context?.teacherName ?? '',
    status: live ? status(found.status) : found.status === 'rejected' ? 'rejected' : 'session_ended',
  };

  if (!live || body.status !== 'approved' || found.studentId === null) {
    return ok(body);
  }

  const token = createStudentToken();
  const issued = repositories.sessions.issueStudentSession(
    found.sessionId,
    found.studentId,
    hashStudentToken(token),
  );

  // رمز حيّ موجود بالفعل: جهاز آخر أخذه، ولا يُصدَر ثانٍ يُخرج الأول.
  if (issued === null) return ok({ ...body, redirectTo: '/' });

  const response = ok({ ...body, redirectTo: '/' });
  response.headers.append('set-cookie', sessionCookie(token));
  return response;
}

function status(value: string): JoinStatusResponse['status'] {
  return value === 'approved' || value === 'rejected' || value === 'expired' ? value : 'pending';
}
