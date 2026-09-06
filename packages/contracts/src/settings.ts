import { z } from 'zod';
import { PROVIDERS } from './ai.js';

/**
 * مفاتيح الإعدادات وقيمها المقبولة.
 *
 * مكانها هنا لا في `packages/db`: الواجهة تسمّي المفتاح لتقرأه أو تكتبه عبر
 * IPC، فهو مفردة مشتركة بين الطرفين لا تفصيلة تخزين. القائمة مصدرها الوحيد
 * هذا الملف، و`packages/db` يستوردها — نسختان تفترقان بصمت أسوأ من تبعية.
 *
 * والقيم معدودة لا مفتوحة: «كل input غير موثوق يمر validation». مفتاح صحيح
 * بقيمة غريبة يصل إلى القاعدة ويُقرأ لاحقاً على أنه منطقيّ، فيُتّخذ قرار على
 * قيمة لا معنى لها.
 */

export const SETTING_KEYS = [
  'language',
  'openLastClassOnStart',
  'launchOnSystemStart',
  'checkUpdatesAutomatically',
  'updateChannel',
  'keepLocalCrashLog',
  /** القاطع العام لمساعدة الطالب — التفعيل التفصيلي لكل فصل ونشاط (PRD §23). */
  'studentAiMasterEnabled',
  'activeAiProvider',
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

const BOOLEAN = ['true', 'false'] as const;

/** العربية اللغة الوحيدة — قرار D1، وهو ما تقوله شاشة T22 نصّاً. */
export const SETTING_VALUES: Readonly<Record<SettingKey, readonly string[]>> = {
  language: ['ar'],
  openLastClassOnStart: BOOLEAN,
  launchOnSystemStart: BOOLEAN,
  checkUpdatesAutomatically: BOOLEAN,
  updateChannel: ['stable', 'beta'],
  keepLocalCrashLog: BOOLEAN,
  studentAiMasterEnabled: BOOLEAN,
  activeAiProvider: ['', ...PROVIDERS],
};

export const settingKeySchema = z.enum(SETTING_KEYS);

export const writeSettingSchema = z
  .object({
    key: settingKeySchema,
    value: z.string(),
  })
  .superRefine((input, ctx) => {
    if (!SETTING_VALUES[input.key].includes(input.value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'قيمة غير مقبولة لهذا الإعداد.',
      });
    }
  });

export type WriteSettingInput = z.infer<typeof writeSettingSchema>;

/**
 * ما تعرضه شاشة T22 كاملاً في نداء واحد.
 * المسار والإصدار ليسا إعدادين محفوظين: الأول من ملف الإعداد، والثاني من
 * التطبيق نفسه — وكلاهما يظهر في الشاشة نفسها، فيصل معها لا بنداء ثانٍ.
 */
export const settingsStateSchema = z.object({
  values: z.record(settingKeySchema, z.string()),
  dataDirectory: z.string().min(1),
  appVersion: z.string().min(1),
});

export type SettingsState = z.infer<typeof settingsStateSchema>;

/**
 * منفذ بوابة الطالب — إعدادٌ متقدّم في `T22`.
 *
 * **ليس مفتاحاً في جدول الإعدادات** لأنه إعداد جهازٍ لا إعداد معلم: منفذٌ
 * مشغول ببرنامج آخر مشكلةُ هذا الحاسوب وحده، ولا يجوز أن يسافر مع نسخةٍ
 * احتياطية إلى جهاز المدرسة. ولذلك يعيش في ملفّ إعدادات التطبيق.
 */
export const studentPortSchema = z.object({
  /** `null` تعني «عُد إلى الافتراضي». */
  port: z.number().int().min(1024).max(65_535).nullable(),
});

export type StudentPortInput = z.infer<typeof studentPortSchema>;

export const studentPortStateSchema = z.object({
  /** ما اختاره المعلم، أو `null` إن لم يختر. */
  chosen: z.number().int().nullable(),
  /** الافتراضي — يُعرض ليعرف المعلم ما سيعود إليه. */
  fallback: z.number().int(),
  /**
   * المنفذ العامل الآن، إن كانت الحصة قائمة.
   * قد يخالف المختار: `findAvailablePort` يتجاوز المشغول.
   */
  active: z.number().int().nullable(),
});

export type StudentPortState = z.infer<typeof studentPortStateSchema>;
