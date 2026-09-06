import { createFileStore } from '@cubecroom/core';
import { currentStudent } from '@/lib/session';
import { dataDirectory, store } from '@/lib/store';

/**
 * GET /api/student/files/<id> — تنزيل مرفق درس منشور.
 *
 * ثلاثة حرّاس قبل بايت واحد:
 *   ١. جلسة حيّة (SEC-007).
 *   ٢. المرفق مربوط بدرس **منشور** في فصل الطالب — لا يكفي أن يعرف معرّفه.
 *   ٣. اسم التخزين يُقرأ من القاعدة لا من الرابط، فلا مسار يخرج من المجلد.
 *
 * ويُقدَّم دائماً بـ `Content-Disposition: attachment` ونوع محايد: ملفٌ مثل
 * `.svg` أو `.html` يُعرض داخل أصل الخادم ينفّذ شيفرة في متصفّح الطالب باسم
 * فصله. التنزيل يفتحه التطبيق المناسب على جهازه، وهو ما يريده أصلاً.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const identity = currentStudent(request);
  if (identity === null) return new Response('forbidden', { status: 403 });

  const repositories = store();
  const directory = dataDirectory();
  if (repositories === null || directory === null) {
    return new Response('unavailable', { status: 500 });
  }

  const active = repositories.sessions.activeContext();
  if (active === undefined) return new Response('forbidden', { status: 403 });

  const { id } = await context.params;

  // المرفق مقبول فقط إن كان في درس منشور من فصل هذه الحصة.
  const allowed = repositories.lessons
    .listPublished(active.session.classId)
    .flatMap((lesson) => repositories.lessons.listAttachments(lesson.id))
    .find((file) => file.id === id);

  if (allowed === undefined) return new Response('not found', { status: 404 });

  try {
    const bytes = await createFileStore(directory).read(allowed.storageName);
    return new Response(new Uint8Array(bytes), {
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(bytes.length),
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(allowed.name)}`,
        'cache-control': 'private, no-store',
      },
    });
  } catch {
    return new Response('not found', { status: 404 });
  }
}
