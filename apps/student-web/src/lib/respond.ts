import {
  apiError,
  MESSAGES,
  validate,
  type ApiError,
  type Contract,
  type ErrorCode,
} from '@cubecroom/contracts';
import { readBoundedJson } from '@cubecroom/core';

/**
 * مغلّف الاستجابات لبوابة الطالب.
 *
 * كل مسار يعيد `{ data }` أو `{ error }` — لا شكل ثالث، فلا تحتاج الواجهة
 * إلى قراءة رمز HTTP لتعرف ما حدث. الطالب لا يرى الرمز أصلاً؛ يرى `message`.
 */

const STATUS: Record<ErrorCode, number> = {
  validation: 400,
  not_found: 404,
  forbidden: 403,
  session_ended: 410,
  rate_limited: 429,
  ai_disabled: 403,
  not_implemented: 501,
  internal: 500,
};

export function ok<T>(data: T): Response {
  return Response.json({ data });
}

export function fail(error: ApiError): Response {
  return Response.json({ error }, { status: STATUS[error.code] });
}

/** حتى تُبنى المرحلة المعنية، يبقى المسار موجوداً وعقده مثبتاً. */
export function notImplemented(): Response {
  return fail(apiError('not_implemented', MESSAGES.notImplemented));
}

/** يقرأ جسم الطلب ويتحقق منه — كل input غير موثوق يمرّ من هنا (PRD: Validation). */
export async function parseBody<T>(
  request: Request,
  schema: Contract<T>,
  options?: { maxBytes: number },
): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw =
      options === undefined
        ? await request.json()
        : await readBoundedJson(bodyChunks(request), options.maxBytes);
  } catch {
    return {
      ok: false,
      response: fail(apiError('validation', 'تعذّرت قراءة ما أرسلته. أعد المحاولة.')),
    };
  }

  const parsed = validate(schema, raw);
  if (!parsed.ok) return { ok: false, response: fail(parsed.error) };
  return { ok: true, value: parsed.value };
}

async function* bodyChunks(request: Request): AsyncGenerator<Uint8Array> {
  const reader = request.body?.getReader();
  if (reader === undefined) return;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) return;
      yield next.value;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
