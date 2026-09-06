/**
 * أخطاء نطاق المستودعات.
 *
 * كل خطأ يحمل `code` للشيفرة ورسالة عربية موجَّهة للمعلم — الطبقة الأعلى
 * تعرض الرسالة كما هي ولا تعيد صياغتها، فتبقى الصياغة في مكان واحد.
 */

export class NotFoundError extends Error {
  readonly code = 'not_found';
  constructor(what: string) {
    super(`لم نعثر على ${what}. ربما حُذف من جهاز آخر أو من نافذة أخرى.`);
    this.name = 'NotFoundError';
  }
}

/**
 * حذف ملف مستخدَم — «Warn before deleting used file» (T18).
 * المواضع تُعاد بأسمائها لا بعددها: الحوار يعدّدها للمعلم قبل أن يقرر.
 */
export class FileInUseError extends Error {
  readonly code = 'file_in_use';
  constructor(readonly usedBy: ReadonlyArray<{ kind: 'lesson' | 'activity'; title: string }>) {
    super(
      `هذا الملف مستخدَم في ${usedBy.length} ${usedBy.length === 1 ? 'موضع' : 'مواضع'}. ` +
        'أزِله منها أولاً، أو احذفه مع إزالته من كل موضع.',
    );
    this.name = 'FileInUseError';
  }
}

/** محاولة إنشاء معلم ثانٍ — التطبيق لمعلم واحد على جهازه (PRD §4.1). */
export class TeacherAlreadyExistsError extends Error {
  readonly code = 'teacher_exists';
  constructor() {
    super('هذا الجهاز مُعدّ لمعلم واحد. عدّل البيانات القائمة بدل إنشاء غيرها.');
    this.name = 'TeacherAlreadyExistsError';
  }
}
