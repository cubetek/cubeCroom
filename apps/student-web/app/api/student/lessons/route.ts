import { apiError, lessonExcerpt, type StudentHome } from '@cubecroom/contracts';
import { fail, ok } from '@/lib/respond';
import { currentStudent } from '@/lib/session';
import { store } from '@/lib/store';

/**
 * GET /api/student/lessons — رئيسية الطالب ودروسه (FR-009 · SEC-007).
 *
 * الحارس أولاً: بلا جلسة حيّة لا يُعاد شيء، ولا فرق بين «لم يدخل بعد» و«أُنهيت
 * حصّته» — كلاهما رمزٌ لا يفتح، والرسالة واحدة فلا تكشف أيّ الحالتين هي.
 *
 * والفصل يُشتق من الجلسة لا من الطلب: لو أخذ الفصل من معامل في الرابط لصار
 * تبديل رقم في شريط العنوان بابَ دخولٍ إلى فصل آخر.
 *
 * `listPublished` هو المدخل الوحيد — قاعدة FR-009: المسودة لا تصل الطالب،
 * والتصفية في الاستعلام لا عند العرض.
 */
export async function GET(request: Request): Promise<Response> {
  const identity = currentStudent(request);
  if (identity === null) {
    return fail(
      apiError('forbidden', 'انتهت جلستك أو لم تُقبل بعد. افتح رابط الدخول وأرسل طلبك من جديد.'),
    );
  }

  const repositories = store();
  if (repositories === null) {
    return fail(apiError('internal', 'تعذّر الوصول إلى بيانات الفصل. أبلغ معلمك.'));
  }

  const context = repositories.sessions.activeContext();
  if (context === undefined) {
    return fail(apiError('session_ended', 'أنهى معلمك جلسة الدخول.'));
  }

  const student = repositories.students.get(identity.studentId);
  const published = repositories.lessons.listPublished(context.session.classId);
  const stats = repositories.lessons.stats(context.session.classId);

  const body: StudentHome = {
    studentName: student.name,
    className: context.className,
    teacherName: context.teacherName,
    lessons: published.map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      excerpt: lessonExcerpt(lesson.blocks),
      publishedAt: (lesson.publishedAt ?? lesson.updatedAt).toISOString(),
      attachments: stats.get(lesson.id)?.attachments ?? 0,
      // أثر القراءة يُسجَّل مع عارض الدرس (P3-5)؛ حتى ذلك الحين لا يُدّعى.
      read: false,
    })),
  };

  return ok(body);
}
