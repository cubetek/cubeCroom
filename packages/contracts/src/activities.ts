import { z } from 'zod';

/**
 * عقود الأنشطة — FR-012.
 *
 * **القاعدة التي يقوم عليها هذا الملف كله:** مفتاح الإجابة لا يوجد في نوع
 * الطالب أصلاً. ليس حقلاً يُحذف عند الإرسال، ولا حقلاً تختار الشاشة ألّا
 * ترسمه — بل حقلٌ **غير موجود في `StudentActivity`**. فكودٌ يسرّبه لا يعمل
 * أصلاً، بدل أن يعمل ويسرّب.
 *
 * ولهذا مسار واحد يبني منظور الطالب: `toStudentActivity`. معاينة المعلم في
 * `T16` تمرّ به هي أيضاً — فما يراه في المعاينة هو ما يراه الطالب حرفياً، لا
 * شبيهه المرسوم مرة ثانية بيد أخرى.
 */

export const questionTypeSchema = z.enum(['choice', 'text']);

export type QuestionType = z.infer<typeof questionTypeSchema>;

export const activityStatusSchema = z.enum(['draft', 'published']);

export type ActivityStatus = z.infer<typeof activityStatusSchema>;

export const activityTitleSchema = z
  .string()
  .trim()
  .min(2, 'اكتب عنواناً للنشاط حتى يعرفه طلابك.')
  .max(150, 'العنوان طويل أكثر من اللازم.');

export const questionPromptSchema = z.string().trim().max(1000);

/** حدّ الخيارات من لوح `T16Builder`: أربعة مرسومة، والسادس متّسع لا وعد. */
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

export const questionOptionSchema = z.object({
  id: z.string().min(1),
  text: z.string().trim().max(300),
  isCorrect: z.boolean(),
});

export type QuestionOption = z.infer<typeof questionOptionSchema>;

/**
 * النوع على السؤال لا على النشاط — كما في مخطط القاعدة ولوح `T16`: كل سؤال
 * يحمل مبدّله الخاص، فنشاطٌ فيه سؤالا اختيار وسؤال قصير حالة مقصودة لا خطأ.
 */
export const teacherQuestionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('choice'),
    id: z.string().min(1),
    prompt: questionPromptSchema,
    points: z.number().int().min(1).max(20),
    options: z.array(questionOptionSchema).max(MAX_OPTIONS),
  }),
  z.object({
    type: z.literal('text'),
    id: z.string().min(1),
    prompt: questionPromptSchema,
    points: z.number().int().min(1).max(20),
    /** «الإجابة المتوقَّعة» — للمقارنة عند التصحيح اليدوي في `T17Review`. */
    expectedAnswer: z.string().trim().max(1000).nullable(),
  }),
]);

export type TeacherQuestion = z.infer<typeof teacherQuestionSchema>;

export const teacherQuestionsSchema = z.array(teacherQuestionSchema).max(50);

export const teacherActivitySummarySchema = z.object({
  id: z.string().min(1),
  classId: z.string().min(1),
  title: z.string().min(1),
  status: activityStatusSchema,
  lessonId: z.string().nullable(),
  lessonTitle: z.string().nullable(),
  studentAiEnabled: z.boolean(),
  publishedAt: z.string().nullable(),
  updatedAt: z.string(),
  /** عدد الأسئلة وحده — جدول `T15` لا يحتاج نصوصها، فلا تُحمَّل ولا تُرسَل. */
  questionCount: z.number().int().nonnegative(),
  /** عمود «النوع» مصوغاً — يُحسب من أنواع الأسئلة لا من حقل على النشاط. */
  kind: z.string().min(1),
  /** عمود «الإجابات» في `T15`: كم سلّم من كم طالب في الفصل. */
  submissions: z.number().int().nonnegative(),
  roster: z.number().int().nonnegative(),
  pendingReview: z.number().int().nonnegative(),
});

export type TeacherActivitySummary = z.infer<typeof teacherActivitySummarySchema>;

export const teacherActivityDetailSchema = teacherActivitySummarySchema.extend({
  questions: teacherQuestionsSchema,
});

export type TeacherActivityDetail = z.infer<typeof teacherActivityDetailSchema>;

/* ── منظور الطالب ──────────────────────────────────── */

