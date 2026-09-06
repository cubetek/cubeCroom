import { PROVIDERS, type ProviderId } from '@cubecroom/contracts';

/**
 * معرّف النموذج بصيغة `provider:model` — PRD §11.
 *
 * سلسلة واحدة لا حقلان: النموذج بلا مزوّده لا معنى له، وحفظهما منفصلين يسمح
 * بحالة لا تُصدَّق — نموذج `gpt-4o` تحت مزوّد `anthropic`. والصيغة نفسها تُخزَّن
 * وتُعرض وتُنقل عبر IPC، فلا تحويل بين طبقة وأخرى.
 */

export type ModelId = `${ProviderId}:${string}`;

export type ParsedModelId = {
  readonly provider: ProviderId;
  readonly model: string;
};

export class UnknownProviderError extends Error {
  readonly code = 'unknown_provider';
  constructor(readonly value: string) {
    super('هذا المزوّد غير مدعوم في هذا الإصدار. اختر مزوّداً من القائمة.');
    this.name = 'UnknownProviderError';
  }
}

export class MalformedModelIdError extends Error {
  readonly code = 'malformed_model_id';
  constructor(readonly value: string) {
    super('تعذّر التعرّف على النموذج المختار. أعد اختياره من إعدادات الذكاء الاصطناعي.');
    this.name = 'MalformedModelIdError';
  }
}

function isProvider(value: string): value is ProviderId {
  return (PROVIDERS as readonly string[]).includes(value);
}

/**
 * يفكّ المعرّف أو يرمي.
 *
 * اسم النموذج يبقى كما هو بلا تطبيع: هو معرّف عند المزوّد لا نصّ للعرض،
 * وأي «تصحيح» له يجعلنا نطلب نموذجاً غير الذي اختاره المعلم.
 */
export function parseModelId(value: string): ParsedModelId {
  const separator = value.indexOf(':');
  if (separator <= 0 || separator === value.length - 1) throw new MalformedModelIdError(value);

  const provider = value.slice(0, separator);
  const model = value.slice(separator + 1).trim();

  if (!isProvider(provider)) throw new UnknownProviderError(provider);
  if (model === '') throw new MalformedModelIdError(value);

  return { provider, model };
}

export function formatModelId(provider: ProviderId, model: string): ModelId {
  return `${provider}:${model.trim()}`;
}

/** فحص بلا رمي — للواجهات التي تعرض حالة بدل أن تنهار. */
export function isValidModelId(value: string): boolean {
  try {
    parseModelId(value);
    return true;
  } catch {
    return false;
  }
}
