import { and, asc, desc, eq, sql, isNull } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import {
  learningSaveSchema,
  learningResponseSchema,
  learningMaterialSchema,
  toStudentLearning,
  type LearningExperience,
  type LearningSaveInput,
  type LearningResponse,
  type LearningItem,
  type LearningFeedback,
  type LearningSession,
  type LearningAttempt,
  type LearningProgress,
} from '@cubecroom/contracts';
import type { Db, OpenResult } from '../open.js';
import {
  classes,
  lessons,
  students,
  learningExperiences,
  learningVersions,
  practiceSessions,
  practiceAttempts,
} from '../schema.js';

export function learningRepository(db: Db, transaction: OpenResult['transaction']) {
  const get = (id: string): LearningExperience => {
    const row = db.select().from(learningExperiences).where(eq(learningExperiences.id, id)).get();
    if (!row) throw new Error('لم نجد تجربة التعلم.');
    return {
      ...row,
      material: learningMaterialSchema.parse(row.material),
      updatedAt: row.updatedAt.toISOString(),
    };
  };
  const requireStudent = (studentId: string, classId: string) => {
    if (
      !db
        .select()
        .from(students)
        .where(
          and(
            eq(students.id, studentId),
            eq(students.classId, classId),
            isNull(students.removedAt),
          ),
        )
        .get()
    )
      throw new Error('الطالب ليس في هذا الفصل.');
  };
  const attempts = (sessionId: string): LearningAttempt[] =>
    db
      .select()
      .from(practiceAttempts)
      .where(eq(practiceAttempts.sessionId, sessionId))
      .orderBy(sql`${practiceAttempts}.rowid`)
      .all()
      .map((r) => ({
        id: r.id,
        itemId: r.itemId,
        answer: r.response.answer,
        confidence: r.response.confidence,
        usedHint: r.response.usedHint,
        feedback: r.feedback,
        createdAt: r.createdAt.toISOString(),
      }));
  const sessionData = (sessionId: string, studentId: string, classId: string) => {
    requireStudent(studentId, classId);
    const session = db
      .select()
      .from(practiceSessions)
      .where(and(eq(practiceSessions.id, sessionId), eq(practiceSessions.studentId, studentId)))
      .get();
    if (!session) throw new Error('جلسة التدريب غير متاحة.');
    const experience = get(session.experienceId);
    if (experience.classId !== classId || !experience.published)
      throw new Error('هذه التجربة غير متاحة الآن.');
    const version = db
      .select()
      .from(learningVersions)
      .where(
        and(
          eq(learningVersions.experienceId, experience.id),
          eq(learningVersions.version, session.version),
        ),
      )
      .get();
    if (!version) throw new Error('نسخة التدريب غير متاحة.');
    return {
      session,
      experience: {
        ...experience,
        version: session.version,
        material: learningMaterialSchema.parse(version.material),
      },
    };
  };
  const sessionView = (sessionId: string, studentId: string, classId: string): LearningSession => {
    const { session, experience } = sessionData(sessionId, studentId, classId);
    return {
      id: session.id,
      completed: session.completed,
      experience: toStudentLearning(experience),
      attempts: attempts(session.id),
    };
  };
  const list = (classId: string) =>
    db
      .select({ id: learningExperiences.id })
      .from(learningExperiences)
      .where(eq(learningExperiences.classId, classId))
      .orderBy(desc(learningExperiences.updatedAt))
      .all()
      .map((r) => get(r.id));
  return {
    get,
    list,
    save(raw: LearningSaveInput): LearningExperience {
      const input = learningSaveSchema.parse(raw);
      return transaction(() => {
        if (!db.select().from(classes).where(eq(classes.id, input.classId)).get())
          throw new Error('الفصل غير موجود.');
        if (
          input.lessonId &&
          !db
            .select()
            .from(lessons)
            .where(and(eq(lessons.id, input.lessonId), eq(lessons.classId, input.classId)))
            .get()
        )
          throw new Error('الدرس ليس في هذا الفصل.');
        const previous = input.id ? get(input.id) : null;
        if (previous && previous.classId !== input.classId)
          throw new Error('لا يمكن نقل التجربة إلى فصل آخر.');
        if ((previous?.version ?? 0) !== input.expectedVersion)
          throw new Error('تغيّرت التجربة منذ فتحها. افتح النسخة الأحدث قبل الحفظ.');
        const id = previous?.id ?? randomUUID();
        const version = (previous?.version ?? 0) + 1;
        const row = {
          id,
          classId: input.classId,
          lessonId: input.lessonId,
          version,
          published: previous?.published ?? false,
          material: input.material,
          updatedAt: new Date(),
        };
        db.insert(learningExperiences)
          .values(row)
          .onConflictDoUpdate({ target: learningExperiences.id, set: row })
          .run();
        db.insert(learningVersions)
          .values({ id: randomUUID(), experienceId: id, version, material: input.material })
          .run();
        return get(id);
      });
    },
    publish(id: string, published: boolean, expectedVersion: number) {
      return transaction(() => {
        const found = get(id);
        if (found.version !== expectedVersion)
          throw new Error('تغيّرت نسخة التجربة؛ راجعها قبل النشر.');
        db.update(learningExperiences)
          .set({ published, updatedAt: new Date() })
          .where(eq(learningExperiences.id, id))
          .run();
        return get(id);
      });
    },
    studentList(studentId: string, classId: string) {
      requireStudent(studentId, classId);
      const rows = db
        .select({
          experienceId: practiceSessions.experienceId,
          itemId: practiceAttempts.itemId,
          feedback: practiceAttempts.feedback,
          createdAt: practiceAttempts.createdAt,
        })
        .from(practiceSessions)
        .innerJoin(practiceAttempts, eq(practiceAttempts.sessionId, practiceSessions.id))
        .where(eq(practiceSessions.studentId, studentId))
        .orderBy(desc(practiceAttempts.createdAt), sql`${practiceAttempts}.rowid DESC`)
        .all();
      const latest = new Map<string, (typeof rows)[number]>();
      for (const row of rows) {
        const key = JSON.stringify([row.experienceId, row.itemId]);
        if (!latest.has(key)) latest.set(key, row);
      }
      return list(classId)
        .filter((e) => e.published)
        .map((e) => ({
          id: e.id,
          title: e.material.title,
          method: e.material.method,
          lessonId: e.lessonId,
          dueAt:
            [...latest.values()]
              .filter((r) => r.experienceId === e.id)
              .map((r) => r.feedback.dueAt)
              .filter((d): d is string => !!d)
              .sort()[0] ?? null,
        }));
    },
    start(experienceId: string, studentId: string, classId: string): LearningSession {
      return transaction(() => {
        requireStudent(studentId, classId);
        const e = get(experienceId);
        if (e.classId !== classId || !e.published) throw new Error('تجربة التعلم غير متاحة.');
        const active = db
          .select()
          .from(practiceSessions)
          .where(
            and(
              eq(practiceSessions.experienceId, experienceId),
              eq(practiceSessions.studentId, studentId),
              eq(practiceSessions.completed, false),
            ),
          )
          .get();
        if (active) return sessionView(active.id, studentId, classId);
        const id = randomUUID();
        db.insert(practiceSessions)
          .values({ id, experienceId, studentId, version: e.version })
          .run();
        return sessionView(id, studentId, classId);
      });
    },
    session: sessionView,
    history(experienceId: string, studentId: string, classId: string) {
      requireStudent(studentId, classId);
      const e = get(experienceId);
      if (e.classId !== classId || !e.published) throw new Error('التجربة غير متاحة.');
      const versions = new Map(
        db
          .select()
          .from(learningVersions)
          .where(eq(learningVersions.experienceId, experienceId))
          .all()
          .map((v) => [v.version, v.material]),
      );
      return db
        .select({
          itemId: practiceAttempts.itemId,
          response: practiceAttempts.response,
          feedback: practiceAttempts.feedback,
          createdAt: practiceAttempts.createdAt,
          version: practiceSessions.version,
        })
        .from(practiceAttempts)
        .innerJoin(practiceSessions, eq(practiceSessions.id, practiceAttempts.sessionId))
        .where(
          and(
            eq(practiceSessions.studentId, studentId),
            eq(practiceSessions.experienceId, experienceId),
          ),
        )
        .orderBy(sql`${practiceAttempts}.rowid DESC`)
        .limit(30)
        .all()
        .map((row) => {
          const item = versions.get(row.version)!.items.find((i) => i.id === row.itemId)!;
          const labels = (answers: string[]) =>
            answers.map(
              (a) => [...item.options, ...item.targets].find((o) => o.id === a)?.text ?? a,
            );
          return {
            prompt: item.prompt,
            answer: labels(row.response.answer),
            initialAnswer: row.response.initialAnswer ? labels(row.response.initialAnswer) : null,
            confidence: row.response.confidence,
            feedback: row.feedback,
            createdAt: row.createdAt.toISOString(),
          };
        });
    },
    submit(
      raw: LearningResponse,
      studentId: string,
      classId: string,
      grade: (
        item: LearningItem,
        response: LearningResponse,
      ) => { correct: boolean | null; score: number | null },
      schedule: (
        now: number,
        successes: number,
        correct: boolean | null,
        hinted: boolean,
      ) => string | null,
    ): LearningFeedback {
      const input = learningResponseSchema.parse(raw);
      return transaction(() => {
        const { session, experience } = sessionData(input.sessionId, studentId, classId);
        const existing = db
          .select()
          .from(practiceAttempts)
          .where(eq(practiceAttempts.id, input.requestId))
          .get();
        if (existing) {
          if (
            existing.sessionId !== session.id ||
            JSON.stringify(existing.response) !== JSON.stringify(input)
          )
            throw new Error('معرّف المحاولة مستخدم لطلب مختلف.');
          return existing.feedback;
        }
        if (session.completed) throw new Error('اكتملت هذه الجولة. ابدأ جولة جديدة.');
        const previous = attempts(session.id);
        const next = previous.length
          ? previous.at(-1)!.feedback.nextItemId
          : experience.material.items[0]!.id;
        if (input.itemId !== next) throw new Error('أجب عن السؤال الحالي أولاً.');
        const index = experience.material.items.findIndex((i) => i.id === input.itemId);
        const item = experience.material.items[index]!;
        const validAnswer = (answer: string[]) => {
          if (answer.some((a) => !a.trim())) return false;
          if (['recall', 'explain'].includes(item.kind)) return answer.length === 1;
          if (item.kind === 'choice')
            return answer.length === 1 && item.options.some((o) => o.id === answer[0]);
          if (answer.length !== item.options.length) return false;
          const allowed = item.kind === 'match' ? item.targets : item.options;
          return (
            answer.every((a) => allowed.some((o) => o.id === a)) &&
            (item.kind !== 'order' || new Set(answer).size === item.options.length)
          );
        };
        if (!validAnswer(input.answer)) throw new Error('أكمل الإجابة باستخدام الخيارات المتاحة.');
        if (
          experience.material.method === 'peer' &&
          (!input.initialAnswer || !validAnswer(input.initialAnswer))
        )
          throw new Error('ابدأ بمحاولة فردية ثم أجب بعد النقاش.');
        const graded = grade(item, input);
        const nextItemId =
          (graded.correct === false ? item.alternate : item.next) ??
          experience.material.items[index + 1]?.id ??
          null;
        const history = db
          .select({
            feedback: practiceAttempts.feedback,
            response: practiceAttempts.response,
            createdAt: practiceAttempts.createdAt,
          })
          .from(practiceAttempts)
          .innerJoin(practiceSessions, eq(practiceSessions.id, practiceAttempts.sessionId))
          .where(
            and(
              eq(practiceSessions.studentId, studentId),
              eq(practiceSessions.experienceId, experience.id),
              eq(practiceSessions.version, session.version),
              eq(practiceAttempts.itemId, item.id),
            ),
          )
          .all();
        // Multiple repetitions on one day count once toward spacing.
        const today = new Date().toISOString().slice(0, 10);
        const successfulDays = new Set(
          history
            .filter(
              (h) =>
                h.feedback.correct &&
                !h.response.usedHint &&
                h.createdAt.toISOString().slice(0, 10) < today,
            )
            .map((h) => h.createdAt.toISOString().slice(0, 10)),
        ).size;
        const feedback: LearningFeedback = {
          ...graded,
          explanation: item.explanation,
          expected: item.answer,
          nextItemId,
          dueAt: schedule(Date.now(), successfulDays, graded.correct, input.usedHint),
        };
        db.insert(practiceAttempts)
          .values({
            id: input.requestId,
            sessionId: session.id,
            itemId: item.id,
            response: input,
            feedback,
          })
          .run();
        if (nextItemId === null)
          db.update(practiceSessions)
            .set({ completed: true })
            .where(eq(practiceSessions.id, session.id))
            .run();
        return feedback;
      });
    },
    progress(experienceId: string): LearningProgress[] {
      const e = get(experienceId);
      const rows = db
        .select({
          studentId: practiceSessions.studentId,
          studentName: students.name,
          version: practiceSessions.version,
          itemId: practiceAttempts.itemId,
          feedback: practiceAttempts.feedback,
        })
        .from(practiceAttempts)
        .innerJoin(practiceSessions, eq(practiceSessions.id, practiceAttempts.sessionId))
        .innerJoin(students, eq(students.id, practiceSessions.studentId))
        .where(eq(practiceSessions.experienceId, e.id))
        .orderBy(asc(practiceAttempts.createdAt))
        .all();
      const versions = new Map(
        db
          .select()
          .from(learningVersions)
          .where(eq(learningVersions.experienceId, e.id))
          .all()
          .map((v) => [v.version, v.material]),
      );
      const grouped = new Map<string, LearningProgress>();
      for (const row of rows) {
        const objective =
          versions.get(row.version)?.items.find((i) => i.id === row.itemId)?.objective ??
          'هدف سابق';
        const key = JSON.stringify([row.studentId, objective]);
        const state = grouped.get(key) ?? {
          studentId: row.studentId,
          studentName: row.studentName,
          objective,
          attempts: 0,
          correct: 0,
          pendingReview: 0,
          graded: 0,
          scoreTotal: 0,
          dueAt: null,
        };
        state.attempts++;
        if (row.feedback.correct) state.correct++;
        if (row.feedback.score === null) state.pendingReview++;
        else {
          state.graded++;
          state.scoreTotal += row.feedback.score;
        }
        state.dueAt = row.feedback.dueAt;
        grouped.set(key, state);
      }
      return [...grouped.values()];
    },
    review(experienceId: string) {
      get(experienceId);
      const versions = new Map(
        db
          .select()
          .from(learningVersions)
          .where(eq(learningVersions.experienceId, experienceId))
          .all()
          .map((v) => [v.version, v.material]),
      );
      return db
        .select({
          id: practiceAttempts.id,
          itemId: practiceAttempts.itemId,
          response: practiceAttempts.response,
          feedback: practiceAttempts.feedback,
          version: practiceSessions.version,
          studentName: students.name,
        })
        .from(practiceAttempts)
        .innerJoin(practiceSessions, eq(practiceSessions.id, practiceAttempts.sessionId))
        .innerJoin(students, eq(students.id, practiceSessions.studentId))
        .where(eq(practiceSessions.experienceId, experienceId))
        .all()
        .filter((r) => r.feedback.score === null)
        .map((r) => {
          const item = versions.get(r.version)!.items.find((i) => i.id === r.itemId)!;
          return {
            id: r.id,
            studentName: r.studentName,
            prompt: item.prompt,
            answer: r.response.answer,
            rubric: item.rubric,
          };
        });
    },
    grade(attemptId: string, score: number, comment: string) {
      transaction(() => {
        const row = db
          .select()
          .from(practiceAttempts)
          .where(eq(practiceAttempts.id, attemptId))
          .get();
        if (!row) throw new Error('المحاولة غير موجودة.');
        db.update(practiceAttempts)
          .set({ feedback: { ...row.feedback, score, correct: score === 1, explanation: comment } })
          .where(eq(practiceAttempts.id, attemptId))
          .run();
      });
    },
  };
}
