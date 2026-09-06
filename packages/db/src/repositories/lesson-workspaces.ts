import { createHash, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  lessonPreparationSchema,
  lessonWorkspaceMaterialSchema,
  lessonWorkspaceUndoSnapshotSchema,
  publishBlockers,
  type LessonWorkspaceMaterial,
  type TeacherQuestion,
} from '@cubecroom/contracts';
import type { Db, OpenResult } from '../open.js';
import { lessonWorkspaces, submissions } from '../schema.js';
import type { lessonsRepository } from './lessons.js';
import type { activitiesRepository, StoredQuestion } from './activities.js';

/** Expected editing conflicts are safe to display; database/validation failures are not. */
export class LessonWorkspaceError extends Error {
  readonly code = 'lesson_workspace_conflict';
}

const toQuestion = (question: StoredQuestion): TeacherQuestion =>
  question.type === 'choice'
    ? {
        id: question.id,
        type: 'choice',
        prompt: question.prompt,
        points: question.points,
        options: question.options.map((option) => ({ ...option })),
      }
    : {
        id: question.id,
        type: 'text',
        prompt: question.prompt,
        points: question.points,
        expectedAnswer: question.expectedAnswer,
      };

/** The complete page and its activity commit together. One undo revision survives app restarts. */
export function lessonWorkspacesRepository(
  db: Db,
  transaction: OpenResult['transaction'],
  lessons: ReturnType<typeof lessonsRepository>,
  activities: ReturnType<typeof activitiesRepository>,
) {
  const row = (id: string) =>
    db.select().from(lessonWorkspaces).where(eq(lessonWorkspaces.lessonId, id)).get();
  const hasSubmissions = (id: string) =>
    db
      .select({ id: submissions.id })
      .from(submissions)
      .where(eq(submissions.activityId, id))
      .get() !== undefined;
  const get = (id: string) => {
    const found = row(id);
    if (!found) return null;
    const parsed = lessonPreparationSchema.safeParse(found.preparation);
    if (!parsed.success) return null;
    const lesson = lessons.get(id);
    const activity = found.activityId ? activities.get(found.activityId) : null;
    // A manually moved activity is no longer owned by this workspace. Keep the page readable.
    const activityId =
      activity?.lessonId === id && activity.classId === lesson.classId ? activity.id : null;
    return { preparation: parsed.data, activityId };
  };
  const state = (id: string) => {
    const lesson = lessons.get(id);
    const workspace = get(id);
    const activity = workspace?.activityId ? activities.get(workspace.activityId) : null;
    if (activity && (activity.classId !== lesson.classId || activity.lessonId !== id)) {
      throw new LessonWorkspaceError('تغيّر النشاط المرتبط بالدرس. افتح الدرس من جديد.');
    }
    return {
      lesson,
      workspace,
      activity,
      questions: activity ? activities.questions(activity.id) : [],
    };
  };
  const fingerprint = (id: string) =>
    createHash('sha256')
      .update(JSON.stringify(state(id)))
      .digest('hex');
  return {
    get,
    fingerprint,
    undoToken(id: string) {
      const found = row(id);
      return found?.undoToken &&
        found.appliedFingerprint === fingerprint(id) &&
        (!found.activityId || !hasSubmissions(found.activityId))
        ? found.undoToken
        : null;
    },
    apply(id: string, expected: string, input: LessonWorkspaceMaterial) {
      const material = lessonWorkspaceMaterialSchema.parse(input);
      const problems = publishBlockers(material.activity);
      if (problems.length) throw new LessonWorkspaceError(problems.join('\n'));
      return transaction(() => {
        if (fingerprint(id) !== expected)
          throw new LessonWorkspaceError(
            'تغيّر الدرس أثناء التجهيز. أعد الطلب على النسخة الحالية.',
          );
        const before = state(id);
        const snapshot = lessonWorkspaceUndoSnapshotSchema.parse({
          title: before.lesson.title,
          blocks: before.lesson.blocks,
          preparation: before.workspace?.preparation ?? null,
          previousActivity: before.activity
            ? {
                id: before.activity.id,
                title: before.activity.title,
                published: before.activity.status === 'published',
                studentAiEnabled: before.activity.studentAiEnabled,
                questions: before.questions.map(toQuestion),
              }
            : null,
        });
        // Never replace questions that already have student answers or grades.
        const activity =
          before.activity && !hasSubmissions(before.activity.id)
            ? activities.update(before.activity.id, { title: material.activity.title })
            : activities.create({
                classId: before.lesson.classId,
                lessonId: id,
                title: material.activity.title,
              });
        activities.replaceQuestions(
          activity.id,
          material.activity.questions.map((question) => ({
            id: question.id,
            type: question.type,
            prompt: question.prompt,
            points: question.points,
            expectedAnswer: question.type === 'text' ? question.expectedAnswer : null,
            options: question.type === 'choice' ? question.options : [],
          })),
        );
        activities.setPublished(activity.id, before.lesson.status === 'published');
        lessons.update(id, { title: material.title, blocks: material.blocks });
        const undoToken = randomUUID();
        const fields = {
          preparation: material.preparation,
          activityId: activity.id,
          undoToken,
          undoSnapshot: snapshot,
          appliedFingerprint: null,
        };
        db.insert(lessonWorkspaces)
          .values({ lessonId: id, ...fields })
          .onConflictDoUpdate({ target: lessonWorkspaces.lessonId, set: fields })
          .run();
        db.update(lessonWorkspaces)
          .set({ appliedFingerprint: fingerprint(id) })
          .where(eq(lessonWorkspaces.lessonId, id))
          .run();
        return { lesson: lessons.get(id), activityId: activity.id, undoToken };
      });
    },
    undo(id: string, token: string) {
      return transaction(() => {
        const found = row(id);
        if (!found || found.undoToken !== token || found.appliedFingerprint !== fingerprint(id)) {
          throw new LessonWorkspaceError(
            'تغيّر الدرس أو النشاط بعد التجهيز؛ لم نتراجع حتى لا نفقد التعديلات الجديدة.',
          );
        }
        const snapshot = lessonWorkspaceUndoSnapshotSchema.parse(found.undoSnapshot);
        if (found.activityId && hasSubmissions(found.activityId)) {
          throw new LessonWorkspaceError(
            'وصلت إجابات طلاب لهذا النشاط. لا يمكن التراجع عن أسئلته الآن.',
          );
        }
        lessons.update(id, { title: snapshot.title, blocks: snapshot.blocks });
        if (snapshot.previousActivity?.id === found.activityId) {
          const previous = snapshot.previousActivity;
          activities.update(previous.id, { title: previous.title });
          activities.replaceQuestions(
            previous.id,
            previous.questions.map((question) => ({
              id: question.id,
              type: question.type,
              prompt: question.prompt,
              points: question.points,
              expectedAnswer: question.type === 'text' ? question.expectedAnswer : null,
              options: question.type === 'choice' ? question.options : [],
            })),
          );
          activities.setPublished(previous.id, previous.published);
          activities.setStudentAiEnabled(previous.id, previous.studentAiEnabled);
        } else if (found.activityId) {
          activities.remove(found.activityId);
        }
        if (snapshot.preparation === null) {
          db.delete(lessonWorkspaces).where(eq(lessonWorkspaces.lessonId, id)).run();
        } else {
          db.update(lessonWorkspaces)
            .set({
              preparation: snapshot.preparation,
              activityId: snapshot.previousActivity?.id ?? null,
              undoToken: null,
              undoSnapshot: null,
              appliedFingerprint: null,
            })
            .where(eq(lessonWorkspaces.lessonId, id))
            .run();
        }
        return lessons.get(id);
      });
    },
    setPublished(id: string, published: boolean) {
      return transaction(() => {
        const workspace = get(id);
        if (workspace?.activityId) {
          const activity = activities.get(workspace.activityId);
          if (activity.classId !== lessons.get(id).classId || activity.lessonId !== id) {
            throw new LessonWorkspaceError('تغيّر النشاط المرتبط بالدرس. افتح الدرس من جديد.');
          }
          if (published) {
            const problems = publishBlockers({
              title: activity.title,
              questions: activities.questions(activity.id).map(toQuestion),
            });
            if (problems.length) throw new LessonWorkspaceError(problems.join('\n'));
          }
          activities.setPublished(activity.id, published);
        }
        return lessons.setPublished(id, published);
      });
    },
  };
}
