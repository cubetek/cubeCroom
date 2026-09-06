import { relative, resolve, sep } from 'node:path';

/**
 * حصر المسارات داخل مجلد مسموح — SEC-004 · SEC-006.
 *
 * **لماذا لا يكفي التحقق من الشكل:** عقود القنوات تتحقق أن المُدخَل نصٌّ غير
 * فارغ، وذلك يقول إنه *مسار* ولا يقول إنه *مسارنا*. وقناتان في هذا التطبيق
 * تأخذان مساراً وتفعلان به ما لا يُرجَع: `backup:delete` تحذف مجلداً حذفاً
 * متكرراً، و`backup:restore` تستبدل بيانات المعلم بمحتواه.
 *
 * والواجهة عندنا لا عند غيرنا — لكن قاعدة SEC-004 أن العملية الرئيسية **لا
 * تثق بالواجهة**. فثغرةٌ يوماً في صفحة، أو خطأ في شيفرتنا نحن، يصير عندها
 * `rm -rf` على مجلد اختاره الطرف الآخر.
 *
 * والمقارنة على المسار المُحلَّل لا على النصّ: `Backups/../..` نصٌّ يبدأ
 * بالمجلد المسموح ويقع خارجه. وكذلك `Backups-2` يبدأ بـ`Backups` حرفياً وليس
 * داخله — ولهذا تُقارَن المكوّنات لا البادئة.
 */
export function isInsideDirectory(parent: string, child: string): boolean {
  const from = resolve(parent);
  const to = resolve(child);
  if (from === to) return false;

  const step = relative(from, to);
  if (step === '' || step.startsWith('..')) return false;
  // مسار مطلق ناتج عن `relative` يعني قرصاً آخر على ويندوز.
  return !step.startsWith(sep) && !/^[a-zA-Z]:/.test(step);
}

/**
 * خطأ يُعرض للمعلم كما هو.
 *
 * لا يُقال فيه المسار المرفوض: الرسالة تصل الواجهة وقد تُسجَّل، ومسارٌ يحمل
 * اسم المستخدم أو بنية جهازه لا داعي لأن ينتقل.
 */
export class PathOutsideError extends Error {
  readonly code = 'path_outside';
  constructor(what: string) {
    super(`هذا المسار خارج مجلد ${what}. أعد فتح الشاشة واختر من القائمة.`);
    this.name = 'PathOutsideError';
  }
}
