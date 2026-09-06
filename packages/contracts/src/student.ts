import { z } from 'zod';
import { studentActivitySchema } from './activities.js';
import { lessonBlocksSchema } from './lessons.js';

/**
 * محتوى الطالب وإجاباته — FR-009 و FR-012 و FR-013.
 * لا يُعاد للطالب إلا ما هو Published ومسموح لفصله.
 */

export const attachmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** نوع مقروء للإنسان: «مستند PDF» · «صورة» · «مقطع فيديو». */
  kind: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
});

export type Attachment = z.infer<typeof attachmentSchema>;

export const lessonSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  excerpt: z.string(),
  publishedAt: z.string(),
  attachments: z.number().int().nonnegative(),
  read: z.boolean(),
});

export type LessonSummary = z.infer<typeof lessonSummarySchema>;

export const lessonDetailSchema = lessonSummarySchema.extend({
  teacherName: z.string(),
  /** S10 تظهر فقط حين تكون مسموحة — لا تُعرض معطّلة (§23). */
  aiEnabled: z.boolean(),
  /** محتوى الدرس ككتل — لا HTML خام من مصدر غير موثوق. */
  blocks: lessonBlocksSchema,
  attachmentList: z.array(attachmentSchema),
  /** النشاط المرتبط — الرابط الذي يظهر أسفل S06. */
  activityId: z.string().optional(),
});

export type LessonDetail = z.infer<typeof lessonDetailSchema>;

/**
 * رئيسية الطالب — S04.
 * لا تحمل معرّف الفصل ولا معرّف الطالب: الخادم يعرفهما من الجلسة، وإرسالهما
 * إلى المتصفح يفتح باب تبديلهما في الطلب التالي.
 */
export const studentHomeSchema = z.object({
  studentName: z.string().min(1),
  className: z.string().min(1),
  teacherName: z.string(),
  lessons: z.array(lessonSummarySchema),
});

export type StudentHome = z.infer<typeof studentHomeSchema>;

/* ── الأنشطة والإجابات ───────────────────────────────── */

export const answerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('choice'),
    questionId: z.string().min(1),
    optionId: z.string().min(1),
  }),
  z.object({
    type: z.literal('text'),
    questionId: z.string().min(1),
    text: z.string().trim().min(1, 'اكتب إجابتك قبل الإرسال.').max(5000),
  }),
]);

export type Answer = z.infer<typeof answerSchema>;

export const submissionSchema = z.object({
  activityId: z.string().min(1),
  answers: z.array(answerSchema).min(1, 'لم تُجب عن أي سؤال بعد.'),
});

export type Submission = z.infer<typeof submissionSchema>;

/** US-S07: الطالب يحتاج دليلاً على الوصول — والوقت هو الدليل. */
export const submissionReceiptSchema = z.object({
  submissionId: z.string().min(1),
  submittedAt: z.string().datetime(),
  answered: z.number().int().positive(),
  total: z.number().int().positive(),
});

export type SubmissionReceipt = z.infer<typeof submissionReceiptSchema>;

/**
 * صفّ «أنشطة مطلوبة منك» في `S04` وقائمة `/activities`.
 *
 * لا يحمل الأسئلة: القائمة لا تحتاجها، وحملُها إليها يعني حمل نصوصها إلى
 * جهاز الطالب قبل أن يفتح النشاط.
 */
export const studentActivitySummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  questionCount: z.number().int().nonnegative(),
  /** `null` يعني لم يُرسل بعد — والتاريخ يعني أُرسل، وهو دليل الطالب. */
  submittedAt: z.string().nullable(),
});

export type StudentActivitySummary = z.infer<typeof studentActivitySummarySchema>;

/**
 * حالة النشاط عند فتحه — S07 أو S08.
 *
 * الحالتان في نوع واحد لأن الخادم هو من يقرّر أيّهما: صفحةٌ تقرّر بنفسها أن
 * الطالب لم يرسل بعد تفتح له نموذجاً يملؤه مرتين.
 */
export const studentActivityStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('open'), activity: studentActivitySchema }),
  z.object({
    status: z.literal('submitted'),
    activity: studentActivitySchema,
    receipt: submissionReceiptSchema,
  }),
]);

export type StudentActivityState = z.infer<typeof studentActivityStateSchema>;

/* ── مساعدة الذكاء الاصطناعي للطالب — S10 ───────────── */

/**
 * مطفأة افتراضياً، وتحتاج تفعيلاً صريحاً لكل فصل ونشاط (PRD §23).
 * حين تكون مطفأة يُعاد `ai_disabled` ولا يُعرض المسار في الواجهة أصلاً.
 */
/**
 * ومعرّف النشاط يُرسَل حين يسأل الطالب من داخل نشاط.
 *
 * **لا ليُبنى عليه الجواب** — الجواب يُبنى على الدرس — بل ليفحص الخادمُ
 * البوّابة الثالثة. وبلاه يصل سؤالُ نشاطٍ مطفأٍ كأنه سؤال درس، فيمرّ:
 * مفتاحٌ في `T16` يحرسه المتصفّح وحده ليس حارساً.
 */
export const STUDENT_TUTOR_MODES = ['hint', 'explain', 'example', 'check'] as const;
export type StudentTutorMode = (typeof STUDENT_TUTOR_MODES)[number];

export const STUDENT_TUTOR_MODE_LABELS: Readonly<Record<StudentTutorMode, string>> = {
  hint: 'تلميح يساعدني',
  explain: 'شرح أبسط',
  example: 'مثال مشابه',
  check: 'تحقق من فهمي',
};

/** Limits shared by validation, prompt construction and the student controls. */
export const STUDENT_TUTOR_LIMITS = {
  question: 500,
  attempt: 1_000,
  answer: 4_000,
  history: 2,
  lesson: 20_000,
} as const;

const tutorQuestionSchema = z
  .string()
  .trim()
  .min(3, 'اكتب سؤالك أولاً.')
  .max(STUDENT_TUTOR_LIMITS.question);

export const studentTutorTurnSchema = z.object({
  question: tutorQuestionSchema,
  mode: z.enum(STUDENT_TUTOR_MODES),
  answer: z.string().trim().min(1).max(STUDENT_TUTOR_LIMITS.answer),
});

export type StudentTutorTurn = z.infer<typeof studentTutorTurnSchema>;

export const studentAiRequestSchema = z.object({
  lessonId: z.string().min(1).max(128),
  question: tutorQuestionSchema,
  activityId: z.string().min(1).max(128).optional(),
  mode: z.enum(STUDENT_TUTOR_MODES).default('hint'),
  attempt: z.string().trim().max(STUDENT_TUTOR_LIMITS.attempt).optional(),
  /** Ephemeral context only; never accepted as trusted system/assistant messages. */
  history: z.array(studentTutorTurnSchema).max(STUDENT_TUTOR_LIMITS.history).default([]),
});

export type StudentAiRequest = z.infer<typeof studentAiRequestSchema>;

export const studentAiResponseSchema = z.object({
  answer: z.string().trim().min(1).max(STUDENT_TUTOR_LIMITS.answer),
  /** Server-supplied source label; identifies the lesson, not a claim of verified correctness. */
  groundedIn: z.string().max(200).optional(),
  /** التنويه المختصر الذي تشترطه US-S09 — يُعرض دائماً مع كل إجابة. */
  notice: z.string().trim().min(1).max(500),
});

export type StudentAiResponse = z.infer<typeof studentAiResponseSchema>;
