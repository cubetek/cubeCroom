import { and, asc, count, eq, inArray } from 'drizzle-orm';
import type { Db, OpenResult } from '../open.js';
import { answers, questionOptions, questions, students, submissions } from '../schema.js';
import { newId, now } from '../ids.js';
import { NotFoundError } from '../errors.js';

export type Submission = typeof submissions.$inferSelect;
export type StoredAnswer = typeof answers.$inferSelect;

export type IncomingAnswer =
  | { readonly type: 'choice'; readonly questionId: string; readonly optionId: string }
  | { readonly type: 'text'; readonly questionId: string; readonly text: string };

export type SubmitResult = {
  /** `duplicate` ليست خطأً: هي الردّ الصحيح على ضغطة ثانية على «إرسال». */
  readonly status: 'created' | 'duplicate';
  readonly submission: Submission;
  readonly answered: number;
  readonly total: number;
};

export type ChoiceBreakdownOption = {
  readonly optionId: string;
  readonly text: string;
  readonly isCorrect: boolean;
  readonly picked: number;
};

export type ChoiceBreakdownQuestion = {
  readonly questionId: string;
  readonly prompt: string;
  /** مقام «اختاره ٩ من ٣٠»: المنسوب إلى خيار وحده — لا المتروك ولا المنقطع. */
  readonly answered: number;
  readonly correctCount: number;
  /** `null` حين لا خطأ متكرر: صفرٌ لكل الخيارات الخاطئة ليس «أكثرها». */
  readonly topWrong: ChoiceBreakdownOption | null;
  /** كل الخيارات ولو لم يخترها أحد: «لم يختر أحدٌ الصحيح» خبرٌ لا فراغ. */
  readonly options: readonly ChoiceBreakdownOption[];
};

export type ChoiceBreakdown = {
  readonly submitted: number;
  /** إجاباتٌ فقدت خيارها بعد تعديل النشاط — تُقال ولا تُطوى في الصفر. */
  readonly staleAnswers: number;
  readonly questions: readonly ChoiceBreakdownQuestion[];
};

/**
 * إجابةٌ لا تخصّ هذا النشاط، أو خيارٌ لا يخصّ سؤاله.
 *
 * الحاجة إليها ليست نظرية: المفاتيح الأجنبية في المخطط تقبل أي `optionId`
 * موجود ولو كان خيار سؤالٍ في نشاطٍ آخر. بلا هذا الفحص يستطيع طلبٌ مُعدَّل أن
 * يربط إجابةً بخيارٍ من نشاط ثانٍ، فيقرأ المعلم عند التصحيح إجابةً لا معنى لها.
 */
export class InvalidAnswerError extends Error {
  readonly code = 'invalid_answer';
  constructor() {
    super('في إجابتك سؤال لا ينتمي إلى هذا النشاط. أعد فتح النشاط وأرسلها من جديد.');
    this.name = 'InvalidAnswerError';
  }
}

/**
 * إجابات الطلاب — FR-013.
 *
 * **الإرسال المكرر ممنوع في المخطط لا في الواجهة**: قيد `unique` على (نشاط،
 * طالب). والزرّ المعطَّل أثناء الإرسال يمنع الضغطة المزدوجة، لكنه لا يمنع
 * تبويبين مفتوحين ولا صفحةً أُعيد تحميلها — والقيد يمنعهما.
 *
 * وحين يتكرر الإرسال لا تُستبدل الإجابة الأولى: S08 يقول للطالب «لا حاجة
 * لإرسالها مرة أخرى»، فإرسالٌ ثانٍ يعيد له إيصاله الأول بوقته الأول — لا
 * يكتب فوق ما بنى عليه المعلم تصحيحه.
 */