/**
 * ما يصل الطالب — ولا شيء غيره.
 *
 * لاحظ ما ليس هنا: لا `isCorrect` ولا `expectedAnswer` ولا `status`. الخيار
 * عند الطالب معرّفٌ ونصّ فقط، فحتى لو فتح أدوات المطوّر في متصفّحه لم يجد
 * الإجابة في الصفحة — لأنها لم تُرسل إليه.
 */
export const studentQuestionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('choice'),
    id: z.string().min(1),
    prompt: z.string(),
    points: z.number().int(),
    options: z.array(z.object({ id: z.string().min(1), text: z.string() })),
  }),
  z.object({
    type: z.literal('text'),
    id: z.string().min(1),
    prompt: z.string(),
    points: z.number().int(),
  }),
]);

export type StudentQuestion = z.infer<typeof studentQuestionSchema>;

export const studentActivitySchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  questions: z.array(studentQuestionSchema),
  /**
   * درسُ المساعدة — `null` حين لا مساعدة في هذا النشاط.
   *
   * **والمساعدة تُبنى على الدرس لا على أسئلة النشاط.** الطالب يُقاس الآن،
   * ونموذجٌ يرى السؤال يُسأل عن إجابته. فيُرجَع إلى المادة التي كتبها معلمه:
   * يراجع ولا يُملى عليه. وهذا يمنع تسريب مفتاح الإجابة **بحكم البنية** لا
   * بحكم تعليماتٍ للنموذج — فالمفتاح لا يصل إليه أصلاً.
   *
   * ونشاطٌ بلا درس مرتبط لا مساعدة فيه: لا مادة تُراجَع.
   */
  helpLessonId: z.string().min(1).nullable(),
});

export type StudentActivity = z.infer<typeof studentActivitySchema>;

/**
 * الإسقاط الوحيد من منظور المعلم إلى منظور الطالب.
 *
 * يُبنى كائنٌ جديد حقلاً حقلاً، ولا يُنسخ الأصل بـ`...` ثم يُحذف منه: النسخُ
 * ثم الحذف يجعل كل حقل يُضاف لاحقاً **يتسرّب افتراضياً** حتى ينتبه أحد. هنا
 * العكس: الحقل الجديد لا يصل الطالب حتى يُكتب هنا بيده.
 */
export function toStudentActivity(activity: {
  id: string;
  title: string;
  questions: readonly TeacherQuestion[];
  /** يُمرَّر صراحةً: الحقل الجديد لا يصل الطالب حتى يُكتب هنا بيده. */
  helpLessonId?: string | null;
}): StudentActivity {
  return {
    id: activity.id,
    title: activity.title,
    helpLessonId: activity.helpLessonId ?? null,
    questions: activity.questions.map((question) =>
      question.type === 'choice'
        ? {
            type: 'choice',
            id: question.id,
            prompt: question.prompt,
            points: question.points,
            options: question.options.map((option) => ({ id: option.id, text: option.text })),
          }
        : {
            type: 'text',
            id: question.id,
            prompt: question.prompt,
            points: question.points,
          },
    ),
  };
}

/**
 * عمود «النوع» في `T15` — قيمة واحدة لنشاطٍ قد تختلف أسئلته.
 *
 * اللوح يرسم قيمتين فقط لأن أنشطته المرسومة متجانسة. و«مختلط» **ليست في
 * اللوح**: أُضيفت لأن `T16` يسمح بالخلط فعلاً، وعرضُ «اختيار من متعدد» لنشاط
 * نصفه أسئلة قصيرة كذبٌ على المعلم في جدوله.
 */
export function activityKind(counts: { readonly choice: number; readonly text: number }): string {
  if (counts.choice === 0 && counts.text === 0) return 'بلا أسئلة';
  if (counts.choice > 0 && counts.text > 0) return 'مختلط';
  return counts.choice > 0 ? 'اختيار من متعدد' : 'إجابة قصيرة';
}

/**
 * ما يمنع النشر — يُحسب هنا لا في الشاشة.
 *
 * نشرُ نشاطٍ بسؤال بلا نصّ، أو سؤال اختيار بلا إجابة صحيحة معلَّمة، يضع أمام
 * الطالب سؤالاً لا جواب له ويضع أمام المعلم تصحيحاً مستحيلاً. والمنع عند
 * النشر لا عند الكتابة: المسودة يُسمح أن تكون ناقصة، فهي مسودة.
 */
