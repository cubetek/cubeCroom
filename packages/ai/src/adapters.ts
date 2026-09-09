import { generateText, stepCountIs } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import {
  PROVIDERS,
  LOCAL_PROVIDER_URLS,
  isLocalProvider,
  localProviderUrlSchema,
  type ProviderId,
} from '@cubecroom/contracts';
import { AiFailure, reasonForStatus, reasonForThrown } from './errors.js';
import type { AiMessage, CompleteResult, ProviderAdapter } from './registry.js';

/**
 * محوّلات السحابة والخوادم المحلية — واجهة واحدة للتوليد وسرد النماذج.
 *
 * التوليد يمرّ بـ Vercel AI SDK كما يفرض §8. أما **سرد النماذج** فبطلب HTTP
 * مباشر: الـSDK لا يوفّره، وخطوة «اختبار الاتصال» في T04 تحتاج نداءً رخيصاً
 * يثبت أن المفتاح مقبول ويعيد ما يستطيع الحساب استعماله — وأرخص من توليد نصّ
 * لا أحد يقرؤه.
 *
 * وكل ما يُحقن هنا (`fetch` و`generate`) له قيمة افتراضية حقيقية: الحقن
 * للاختبار بلا شبكة، لا لتغيير السلوك في المنتج.
 */

export type AdapterOptions = {
  readonly fetch?: typeof globalThis.fetch | undefined;
  readonly generate?: typeof generateText | undefined;
};

type ModelFactory = (
  key: string,
  call: typeof fetch,
  baseURL?: string,
) => (model: string) => Parameters<typeof generateText>[0]['model'];

const OPENROUTER_URL = 'https://openrouter.ai/api/v1';

/** APIs المتوافقة تستخدم chat صراحةً؛ OpenAI SDK يستعمل Responses افتراضياً. */
function compatibleFactory(provider: 'openrouter' | 'lmstudio' | 'ollama'): ModelFactory {
  return (key, call, baseURL) =>
    createOpenAI({
      apiKey: key || 'local',
      baseURL:
        provider === 'openrouter' ? OPENROUTER_URL : (baseURL ?? LOCAL_PROVIDER_URLS[provider]),
      fetch:
        isLocalProvider(provider) && key === ''
          ? async (url, init) => {
              const headers = new Headers(init?.headers);
              headers.delete('authorization');
              return call(url, { ...init, headers });
            }
          : call,
    }).chat;
}

const FACTORIES: Readonly<Record<ProviderId, ModelFactory>> = {
  openai: (key, call) => createOpenAI({ apiKey: key, fetch: call }),
  anthropic: (key, call) => createAnthropic({ apiKey: key, fetch: call }),
  google: (key, call) => createGoogleGenerativeAI({ apiKey: key, fetch: call }),
  openrouter: compatibleFactory('openrouter'),
  lmstudio: compatibleFactory('lmstudio'),
  ollama: compatibleFactory('ollama'),
};

/** نداء السرد لكل مزوّد: عنوانه وترويسته وموضع الأسماء في ردّه. */
const CATALOGUE: Readonly<
  Record<
    'openai' | 'anthropic' | 'google',
    {
      url: (key: string) => string;
      headers: (key: string) => Record<string, string>;
      names: (body: unknown) => string[];
    }
  >
> = {
  openai: {
    url: () => 'https://api.openai.com/v1/models',
    headers: (key) => ({ authorization: `Bearer ${key}` }),
    names: (body) => pluck(body, 'data', 'id'),
  },
  anthropic: {
    url: () => 'https://api.anthropic.com/v1/models',
    headers: (key) => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
    names: (body) => pluck(body, 'data', 'id'),
  },
  google: {
    // المفتاح في الرابط هو ما توثّقه Google لهذا المسار.
    url: (key) =>
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
    headers: () => ({}),
    names: (body) => pluck(body, 'models', 'name'),
  },
};

function pluck(body: unknown, listKey: string, nameKey: string): string[] {
  if (typeof body !== 'object' || body === null) return [];
  const list = (body as Record<string, unknown>)[listKey];
  if (!Array.isArray(list)) return [];

  return list
    .map((entry) => {
      if (typeof entry !== 'object' || entry === null) return null;
      const value = (entry as Record<string, unknown>)[nameKey];
      return typeof value === 'string' ? value : null;
    })
    .filter((name): name is string => name !== null);
}