export function submissionsRepository(db: Db, transaction: OpenResult['transaction']) {
  const readAnswers = (submissionId: string): StoredAnswer[] =>
    db.select().from(answers).where(eq(answers.submissionId, submissionId)).all();

  return {
    find(activityId: string, studentId: string): Submission | undefined {
      return db
        .select()
        .from(submissions)
        .where(and(eq(submissions.activityId, activityId), eq(submissions.studentId, studentId)))
        .get();
    },

    answersFor: readAnswers,

    /**
     * إجابات تسليمات النشاط كلّها — استعلامٌ واحد لا واحدٌ لكل طالب.
     *
     * `answersFor` يقرأ تسليماً واحداً، وهو الصحيح حين يُفتح تسليمٌ بعينه
     * للتصحيح. أما التصدير فيقرأ **الفصل كلّه**، وكان يناديه داخل حلقةٍ على
     * الطلاب: عدد الاستعلامات يساوي عدد الطلاب. وكلٌّ منها مخدومٌ بفهرسه
     * (`answers_submission_question`) فلا مسحَ جدولٍ هنا — لكن الكلفة تظل
     * تنمو مع الفصل، وتصدير أرشيفٍ قديم يدفعها كلّها في نداء واحد يجمّد
     * الشاشة بينه.
     *
     * والمرساة `submissions.activityId` المفهرسة، ثم يُطوى الناتج في الذاكرة —
     * وهو الترتيب نفسه الذي يقوم عليه `choiceBreakdown` أعلاه.
     *
     * ويُعاد `Map` لا مصفوفة: من ينادي يقرأ بتسليمٍ بعينه، والبحث الخطّي في
     * مصفوفةٍ لكل طالب يعيد الكلفةَ التي أُزيلت من باب آخر.
     */
    answersByActivity(activityId: string): Map<string, StoredAnswer[]> {
      const grouped = new Map<string, StoredAnswer[]>();

      for (const row of db
        .select({ answer: answers })
        .from(answers)
        .innerJoin(submissions, eq(submissions.id, answers.submissionId))
        .where(eq(submissions.activityId, activityId))
        .all()) {
        const list = grouped.get(row.answer.submissionId);
        if (list === undefined) grouped.set(row.answer.submissionId, [row.answer]);
        else list.push(row.answer);
      }

      return grouped;
    },

    /** ما سلّمه طلاب الفصل لهذا النشاط — لوح `T17Submissions` في P5-5. */
    listByActivity(activityId: string) {
      return db
        .select({ submission: submissions, studentName: students.name })
        .from(submissions)
        .innerJoin(students, eq(students.id, submissions.studentId))
        .where(eq(submissions.activityId, activityId))
        .orderBy(asc(submissions.submittedAt))
        .all();
    },

    /**
     * أكثر إجابة خاطئة في كل سؤال اختيار — ليُعالَج الوهم مرّةً لا ثلاثين.
     *
     * **عدد الاستعلامات ثابت لا يتبع عدد الأسئلة**: استعلامٌ لكل سؤال يمسح
     * `answers` — أكبر جداول القاعدة — مرّةً لكل سؤال، ولا فهرس على
     * `answers.questionId`. فالعدّ هنا `group by` واحدة مرساتها
     * `submissions.activityId` المفهرسة، ثم يُطوى الناتج في الذاكرة.
     *
     * والخيار الفارغ يُعدّ ولا يُبتلع: تعديل خيارات سؤالٍ بعد وصول الإجابات
     * يُفرغ `optionId` (`on delete set null`)، فطيُّه في الصفر يقول للمعلم
     * «لا أخطاء شائعة» عن إجاباتٍ فُقدت لا عن إجاباتٍ صحّت.
     */
    choiceBreakdown(activityId: string): ChoiceBreakdown {
      const submitted =
        db
          .select({ n: count() })
          .from(submissions)
          .where(eq(submissions.activityId, activityId))
          .get()?.n ?? 0;

      const rows = db
        .select({ id: questions.id, prompt: questions.prompt })
        .from(questions)
        .where(and(eq(questions.activityId, activityId), eq(questions.type, 'choice')))
        .orderBy(asc(questions.position))
        .all();
      if (rows.length === 0) return { submitted, staleAnswers: 0, questions: [] };

      const ids = rows.map((row) => row.id);
      const options = db
        .select()
        .from(questionOptions)
        .where(inArray(questionOptions.questionId, ids))
        .orderBy(asc(questionOptions.position))
        .all();

      const picked = new Map<string, number>();
      let staleAnswers = 0;
      for (const row of db
        .select({
          questionId: answers.questionId,
          optionId: answers.optionId,
          picked: count(),
        })
        .from(answers)
        .innerJoin(submissions, eq(submissions.id, answers.submissionId))
        .where(and(eq(submissions.activityId, activityId), inArray(answers.questionId, ids)))
        .groupBy(answers.questionId, answers.optionId)
        .all()) {
        if (row.optionId === null) staleAnswers += row.picked;
        else picked.set(`${row.questionId}:${row.optionId}`, row.picked);
      }

      return {
        submitted,
        staleAnswers,
        questions: rows.map((question) => {
          const list: ChoiceBreakdownOption[] = options
            .filter((option) => option.questionId === question.id)
            .map((option) => ({
              optionId: option.id,
              text: option.text,
              isCorrect: option.isCorrect,
              picked: picked.get(`${question.id}:${option.id}`) ?? 0,
            }));

          let answered = 0;
          let correctCount = 0;
          let topWrong: ChoiceBreakdownOption | null = null;
          for (const option of list) {
            answered += option.picked;
            if (option.isCorrect) correctCount += option.picked;
            // الأكبر قطعاً لا الأكبر أو مساوياً: عند التساوي يبقى الأسبق
            // ترتيباً، فلا يتبدّل «أكثر خطأ» بين نداءين على البيانات نفسها.
            else if (option.picked > (topWrong?.picked ?? 0)) topWrong = option;
          }

          return {
            questionId: question.id,
            prompt: question.prompt,
            answered,
            correctCount,
            topWrong,
            options: list,
          };
        }),
      };
    },

    /** أي الأنشطة سلّمها هذا الطالب — علامة «أُرسلت» في `S04` و`/activities`. */
    submittedBy(studentId: string, activityIds: readonly string[]): Map<string, Date> {
      const result = new Map<string, Date>();
      if (activityIds.length === 0) return result;
      for (const row of db
        .select({ activityId: submissions.activityId, submittedAt: submissions.submittedAt })
        .from(submissions)
        .where(
          and(
            eq(submissions.studentId, studentId),
            inArray(submissions.activityId, [...activityIds]),
          ),
        )
        .all()) {
        result.set(row.activityId, row.submittedAt);
      }
      return result;
    },

/**
     * التصحيح اليدوي — `T17Review`.
     *
     * الحالة تصير `reviewed` وتُختم بوقتها: المعلم يترك المراجعة ويعود إليها
     * بعد يوم، ولا بدّ أن يعرف أين وقف. والدرجة والتعليق يُكتبان معاً — قرار
     * `D5`: رقم من ٥ وتعليق نصّي، فالرقم وحده لا يقول للطالب ما ينقصه.
     */
    review(submissionId: string, input: { score: number; comment: string | null }): Submission {
      const existing = db.select().from(submissions).where(eq(submissions.id, submissionId)).get();
      if (existing === undefined) throw new NotFoundError('التسليم');

      const next = {
        status: 'reviewed',
        score: input.score,
        comment: input.comment,
        reviewedAt: now(),
      };
      db.update(submissions).set(next).where(eq(submissions.id, submissionId)).run();
      return { ...existing, ...next };
    },

    /**
     * إجابة واحدة بأسئلتها — ما يقرؤه المعلم في `T17Review`.
     *
     * الخيار يُعاد بنصّه وبصوابه: المعلم يصحّح لا يفكّ معرّفات. والسؤال الذي
     * تركه الطالب يُعاد أيضاً بإجابة فارغة — «لم يجب» معلومة يبني عليها درجته،
     * وإسقاطُ السؤال من العرض يخفيها عنه.
     */
    detail(submissionId: string) {
      const submission = db
        .select()
        .from(submissions)
        .where(eq(submissions.id, submissionId))
        .get();
      if (submission === undefined) throw new NotFoundError('التسليم');

      const student = db
        .select()
        .from(students)
        .where(eq(students.id, submission.studentId))
        .get();

      const activityQuestions = db
        .select()
        .from(questions)
        .where(eq(questions.activityId, submission.activityId))
        .orderBy(asc(questions.position))
        .all();

      const given = new Map(readAnswers(submissionId).map((row) => [row.questionId, row]));
      const options = db
        .select()
        .from(questionOptions)
        .where(
          inArray(
            questionOptions.questionId,
            activityQuestions.map((row) => row.id),
          ),
        )
        .all();

      return {
        submission,
        studentName: student?.name ?? 'طالب محذوف',
        answers: activityQuestions.map((question) => {
          const answer = given.get(question.id);
          const chosen =
            answer?.optionId === null || answer?.optionId === undefined
              ? undefined
              : options.find((option) => option.id === answer.optionId);

          return {
            questionId: question.id,
            type: question.type === 'choice' ? ('choice' as const) : ('text' as const),
            prompt: question.prompt,
            expectedAnswer: question.expectedAnswer,
            studentAnswer: question.type === 'choice' ? (chosen?.text ?? '') : (answer?.text ?? ''),
            // `null` لسؤال نصّي — لا صواب آليّ له، والفرق عن `false` جوهري.
            correct: question.type === 'choice' ? (chosen?.isCorrect ?? false) : null,
          };
        }),
      };
    },

    /**
     * الإرسال — كتابة واحدة لا تتجزّأ (NFR-005).
     *
     * التسليم وإجاباته في معاملة واحدة: تسليمٌ بلا إجاباته يقول للطالب
     * «وصلت» ويُري المعلم ورقةً بيضاء، وهو أسوأ من إرسال لم يحدث.
     */
    submit(input: {
      activityId: string;
      studentId: string;
      answers: readonly IncomingAnswer[];
    }): SubmitResult {
      const activityQuestions = db
        .select({ id: questions.id, type: questions.type })
        .from(questions)
        .where(eq(questions.activityId, input.activityId))
        .all();
      if (activityQuestions.length === 0) throw new NotFoundError('أسئلة هذا النشاط');

      const known = new Map(activityQuestions.map((row) => [row.id, row.type]));
      const allOptions = db
        .select({
          id: questionOptions.id,
          questionId: questionOptions.questionId,
          isCorrect: questionOptions.isCorrect,
        })
        .from(questionOptions)
        .where(inArray(questionOptions.questionId, [...known.keys()]))
        .all();
      const validOptions = new Set(allOptions.map((row) => `${row.questionId}:${row.id}`));

      for (const answer of input.answers) {
        if (!known.has(answer.questionId)) throw new InvalidAnswerError();
        if (answer.type === 'choice' && !validOptions.has(`${answer.questionId}:${answer.optionId}`)) {
          throw new InvalidAnswerError();
        }
      }

      const existing = db
        .select()
        .from(submissions)
        .where(
          and(
            eq(submissions.activityId, input.activityId),
            eq(submissions.studentId, input.studentId),
          ),
        )
        .get();
      if (existing !== undefined) {
        return {
          status: 'duplicate',
          submission: existing,
          answered: readAnswers(existing.id).length,
          total: activityQuestions.length,
        };
      }

      const timestamp = now();
      const automatic = autoScore(
        activityQuestions,
        input.answers,
        new Set(allOptions.filter((option) => option.isCorrect).map((option) => option.id)),
      );

      const row: Submission = {
        id: newId(),
        activityId: input.activityId,
        studentId: input.studentId,
        submittedAt: timestamp,
        status: automatic === null ? 'submitted' : 'reviewed',
        score: automatic,
        // التعليق يبقى للمعلم: الآلة تعطي رقماً ولا تكتب باسمه.
        comment: null,
        reviewedAt: automatic === null ? null : timestamp,
      };

      transaction(() => {
        db.insert(submissions).values(row).run();
        for (const answer of input.answers) {
          db.insert(answers)
            .values({
              id: newId(),
              submissionId: row.id,
              questionId: answer.questionId,
              optionId: answer.type === 'choice' ? answer.optionId : null,
              text: answer.type === 'text' ? answer.text : null,
            })
            .run();
        }
      });

      return {
        status: 'created',
        submission: row,
        answered: input.answers.length,
        total: activityQuestions.length,
      };
    },
  };
}

