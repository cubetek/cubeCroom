import { apiError, submissionSchema, type SubmissionReceipt } from '@cubecroom/contracts';
import { InvalidAnswerError } from '@cubecroom/db';
import { guardWrite } from '@/lib/guard';
import { fail, ok, parseBody } from '@/lib/respond';
import { currentStudent } from '@/lib/session';
import { store } from '@/lib/store';

/**
 * POST /api/student/submissions — إرسال إجابة (FR-013).
 *
 * الحفظ محلي على جهاز المعلم، ويعيد وقت الإرسال — وهو دليل الطالب على الوصول
 * (US-S07). ولذلك الوقت يُقرأ من صفّ القاعدة بعد الكتابة لا من ساعة المتصفح:
 * ساعةٌ مضبوطة خطأً على جهاز طالب كانت ستُظهر له إيصالاً بوقتٍ لا يطابق ما
 * يراه معلمه.
 *
 * **والإرسال المكرر لا يُعامَل خطأً**: تبويبٌ ثانٍ أو صفحةٌ أُعيد تحميلها
 * تُعيد الإيصال الأول بوقته الأول — الطالب يرى «وصلت» لأنها وصلت فعلاً، ولا
 * تُكتب إجابته الثانية فوق ما بنى عليه المعلم تصحيحه.
 *
 * والنشاط يُقرأ من `listPublished` لفصل الجلسة: معرّفٌ مخمَّن في الجسم لا
 * يُسلّم إجابةً لنشاطٍ لم يُنشر، ولا لنشاطِ فصلٍ آخر.
 */
export async function POST(request: Request): Promise<Response> {
  const blocked = guardWrite(request);
  if (blocked !== null) return fail(blocked);

  const identity = currentStudent(request);
  if (identity === null) {
    return fail(
      apiError('forbidden', 'انتهت جلستك أو لم تُقبل بعد. افتح رابط الدخول وأرسل طلبك من جديد.'),
    );
  }

  const parsed = await parseBody(request, submissionSchema);
  if (!parsed.ok) return parsed.response;

  const repositories = store();
  if (repositories === null) {
    return fail(apiError('internal', 'تعذّر الوصول إلى بيانات الفصل. أبلغ معلمك.'));
  }

  const context = repositories.sessions.activeContext();
  if (context === undefined) {
    return fail(apiError('session_ended', 'أنهى معلمك جلسة الدخول.'));
  }

  const activity = repositories.activities
    .listPublished(context.session.classId)
    .find((row) => row.id === parsed.value.activityId);
  if (activity === undefined) {
    return fail(apiError('not_found', 'لم نعثر على هذا النشاط. عُد إلى قائمة الأنشطة.'));
  }

  try {
    const result = repositories.submissions.submit({
      activityId: activity.id,
      studentId: identity.studentId,
      answers: parsed.value.answers,
    });

    const receipt: SubmissionReceipt = {
      submissionId: result.submission.id,
      submittedAt: result.submission.submittedAt.toISOString(),
      answered: Math.max(1, result.answered),
      total: Math.max(1, result.total),
    };
    return ok(receipt);
  } catch (cause) {
    if (cause instanceof InvalidAnswerError) {
      return fail(apiError('validation', cause.message));
    }
    return fail(apiError('internal', 'تعذّر حفظ إجابتك على جهاز معلمك. أعد المحاولة.'));
  }
}
