import { apiError, learningIdSchema, learningResponseSchema } from '@cubecroom/contracts';
import { gradeLearningItem, nextLearningReview } from '@cubecroom/core';
import { guardWrite } from '@/lib/guard';
import { fail, ok, parseBody } from '@/lib/respond';
import { currentStudent } from '@/lib/session';
import { store } from '@/lib/store';

export const dynamic = 'force-dynamic';
export async function POST(request: Request): Promise<Response> {
  const blocked = guardWrite(request);
  if (blocked) return fail(blocked);
  const identity = currentStudent(request);
  const repositories = store();
  const context = repositories?.sessions.activeContext();
  if (!identity || !repositories || !context || identity.sessionId !== context.session.id)
    return fail(apiError('forbidden', 'افتح رابط فصلك وسجل الدخول أولاً.'));
  try {
    if (new URL(request.url).searchParams.get('action') === 'history') {
      const parsed = await parseBody(request, learningIdSchema, { maxBytes: 1024 });
      if (!parsed.ok) return parsed.response;
      return ok(
        repositories.learning.history(parsed.value.id, identity.studentId, context.session.classId),
      );
    }
    if (new URL(request.url).searchParams.get('action') === 'start') {
      const parsed = await parseBody(request, learningIdSchema, { maxBytes: 1024 });
      if (!parsed.ok) return parsed.response;
      return ok(
        repositories.learning.start(parsed.value.id, identity.studentId, context.session.classId),
      );
    }
    const parsed = await parseBody(request, learningResponseSchema, { maxBytes: 48_000 });
    if (!parsed.ok) return parsed.response;
    return ok(
      repositories.learning.submit(
        parsed.value,
        identity.studentId,
        context.session.classId,
        gradeLearningItem,
        nextLearningReview,
      ),
    );
  } catch (e) {
    return fail(apiError('validation', e instanceof Error ? e.message : 'تعذر حفظ المحاولة.'));
  }
}
