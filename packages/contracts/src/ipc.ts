import { z } from 'zod';
import { studentNameSchema } from './join.js';

/**
 * عقود القنوات بين واجهة المعلم والعملية الرئيسية.
 *
 * القنوات معدودة هنا لا مكتوبة نصّاً في كل موضع: اسم قناة مكتوب خطأً يصبح
 * خطأ ترجمة لا نداءً صامتاً لا يردّ. وكل مدخل يمرّ بمخططه قبل أن يلمس القاعدة
 * (PRD: «كل input غير موثوق يمر validation»).
 */
export const IPC = {
  windowAppearance: 'app:window-appearance',
  bootState: 'app:boot-state',
  chooseDataDirectory: 'app:choose-data-directory',
  completeOnboarding: 'app:complete-onboarding',
  classesList: 'classes:list',
  homeState: 'app:home-state',
  aiSettings: 'ai:settings',
  aiSaveKey: 'ai:save-key',
  aiSetModel: 'ai:set-model',
  aiRun: 'ai:run',
  aiCancel: 'ai:cancel',
  aiActiveModel: 'ai:active-model',
  aiDeleteKey: 'ai:delete-key',
  filesList: 'files:list',
  filesPick: 'files:pick',
  filesRemove: 'files:remove',
  filesOpenFolder: 'files:open-folder',
  lessonAttachments: 'lessons:attachments',
  lessonAttach: 'lessons:attach',
  /** حدث من العملية الرئيسية إلى الواجهة — لا نداء. */
  fileProgress: 'files:progress',
  rosterList: 'roster:list',
  rosterRename: 'roster:rename',
  rosterAction: 'roster:action',
  requestsList: 'requests:list',
  requestDecide: 'requests:decide',
  requestsApproveAll: 'requests:approve-all',
  lessonsList: 'lessons:list',
  lessonGet: 'lessons:get',
  lessonAgentRun: 'lessons:agent-run',
  lessonAgentUndo: 'lessons:agent-undo',
  lessonCreate: 'lessons:create',
  lessonUpdate: 'lessons:update',
  lessonPublish: 'lessons:publish',
  lessonDuplicate: 'lessons:duplicate',
  lessonDelete: 'lessons:delete',
  activitiesList: 'activities:list',
  activityGet: 'activities:get',
  activityCreate: 'activities:create',
  activityUpdate: 'activities:update',
  activityPublish: 'activities:publish',
  activityStudentAi: 'activities:student-ai',
  activityDelete: 'activities:delete',
  activityGenerate: 'activities:generate',
  activitySuggestReview: 'activities:suggest-review',
  activityChoiceBreakdown: 'activities:choice-breakdown',
  lessonUnread: 'lessons:unread',
  activityCopy: 'activities:copy',
  activityExportResults: 'activities:export-results',
  activityOpenExports: 'activities:open-exports',
  activitySubmissions: 'activities:submissions',
  submissionGet: 'activities:submission',
  submissionReview: 'activities:review',
  classesCreate: 'classes:create',
  classesUpdate: 'classes:update',
  classesArchive: 'classes:archive',
  classesStudentAi: 'classes:student-ai',
  copyText: 'app:copy-text',
  portalStart: 'portal:start',
  portalStop: 'portal:stop',
  portalStatus: 'portal:status',
  /** مخرج «تحديد مكان البيانات» في T01States/٣. */
  relocateDataDirectory: 'app:relocate-data-directory',
  readSettings: 'settings:read',
  writeSetting: 'settings:write',
  openDataDirectory: 'app:open-data-directory',
  diagnostics: 'app:diagnostics',
  diagnosticsExport: 'app:diagnostics-export',
  studentPortGet: 'app:student-port',
  studentPortSet: 'app:student-port-set',
  dataMove: 'app:data-move',
  openFirewallSettings: 'app:open-firewall-settings',
  backupState: 'backup:state',
  backupCreate: 'backup:create',
  backupDelete: 'backup:delete',
  backupOpenFolder: 'backup:open-folder',
  restorePreview: 'backup:restore-preview',
  restoreRun: 'backup:restore',
  recoveryList: 'recovery:list',
  recoveryRestore: 'recovery:restore',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

export const windowAppearanceSchema = z.object({
  background: z.string().regex(/^#[0-9a-f]{6}$/i),
  foreground: z.string().regex(/^#[0-9a-f]{6}$/i),
});
export type WindowAppearance = z.infer<typeof windowAppearanceSchema>;

/* ── حالة الإقلاع ───────────────────────────────────── */

export const teacherProfileSchema = z.object({
  name: z.string().min(1),
  institution: z.string().nullable(),
});

export type TeacherProfile = z.infer<typeof teacherProfileSchema>;

/**
 * ما تعرفه الواجهة عند الإقلاع.
 *
 * `blocked` ليست خطأ عابراً: هي حالة رفض الإقلاع (قاعدة أحدث من التطبيق أو
 * ترحيل فاشل). الواجهة تعرض `message` كما هي — النصّ مكتوب في packages/db
 * ولا يُعاد صياغته هنا.
 */
export const bootStateSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('onboarding'),
    defaultDataDirectory: z.string().min(1),
  }),
  z.object({
    status: z.literal('ready'),
    teacher: teacherProfileSchema,
    dataDirectory: z.string().min(1),
  }),
  z.object({
    status: z.literal('blocked'),
    message: z.string().min(1),
    /** إجراءات المخرج — تقابل أزرار حالة الاسترجاع في T01States. */
    canRetry: z.boolean(),
  }),
]);

