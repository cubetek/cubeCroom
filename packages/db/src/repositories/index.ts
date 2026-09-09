import type { OpenResult } from '../open.js';
import { learningRepository } from './learning.js';
import { agentsRepository } from './agents.js';
import { teacherRepository } from './teacher.js';
import { settingsRepository } from './settings.js';
import { classesRepository } from './classes.js';
import { studentsRepository } from './students.js';
import { lessonsRepository } from './lessons.js';
import { lessonWorkspacesRepository } from './lesson-workspaces.js';
import { activitiesRepository } from './activities.js';
import { submissionsRepository } from './submissions.js';
import { filesRepository } from './files.js';
import { aiRepository } from './ai.js';
import { sessionsRepository } from './sessions.js';
import { statsRepository } from './stats.js';

/**
 * كل المستودعات فوق اتصال واحد.
 *
 * `transaction` يُمرَّر لمن يحتاجه لا لمن لا يحتاجه — فيبقى ظاهراً في التوقيع
 * أيّ المستودعات تكتب كتابة مركّبة.
 */
export function createRepositories(handle: OpenResult) {
  const { db, transaction } = handle;
  const lessons = lessonsRepository(db, transaction);
  const activities = activitiesRepository(db, transaction);
  return {
    learning: learningRepository(db, transaction),
    agents: agentsRepository(db, transaction),
    teacher: teacherRepository(db),
    settings: settingsRepository(db),
    classes: classesRepository(db),
    students: studentsRepository(db),
    lessons,
    activities,
    lessonWorkspaces: lessonWorkspacesRepository(db, transaction, lessons, activities),
    submissions: submissionsRepository(db, transaction),
    files: filesRepository(db, transaction),
    ai: aiRepository(db),
    sessions: sessionsRepository(db, transaction),
    stats: statsRepository(db),
    /** لتركيب عمليات تمسّ أكثر من مستودع داخل معاملة واحدة (NFR-005). */
    transaction,
  } as const;
}

export type Repositories = ReturnType<typeof createRepositories>;

export { teacherRepository } from './teacher.js';
export { settingsRepository, SETTING_KEYS, SETTING_DEFAULTS } from './settings.js';
export { classesRepository } from './classes.js';
export { studentsRepository } from './students.js';
export { lessonsRepository } from './lessons.js';
export { activitiesRepository } from './activities.js';
export { submissionsRepository, InvalidAnswerError } from './submissions.js';
export { filesRepository } from './files.js';
export { aiRepository } from './ai.js';
export { sessionsRepository } from './sessions.js';
export { statsRepository } from './stats.js';

export type { Teacher, TeacherInput } from './teacher.js';
export type { SettingKey } from './settings.js';
export type { Class, ClassInput, ClassSummary } from './classes.js';
export type { Student, StudentInput } from './students.js';
export type { Lesson, LessonInput, LessonStatus } from './lessons.js';
export type {
  Activity,
  ActivityInput,
  ActivityStatus,
  ActivityTally,
  StoredQuestion,
} from './activities.js';
export type { StoredFile, FileInput, FileUsage } from './files.js';
export type { Contents } from './stats.js';
export type { AiProvider, AiProviderStatus } from './ai.js';
export type {
  Session,
  JoinRequest,
  JoinRequestStatus,
  SessionContext,
  StudentSession,
} from './sessions.js';
export type {
  Submission,
  StoredAnswer,
  IncomingAnswer,
  SubmitResult,
  ChoiceBreakdown,
  ChoiceBreakdownQuestion,
  ChoiceBreakdownOption,
} from './submissions.js';
