import {
  lessonContentText,
  readLessonBlocks,
  toStudentLearning,
  type LearningExperience,
} from '@cubecroom/contracts';
import { NotFoundError, type Repositories } from '@cubecroom/db';

/**
 * What the local MCP server may return (D36).
 *
 * Content is returned without answer keys: correct choices, expected answers, learning answers,
 * explanations and rubrics are left out. Results are class totals, without student names,
 * identifiers or answers. Every result is built field by field, never spread from a stored row,
 * so a column added later stays out until someone writes it here on purpose.
 */

export class McpReadError extends Error {}

type Option = { readonly id: string; readonly text: string };

const iso = (value: Date | null): string | null => (value === null ? null : value.toISOString());
const option = (value: Option) => ({ id: value.id, text: value.text });
const rounded = (total: number, count: number): number | null =>
  count === 0 ? null : Math.round((total / count) * 100) / 100;

function found<T>(read: () => T, entity: string): T {
  try {
    return read();
  } catch (error) {
    if (error instanceof NotFoundError) throw new McpReadError(`${entity} was not found. ${error.message}`);
    throw error;
  }
}

function experience(repos: Repositories, experienceId: string): LearningExperience {
  try {
    return repos.learning.get(experienceId);
  } catch {
    throw new McpReadError(
      'Learning experience was not found or could not be read. لم نجد تجربة التعلم أو تعذّرت قراءتها.',
    );
  }
}

export function listClasses(repos: Repositories, includeArchived: boolean) {
  return {
    classes: repos.classes.listSummaries({ includeArchived }).map((row) => ({
      id: row.id,
      name: row.name,
      subject: row.subject,
      level: row.level,
      description: row.description,
      archived: row.archivedAt !== null,
      students: row.students,
      lessons: row.lessons,
      activities: row.activities,
    })),
  };
}

export function listLessons(repos: Repositories, classId: string) {
  found(() => repos.classes.get(classId), 'Class');
  return {
    classId,
    lessons: repos.lessons.listByClass(classId).map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      publishedAt: iso(row.publishedAt),
      updatedAt: iso(row.updatedAt),
    })),
  };
}

/** The same plain text that student help is built on (D25). */
export function readLesson(repos: Repositories, lessonId: string) {
  const lesson = found(() => repos.lessons.get(lessonId), 'Lesson');
  return {
    id: lesson.id,
    classId: lesson.classId,
    title: lesson.title,
    status: lesson.status,
    updatedAt: iso(lesson.updatedAt),
    text: lessonContentText(lesson.title, readLessonBlocks(lesson.blocks)),
  };
}

export function listActivities(repos: Repositories, classId: string) {
  found(() => repos.classes.get(classId), 'Class');
  const tally = repos.activities.tally(classId);
  return {
    classId,
    rosterSize: repos.activities.rosterSize(classId),
    activities: repos.activities.listByClass(classId).map((row) => {
      const counts = tally.get(row.id);
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        lessonId: row.lessonId,
        publishedAt: iso(row.publishedAt),
        updatedAt: iso(row.updatedAt),
        questions: counts?.questions ?? 0,
        choiceQuestions: counts?.choiceQuestions ?? 0,
        textQuestions: counts?.textQuestions ?? 0,
        submissions: counts?.submissions ?? 0,
        pendingReview: counts?.pendingReview ?? 0,
      };
    }),
  };
}

export function readActivity(repos: Repositories, activityId: string) {
  const activity = found(() => repos.activities.get(activityId), 'Activity');
  return {
    id: activity.id,
    classId: activity.classId,
    title: activity.title,
    status: activity.status,
    lessonId: activity.lessonId,
    questions: repos.activities.questions(activity.id).map((question) =>
      question.type === 'choice'
        ? {
            id: question.id,
            type: 'choice' as const,
            prompt: question.prompt,
            points: question.points,
            options: question.options.map(option),
          }
        : { id: question.id, type: 'text' as const, prompt: question.prompt, points: question.points },
    ),
  };
}

/**
 * Class totals for one activity. Per-choice counts stay, but correctness does not: the counts
 * say how many students picked each choice, never which choice was right.
 */
