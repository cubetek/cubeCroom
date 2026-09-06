import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Db, OpenResult } from '../open.js';
import {
  activities,
  activityFiles,
  lessons,
  questionOptions,
  questions,
  students,
  submissions,
} from '../schema.js';
import { newId, now } from '../ids.js';
import { NotFoundError } from '../errors.js';

export type Activity = typeof activities.$inferSelect;
export type ActivityStatus = 'draft' | 'published';

export type StoredQuestion = {
  readonly id: string;
  readonly type: 'choice' | 'text';
  readonly prompt: string;
  readonly points: number;
  readonly expectedAnswer: string | null;
  readonly options: ReadonlyArray<{ id: string; text: string; isCorrect: boolean }>;
};

export type ActivityInput = {
  readonly classId: string;
  readonly title: string;
  readonly lessonId?: string | null;
};

export type ActivityTally = {
  readonly questions: number;
  readonly choiceQuestions: number;
  readonly textQuestions: number;
  readonly submissions: number;
  readonly pendingReview: number;
};

/**
 * الأنشطة وأسئلتها — FR-012.
 *
 * القاعدة نفسها التي تحكم الدروس تحكمها: `listPublished` هو المدخل الوحيد
 * لبوابة الطالب، والتصفية في الاستعلام لا في الواجهة. ومسودّة النشاط أخطر من
 * مسودّة الدرس: نشاطٌ نصف مكتوب يصل الطالب يعني إجابات على أسئلة ناقصة.
 */
