import type { ProviderId } from '@cubecroom/contracts';
import { parseModelId, type ModelId } from './model-id.js';

/**
 * سجلّ المزوّدين — PRD §11.
 *
 * معيار الإنجاز: **تبديل المزوّد دون تغيير منطق الميزات**. ولذلك ميزات
 * الذكاء الاصطناعي (T14 · T16 · S10) لا تعرف مزوّداً ولا SDK؛ تنادي
 * `registry.complete(...)` بمعرّف نموذج، والسجلّ يختار المحوّل.
 *
 * والمفتاح لا يُمرَّر من الميزة: السجلّ يطلبه من الخزنة لحظة النداء عبر
 * `resolveKey` ثم ينساه. لو مرّ عبر توقيع كل ميزة لتسرّب إلى سجلّات الأخطاء
 * وإلى كل من يقرأ الشيفرة (SEC-005).
 */

export type AiMessage = {
  readonly role: 'system' | 'user';
  readonly content: string;
};

export type CompleteRequest = {
  readonly modelId: ModelId | string;
  readonly messages: readonly AiMessage[];
  readonly signal?: AbortSignal | undefined;
  readonly maxOutputTokens?: number | undefined;
};

export type CompleteResult = {
  readonly text: string;
  /** يُملأ إن وفّره المزوّد — US-T13 يشترط «إن توفرت». */
  readonly tokens?: number | undefined;
};

/**
 * ما يجب أن يوفّره كل محوّل مزوّد.
 * المحوّلات الحقيقية تغلّف Vercel AI SDK وتُبنى في P4-3؛ الواجهة هنا لتبقى
 * الميزات مكتوبة قبلها وبعدها بلا تغيير.
 */
export type ProviderAdapter = {
  readonly provider: ProviderId;
  /** يتحقق أن المفتاح صالح ويعيد نماذج الحساب — خطوة «اختبار» في T04. */
  readonly listModels: (key: string, signal?: AbortSignal, baseURL?: string) => Promise<string[]>;
  readonly complete: (input: {
    key: string;
    baseURL?: string | undefined;
    model: string;
    messages: readonly AiMessage[];
    signal?: AbortSignal | undefined;
    maxOutputTokens?: number | undefined;
  }) => Promise<CompleteResult>;
};

export class ProviderNotConfiguredError extends Error {
  readonly code = 'provider_not_configured';
  constructor(readonly provider: ProviderId) {
    super('لم تربط هذا المزوّد بعد. افتح إعدادات الذكاء الاصطناعي واختبر الاتصال به.');
    this.name = 'ProviderNotConfiguredError';
  }
}

export class ProviderUnavailableError extends Error {
  readonly code = 'provider_unavailable';
  constructor(readonly provider: ProviderId) {
    super('هذا المزوّد غير متاح في هذا الإصدار من التطبيق.');
    this.name = 'ProviderUnavailableError';
  }
}

export type RegistryOptions = {
  readonly adapters: readonly ProviderAdapter[];
  /** يعيد مفتاح المزوّد من الخزنة، أو `null` إن لم يُربط. */
  readonly resolveKey: (provider: ProviderId) => Promise<string | null>;
  readonly resolveBaseURL?: ((provider: ProviderId) => Promise<string | undefined>) | undefined;
};

export function createRegistry({ adapters, resolveKey, resolveBaseURL }: RegistryOptions) {
  const byProvider = new Map(adapters.map((adapter) => [adapter.provider, adapter]));

  const adapterFor = (provider: ProviderId): ProviderAdapter => {
    const adapter = byProvider.get(provider);
    if (adapter === undefined) throw new ProviderUnavailableError(provider);
    return adapter;
  };

  return {
    providers: (): ProviderId[] => [...byProvider.keys()],

    has: (provider: ProviderId): boolean => byProvider.has(provider),

    /** خطوة «اختبار» قبل الحفظ — المفتاح يأتي من الشاشة مرة واحدة (P4-3). */
    async listModels(provider: ProviderId, key: string, signal?: AbortSignal, baseURL?: string): Promise<string[]> {
      return adapterFor(provider).listModels(key, signal, baseURL);
    },

    /**
     * النداء الوحيد الذي تعرفه الميزات.
     * تبديل المزوّد = تبديل سلسلة `provider:model`، لا أكثر.
     */
    async complete(request: CompleteRequest): Promise<CompleteResult> {
      const { provider, model } = parseModelId(request.modelId);
      const adapter = adapterFor(provider);

      const key = await resolveKey(provider);
      if (key === null) throw new ProviderNotConfiguredError(provider);

      return adapter.complete({
        key,
        baseURL: await resolveBaseURL?.(provider),
        model,
        messages: request.messages,
        ...(request.signal === undefined ? {} : { signal: request.signal }),
        ...(request.maxOutputTokens === undefined ? {} : { maxOutputTokens: request.maxOutputTokens }),
      });
    },
  };
}

export type Registry = ReturnType<typeof createRegistry>;
