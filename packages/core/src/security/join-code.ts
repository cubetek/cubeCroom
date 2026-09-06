import { randomInt } from 'node:crypto';
import { JOIN_CODE_DIGITS } from '@cubecroom/contracts';

/**
 * توليد رمز الحصة — §22.
 *
 * التنظيف والمقارنة والعرض في `@cubecroom/contracts` لأنّ شاشة المعلم تحتاجها
 * في متصفّح. والتوليد وحده هنا لأنه وحده يحتاج مصدر تشفير.
 */
export function createJoinCode(): string {
  // `randomInt` من مصدر التشفير: رمزٌ يُخمَّن يفتح باب الطلب لمن ليس في الغرفة.
  return String(randomInt(0, 10 ** JOIN_CODE_DIGITS)).padStart(JOIN_CODE_DIGITS, '0');
}