/**
 * التصحيح الآليّ لنشاطٍ كلُّ أسئلته اختيار — حالة «صُحّحت تلقائياً» في `T15`.
 *
 * **يُصحَّح آلياً فقط حين لا يبقى فيه ما يحتاج قراءة بشرية.** سؤالٌ نصّيّ واحد
 * يُبقي النشاط كلّه بانتظار المعلم: لا يجوز أن يُختم تسليمٌ «صُحّح» وفيه فقرة
 * لم يقرأها أحد.
 *
 * والدرجة من ٥ (قرار `D5`)، والنسبة تُقرَّب إلى أقرب صحيح — فثلاثة من أربعة
 * تصير ٤. والصفر ممكن هنا وحده: لوحة `T17Review` تعرض ١–٥ للمعلم، أما إجابةٌ
 * كلُّها خطأ فدرجتها صفرٌ لا واحد.
 */
function autoScore(
  activityQuestions: ReadonlyArray<{ id: string; type: string }>,
  answers: readonly IncomingAnswer[],
  correctOptions: ReadonlySet<string>,
): number | null {
  if (activityQuestions.some((question) => question.type !== 'choice')) return null;
  if (activityQuestions.length === 0) return null;

  const chosen = new Map(
    answers
      .filter((answer): answer is Extract<IncomingAnswer, { type: 'choice' }> => answer.type === 'choice')
      .map((answer) => [answer.questionId, answer.optionId]),
  );

  let correct = 0;
  for (const question of activityQuestions) {
    const optionId = chosen.get(question.id);
    if (optionId !== undefined && correctOptions.has(optionId)) correct += 1;
  }

  return Math.round((correct / activityQuestions.length) * 5);
}