export function publishBlockers(activity: {
  title: string;
  questions: readonly TeacherQuestion[];
}): string[] {
  const problems: string[] = [];
  if (activity.title.trim().length < 2) problems.push('النشاط بلا عنوان.');
  if (activity.questions.length === 0) problems.push('النشاط بلا أسئلة.');

  activity.questions.forEach((question, index) => {
    const at = index + 1;
    if (question.prompt.trim() === '') problems.push(`السؤال ${at}: نصّ السؤال فارغ.`);
    if (question.type !== 'choice') return;

    const filled = question.options.filter((option) => option.text.trim() !== '');
    if (filled.length < MIN_OPTIONS) problems.push(`السؤال ${at}: يحتاج خيارين على الأقل.`);
    if (!filled.some((option) => option.isCorrect)) {
      problems.push(`السؤال ${at}: لم تُعلَّم الإجابة الصحيحة.`);
    }
  });

  return problems;
}

/* ── مسوّدة إجابات الطالب — S07 · S07SendFail ──────── */

/**
 * ما يُحفظ على جهاز الطالب قبل الإرسال.
 *
 * له مخطط لأنه **مدخل غير موثوق كأي مدخل آخر**: يُقرأ من `localStorage` — وقد
 * كتبه إصدارٌ سابق، أو عبث به أحد، أو تلف. والقاعدة نفسها التي تحكم كتل الدرس
 * تحكمه: ما لا يُقرأ يُسقَط، ويبدأ الطالب من فارغ — ولا تسقط الصفحة عليه.
 */
export const answerDraftSchema = z.object({
  answers: z.record(z.string(), z.string()),
  /** «كُتبت اليوم ١٠:٠٢ ص» في `S07SendFail` — متى آخر تعديل لا متى فُتحت. */
  savedAt: z.string(),
});

export type AnswerDraft = z.infer<typeof answerDraftSchema>;

/**
 * الإجابات كما يقرؤها الطالب — لعرضها عليه حين يفشل الإرسال.
 *
 * **هذا هو نصف معيار الإنجاز الذي يسهل نسيانه:** «الإجابة محفوظة **وتظهر
 * له**». طفلٌ رأى «لم تصل إجابتك» يظنّ أنه فقد ما كتبه، فيعيد كتابته أو ييأس.
 * الرؤية أصدق من الطمأنة.
 *
 * والخيار يُعرض بنصّه لا بمعرّفه: معرّفٌ لا يفهمه لا يطمئنه. وخيارٌ لم يعد
 * موجوداً (عدّل المعلم النشاط) يُسقَط بدل أن يُعرض معرّفه خاماً.
 */
export function readableAnswers(
  activity: StudentActivity,
  answers: Readonly<Record<string, string>>,
): ReadonlyArray<{ questionId: string; prompt: string; answer: string }> {
  const result: Array<{ questionId: string; prompt: string; answer: string }> = [];

  for (const question of activity.questions) {
    const value = (answers[question.id] ?? '').trim();
    if (value === '') continue;

    if (question.type === 'text') {
      result.push({ questionId: question.id, prompt: question.prompt, answer: value });
      continue;
    }

    const option = question.options.find((one) => one.id === value);
    if (option === undefined) continue;
    result.push({ questionId: question.id, prompt: question.prompt, answer: option.text });
  }

  return result;
}

/* ── مدخلات القنوات ────────────────────────────────── */

export const createActivitySchema = z.object({
  classId: z.string().min(1),
  title: activityTitleSchema,
  lessonId: z.string().min(1).nullable().optional(),
});

export type CreateActivityInput = z.infer<typeof createActivitySchema>;

export const updateActivitySchema = z.object({
  id: z.string().min(1),
  title: activityTitleSchema.optional(),
  /** `null` يفكّ الارتباط بالدرس؛ الغياب يُبقيه كما هو. */
  lessonId: z.string().min(1).nullable().optional(),
  questions: teacherQuestionsSchema.optional(),
});

export type UpdateActivityInput = z.infer<typeof updateActivitySchema>;

export const publishActivitySchema = z.object({
  id: z.string().min(1),
  published: z.boolean(),
});

