import { z } from 'zod';

/**
 * انضمام الطالب — FR-005 و FR-006.
 * الطلب **لا يمنح وصولاً**؛ يبقى Pending حتى يبتّ المعلم فيه.
 */

/**
 * رسالة الخطأ منقولة حرفياً من لوح `S01Error` — الصياغة جزء من التصميم
 * المعتمد لا نصّ تقني يُعاد كتابته عند التنفيذ.
 */
export const studentNameSchema = z
  .string()
  .trim()
  .min(2, 'اكتب اسمك كاملاً حتى يعرفك معلمك — حرف واحد لا يكفي.')
  .max(60, 'الاسم طويل أكثر من اللازم. اكتبه مختصراً كما يناديك معلمك.');

export const joinRequestSchema = z.object({
  name: studentNameSchema,
  /** «معرّف اختياري» في مكوّنات S01 — رقم الطالب في الفصل إن طلبه المعلم. */
  identifier: z
    .string()
    .trim()
    .max(20, 'الرقم طويل أكثر من اللازم.')
    .optional(),
  /**
   * رمز الحصة كما كتبه الطالب — يُنظَّف قبل المقارنة.
   *
   * الرسالة تقول ما يفعله لا ما أخطأ فيه: «اسأل معلمك عن الرمز» أنفع من
   * «رمز غير صالح» لطفلٍ لا يعرف أين يجده.
   */
  joinCode: z
    .string()
    .trim()
    .min(1, 'اكتب رمز الحصة الذي كتبه معلمك على السبورة.')
    .max(20),
});

export type JoinRequest = z.infer<typeof joinRequestSchema>;

/**
 * الحالات التي قد يراها الطالب.
 * `rejected` قابلة لإعادة المحاولة دائماً — قرار C4، فلا يوجد حقل يسمح أو يمنع.
 */
export const joinStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'expired',
  'session_ended',
]);

export type JoinStatus = z.infer<typeof joinStatusSchema>;

export const joinContextSchema = z.object({
  className: z.string().min(1),
  teacherName: z.string().min(1),
});

export const joinAcceptedSchema = joinContextSchema.extend({
  /** معرّف الطلب — يستعمله الطالب في polling الحالة، ولا يمنح وصولاً بذاته. */
  requestId: z.string().min(1),
  status: z.literal('pending'),
  submittedName: z.string().min(1),
});

export type JoinAccepted = z.infer<typeof joinAcceptedSchema>;

export const joinStatusResponseSchema = joinContextSchema.extend({
  status: joinStatusSchema,
  /** يُملأ عند `approved` فقط — الانتقال إلى S04 يتم تلقائياً. */
  redirectTo: z.string().optional(),
});

export type JoinStatusResponse = z.infer<typeof joinStatusResponseSchema>;
