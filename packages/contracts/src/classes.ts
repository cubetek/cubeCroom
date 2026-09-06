import { z } from 'zod';

/**
 * عقود الفصول — FR-003: «إنشاء/تعديل/أرشفة».
 *
 * رسالة الاسم منقولة حرفياً من لوح `T07States`، فتبقى الصياغة في مكان واحد
 * ولا تُعاد كتابتها في الواجهة.
 */

export const classNameSchema = z
  .string()
  .trim()
  .min(2, 'أدخل اسماً للفصل حتى يتعرّف عليه طلابك — مثل «الصف السادس — علوم».')
  .max(80, 'اسم الفصل طويل أكثر من اللازم.');

const optionalText = (max: number) => z.string().trim().max(max).optional();

export const classInputSchema = z.object({
  name: classNameSchema,
  subject: optionalText(40),
  level: optionalText(40),
  description: optionalText(240),
});

export type ClassInput = z.infer<typeof classInputSchema>;

export const updateClassSchema = z.object({
  id: z.string().min(1),
  patch: classInputSchema,
});

export type UpdateClassInput = z.infer<typeof updateClassSchema>;

export const archiveClassSchema = z.object({
  id: z.string().min(1),
  archived: z.boolean(),
});

export type ArchiveClassInput = z.infer<typeof archiveClassSchema>;

/**
 * ما تعرضه بطاقة الفصل في T06.
 *
 * لا حقول لحالة الجلسة («دخول الطلاب متاح · ١٨ متصلاً») ولا «آخر حصة»: كلاهما
 * يحتاج جلسات لم تُبنَ بعد (P2-5). حقلٌ يُرسَل بقيمة مخترَعة أسوأ من حقل غائب.
 */
export const classSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  subject: z.string().nullable(),
  level: z.string().nullable(),
  description: z.string().nullable(),
  archivedAt: z.string().nullable(),
  students: z.number().int().nonnegative(),
  lessons: z.number().int().nonnegative(),
  activities: z.number().int().nonnegative(),
  hasDraft: z.boolean(),
  /** مساعدة الطالب في هذا الفصل — قرار D10، مطفأة افتراضياً (§23). */
  studentAiEnabled: z.boolean(),
});

export type ClassSummary = z.infer<typeof classSummarySchema>;

export const listClassesSchema = z.object({
  includeArchived: z.boolean().default(false),
});

export type ListClassesInput = z.infer<typeof listClassesSchema>;

/** مفتاح مساعدة الطالب على مستوى الفصل — T08. */
export const classStudentAiSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean(),
});

export type ClassStudentAiInput = z.infer<typeof classStudentAiSchema>;
