import { z } from 'zod';

/**
 * النسخ الاحتياطي والاستعادة — FR-015 · لوحا `T20Backup` و`T20Restore`.
 *
 * **القاعدة التي يقوم عليها هذا الملف:** الاستعادة العملية الوحيدة في المنتج
 * التي تمحو عمل المعلم وطلابه. فكل ما يخصّها يُقال بصراحة قبل أن تجري: كم
 * سيُفقد، وأين تُحفظ نسخة الوضع الحالي، وأن التطبيق سيُغلق.
 */

export const backupContentsSchema = z.object({
  classes: z.number().int().nonnegative(),
  lessons: z.number().int().nonnegative(),
  activities: z.number().int().nonnegative(),
  submissions: z.number().int().nonnegative(),
  files: z.number().int().nonnegative(),
  fileBytes: z.number().int().nonnegative(),
});

export type BackupContentsView = z.infer<typeof backupContentsSchema>;

export const backupRowSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  status: z.enum(['complete', 'damaged']),
  createdAt: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative(),
  /** رسالة التلف تُعرض كما هي — صياغتها في `packages/core` لا هنا. */
  reason: z.string().optional(),
  contents: backupContentsSchema.optional(),
});

export type BackupRow = z.infer<typeof backupRowSchema>;

export const backupStateSchema = z.object({
  directory: z.string().min(1),
  backups: z.array(backupRowSchema),
  /** محتوى جهاز المعلم الآن — يُقارَن بالنسخة لحساب ما سيُفقد. */
  current: backupContentsSchema,
  lastBackupAt: z.string().nullable(),
});

export type BackupState = z.infer<typeof backupStateSchema>;

export const backupPathSchema = z.object({ path: z.string().min(1) });

export type BackupPathInput = z.infer<typeof backupPathSchema>;

/**
 * ما سيختفي من واجهة المعلم — «سيُفقد كل ما أُنشئ بعد ذلك الوقت».
 * يُحسب في العملية الرئيسية ويصل الشاشة جاهزاً، فتبقى القاعدة في مكان واحد.
 */
export const restorePreviewSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ready'),
    createdAt: z.string(),
    loss: backupContentsSchema.omit({ fileBytes: true }),
  }),
  z.object({ status: z.literal('refused'), message: z.string().min(1) }),
]);

export type RestorePreview = z.infer<typeof restorePreviewSchema>;

export const restoreResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('restored'),
    /** أين حُفظ الوضع السابق — يُقال للمعلم صراحةً، فهو طريق الرجوع. */
    safetyBackupPath: z.string().min(1),
  }),
  z.object({ status: z.literal('refused'), message: z.string().min(1) }),
]);

export type RestoreResultView = z.infer<typeof restoreResultSchema>;

/** نصّ الإقرار في `T20Restore` — لا يُستعاد قبل تعليمه. */
export const RESTORE_ACKNOWLEDGEMENT =
  'أفهم أن محتوى جهازي سيُستبدل بمحتوى النسخة، وأن ما أُنشئ بعدها سيختفي من الواجهة.';

/**
 * التنبيه الثابت في `T20Backup`.
 *
 * يبقى معروضاً دائماً لأنه ليس تحذيراً من عطل بل وصفٌ للمنتج: لا خادم يحتفظ
 * بنسخة ثانية، فمجلد النسخ على جهاز المعلم هو كل ما بينه وبين فقدان سنة عمل.
 */
export const BACKUP_NOTICE =
  'بياناتك كلها على هذا الجهاز وحده. لا نسخة عند أحد غيرك — فالنسخة الاحتياطية هي طريقك ' +
  'الوحيد لاسترجاعها إن تعطّل الجهاز. انسخ مجلد النسخ إلى قرص خارجي بين حين وآخر.';

/**
 * نقل مجلد البيانات — `T22`.
 *
 * **النتيجة تقول أين بقي القديم.** النقل هنا نسخٌ ثم تحويلُ الإشارة، والقديم
 * يبقى حيث هو: بياناتُ معلمٍ لا نسخة لها عند أحد لا تُحذف آلياً. فالمعلم
 * يحذفها بنفسه حين يطمئن.
 */
export const moveDataSchema = z.object({ directory: z.string().min(1) });

export type MoveDataInput = z.infer<typeof moveDataSchema>;

export const moveDataResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('moved'),
    to: z.string().min(1),
    /** مكان النسخة القديمة — تُعرض للمعلم ليحذفها متى شاء. */
    oldPath: z.string().min(1),
  }),
  z.object({ status: z.literal('refused'), message: z.string().min(1) }),
]);

export type MoveDataResult = z.infer<typeof moveDataResultSchema>;