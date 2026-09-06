import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * رموز جلسات الطلاب — SEC-007: «tokens عشوائية قوية وقابلة للإبطال».
 *
 * القاعدة تحفظ **الهاش لا الرمز**: ملف القاعدة يعيش في مجلد المعلم ويُنسخ في
 * كل نسخة احتياطية وقد يُرسل إلى الدعم الفني. رمزٌ مخزَّن بنصّه يعني أن من
 * يقرأ الملف يدخل الفصل باسم أي طالب.
 *
 * ٣٢ بايتاً عشوائياً: مساحة لا تُخمَّن، والحصة تنتهي بعدها بساعة على الأكثر.
 */

const TOKEN_BYTES = 32;

export function createStudentToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * SHA-256 بلا ملح ولا تكرار — عمداً.
 *
 * الملح والتكرار يحميان **كلمات المرور** لأنها قصيرة ومحتمَل تخمينها. هذا
 * رمز عشوائي بـ ٢٥٦ بت لا يُخمَّن أصلاً، وإبطاء التحقق فيه يُبطئ كل طلب من
 * كل طالب بلا مقابل أمني.
 */
export function hashStudentToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * مقارنة بزمن ثابت.
 *
 * الهاشات تُقارَن في القاعدة عادةً، لكن أي مقارنة في الشيفرة تمرّ من هنا:
 * `===` على نصّ يخرج عند أول حرف مختلف، وفرق التوقيت يكشف الهاش حرفاً حرفاً.
 */
export function sameToken(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
