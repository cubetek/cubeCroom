import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRegistry,
  formatModelId,
  isValidModelId,
  parseModelId,
  MalformedModelIdError,
  ProviderNotConfiguredError,
  ProviderUnavailableError,
  UnknownProviderError,
} from '../dist/index.js';

/**
 * معيار إنجاز P4-2: «تبديل المزود دون تغيير منطق الميزات».
 * الاختبار الأخير هو المعيار نفسه: دالة ميزة واحدة تعمل مع مزوّدين مختلفين
 * بلا سطر يتغيّر فيها.
 */

const echo = (provider) => ({
  provider,
  listModels: async () => [`${provider}-model-a`, `${provider}-model-b`],
  complete: async ({ key, model, messages }) => ({
    text: `${provider}/${model}/${key}/${messages.at(-1)?.content ?? ''}`,
    tokens: 12,
  }),
});

test('student generation budget and cancellation propagate through the shared registry', async () => {
  let seen;
  const registry = createRegistry({
    adapters: [{ ...echo('ollama'), complete: async (input) => { seen = input; return { text: 'تلميح' }; } }],
    resolveKey: async () => '',
  });
  const signal = new AbortController().signal;
  await registry.complete({ modelId: 'ollama:fixture', messages: [], maxOutputTokens: 1000, signal });
  assert.equal(seen.maxOutputTokens, 1000);
  assert.equal(seen.signal, signal);
});

describe('معرّف النموذج', () => {
  test('يُفكّ إلى مزوّد ونموذج', () => {
    assert.deepEqual(parseModelId('openai:gpt-4o-mini'), {
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
  });

  test('اسم النموذج يبقى كما هو — نقطتان في اسمه لا تكسرانه', () => {
    assert.deepEqual(parseModelId('google:models/gemini-1.5:latest'), {
      provider: 'google',
      model: 'models/gemini-1.5:latest',
    });
  });

  test('مزوّد غير مدعوم يُرفض برسالة للمعلم', () => {
    assert.throws(() => parseModelId('cohere:command'), (error) => {
      assert.ok(error instanceof UnknownProviderError);
      assert.match(error.message, /غير مدعوم/);
      return true;
    });
  });

  test('الصيغة الناقصة تُرفض', () => {
    for (const value of ['gpt-4o', 'openai:', ':gpt-4o', '']) {
      assert.throws(() => parseModelId(value), MalformedModelIdError, `مرّ: ${value}`);
    }
  });

  test('التكوين والفحص متقابلان', () => {
    assert.equal(formatModelId('anthropic', ' claude-3-5-haiku '), 'anthropic:claude-3-5-haiku');
    assert.equal(isValidModelId('anthropic:claude-3-5-haiku'), true);
    assert.equal(isValidModelId('nope'), false);
  });
});

describe('السجلّ', () => {
  const registry = createRegistry({
    adapters: [echo('openai'), echo('anthropic')],
    resolveKey: async (provider) => (provider === 'openai' ? 'sk-openai' : null),
  });

  test('مزوّد بلا محوّل يُرفض قبل أن يُطلب مفتاحه', async () => {
    await assert.rejects(
      () => registry.complete({ modelId: 'google:gemini', messages: [] }),
      ProviderUnavailableError,
    );
  });

  test('مزوّد بلا مفتاح يقول للمعلم ما يفعل', async () => {
    await assert.rejects(
      () => registry.complete({ modelId: 'anthropic:claude', messages: [] }),
      (error) => {
        assert.ok(error instanceof ProviderNotConfiguredError);
        assert.match(error.message, /افتح إعدادات الذكاء الاصطناعي/);
        return true;
      },
    );
  });

  test('المفتاح لا يمرّ عبر توقيع الميزة — السجلّ يجلبه ويمرّره', async () => {
    const result = await registry.complete({
      modelId: 'openai:gpt-4o-mini',
      messages: [{ role: 'user', content: 'بسّط هذه الفقرة' }],
    });

    assert.equal(result.text, 'openai/gpt-4o-mini/sk-openai/بسّط هذه الفقرة');
    assert.equal(result.tokens, 12);
  });

  test('تبديل المزوّد لا يغيّر منطق الميزة — معيار الإنجاز', async () => {
    // «ميزة» مكتوبة مرة واحدة: لا تعرف مزوّداً ولا مفتاحاً ولا SDK.
    const simplify = (registryInstance, modelId) =>
      registryInstance.complete({
        modelId,
        messages: [{ role: 'user', content: 'بسّط' }],
      });

    const both = createRegistry({
      adapters: [echo('openai'), echo('anthropic')],
      resolveKey: async (provider) => `key-${provider}`,
    });

    const first = await simplify(both, 'openai:gpt-4o-mini');
    const second = await simplify(both, 'anthropic:claude-3-5-haiku');

    assert.match(first.text, /^openai\/gpt-4o-mini\//);
    assert.match(second.text, /^anthropic\/claude-3-5-haiku\//);
  });

  test('قائمة النماذج تمرّ إلى المحوّل الصحيح', async () => {
    assert.deepEqual(await registry.listModels('anthropic', 'sk-test'), [
      'anthropic-model-a',
      'anthropic-model-b',
    ]);
  });
});
