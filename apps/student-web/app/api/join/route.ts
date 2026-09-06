import {
  apiError,
  joinRequestSchema,
  sameJoinCode,
  type JoinAccepted,
} from '@cubecroom/contracts';
import { guardWrite } from '@/lib/guard';
import { fail, ok, parseBody } from '@/lib/respond';
import { store } from '@/lib/store';

/**
 * POST /api/join — إرسال طلب الدخول (FR-005).
 *
 * **الطلب لا يمنح وصولاً.** الردّ لا يحمل رمز جلسة ولا كعكة ولا معرّف طالب:
 * صفٌّ حالته `pending` ومعرّفه ليتابع الطالب حالته، لا أكثر. إصدار الرموز
 * عند القبول يأتي في P2-5، وهذا هو الفرق الذي يجعل موافقة المعلم شرطاً حقيقياً
 * لا واجهةً فوق باب مفتوح.
 */
export async function POST(request: Request): Promise<Response> {
  // الحارس قبل قراءة الجسم: طلبٌ من صفحة أخرى لا يستحق أن يُقرأ أصلاً.
  const blocked = guardWrite(request);
  if (blocked !== null) return fail(blocked);

  const parsed = await parseBody(request, joinRequestSchema);
  if (!parsed.ok) return parsed.response;

  const repositories = store();
  if (repositories === null) {
    return fail(apiError('internal', 'تعذّر الوصول إلى بيانات الفصل. أبلغ معلمك.'));
  }

  const context = repositories.sessions.activeContext();
  if (context === undefined) {
    return fail(
      apiError('session_ended', 'لم يفتح معلمك الدخول بعد، أو أنهى الحصة. اسأله ثم أعد المحاولة.'),
    );
  }

  /*
   * رمز الحصة — §22.
   *
   * حارسٌ يمنع طلبات من أجهزة على شبكة المدرسة لم ترَ السبورة. **ولا يُغني عن
   * موافقة المعلم ولا يُنقصها** (FR-005): الطلب يبقى معلَّقاً بعده كما كان.
   *
   * وحصةٌ بلا رمز — بُدئت بإصدار أقدم من هذا الترحيل — تُقبل بلا فحص: طالبٌ
   * يُمنع من الدخول لأن معلمه حدَّث التطبيق عطلٌ صنعناه نحن.
   */
  const expected = context.session.joinCode;
  if (expected !== null && !sameJoinCode(parsed.value.joinCode, expected)) {
    return fail(
      apiError(
        'validation',
        'رمز الحصة غير مطابق. اسأل معلمك عن الرمز المكتوب على السبورة.',
        'joinCode',
      ),
    );
  }

  const created = repositories.sessions.createRequest({
    sessionId: context.session.id,
    name: parsed.value.name,
    identifier: parsed.value.identifier ?? null,
  });

  const body: JoinAccepted = {
    requestId: created.id,
    status: 'pending',
    submittedName: created.name,
    className: context.className,
    teacherName: context.teacherName,
  };
  return ok(body);
}
