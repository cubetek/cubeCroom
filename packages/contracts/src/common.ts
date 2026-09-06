import { z } from 'zod';

/**
 * مغلّف الأخطاء المشترك.
 *
 * قاعدة ملزِمة من المصدر: الطالب **لا يرى HTTP status** ولا مصطلحاً تقنياً؛
 * والمعلم يرى «المشكلة المحتملة والإجراء، لا stack trace».
 * ولذلك يحمل كل خطأ حقلين منفصلين:
 *   `code`    — للشيفرة: تفرّع المنطق وتسجيل الأحداث.
 *   `message` — للإنسان: عربي، يقول ما حدث وما يفعله بعده. هو وحده ما يُعرض.
 */
export const ERROR_CODES = [
  'validation',
  'not_found',
  'forbidden',
  'session_ended',
  'rate_limited',
  'ai_disabled',
  'not_implemented',
  'internal',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const apiErrorSchema = z.object({
  code: z.enum(ERROR_CODES),
  /** النص الذي يُعرض للمستخدم كما هو. لا يُترجم ولا يُختصر في الواجهة. */
  message: z.string().min(1),
  /** اسم الحقل حين يكون الخطأ خطأ تحقّق — لربط الرسالة بالحقل نفسه. */
  field: z.string().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export function apiError(code: ErrorCode, message: string, field?: string): ApiError {
  return field === undefined ? { code, message } : { code, message, field };
}

/** رسائل ثابتة تُعاد من أكثر من مسار — تبقى في مكان واحد فلا تتفرّق صياغتها. */
export const MESSAGES = {
  sessionEnded: 'أنهى المعلم جلسة الدخول.',
  notImplemented: 'هذه الميزة لم تُبنَ بعد.',
  rateLimited: 'حاول مرة أخرى بعد قليل.',
  internal: 'حدث خطأ غير متوقّع. أعد المحاولة، وإن تكرر أخبر معلمك.',
} as const;