export type PublishActivityInput = z.infer<typeof publishActivitySchema>;

export const activityStudentAiSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
});

export type ActivityStudentAiInput = z.infer<typeof activityStudentAiSchema>;

export const activityIdSchema = z.object({ id: z.string().min(1) });
export const submissionIdSchema = z.object({ id: z.string().min(1) });

/* ── توليد الأسئلة — T16AiGenerate ─────────────────── */

/** أعداد اللوح الثلاثة، لا حقل رقم حرّ: ثلاثة أزرار أسرع من حقل يُكتب فيه. */
export const QUESTION_COUNTS = [3, 5, 10] as const;

export const generateQuestionsSchema = z.object({
  requestId: z.string().min(1).max(64),
  /** النشاط الذي ستُدرج فيه — منه يُعرف فصله، ومنه تُقرأ صلاحية الدرس. */
  activityId: z.string().min(1),
  /** «المصدر» في اللوح: الدرس الذي تُقرأ منه الأسئلة. */
  lessonId: z.string().min(1),
  count: z.union([z.literal(3), z.literal(5), z.literal(10)]),
  type: questionTypeSchema,
});

export type GenerateQuestionsInput = z.infer<typeof generateQuestionsSchema>;

/**
 * ناتج التوليد — أسئلة **مقترحة** لا مُدرجة.
 *
 * المعرّفات تُولَّد في العملية الرئيسية لا في الواجهة: بها تُحدَّد الأسئلة
 * المختارة، وبها تُدرج. و«لا شيء يُكتب» ليس وعداً في نصّ الشاشة — هو أن هذه
 * القناة **لا تكتب في القاعدة أصلاً**: تقرأ الدرس، وتنادي المزوّد، وتعيد.
 */
export const generatedQuestionsSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    questions: teacherQuestionsSchema,
    provider: z.string().min(1),
    model: z.string().min(1),
    tokens: z.number().int().nonnegative().optional(),
    /** ما وصل من النموذج وسقط لأنه غير مقروء — يُقال للمعلم لا يُخفى. */
    dropped: z.number().int().nonnegative(),
  }),
  z.object({ status: z.literal('no_provider') }),
  z.object({ status: z.literal('cancelled') }),
  z.object({
    status: z.literal('empty'),
    message: z.string().min(1),
  }),
  z.object({
    status: z.literal('failed'),
    reason: z.enum(['rejected_key', 'offline', 'quota', 'timeout', 'provider_error']),
    message: z.string().min(1),
    action: z.enum(['open_settings', 'retry']),
  }),
]);

export type GeneratedQuestions = z.infer<typeof generatedQuestionsSchema>;

/* ── المراجعة والتصحيح — T17 ───────────────────────── */

export const submissionStatusSchema = z.enum(['submitted', 'reviewed', 'missing']);

export type SubmissionStatus = z.infer<typeof submissionStatusSchema>;

/**
 * صفّ جدول `T17Submissions`.
 *
 * **الجدول يعدّ الفصل كلّه لا المسلِّمين وحدهم**: «لم يرسل بعد» صفٌّ مثل غيره
 * بلا وقت ولا درجة. معلمٌ يرى قائمة المسلِّمين وحدها لا يعرف من ينقصه إلا
 * بمقارنتها بكشفه — وذلك عملٌ يدويّ يفعله في كل حصة.
 */
export const submissionRowSchema = z.object({
  studentId: z.string().min(1),
  studentName: z.string().min(1),
  /** `null` لمن لم يرسل — ولا يُخترع له معرّف تسليم. */
  submissionId: z.string().nullable(),
  submittedAt: z.string().nullable(),
  status: submissionStatusSchema,
  score: z.number().int().nullable(),
});

export type SubmissionRow = z.infer<typeof submissionRowSchema>;

export const activitySubmissionsSchema = z.object({
  activityId: z.string().min(1),
  title: z.string().min(1),
  status: activityStatusSchema,
  /** بطاقات الأعداد الثلاث في أعلى `T17`. */
  submitted: z.number().int().nonnegative(),
  roster: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  reviewed: z.number().int().nonnegative(),
  missing: z.number().int().nonnegative(),
  rows: z.array(submissionRowSchema),
});

export type ActivitySubmissions = z.infer<typeof activitySubmissionsSchema>;

