import { z } from 'zod';

/**
 * الملفات والمرفقات — FR-008 · T13Upload · T18.
 *
 * «مستخدَم في» ليس زينة: بدونه يستحيل تنفيذ الملاحظة الوحيدة التي يفردها
 * المصدر لـ T18 — «تحذير قبل حذف ملف مستخدَم» — فيُعاد مع كل ملف بأسماء
 * مواضعه لا بعددها، لأن الحوار يعدّدها للمعلم قبل أن يقرّر.
 */

export const fileUsageSchema = z.object({
  kind: z.enum(['lesson', 'activity']),
  id: z.string().min(1),
  title: z.string().min(1),
  published: z.boolean(),
});

export type FileUsage = z.infer<typeof fileUsageSchema>;

export const storedFileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** «مستند PDF» · «صورة» · «مقطع فيديو» — نصّ للإنسان لا نوع MIME. */
  kind: z.string().min(1),
  /** الشارة في الجدول: PDF · PNG · MP4. */
  badge: z.string().min(1),
  category: z.enum(['document', 'image', 'clip', 'other']),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: z.string().min(1),
  usedBy: z.array(fileUsageSchema),
});

export type StoredFile = z.infer<typeof storedFileSchema>;

export const attachToLessonSchema = z.object({
  lessonId: z.string().min(1),
  fileIds: z.array(z.string().min(1)).max(50),
});

export type AttachToLessonInput = z.infer<typeof attachToLessonSchema>;

export const fileIdSchema = z.object({ id: z.string().min(1) });

/**
 * حذف ملف — ثلاثة مخارج في حوار `T18DeleteWarn`:
 *   `guarded` يرفض إن كان مستخدَماً ويعيد مواضعه.
 *   `cascade` يحذفه ويزيله من كل موضع («حذف نهائياً»).
 * والمخرج الثالث «إزالته من الدرس فقط» ليس حذفاً بل تعديل مرفقات الدرس.
 */
export const removeFileSchema = z.object({
  id: z.string().min(1),
  mode: z.enum(['guarded', 'cascade']),
});

export type RemoveFileInput = z.infer<typeof removeFileSchema>;

export const removeFileResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('removed') }),
  z.object({
    status: z.literal('in_use'),
    message: z.string().min(1),
    usedBy: z.array(fileUsageSchema),
  }),
]);

export type RemoveFileResult = z.infer<typeof removeFileResultSchema>;

/** تقدّم نسخ مرفق — حدث من العملية الرئيسية إلى الواجهة (T13Upload). */
export const fileProgressSchema = z.object({
  name: z.string().min(1),
  copied: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  done: z.boolean(),
  failed: z.boolean(),
});

export type FileProgress = z.infer<typeof fileProgressSchema>;
