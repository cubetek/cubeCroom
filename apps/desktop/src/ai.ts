import {
  createAllAdapters,
  createRegistry,
  type ProviderAdapter,
  type Registry,
} from '@cubecroom/ai';
import { readKey, hasKey } from './secrets.js';
import { isLocalProvider, LOCAL_PROVIDER_URLS } from '@cubecroom/contracts';
import { readConfig } from './config.js';
import { repositories, storeState } from './store.js';

/**
 * سجلّ المزوّدين في العملية الرئيسية.
 *
 * هنا وحده يلتقي المفتاح بالشبكة: الميزات تنادي `registry.complete` بمعرّف
 * نموذج، والسجلّ يجلب المفتاح من الخزنة لحظة النداء. لا يمرّ المفتاح بالواجهة
 * ولا بالقاعدة ولا بتوقيع أي ميزة (SEC-005).
 *
 * المحوّلات مبنيّة فوق Vercel AI SDK (§8) للتوليد، وفوق نداء HTTP
 * مباشر لسرد النماذج — والسرد هو خطوة «اختبار الاتصال» في T04.
 */

const ADAPTERS: readonly ProviderAdapter[] = createAllAdapters();

let registry: Registry | null = null;

export function aiRegistry(): Registry {
  registry ??= createRegistry({
    adapters: ADAPTERS,
    resolveKey: async (provider) => {
      if (
        storeState().status !== 'open' ||
        repositories().ai.find(provider)?.status !== 'connected'
      )
        return null;
      const key = await readKey(provider);
      return key ?? (isLocalProvider(provider) && !(await hasKey(provider)) ? '' : null);
    },
    resolveBaseURL: async (provider) =>
      isLocalProvider(provider)
        ? ((await readConfig())?.aiEndpoints?.[provider] ?? LOCAL_PROVIDER_URLS[provider])
        : undefined,
  });
  return registry;
}
