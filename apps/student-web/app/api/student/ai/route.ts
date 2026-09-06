import {
  apiError,
  studentAiRequestSchema,
  studentAiResponseSchema,
  STUDENT_AI_POLICY,
} from '@cubecroom/contracts';
import { guardWrite } from '@/lib/guard';
import { fail, ok, parseBody } from '@/lib/respond';
import { currentStudent } from '@/lib/session';
import { store } from '@/lib/store';

/**
 * POST /api/student/ai — مساعدة الطالب داخل الدرس (S10 · §23 · قرار D10).
 *
 * **هذا المسار لا يعرف مفتاح المعلم ولا يستطيع معرفته.** يمرّر السؤال إلى
 * القناة الداخلية في عملية Electron، وهي وحدها تملك المفتاح وتبني المكالمة
 * (SEC-005). فلو تسرّبت هذه العملية كاملةً لم يتسرّب معها مفتاح.
 *
 * والبوّابات تُفحص هناك أيضاً لا هنا: قرار السماح يقرأ إعداد المعلم وحالة
 * الفصل، وكلاهما في قاعدةٍ يملكها الطرف الآخر. وما يصل من هنا سؤالٌ ومعرّف
 * فصلٍ **مشتقّ من الجلسة** لا من جسم الطلب.
 */
export async function POST(request: Request): Promise<Response> {
  const blocked = guardWrite(request);
  if (blocked !== null) return fail(blocked);

  const identity = currentStudent(request);
  if (identity === null) {
    return fail(apiError('forbidden', 'انتهت جلستك. افتح رابط الدخول من جديد.'));
  }

  const parsed = await parseBody(request, studentAiRequestSchema, {
    maxBytes: STUDENT_AI_POLICY.requestBytes,
  });
  if (!parsed.ok) return parsed.response;
  const admitted = currentStudent(request);
  if (admitted?.sessionId !== identity.sessionId || admitted.studentId !== identity.studentId) {
    return fail(apiError('session_ended', 'انتهت جلستك. افتح رابط الدخول من جديد.'));
  }

  const repositories = store();
  const context = repositories?.sessions.activeContext();
  if (repositories === null || context === undefined || context.session.id !== identity.sessionId) {
    return fail(apiError('session_ended', 'أنهى معلمك جلسة الدخول.'));
  }

  const url = process.env.CUBECROOM_INTERNAL_URL;
  const secret = process.env.CUBECROOM_INTERNAL_SECRET;
  if (url === undefined || secret === undefined) {
    return fail(apiError('ai_disabled', 'مساعدة الذكاء الاصطناعي غير مفعّلة في هذا الدرس.'));
  }

  let response: Response;
  try {
    response = await fetch(`${url}/ai`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      signal: AbortSignal.any([
        request.signal,
        AbortSignal.timeout(STUDENT_AI_POLICY.proxyTimeoutMs),
      ]),
      body: JSON.stringify({
        ...parsed.value,
        classId: context.session.classId,
        sessionId: identity.sessionId,
        studentId: identity.studentId,
      }),
    });
  } catch {
    return fail(apiError('internal', 'تعذّر الوصول إلى جهاز معلمك. أعد المحاولة بعد قليل.'));
  }

  if (response.status === 403) {
    // مطفأة لهذا الفصل — والواجهة تخفي المسار أصلاً، فهذه حراسة ثانية.
    return fail(apiError('ai_disabled', 'مساعدة الذكاء الاصطناعي غير مفعّلة في هذا الدرس.'));
  }
  if (response.status === 429) {
    return fail(apiError('rate_limited', 'المساعدة مشغولة الآن. انتظر قليلاً ثم حاول مرة أخرى.'));
  }
  if (response.status === 410) {
    return fail(apiError('session_ended', 'أنهى معلمك جلسة الدخول.'));
  }
  if (response.status === 409) {
    return fail(apiError('validation', 'حدّث معلمك الدرس. افتحه من جديد ثم أعد سؤالك.'));
  }
  if (response.status === 404) {
    return fail(apiError('not_found', 'هذا الدرس أو النشاط غير متاح الآن. ارجع إلى دروسك.'));
  }
  if (!response.ok) {
    return fail(apiError('internal', 'المساعدة لا تعمل الآن. اسأل معلمك.'));
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return fail(apiError('internal', 'المساعدة لا تعمل الآن. اسأل معلمك.'));
  }
  const result = studentAiResponseSchema.safeParse(body);
  if (!result.success) {
    return fail(apiError('internal', 'المساعدة لا تعمل الآن. اسأل معلمك.'));
  }

  const latest = currentStudent(request);
  if (latest?.sessionId !== identity.sessionId || latest.studentId !== identity.studentId) {
    return fail(apiError('session_ended', 'انتهت جلستك. افتح رابط الدخول من جديد.'));
  }

  return ok(result.data);
}