export type BootState = z.infer<typeof bootStateSchema>;

/* ── أول تشغيل ─────────────────────────────────────── */

/**
 * اسم المعلم — الحقل الإلزامي الوحيد في T03.
 * الرسالة منقولة من لوح `T03Error`، فتبقى الصياغة في مكان واحد.
 */
export const teacherNameSchema = z
  .string()
  .trim()
  .min(2, 'اكتب اسمك ليعرفك طلابك حين يدخلون إلى فصلك.')
  .max(60, 'الاسم طويل أكثر من اللازم.');

export const completeOnboardingSchema = z.object({
  name: teacherNameSchema,
  institution: z.string().trim().max(80).optional(),
  /** المسار المختار في T03b — يُتحقق من صلاحيته للكتابة في العملية الرئيسية. */
  dataDirectory: z.string().min(1),
});

export type CompleteOnboardingInput = z.infer<typeof completeOnboardingSchema>;

/**
 * «فتح المجلد» في T22 و T18.
 * الفشل يُعاد لا يُرمى: تعذّر فتح مستكشف الملفات ليس عطلاً في التطبيق.
 */
export const openPathResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('opened') }),
  z.object({ status: z.literal('failed'), message: z.string().min(1) }),
]);

export type OpenPathResult = z.infer<typeof openPathResultSchema>;

export const chooseDirectoryResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('chosen'), path: z.string().min(1) }),
  z.object({ status: z.literal('cancelled') }),
  z.object({ status: z.literal('unusable'), message: z.string().min(1) }),
]);

export type ChooseDirectoryResult = z.infer<typeof chooseDirectoryResultSchema>;

// يُعاد تصديره ليبقى مصدر قواعد الأسماء واحداً بين المعلم والطالب.
export { studentNameSchema };

/**
 * نسخ نصّ إلى الحافظة — «نسخ الرابط» في T09.
 *
 * يمرّ بالعملية الرئيسية لا بـ `navigator.clipboard`: الواجهة تُحمَّل من
 * بروتوكول `app://` مخصّص، وواجهة الحافظة في المتصفح مشروطة بسياق آمن قد لا
 * يتحقق هناك. والحدّ الأعلى موجود ليبقى ما يُنسخ رابطاً لا مستنداً.
 */
export const copyTextSchema = z.object({ text: z.string().min(1).max(2000) });

export type CopyTextInput = z.infer<typeof copyTextSchema>;
