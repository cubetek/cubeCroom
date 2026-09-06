import { ar } from '@cubecroom/contracts';

/**
 * أخطاء مخزن الملفات.
 *
 * كل خطأ يحمل `code` للشيفرة ورسالة عربية موجَّهة للمعلم، والطبقة الأعلى
 * تعرضها كما هي — القاعدة نفسها المتّبعة في `packages/db`.
 */

/**
 * فشل نسخ المرفق. الرسالة منقولة حرفياً من لوح `T13Upload`.
 * تغطي انقطاع النسخ وفقدان المصدر معاً: كلاهما عند المعلم سببٌ واحد —
 * الملف لم يعد في مكانه — والعلاج واحد.
 */
export class FileCopyFailedError extends Error {
  readonly code = 'file_copy_failed';
  constructor(cause?: unknown) {
    super('توقّف النسخ قبل أن يكتمل. تأكّد أن الملف ما زال في مكانه ثم أعد المحاولة.');
    this.name = 'FileCopyFailedError';
    if (cause !== undefined) this.cause = cause;
  }
}

/** نسخة الملف مفقودة من مجلد البيانات — حُذفت من خارج التطبيق غالباً. */
export class FileDataMissingError extends Error {
  readonly code = 'file_data_missing';
  constructor() {
    super(
      'لم نعثر على نسخة هذا الملف في مجلد بياناتك. ربما حُذفت من خارج التطبيق — ' +
        'أزِل الملف من مكتبتك ثم ارفعه من جديد.',
    );
    this.name = 'FileDataMissingError';
  }
}

/**
 * فشل إنشاء نسخة احتياطية.
 *
 * المجلد الناقص لا يُحذف: لوح `T20Backup` يعرضه صفّاً أحمر «توقّفت قبل أن
 * تكتمل»، ومحوُه يُخفي عن المعلم أن محاولةً جرت وفشلت — فيظنّ نفسه محميّاً.
 * لذلك يحمل الخطأ مسار المجلد الباقي.
 */
export class BackupFailedError extends Error {
  readonly code = 'backup_failed';
  constructor(
    cause?: unknown,
    readonly path?: string,
  ) {
    super(
      'توقّف إنشاء النسخة الاحتياطية قبل أن يكتمل. ' +
        'تأكّد من وجود مساحة كافية في مكان الحفظ ثم أعد المحاولة.',
    );
    this.name = 'BackupFailedError';
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * كل المنافذ المجرَّبة مشغولة.
 *
 * الرسالة تصف الأثر والإجراء لا الرقم: «منفذ ٤٣١٧ محجوز» جملة لا يملك المعلم
 * حيالها شيئاً. الأرقام تبقى في الخطأ لـ«تفاصيل تقنية» في T09NoLan.
 */
export class PortUnavailableError extends Error {
  readonly code = 'port_unavailable';
  constructor(
    readonly from: number,
    readonly to: number,
  ) {
    super(
      'تعذّر فتح باب الدخول على هذا الجهاز — برنامج آخر يشغل المنافذ التي نستعملها. ' +
        'أغلق البرامج التي لا تحتاجها ثم أعد المحاولة، أو أعد تشغيل الجهاز.',
    );
    this.name = 'PortUnavailableError';
  }
}

/**
 * اسم تخزين لا يطابق الشكل المولَّد.
 *
 * ليس خطأ يقع فيه المعلم: أسماء التخزين تُولَّد هنا ولا تأتي من مدخلاته.
 * وصولُ اسم غريب يعني خطأ برمجياً أو محاولة خروج من المجلد عبر `../`،
 * وكلاهما يُوقَف قبل لمس القرص لا بعده (SEC-006).
 */
export class UnsafeStorageNameError extends Error {
  readonly code = 'unsafe_storage_name';
  constructor(readonly storageName: string) {
    super('تعذّر الوصول إلى الملف: اسم تخزين غير صالح.');
    this.name = 'UnsafeStorageNameError';
  }
}

/**
 * صفٌّ في تصدير النتائج يحمل قيمةً لا تُكتب في خليّة.
 *
 * الأنواع تصف ما يَعِد به المستدعي، والصفوف تصل من قاعدة البيانات ومن `IPC`
 * حيث لا نوع يُفحص. وسقوط الملفّ كلّه بـ`TypeError` لا يسمّي أحداً يترك المعلم
 * أمام تصديرٍ لا يعمل ولا يدري أيّ سجلٍّ يصحّح — فيُسمّى هنا الصفّ والحقل.
 *
 * ورقم الصفّ يبدأ من واحد: المعلم يعدّ صفوف جدوله لا فهارس مصفوفة.
 */
export class ResultsRowError extends Error {
  readonly code = 'results_row_invalid';
  constructor(
    readonly row: number,
    readonly studentName: string,
    readonly field: string,
  ) {
    super(
      `تعذّر تصدير النتائج: قيمة غير صالحة في «${field}» عند الصفّ ${ar(row)}` +
        `${studentName === '' ? '' : ` (${studentName})`}. صحّح هذا السجلّ ثم أعد التصدير.`,
    );
    this.name = 'ResultsRowError';
  }
}
