import {
  toStudentActivity,
  type StudentActivityState,
  type StudentActivitySummary,
  type TeacherQuestion,
} from '@cubecroom/contracts';
import { studentAiAllowed } from '@cubecroom/core';
import type { StoredQuestion } from '@cubecroom/db';
import type { StudentIdentity } from './session';
import { store } from './store';

/**
 * أنشطة الطالب — FR-012 و FR-013.
 *
 * كما في الدروس: المدخل الوحيد `listPublished`، والفصل يُشتق من الجلسة لا من
 * الرابط. ومسودّة النشاط أخطر من مسودّة الدرس — نشاطٌ نصف مكتوب يصل الطالب
 * يعني إجابات على أسئلة ناقصة، وتصحيحاً عليها.
 *
 * وكل ما يخرج من هنا يمرّ بـ`toStudentActivity`: **مفتاح الإجابة لا يغادر جهاز
 * المعلم**، لا لأن هذه الدالة تحذفه، بل لأن النوع الذي تعيده لا يحمله.
 */

export function readActivities(identity: StudentIdentity): StudentActivitySummary[] | null {
  const repositories = store();
  if (repositories === null) return null;

  const context = repositories.sessions.activeContext();
  if (context === undefined) return null;

  const published = repositories.activities.listPublished(context.session.classId);
  const tally = repositories.activities.tally(context.session.classId);
  const submitted = repositories.submissions.submittedBy(
    identity.studentId,
    published.map((activity) => activity.id),
  );

  return published.map((activity) => ({
    id: activity.id,
    title: activity.title,
    questionCount: tally.get(activity.id)?.questions ?? 0,
    submittedAt: submitted.get(activity.id)?.toISOString() ?? null,
  }));
}

/**
 * نشاطٌ واحد بحالته — S07 أو S08.
 *
 * **الحالة تُقرَّر هنا لا في الصفحة**: صفحةٌ تقرّر بنفسها أن الطالب لم يرسل
 * بعد تفتح له نموذجاً يملؤه مرة ثانية بعد أن وصلت إجابته الأولى.
 */
export function readActivity(
  identity: StudentIdentity,
  activityId: string,
): StudentActivityState | null {
  const repositories = store();
  if (repositories === null) return null;

  const context = repositories.sessions.activeContext();
  if (context === undefined) return null;

  const found = repositories.activities
    .listPublished(context.session.classId)
    .find((row) => row.id === activityId);
  if (found === undefined) return null;

  const questions = repositories.activities.questions(found.id).map(toTeacherQuestion);
  const activity = toStudentActivity({
      /*
       * البوّابات الثلاث تُحسب هنا — والدرس المرتبط هو مادة المراجعة.
       *
       * ونشاطٌ بلا درس لا مساعدة فيه: لا مادة تُراجَع، والبديل الوحيد أن
       * يُبنى الجواب على أسئلة النشاط — وذلك يعرض مفتاح الإجابة لنموذج
       * يسأله الطالب عنه.
       */
      helpLessonId:
        found.lessonId !== null &&
        studentAiAllowed({
          context: 'activity',
          master: repositories.settings.getBoolean('studentAiMasterEnabled'),
          classEnabled: repositories.classes.get(context.session.classId).studentAiEnabled,
          activityEnabled: found.studentAiEnabled,
        })
          ? found.lessonId
          : null, id: found.id, title: found.title, questions });

  const submission = repositories.submissions.find(found.id, identity.studentId);
  if (submission === undefined) return { status: 'open', activity };

  return {
    status: 'submitted',
    activity,
    receipt: {
      submissionId: submission.id,
      submittedAt: submission.submittedAt.toISOString(),
      answered: Math.max(1, repositories.submissions.answersFor(submission.id).length),
      total: Math.max(1, questions.length),
    },
  };
}

/**
 * صفّ القاعدة يحمل حقلَي النوعين معاً؛ النوع المصنَّف يحمل واحداً.
 * التحويل هنا هو ما يجعل `toStudentActivity` قادرة على إسقاط ما يخصّ المعلم
 * وحده — فهي لا تقرأ صفوفاً، تقرأ أسئلة مصنَّفة.
 */
function toTeacherQuestion(question: StoredQuestion): TeacherQuestion {
  return question.type === 'choice'
    ? {
        type: 'choice',
        id: question.id,
        prompt: question.prompt,
        points: question.points,
        options: question.options.map((option) => ({ ...option })),
      }
    : {
        type: 'text',
        id: question.id,
        prompt: question.prompt,
        points: question.points,
        expectedAnswer: question.expectedAnswer,
      };
}
