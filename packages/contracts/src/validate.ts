import type { ZodType, ZodTypeDef } from 'zod';
import { apiError, type ApiError } from './common.js';

/**
 * حدود zod تنتهي عند هذه الحزمة.
 *
 * الحزم المستهلكة (بوابة الطالب · طبقة IPC) تستورد `validate` و`Contract`
 * فقط، فلا تعرف zod ولا تُترجم أخطاءه بنفسها — وتبقى صياغة الرسائل في مكان
 * واحد هو ملفات العقود، لا موزّعة على كل مسار.
 */
export type Contract<T> = ZodType<T, ZodTypeDef, unknown>;

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ApiError };

/**
 * أول مشكلة تحقّق تُترجم إلى خطأ واحد مرتبط بحقله.
 * عرض خطأ واحد لا قائمة: المعلم غير التقني والطالب يصلحان مشكلة في كل مرة.
 */
export function validate<T>(schema: Contract<T>, input: unknown): ValidationResult<T> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };

  const issue = parsed.error.issues[0];
  if (!issue) return { ok: false, error: apiError('validation', 'تحقّق من البيانات المُرسلة.') };

  const field = issue.path.join('.');
  return {
    ok: false,
    error: apiError('validation', issue.message, field === '' ? undefined : field),
  };
}
