import { app } from 'electron';
import { localProviderEndpointsSchema, type LocalProviderEndpoints } from '@cubecroom/contracts';
import { access, constants, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * إعداد ما قبل القاعدة.
 *
 * مسار البيانات نفسه لا يمكن أن يُحفظ في القاعدة — نحتاجه لنعرف أين نفتحها.
 * فيعيش وحده في ملف صغير داخل مجلد التطبيق، ولا يحمل شيئاً آخر: كل إعداد
 * له مكان في جدول `settings`.
 */

export type AppConfig = {
  readonly dataDirectory: string;
  /** عناوين خوادم الجهاز، خارج النسخ الاحتياطية ومفاتيح API. */
  readonly aiEndpoints?: LocalProviderEndpoints;
  /**
   * منفذ بوابة الطالب المفضَّل — `undefined` تعني الافتراضي.
   *
   * **وهو إعداد جهازٍ لا إعداد معلم**، ولذلك يعيش هنا لا في القاعدة: منفذٌ
   * مشغول ببرنامج آخر مشكلةُ هذا الحاسوب وحده. ومعلمٌ يستعيد نسخته
   * الاحتياطية على جهاز المدرسة لا يجرّ معه منفذاً اختاره لجهاز بيته.
   *
   * **ومفضَّلٌ لا مفروض:** `findAvailablePort` يتجاوزه إن كان مشغولاً، فلا
   * يستطيع إعدادٌ خاطئ أن يمنع الحصة.
   */
  readonly studentPort?: number;
};

/**
 * المدى المقبول: ما فوق المنافذ المحجوزة وما دون سقف النظام.
 *
 * ودون ١٠٢٤ يحتاج صلاحية مسؤول على أنظمة كثيرة — فمنفذٌ يُقبل ثم يفشل
 * الاستماع عليه أسوأ من منفذٍ يُرفض عند الكتابة.
 */
export const PORT_MIN = 1024;
export const PORT_MAX = 65_535;

export function isUsablePort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= PORT_MIN && value <= PORT_MAX;
}

const CONFIG_FILE = () => join(app.getPath('userData'), 'config.json');

/** المكان الموصى به في T03b — داخل مستندات المعلم لا في أعماق النظام. */
export function defaultDataDirectory(): string {
  /*
   * `CUBECROOM_DATA_DIR` يوجّه المكان الافتراضي — وهو المتغيّر نفسه الذي
   * تقرؤه بوابة الطالب، فالاصطلاح واحد في المنتج كله.
   *
   * وفائدته هنا أن الفحص الآليّ يعمل على مجلد خاص به: بلا هذا يكتب في مجلد
   * مستندات المعلم الحقيقي، فيصير تنظيفُ الفحص حذفاً لعمله.
   */
  const directed = process.env.CUBECROOM_DATA_DIR;
  if (directed !== undefined && directed !== '') return directed;
  return join(app.getPath('documents'), 'CubeCroom');
}

/** غياب الملف يعني أول تشغيل — لا خطأ. */
export async function readConfig(): Promise<AppConfig | null> {
  try {
    const raw = await readFile(CONFIG_FILE(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as AppConfig).dataDirectory === 'string' &&
      (parsed as AppConfig).dataDirectory.length > 0
    ) {
      const port = (parsed as AppConfig).studentPort;
      const endpoints = localProviderEndpointsSchema.safeParse((parsed as AppConfig).aiEndpoints);
      return {
        dataDirectory: (parsed as AppConfig).dataDirectory,
        ...(endpoints.success ? { aiEndpoints: endpoints.data } : {}),
        // منفذٌ تالفٌ في الملفّ يُهمَل ويعود الافتراضي — لا يمنع الإقلاع.
        ...(isUsablePort(port) ? { studentPort: port } : {}),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function writeConfig(config: AppConfig): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true });
  await writeFile(CONFIG_FILE(), `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

/**
 * تعديل حقلٍ في الإعداد بلا محو ما سواه.
 *
 * `writeConfig` يكتب الملفّ كاملاً — فمن ناداه بحقلٍ واحد محا البقية. وكان
 * ذلك يُعالَج في كل موضع نداء على حدة: يُقرأ الملفّ، ويُنسخ يدوياً ما لا
 * يُغيَّر، ثم يُكتب. أربعة مواضع، وأربع نسخ من الحرص نفسه.
 *
 * **والخامس هو موضع العطل.** حقلٌ ثالث يُضاف إلى `AppConfig` يلزمه سطرٌ في
 * المواضع الأربعة، وموضعٌ يُنسى يُسقط الحقل بصمت عند أول حفظ — ولا يظهر ذلك
 * في فحص أنواع ولا في اختبار: الملفّ يُكتب بنجاح، ناقصاً.
 *
 * فالدمج يعيش هنا مرة واحدة، ومن يضيف حقلاً لا يحتاج أن يعرف من يكتب الملفّ.
 *
 * و`null` تعني «امحُ هذا الحقل»، وهي غير `undefined` التي تعني «لا تمسّه» —
 * وهو الفرق بين إلغاء المنفذ المختار وبين تركه كما هو.
 */
export async function updateConfig(patch: {
  readonly dataDirectory?: string;
  readonly aiEndpoints?: LocalProviderEndpoints;
  readonly studentPort?: number | null;
}): Promise<AppConfig> {
  const existing = await readConfig();

  const dataDirectory = patch.dataDirectory ?? existing?.dataDirectory;
  // لا يُكتب إعدادٌ بلا مكان بيانات: ملفٌّ ناقص يعني إقلاعاً يظنّ الإعداد تامّاً.
  if (dataDirectory === undefined) throw new Error('لم يُضبط مكان البيانات بعد.');

  const studentPort =
    patch.studentPort === undefined ? existing?.studentPort : (patch.studentPort ?? undefined);

  const next: AppConfig = {
    dataDirectory,
    ...((existing?.aiEndpoints !== undefined || patch.aiEndpoints !== undefined)
      ? { aiEndpoints: { ...existing?.aiEndpoints, ...patch.aiEndpoints } } : {}),
    // منفذٌ خارج المدى يُهمَل هنا كما يُهمَل عند القراءة — الحارس واحد للطريقين.
    ...(isUsablePort(studentPort) ? { studentPort } : {}),
  };

  await writeConfig(next);
  return next;
}

/**
 * يتحقق أن المجلد صالح للكتابة **قبل** أن يُعتمد.
 *
 * التحذير في T03b عن القرص الخارجي ليس نصّاً تجميلياً: اختيار مكان لا يُكتب
 * فيه يجعل التطبيق يفشل عند أول حفظ، وسط الحصة. الفحص هنا يمنع ذلك مبكراً.
 */
export async function ensureWritableDirectory(
  path: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await mkdir(path, { recursive: true });
    await access(path, constants.W_OK);
    return { ok: true };
  } catch {
    return {
      ok: false,
      message:
        'لا نستطيع الحفظ في هذا المكان. اختر مجلداً آخر على هذا الجهاز، ' +
        'وتجنّب الأقراص الخارجية والمجلدات المشتركة على الشبكة.',
    };
  }
}