export function activitiesRepository(db: Db, transaction: OpenResult['transaction']) {
  const require = (id: string): Activity => {
    const row = db.select().from(activities).where(eq(activities.id, id)).get();
    if (!row) throw new NotFoundError('النشاط');
    return row;
  };

  const readQuestions = (activityId: string): StoredQuestion[] => {
    const rows = db
      .select()
      .from(questions)
      .where(eq(questions.activityId, activityId))
      .orderBy(asc(questions.position))
      .all();
    if (rows.length === 0) return [];

    const options = db
      .select()
      .from(questionOptions)
      .where(
        inArray(
          questionOptions.questionId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(questionOptions.position))
      .all();

    return rows.map((row) => ({
      id: row.id,
      type: row.type === 'choice' ? 'choice' : 'text',
      prompt: row.prompt,
      points: row.points,
      expectedAnswer: row.expectedAnswer,
      options: options
        .filter((option) => option.questionId === row.id)
        .map((option) => ({ id: option.id, text: option.text, isCorrect: option.isCorrect })),
    }));
  };

  return {
    get: require,

    /** Scoped single-row lookup; does not load the classroom's activity history. */
    findPublished(id: string, classId: string): Activity | undefined {
      return db.select().from(activities).where(and(
        eq(activities.id, id), eq(activities.classId, classId), eq(activities.status, 'published'),
      )).get();
    },

    listByClass(classId: string, { status }: { status?: ActivityStatus } = {}): Activity[] {
      const condition =
        status === undefined
          ? eq(activities.classId, classId)
          : and(eq(activities.classId, classId), eq(activities.status, status));
      return db.select().from(activities).where(condition).orderBy(desc(activities.updatedAt)).all();
    },

    /** ما يراه الطالب — ولا شيء غيره. */
    listPublished(classId: string): Activity[] {
      return db
        .select()
        .from(activities)
        .where(and(eq(activities.classId, classId), eq(activities.status, 'published')))
        .orderBy(desc(activities.publishedAt))
        .all();
    },

    questions: readQuestions,

    /** عنوان الدرس المرتبط — «مرتبط بدرس: …» في `T15` و`T16`. */
    lessonTitle(lessonId: string | null): string | null {
      if (lessonId === null) return null;
      const row = db
        .select({ title: lessons.title })
        .from(lessons)
        .where(eq(lessons.id, lessonId))
        .get();
      return row?.title ?? null;
    },

    create(input: ActivityInput): Activity {
      const timestamp = now();
      const row: Activity = {
        id: newId(),
        classId: input.classId,
        lessonId: input.lessonId ?? null,
        title: input.title,
        status: 'draft',
        publishedAt: null,
        // قرار D10: البوّابة الثالثة تبدأ مغلقة، كأختيها.
        studentAiEnabled: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.insert(activities).values(row).run();
      return row;
    },

    update(id: string, patch: { title?: string; lessonId?: string | null }): Activity {
      const existing = require(id);
      const next = {
        title: patch.title ?? existing.title,
        lessonId: patch.lessonId === undefined ? existing.lessonId : patch.lessonId,
        updatedAt: now(),
      };
      db.update(activities).set(next).where(eq(activities.id, id)).run();
      return { ...existing, ...next };
    },

    setPublished(id: string, published: boolean): Activity {
      const existing = require(id);
      const next = {
        status: published ? 'published' : 'draft',
        // كما في الدرس: إلغاء النشر يمحو تاريخه، وإعادته حدث جديد.
        publishedAt: published ? now() : null,
        updatedAt: now(),
      };
      db.update(activities).set(next).where(eq(activities.id, id)).run();
      return { ...existing, ...next };
    },

    /** البوّابة الثالثة في قرار D10 — مفتاح النشاط. */
    setStudentAiEnabled(id: string, enabled: boolean): Activity {
      const existing = require(id);
      const next = { studentAiEnabled: enabled, updatedAt: now() };
      db.update(activities).set(next).where(eq(activities.id, id)).run();
      return { ...existing, ...next };
    },

    remove(id: string): void {
      require(id);
      db.delete(activities).where(eq(activities.id, id)).run();
    },

    /**
     * «نسخ النشاط إلى فصل آخر» — معلّمٌ يدرّس المادة نفسها لفصلين.
     *
     * تُنسخ الأسئلة وخياراتها ومرفقاتها، ولا تُنسخ التسليمات ولا الإجابات ولا
     * الدرجات ولا الملاحظات: إجابةُ طالبٍ ملكُه هو في فصله هو، ونقلها تنسب
     * عمل طفلٍ إلى فصلٍ لم يكتبه فيه.
     *
     * والنسخة مسودّة ولو كان الأصل منشوراً — FR-009: النشر فعل المعلّم بعد
     * أن يراجع، لا أثرٌ جانبي للنسخ. ومفتاح مساعدة الطالب يبدأ مطفأً لا
     * موروثاً، كما في `create` وللسبب نفسه (قرار D10): بوّابةٌ لم يفتحها
     * المعلّم في هذا الفصل تبقى مغلقة.
     *
     * أمّا `lessonId` فيسقط عند تغيّر الفصل: الدرس المرتبط درسُ الفصل الأصل،
     * فحملُه يُظهر لفصلٍ محتوى فصلٍ آخر ولا يملك المعلّم هنا ما يصحّحه به.
     * ويبقى وحده حين يكون الهدف الفصل نفسه، إذ صحّته مثبتة عندئذٍ.
     *
     * وكل ذلك في معاملة واحدة — NFR-005: نسخةٌ بأسئلةٍ بلا خياراتها أسوأ من
     * نسخةٍ لم تُنشأ.
     */
    copyToClass(id: string, targetClassId: string): Activity {
      const source = require(id);
      // `sourceQuestions` لا `questions`: الاسم الثاني جدولٌ مستورد أعلاه.
      const sourceQuestions = readQuestions(id);
      const timestamp = now();
      const copy: Activity = {
        ...source,
        id: newId(),
        classId: targetClassId,
        lessonId: source.classId === targetClassId ? source.lessonId : null,
        title: `${source.title} — نسخة`,
        status: 'draft',
        publishedAt: null,
        studentAiEnabled: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      transaction(() => {
        db.insert(activities).values(copy).run();

        sourceQuestions.forEach((question, position) => {
          // معرّف جديد لكل صفّ: مشاركة المعرّف تجعل حذف أحد النشاطين يذهب بالآخر.
          const questionId = newId();
          db.insert(questions)
            .values({
              id: questionId,
              activityId: copy.id,
              position,
              type: question.type,
              prompt: question.prompt,
              // القاعدة نفسها في `replaceQuestions`: سؤال اختيار لا يحمل إجابة متوقَّعة.
              expectedAnswer: question.type === 'text' ? question.expectedAnswer : null,
              points: question.points,
            })
            .run();

          if (question.type !== 'choice') return;
          question.options.forEach((option, at) => {
            db.insert(questionOptions)
              .values({
                id: newId(),
                questionId,
                position: at,
                text: option.text,
                isCorrect: option.isCorrect,
              })
              .run();
          });
        });

        // الملف لا ينتمي إلى فصل، فمرفقه يعبر معه — كما في تكرار الدرس.
        for (const row of db
          .select()
          .from(activityFiles)
          .where(eq(activityFiles.activityId, id))
          .all()) {
          db.insert(activityFiles)
            .values({ activityId: copy.id, fileId: row.fileId, position: row.position })
            .run();
        }
      });

      return copy;
    },

    /**
     * استبدال أسئلة النشاط دفعةً واحدة — NFR-005.
     *
     * الحذف ثم الإدراج داخل معاملة واحدة: نشاطٌ يبقى بلا أسئلته لأن الإدراج
     * فشل في منتصفه أسوأ من كتابةٍ لم تحدث أصلاً. والمعرّفات تأتي من الواجهة
     * وتُكتب كما هي — فسؤالٌ لم يُمسّ يبقى معرّفه، وتبقى إجابات الطلاب
     * المرتبطة به مرتبطةً به.
     */
    replaceQuestions(activityId: string, incoming: readonly StoredQuestion[]): void {
      require(activityId);
      transaction(() => {
        const keep = incoming.map((question) => question.id);
        const existing = db
          .select({ id: questions.id })
          .from(questions)
          .where(eq(questions.activityId, activityId))
          .all()
          .map((row) => row.id);

        for (const id of existing) {
          if (!keep.includes(id)) db.delete(questions).where(eq(questions.id, id)).run();
        }

        incoming.forEach((question, position) => {
          const values = {
            activityId,
            position,
            type: question.type,
            prompt: question.prompt,
            expectedAnswer: question.type === 'text' ? question.expectedAnswer : null,
            points: question.points,
          };

          if (existing.includes(question.id)) {
            db.update(questions).set(values).where(eq(questions.id, question.id)).run();
          } else {
            db.insert(questions)
              .values({ id: question.id, ...values })
              .run();
          }

          /*
           * **الخيارات تُوفَّق ولا تُستبدل — وهذا يحمي إجابات الطلاب.**
           *
           * كان السطر هنا يحذف خيارات السؤال كلَّها ثم يعيد إدراجها. و
           * `answers.option_id` مرتبطٌ بها بـ`on delete set null`، فالحذف كان
           * **يُفرّغ إجابة كل طالب** عن ذلك السؤال — حتى حين لا يتغيّر شيء
           * أصلاً وتُعاد المعرّفات نفسها، لأن التفريغ يقع لحظة الحذف.
           *
           * أثرُه: معلمٌ يفتح نشاطاً منشوراً ويصلح فيه حرفاً بعد أن سلّم
           * ثلاثون طالباً، فتضيع اختياراتهم الثلاثون بصمت — وإيصالُ الطالب
           * ما زال يقول له إن إجابته «وصلت ومحفوظة». وهذا نقضٌ لأصرح وعدٍ
           * في المنتج.
           *
           * فصار التوفيق هو القاعدة، كما هو للأسئلة أعلاه: ما بقي يُحدَّث،
           * وما جدّ يُدرَج، ولا يُحذف إلا ما حذفه المعلم فعلاً. وحذفُ خيارٍ
           * قصده المعلم يُفرّغ ما أشار إليه — وذلك صوابٌ لا عطل: الخيار لم
           * يعد موجوداً.
           */
          const storedOptions = db
            .select({ id: questionOptions.id })
            .from(questionOptions)
            .where(eq(questionOptions.questionId, question.id))
            .all()
            .map((row) => row.id);

          const keptOptions = question.type === 'choice' ? question.options.map((one) => one.id) : [];
          for (const optionId of storedOptions) {
            if (!keptOptions.includes(optionId)) {
              db.delete(questionOptions).where(eq(questionOptions.id, optionId)).run();
            }
          }

          if (question.type !== 'choice') return;
          question.options.forEach((option, at) => {
            const fields = {
              questionId: question.id,
              position: at,
              text: option.text,
              isCorrect: option.isCorrect,
            };
            if (storedOptions.includes(option.id)) {
              db.update(questionOptions).set(fields).where(eq(questionOptions.id, option.id)).run();
            } else {
              db.insert(questionOptions)
                .values({ id: option.id, ...fields })
                .run();
            }
          });
        });

        db.update(activities).set({ updatedAt: now() }).where(eq(activities.id, activityId)).run();
      });
    },

    /** أعداد جدول `T15`: الأسئلة، والمسلَّم، وما ينتظر المراجعة. */
    tally(classId: string): Map<string, ActivityTally> {
      const result = new Map<
        string,
        { questions: number; choiceQuestions: number; textQuestions: number; submissions: number; pendingReview: number }
      >();
      const ids = db
        .select({ id: activities.id })
        .from(activities)
        .where(eq(activities.classId, classId))
        .all()
        .map((row) => row.id);
      if (ids.length === 0) return result;
      for (const id of ids) {
        result.set(id, {
          questions: 0,
          choiceQuestions: 0,
          textQuestions: 0,
          submissions: 0,
          pendingReview: 0,
        });
      }

      for (const row of db
        .select({ activityId: questions.activityId, type: questions.type })
        .from(questions)
        .where(inArray(questions.activityId, ids))
        .all()) {
        const entry = result.get(row.activityId);
        if (!entry) continue;
        entry.questions += 1;
        if (row.type === 'choice') entry.choiceQuestions += 1;
        else entry.textQuestions += 1;
      }

      for (const row of db
        .select({ activityId: submissions.activityId, status: submissions.status })
        .from(submissions)
        .where(inArray(submissions.activityId, ids))
        .all()) {
        const entry = result.get(row.activityId);
        if (!entry) continue;
        entry.submissions += 1;
        if (row.status !== 'reviewed') entry.pendingReview += 1;
      }

      return result;
    },

    /**
     * مقام كسر «١٤ من ٢١» في `T15`.
     * المُخرَج من الفصل لا يُحتسب: معلمٌ يرى «١٤ من ٢١» وثلاثةٌ منهم مُخرَجون
     * ينتظر إجاباتٍ لن تأتي.
     */
    rosterSize(classId: string): number {
      return db
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.classId, classId), isNull(students.removedAt)))
        .all().length;
    },
  };
}