export function activityResults(repos: Repositories, activityId: string) {
  const activity = found(() => repos.activities.get(activityId), 'Activity');
  const questions = repos.activities.questions(activity.id);
  // Only status and score are read; the joined student name is never touched.
  const submissions = repos.submissions.listByActivity(activity.id).map((row) => row.submission);
  const distribution = new Map<number, number>([0, 1, 2, 3, 4, 5].map((score) => [score, 0]));
  let reviewed = 0;
  let scored = 0;
  let scoreTotal = 0;
  for (const submission of submissions) {
    if (submission.status === 'reviewed') reviewed += 1;
    const score = submission.score;
    if (score !== null && distribution.has(score)) {
      distribution.set(score, (distribution.get(score) ?? 0) + 1);
      scored += 1;
      scoreTotal += score;
    }
  }

  const breakdown = repos.submissions.choiceBreakdown(activity.id);
  const choices = new Map(breakdown.questions.map((question) => [question.questionId, question]));
  const written = new Map<string, number>();
  for (const answers of repos.submissions.answersByActivity(activity.id).values()) {
    for (const answer of answers) {
      if (answer.text !== null && answer.text.trim() !== '') {
        written.set(answer.questionId, (written.get(answer.questionId) ?? 0) + 1);
      }
    }
  }

  return {
    activityId: activity.id,
    classId: activity.classId,
    title: activity.title,
    rosterSize: repos.activities.rosterSize(activity.classId),
    submitted: submissions.length,
    reviewed,
    pendingReview: submissions.length - reviewed,
    meanScore: rounded(scoreTotal, scored),
    scoreDistribution: [...distribution].map(([score, count]) => ({ score, count })),
    // Choices removed after students answered leave answers without a choice; they are counted.
    answersWithoutChoice: breakdown.staleAnswers,
    questions: questions.map((question) => {
      if (question.type !== 'choice') {
        return {
          questionId: question.id,
          type: 'text' as const,
          prompt: question.prompt,
          answered: written.get(question.id) ?? 0,
        };
      }
      const choice = choices.get(question.id);
      return {
        questionId: question.id,
        type: 'choice' as const,
        prompt: question.prompt,
        answered: choice?.answered ?? 0,
        options: (choice?.options ?? []).map((entry) => ({
          id: entry.optionId,
          text: entry.text,
          picked: entry.picked,
        })),
      };
    }),
  };
}

export function listLearningExperiences(repos: Repositories, classId: string) {
  found(() => repos.classes.get(classId), 'Class');
  return {
    classId,
    experiences: repos.learning.list(classId).map((entry) => ({
      id: entry.id,
      title: entry.material.title,
      method: entry.material.method,
      stage: entry.material.stage,
      lessonId: entry.lessonId,
      published: entry.published,
      version: entry.version,
      items: entry.material.items.length,
      updatedAt: entry.updatedAt,
    })),
  };
}

/**
 * The student view without rubrics, which the owner counted among the answer keys.
 *
 * Order and match items keep their options in authoring order, and that order can be the answer
 * itself. They are sorted by text instead.
 */
export function readLearningExperience(repos: Repositories, experienceId: string) {
  const stored = experience(repos, experienceId);
  const student = toStudentLearning(stored);
  const byText = (list: readonly Option[]) =>
    list.map(option).sort((a, b) => a.text.localeCompare(b.text, 'ar'));
  return {
    id: stored.id,
    classId: stored.classId,
    lessonId: stored.lessonId,
    published: stored.published,
    version: student.version,
    title: student.material.title,
    method: student.material.method,
    stage: student.material.stage,
    instructions: student.material.instructions,
    items: student.material.items.map((item) => {
      const arranged = item.kind === 'order' || item.kind === 'match';
      return {
        id: item.id,
        kind: item.kind,
        objective: item.objective,
        prompt: item.prompt,
        options: arranged ? byText(item.options) : item.options.map(option),
        targets: arranged ? byText(item.targets) : item.targets.map(option),
        hint: item.hint,
        example: item.example,
      };
    }),
  };
}

/** Totals per objective, as the specialist agents' progress analysis reads them. */
export function learningProgress(repos: Repositories, experienceId: string) {
  const stored = experience(repos, experienceId);
  const summary = new Map<
    string,
    { attempts: number; correct: number; pendingReview: number; graded: number; scoreTotal: number; learners: Set<string> }
  >();
  for (const row of repos.learning.progress(stored.id)) {
    const entry = summary.get(row.objective) ?? {
      attempts: 0,
      correct: 0,
      pendingReview: 0,
      graded: 0,
      scoreTotal: 0,
      learners: new Set<string>(),
    };
    entry.attempts += row.attempts;
    entry.correct += row.correct;
    entry.pendingReview += row.pendingReview;
    entry.graded += row.graded;
    entry.scoreTotal += row.scoreTotal;
    entry.learners.add(row.studentId);
    summary.set(row.objective, entry);
  }
  return {
    experienceId: stored.id,
    title: stored.material.title,
    objectives: [...summary].map(([objective, entry]) => ({
      objective,
      attempts: entry.attempts,
      correct: entry.correct,
      pendingReview: entry.pendingReview,
      graded: entry.graded,
      meanScore: rounded(entry.scoreTotal, entry.graded),
      learners: entry.learners.size,
    })),
  };
}