export function createAdapter(provider: ProviderId, options: AdapterOptions = {}): ProviderAdapter {
  const call = options.fetch ?? globalThis.fetch;
  const generate = options.generate ?? generateText;
  const local = isLocalProvider(provider);

  const endpoint = (baseURL?: string): string | undefined => {
    if (!isLocalProvider(provider)) return undefined;
    const parsed = localProviderUrlSchema.safeParse(baseURL ?? LOCAL_PROVIDER_URLS[provider]);
    if (!parsed.success)
      throw new AiFailure('provider_error', 'أدخل عنوان خادم صالحاً ثم أعد اختبار الاتصال.');
    return parsed.data;
  };

  const failure = (error: unknown): AiFailure => {
    if (error instanceof AiFailure) return error;
    const reason = reasonForThrown(error);
    return new AiFailure(
      reason,
      local && reason === 'offline'
        ? 'تعذّر الوصول إلى الخادم المحلي. شغّله وتأكد من عنوانه ثم أعد المحاولة.'
        : undefined,
    );
  };

  return {
    provider,

    async listModels(key, signal, baseURL) {
      const timeout = AbortSignal.timeout(15_000);
      const boundedSignal = signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
      try {
        const get = async (url: string, headers: Record<string, string>) => {
          const response = await call(url, { headers, signal: boundedSignal });
          if (!response.ok) throw new AiFailure(reasonForStatus(response.status));
          return response;
        };
        const bearer = key === '' ? {} : { authorization: `Bearer ${key}` };
        // قائمة OpenRouter عامة، فلا تُعدّ نجاحها دليلاً على صلاحية المفتاح.
        if (provider === 'openrouter') await get(`${OPENROUTER_URL}/key`, bearer);

        if (provider === 'openrouter' || isLocalProvider(provider)) {
          const root = provider === 'openrouter' ? OPENROUTER_URL : endpoint(baseURL);
          const response = await get(`${root}/models`, bearer);
          const body: unknown = await response.json();
          if (
            typeof body !== 'object' ||
            body === null ||
            !('data' in body) ||
            !Array.isArray(body.data)
          ) {
            throw new AiFailure(
              'provider_error',
              'لم يُعد الخادم قائمة نماذج صالحة. تحقق من عنوانه ثم أعد المحاولة.',
            );
          }
          return [...new Set(pluck(body, 'data', 'id').filter((name) => name.trim() !== ''))];
        }

        const catalogue = CATALOGUE[provider];
        const response = await get(catalogue.url(key), catalogue.headers(key));
        try {
          return catalogue.names(await response.json());
        } catch {
          return [];
        }
      } catch (error) {
        throw failure(error);
      }
    },

    async complete({ key, model, messages, signal, baseURL, maxOutputTokens, tools }): Promise<CompleteResult> {
      try {
        const system = systemOf(messages);
        const result = await generate({
          ...(tools ? { tools, stopWhen: stepCountIs(12) } : {}),
          model: FACTORIES[provider](key, call, endpoint(baseURL))(model),
          prompt: promptOf(messages),
          ...(system === undefined ? {} : { system }),
          ...(signal === undefined ? {} : { abortSignal: signal }),
          ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
        });

        return {
          text: result.text,
          ...(typeof (result.totalUsage?.totalTokens ?? result.usage?.totalTokens) === 'number'
            ? { tokens: result.totalUsage?.totalTokens ?? result.usage.totalTokens }
            : {}),
        };
      } catch (error) {
        throw failure(error);
      }
    },
  };
}

function systemOf(messages: readonly AiMessage[]): string | undefined {
  const system = messages.filter((message) => message.role === 'system').map((one) => one.content);
  return system.length === 0 ? undefined : system.join('\n');
}

function promptOf(messages: readonly AiMessage[]): string {
  return messages
    .filter((message) => message.role === 'user')
    .map((one) => one.content)
    .join('\n');
}

export function createAllAdapters(options: AdapterOptions = {}): ProviderAdapter[] {
  return PROVIDERS.map((provider) => createAdapter(provider, options));
}
