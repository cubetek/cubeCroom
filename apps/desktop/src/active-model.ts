import { PROVIDERS, PROVIDER_LABELS, type ActiveModel } from '@cubecroom/contracts';
import { repositories, storeState } from './store.js';

/**
 * المزوّد والنموذج المستعملان الآن.
 *
 * اختيار المعلم صريح؛ فصل المحلي لا يحوّل طلباته إلى السحابة تلقائياً.
 * الاتصالات القديمة بلا اختيار صريح تبقى على ترتيبها السابق.
 */
export function activeModel(): ActiveModel {
  if (storeState().status !== 'open') return null;

  const selected = repositories().settings.get('activeAiProvider');
  const preferred = PROVIDERS.find((provider) => provider === selected);
  const ordered = preferred === undefined ? PROVIDERS : [preferred];
  for (const provider of ordered) {
    const row = repositories().ai.find(provider);
    if (row?.status === 'connected' && row.defaultModel !== null && row.defaultModel !== '') {
      return { provider, label: PROVIDER_LABELS[provider], model: row.defaultModel };
    }
  }
  return null;
}