/**
 * إجابة واحدة كما يقرؤها المعلم في `T17Review`.
 *
 * `correct` ثلاثيّ القيمة عمداً: `true` و`false` لسؤال الاختيار، و`null`
 * للنصّي — لا صواب آليّ له. وجعلُه `false` افتراضياً كان سيلوّن كل إجابة نصّية
 * بلون الخطأ قبل أن يقرأها أحد.
 */
export const reviewAnswerSchema = z.object({
  questionId: z.string().min(1),
  type: questionTypeSchema,
  prompt: z.string(),
  studentAnswer: z.string(),
  expectedAnswer: z.string().nullable(),
  correct: z.boolean().nullable(),
});

export type ReviewAnswer = z.infer<typeof reviewAnswerSchema>;

export const submissionDetailSchema = z.object({
  submissionId: z.string().min(1),
  activityId: z.string().min(1),
  activityTitle: z.string().min(1),
  studentName: z.string().min(1),
  submittedAt: z.string(),
  status: submissionStatusSchema,
  score: z.number().int().nullable(),
  comment: z.string().nullable(),
  answers: z.array(reviewAnswerSchema),
});

export type SubmissionDetail = z.infer<typeof submissionDetailSchema>;

/**
 * الدرجة من ٥ — قرار `D5`.
 *
 * الحدّ الأدنى صفر لا واحد: لوحة `T17Review` تعرض أزرار ١–٥ للمعلم، لكن
 * التصحيح الآليّ لإجابةٍ كلُّها خطأ يعطي صفراً — والعقد يقبل ما يستطيع النظام
 * أن ينتجه، لا ما ترسمه الشاشة وحدها.
 */
export const reviewSubmissionSchema = z.object({
  submissionId: z.string().min(1),
  score: z.number().int().min(0).max(5),
  comment: z.string().trim().max(1000).nullable().optional(),
});

export type ReviewSubmissionInput = z.infer<typeof reviewSubmissionSchema>;

/** الردود السريعة في `T17Review` — تُدرَج في حقل التعليق ولا تُرسل وحدها. */
export const REVIEW_QUICK_COMMENTS = [
  'إجابة ممتازة',
  'راجِع المصطلحات',
  'أعد المحاولة',
] as const;

/**
 * اقتراح تقييم لإجابة نصّية — يخدم `T17Review`.
 *
 * **لا يُرسَل مفتاح الإجابة من الواجهة.** المُدخَل معرّفات فقط، والعملية
 * الرئيسية تقرأ السؤال ومفتاحه وإجابة الطالب من القاعدة. فواجهةٌ تُرسل
 * المفتاح تعني مساراً يستطيع أن يزوّره — والقاعدة نفسها في هذا المشروع:
 * ما يُشتقّ من البيانات لا يُؤخذ من الطلب.
 */
export const suggestReviewSchema = z.object({
  requestId: z.string().min(1).max(64),
  submissionId: z.string().min(1),
  questionId: z.string().min(1),
});

export type SuggestReviewInput = z.infer<typeof suggestReviewSchema>;

/**
 * ناتج الاقتراح — **مسوّدة تُعرض، لا درجة تُحفظ**.
 *
 * `grade` و`comment` كلاهما قد يكون `null`: ما لم يقرأه المحلّل لا يُخمَّن،
 * والمعلم يكمله. و`status` يميّز «لا مزوّد» عن «فشل» عن «سؤال ليس نصّياً»
 * لأن لكلٍّ ما يفعله المعلم بعده.
 */
export const reviewSuggestionResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    grade: z.number().min(0).max(5).nullable(),
    comment: z.string().nullable(),
    provider: z.string().min(1),
    model: z.string().min(1),
    tokens: z.number().int().nonnegative().optional(),
  }),
  /** لا مفتاح مضبوط — تُعرض دعوة للإعداد لا خطأ (كما في `aiResultSchema`). */
  z.object({ status: z.literal('no_provider') }),
  z.object({ status: z.literal('cancelled') }),
  z.object({
    status: z.literal('unreadable'),
    message: z.string().min(1),
  }),
  z.object({
    status: z.literal('failed'),
    reason: z.enum(['rejected_key', 'offline', 'quota', 'timeout', 'provider_error']),
    message: z.string().min(1),
    action: z.enum(['open_settings', 'retry']),
  }),
]);

