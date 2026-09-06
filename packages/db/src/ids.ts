import { randomUUID } from 'node:crypto';

/**
 * معرّفات نصّية عشوائية.
 *
 * ليست أرقاماً متسلسلة عمداً: النسخ الاحتياطي والاستعادة قد يجمعان بيانات من
 * أكثر من جهاز، والتسلسل يتصادم عندها. و UUID لا يكشف عدد الصفوف أيضاً.
 */
export function newId(): string {
  return randomUUID();
}

/** لحظة موحّدة لكل صفوف عملية واحدة — يمنع فروق مللي ثانية داخل المعاملة. */
export function now(): Date {
  return new Date();
}
