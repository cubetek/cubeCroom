import { z } from 'zod';
import { providerIdSchema } from './ai.js';
import type { LessonSection } from './lessons.js';

/**
 * إجراءات الذكاء الاصطناعي داخل المحرر — FR-010 · T14.
 *
 * الإجراءات معدودة لا نصّ حرّ وحده: المصدر يقول إن «التصميم الافتراضي يجب أن
 * يبدأ من **نية المعلم** لأن ذلك أسرع وأوضح لمستخدم غير تقني». وحقل «تعليمات
 * أخرى» يبقى لمن يريد صياغته بنفسه.
 */

export const AI_ACTIONS = [
  'explain',
  'simplify',
  'questions',
  'summary',
  'objectives',
  'lesson_plan',
  'misconceptions',
  'exit_ticket',
  'custom',
] as const;

export type AiAction = (typeof AI_ACTIONS)[number];

export const aiActionSchema = z.enum(AI_ACTIONS);

export const AI_ACTION_LABELS: Readonly<Record<AiAction, string>> = {
  explain: 'أنشئ شرحاً',
  simplify: 'بسّط',
  questions: 'حوّل إلى أسئلة',
  summary: 'أنشئ ملخصاً',
  objectives: 'اقترح أهداف تعلّم',
  lesson_plan: 'حضّر تسلسل الدرس',
  misconceptions: 'توقّع مفاهيم خاطئة',
  exit_ticket: 'أنشئ تذكرة خروج',
  custom: 'تعليمات أخرى',
};

export const AI_ACTION_DESCRIPTIONS: Readonly<Record<AiAction, string>> = {
  explain: 'شرح بمثال وخطوة يجرّبها الطالب.',
  simplify: 'تكييف اللغة والخطوات مع مستوى الدعم.',
  questions: 'أسئلة تستدعي التفسير والتطبيق.',
  summary: 'الأفكار الأساسية التي يتذكّرها الطالب.',
  objectives: 'نواتج قابلة للملاحظة والقياس.',
  lesson_plan: 'تهيئة، نموذج، ممارسة وتحقق من الفهم.',
  misconceptions: 'احتمالات للفحص، مع أسئلة تشخيصية.',
  exit_ticket: 'ثلاثة أسئلة قصيرة قبل نهاية الحصة.',
  custom: 'صِغ طلباً يناسب درسَك.',
};

/** Teacher preparation can contain answers; it is never inserted into a student lesson. */
export const AI_ACTION_TARGETS: Readonly<Record<AiAction, LessonSection | null>> = {
  explain: 'content',
  simplify: 'content',
  questions: 'content',
  summary: 'summary',
  objectives: 'outcomes',
  lesson_plan: null,
  misconceptions: null,
  exit_ticket: 'content',
  custom: 'content',
};

export const TEACHER_AI_STAGES = [
  { value: 'primary', label: 'الابتدائية' },
  { value: 'middle', label: 'المتوسطة' },
  { value: 'secondary', label: 'الثانوية' },
] as const;

export const TEACHER_AI_SUPPORT = [
  { value: 'balanced', label: 'دعم متوازن' },
  { value: 'scaffolded', label: 'خطوات أصغر ودعم إضافي' },
  { value: 'challenge', label: 'تحدٍ وتطبيق أعمق' },
] as const;

export const teacherAiContextSchema = z.object({
  stage: z.enum(['primary', 'middle', 'secondary']),
  support: z.enum(['balanced', 'scaffolded', 'challenge']),
  durationMinutes: z.number().int().min(10).max(120),
});
export type TeacherAiContext = z.infer<typeof teacherAiContextSchema>;
export const DEFAULT_TEACHER_AI_CONTEXT: Readonly<TeacherAiContext> = {
  stage: 'primary',
  support: 'balanced',
  durationMinutes: 45,
};
export const MAX_TEACHER_AI_CONTENT = 20_000;

export const runAiSchema = z.object({
  /** معرّف يولّده العميل ليستطيع إلغاء نداءه — لا يُخزَّن ولا يُعاد. */
  requestId: z.string().min(1).max(64),
  action: aiActionSchema,
  /** النصّ الذي يعمل عليه الإجراء: فقرة محدَّدة أو الدرس كاملاً. */
  content: z.string().trim().min(1, 'لا يوجد نصّ ليعمل عليه.').max(MAX_TEACHER_AI_CONTENT),
  /** يُملأ مع `custom` وحده. */
  instructions: z.string().trim().max(500).optional(),
  context: teacherAiContextSchema.optional(),
});

export type RunAiInput = z.infer<typeof runAiSchema>;

export const cancelAiSchema = z.object({
  requestId: z.string().min(1).max(64),
});

export type CancelAiInput = z.infer<typeof cancelAiSchema>;

/**
 * نتيجة الإجراء.
 *
 * `no_provider` ليست خطأً بل حالة: المصدر يشترط «إذا لم يوجد BYOK: CTA
 * «إعداد الذكاء الاصطناعي» بدل خطأ» — فالواجهة تعرض دعوةً لا عطلاً.
 */
export const aiResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    text: z.string(),
    provider: providerIdSchema,
    model: z.string(),
    tokens: z.number().int().nonnegative().optional(),
  }),
  z.object({ status: z.literal('no_provider') }),
  z.object({ status: z.literal('cancelled') }),
  z.object({
    status: z.literal('failed'),
    reason: z.enum(['rejected_key', 'offline', 'quota', 'timeout', 'provider_error']),
    message: z.string().min(1),
    /** ما يفعله المعلم بعده — «فتح إعدادات الذكاء الاصطناعي» أو «إعادة المحاولة». */
    action: z.enum(['open_settings', 'retry']),
  }),
]);

export type AiResult = z.infer<typeof aiResultSchema>;

/** المزوّد والنموذج المعروضان أسفل اللوحة. */
export const activeModelSchema = z
  .object({
    provider: providerIdSchema,
    label: z.string().min(1),
    model: z.string().min(1),
  })
  .nullable();

export type ActiveModel = z.infer<typeof activeModelSchema>;
