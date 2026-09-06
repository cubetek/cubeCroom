import { studentAiAllowed } from '@cubecroom/core';
import { lessonExcerpt, readLessonBlocks, type LessonDetail, type LessonSummary } from '@cubecroom/contracts';
import type { StudentIdentity } from './session';
import { store } from './store';

/**
 * قراءة دروس الطالب — FR-009.
 *
 * مدخل واحد للطرفين (الصفحة والمسار)، وكلاهما يبدأ من الجلسة لا من معامل في
 * الرابط: الفصل يُشتق من الحصة، فلا يفتح تبديلُ رقمٍ في شريط العنوان فصلاً
 * آخر. و`listPublished` هو المصدر الوحيد — المسودة لا تصل الطالب.
 */

export type StudentLessons = {
  readonly className: string;
  readonly teacherName: string;
  readonly lessons: LessonSummary[];
};

export function readLessons(identity: StudentIdentity): StudentLessons | null {
  const repositories = store();
  if (repositories === null) return null;

  const context = repositories.sessions.activeContext();
  if (context === undefined) return null;

  const stats = repositories.lessons.stats(context.session.classId);
  const read = new Set(repositories.lessons.readBy(identity.studentId));

  return {
    className: context.className,
    teacherName: context.teacherName,
    lessons: repositories.lessons.listPublished(context.session.classId).map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      excerpt: lessonExcerpt(lesson.blocks),
      publishedAt: (lesson.publishedAt ?? lesson.updatedAt).toISOString(),
      attachments: stats.get(lesson.id)?.attachments ?? 0,
      read: read.has(lesson.id),
    })),
  };
}

/**
 * درس واحد بمحتواه ومرفقاته — S06.
 *
 * يُعاد `null` إن لم يكن منشوراً أو كان من فصل آخر: الفحص هنا لا في الصفحة،
 * فمعرّفٌ مخمَّن في الرابط لا يفتح درساً لم يُنشر لصاحبه.
 */
export function readLesson(identity: StudentIdentity, lessonId: string): LessonDetail | null {
  const repositories = store();
  if (repositories === null) return null;

  const context = repositories.sessions.activeContext();
  if (context === undefined) return null;

  const lesson = repositories.lessons
    .listPublished(context.session.classId)
    .find((row) => row.id === lessonId);
  if (lesson === undefined) return null;

  const attachments = repositories.lessons.listAttachments(lesson.id);
  const read = repositories.lessons.readBy(identity.studentId);

  return {
    id: lesson.id,
    title: lesson.title,
    excerpt: lessonExcerpt(lesson.blocks),
    publishedAt: (lesson.publishedAt ?? lesson.updatedAt).toISOString(),
    attachments: attachments.length,
    read: read.includes(lesson.id),
    teacherName: context.teacherName,
    // البوّابات نفسها التي يفحصها الطرف الآخر — والشاشة لا تعرض ما لا يعمل.
    aiEnabled: studentAiAllowed({
      context: 'lesson',
      master: repositories.settings.getBoolean('studentAiMasterEnabled'),
      classEnabled: repositories.classes.get(context.session.classId).studentAiEnabled,
    }),
    ...activityLink(repositories, context.session.classId, lesson.id),
    blocks: readLessonBlocks(lesson.blocks),
    attachmentList: attachments.map((file) => ({
      id: file.id,
      name: file.name,
      kind: file.kind,
      sizeBytes: file.sizeBytes,
    })),
  };
}

/** فتحُ الدرس هو حدث القراءة نفسه — لا زرّ «علّمه مقروءاً» في اللوح. */
export function markRead(identity: StudentIdentity, lessonId: string): void {
  store()?.lessons.markRead(lessonId, identity.studentId);
}

/**
 * «نشاط مرتبط بهذا الدرس» في `S06`.
 *
 * المنشور وحده، وأحدثه إن تعدّد: الرابط دعوةٌ إلى عمل واحد، وقائمةٌ أسفل
 * الدرس تحوّله إلى قرار. والمسودّة لا تُذكر أصلاً — لا يراها الطالب ولا يُقال
 * له إنها موجودة.
 */
function activityLink(
  repositories: NonNullable<ReturnType<typeof store>>,
  classId: string,
  lessonId: string,
): { activityId?: string } {
  const linked = repositories.activities
    .listPublished(classId)
    .find((activity) => activity.lessonId === lessonId);
  return linked === undefined ? {} : { activityId: linked.id };
}
