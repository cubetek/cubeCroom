/**
 * «متصل الآن» — FR-007.
 *
 * لا اتصال دائماً بين المتصفح والخادم (لا WebSocket في هذا الإصدار)، فالحضور
 * يُستنتج من آخر طلب وصل من جهاز الطالب: صفحته تنبض كل خمس ثوانٍ.
 *
 * والنافذة ٢٠ ثانية لا ٥: نبضة واحدة قد تتأخر بشبكة مدرسة مزدحمة، وإظهار
 * الطالب «غير متصل» لأن نبضة تأخرت يجعل المعلم يشكّ في جهازه لا في الشبكة.
 * وفي المقابل لا تُطوَّل أكثر: طالبٌ أغلق جهازه قبل دقيقتين وما زال «متصلاً»
 * يجعل العدّاد كذبةً مريحة.
 */

export const PRESENCE_WINDOW_MS = 20_000;

export function isOnline(lastSeenAt: Date | null | undefined, now: Date = new Date()): boolean {
  if (lastSeenAt === null || lastSeenAt === undefined) return false;
  const elapsed = now.getTime() - lastSeenAt.getTime();
  // زمن سالب يعني ساعة الجهاز تحرّكت؛ يُعدّ حاضراً لا يُرفض.
  return elapsed <= PRESENCE_WINDOW_MS;
}
