/**
 * إصدار المخطط الذي يفهمه هذا البناء من التطبيق.
 * يُرفع مع كل ترحيل جديد يُضاف إلى packages/db/migrations.
 */
export const SCHEMA_VERSION = 3;

/**
 * القاعدة أحدث من التطبيق.
 *
 * يحدث حين يفتح المعلم بياناته بإصدار أقدم من الذي أنشأها — بعد استعادة نسخة
 * على جهاز آخر مثلاً (FR-015). السياسة المعتمدة: **رفض الإقلاع**، لا فتحها
 * للقراءة ولا محاولة ترحيل عكسي:
 *
 *   • الترحيل العكسي غير معرَّف؛ محاولته تفقد بيانات بصمت.
 *   • وضع القراءة يجعل المعلم يظن أن التطبيق يعمل ثم يصطدم بأول كتابة —
 *     وسط حصة، وهو أسوأ وقت لاكتشاف ذلك.
 *
 * الرسالة تقول ما حدث وما يفعله، بلا رقم إصدار مخطط ولا مصطلح تقني.
 */
export class DatabaseTooNewError extends Error {
  readonly code = 'db_too_new';

  constructor(
    readonly foundVersion: number,
    readonly expectedVersion: number,
  ) {
    super(
      'بياناتك أُنشئت بإصدار أحدث من CubeCroom المثبَّت على هذا الجهاز. ' +
        'حدّث التطبيق إلى آخر إصدار ثم افتحه من جديد. ' +
        'فتحُها بهذا الإصدار قد يُتلفها، ولذلك أوقفنا التشغيل.',
    );
    this.name = 'DatabaseTooNewError';
  }
}

/** فشل الترحيل نفسه — القاعدة تُترك كما هي ولا يُكمل الإقلاع. */
export class MigrationFailedError extends Error {
  readonly code = 'db_migration_failed';

  constructor(override readonly cause: unknown) {
    super(
      'تعذّر تجهيز بياناتك للفتح. لم يُغيَّر شيء فيها. ' +
        'أعد تشغيل التطبيق، وإن تكرر الأمر استعد آخر نسخة احتياطية.',
    );
    this.name = 'MigrationFailedError';
  }
}