export type ReviewSuggestionResult = z.infer<typeof reviewSuggestionResultSchema>;

/**
 * توزيع إجابات نشاط الاختيار — يخدم `T17`.
 *
 * **ما يحلّه للمعلم:** التصحيح الآليّ (`D12`) يعطيه درجاتٍ ولا يقول له **أين
 * أخطأ صفُّه**. فيقرأ ثلاثين ورقة ليكتشف أن نصفهم خلط بين مفهومين — أو لا
 * يقرأ، فيمضي ولا يعرف. وهذا يعرض له الخطأ الأكثر تكراراً لكل سؤال، فيعالج
 * مفهوماً واحداً مرة واحدة.
 *
 * وهو **محلّيّ بالكامل**: عدٌّ على بياناتٍ عنده، بلا مزوّد ولا مفتاح. فيعمل
 * لكل معلم لا لمن اشترك في خدمة.
 */
export const choiceBreakdownOptionSchema = z.object({
  optionId: z.string().min(1),
  text: z.string(),
  isCorrect: z.boolean(),
  picked: z.number().int().nonnegative(),
});

export const choiceBreakdownQuestionSchema = z.object({
  questionId: z.string().min(1),
  prompt: z.string(),
  /** مقام «اختاره ٩ من ٣٠» — المنسوب إلى خيار وحده. */
  answered: z.number().int().nonnegative(),
  correctCount: z.number().int().nonnegative(),
  /** `null` حين لا خطأ متكرر: صفرٌ لكل الخيارات الخاطئة ليس «أكثرها». */
  topWrong: choiceBreakdownOptionSchema.nullable(),
  options: z.array(choiceBreakdownOptionSchema),
});

export const choiceBreakdownSchema = z.object({
  submitted: z.number().int().nonnegative(),
  /**
   * إجاباتٌ فقدت خيارها بحذف المعلم إياه — تُقال ولا تُطوى في الصفر.
   * فـ«لا أخطاء شائعة» عن إجاباتٍ فُقدت كذبٌ مطمئن.
   */
  staleAnswers: z.number().int().nonnegative(),
  questions: z.array(choiceBreakdownQuestionSchema),
});

export type ChoiceBreakdownOption = z.infer<typeof choiceBreakdownOptionSchema>;
export type ChoiceBreakdownQuestion = z.infer<typeof choiceBreakdownQuestionSchema>;
export type ChoiceBreakdownResult = z.infer<typeof choiceBreakdownSchema>;

/**
 * نسخ نشاط إلى فصل آخر — يخدم `T15`.
 *
 * معلمٌ يدرّس المادة نفسها لفصلين يبني النشاط مرتين. والنسخة تصل **مسودةً**
 * دائماً: النشر فعلٌ يقصده المعلم لفصلٍ بعينه (`FR-009`)، ونسخةٌ تصل منشورة
 * تُعرض على صفٍّ قبل أن يراجعها أحد.
 */
export const copyActivitySchema = z.object({
  id: z.string().min(1),
  /** الفصل الهدف — قد يكون الفصل نفسه، فالنسخ داخل الفصل تكرارٌ مشروع. */
  targetClassId: z.string().min(1),
});

export type CopyActivityInput = z.infer<typeof copyActivitySchema>;
/**
 * تصدير نتائج نشاط — يخدم `T17`.
 *
 * **ولماذا مجلدٌ لا نافذة حفظ:** نافذة حفظ ويندوز تسأل معلماً غير تقنيّ عن
 * مسارٍ يختاره، فيحفظ في مكانٍ لا يجده بعدها. والنسخ الاحتياطي في هذا
 * التطبيق يفعل الشيء نفسه: يكتب في مجلد معلوم ثم يفتحه. فالتصدير يتبعه.
 */
export const exportedResultsSchema = z.object({
  /** مسار الملفّ كما كُتب — يُعرض للمعلم ليعرف أين ذهب. */
  path: z.string().min(1),
  fileName: z.string().min(1),
  /** عدد الصفوف المكتوبة — الفصل كلّه لا المسلِّمون وحدهم. */
  rows: z.number().int().nonnegative(),
});

export type ExportedResults = z.infer<typeof exportedResultsSchema>;