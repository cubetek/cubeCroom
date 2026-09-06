import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  AiFailure,
  buildMessages,
  createAdapter,
  createAllAdapters,
  reasonForThrown,
} from '../dist/index.js';

/**
 * معيار إنجاز P4-3 يقوم على خطوة «اختبار الاتصال»، فهذه الاختبارات تفحصها
 * بلا شبكة: `fetch` مُحقَن، فما يُختبَر هو ترجمة ردّ المزوّد لا المزوّد نفسه.
 *
 * ولوح `T04States` ينصّ: «لا رمز خطأ ولا اسم استجابة تقنية». الفحوص أدناه
 * تُثبت ذلك في نصّ الرسالة نفسه لا في النية.
 */

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('سرد النماذج — خطوة الاختبار', () => {
  test('OpenAI: المفتاح في ترويسة Bearer والأسماء من data[].id', async () => {
    let seen = null;
    const adapter = createAdapter('openai', {
      fetch: async (url, init) => {
        seen = { url: String(url), headers: init?.headers };
        return json({ data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4o' }] });
      },
    });

    assert.deepEqual(await adapter.listModels('sk-test'), ['gpt-4o-mini', 'gpt-4o']);
    assert.match(seen.url, /api\.openai\.com/);
    assert.equal(seen.headers.authorization, 'Bearer sk-test');
  });

  test('Anthropic: المفتاح في x-api-key مع إصدار الواجهة', async () => {
    let headers = null;
    const adapter = createAdapter('anthropic', {
      fetch: async (_url, init) => {
        headers = init?.headers;
        return json({ data: [{ id: 'claude-3-5-haiku-latest' }] });
      },
    });

    assert.deepEqual(await adapter.listModels('sk-ant'), ['claude-3-5-haiku-latest']);
    assert.equal(headers['x-api-key'], 'sk-ant');
    assert.ok(headers['anthropic-version']);
  });

  test('Google: المفتاح في الرابط مُرمَّزاً والأسماء من models[].name', async () => {
    let url = null;
    const adapter = createAdapter('google', {
      fetch: async (target) => {
        url = String(target);
        return json({ models: [{ name: 'models/gemini-1.5-flash' }] });
      },
    });

    assert.deepEqual(await adapter.listModels('AIza key/with+chars'), ['models/gemini-1.5-flash']);
    assert.ok(url.includes(encodeURIComponent('AIza key/with+chars')), 'المفتاح مُرمَّز في الرابط');
  });

  test('ردّ ناجح بجسم غير مفهوم لا يُفشل الاختبار — المفتاح مقبول', async () => {
    const adapter = createAdapter('openai', {
      fetch: async () => new Response('<html>', { status: 200 }),
    });

    assert.deepEqual(await adapter.listModels('sk-test'), []);
  });
});

describe('ترجمة الأخطاء — لا رمز ولا مصطلح تقني', () => {
  const failing = (status) =>
    createAdapter('openai', { fetch: async () => json({ error: { code: 'invalid_api_key' } }, status) });

  test('٤٠١ ⇦ مفتاح مرفوض برسالة تقول ما يفعله المعلم', async () => {
    await assert.rejects(() => failing(401).listModels('sk-bad'), (error) => {
      assert.ok(error instanceof AiFailure);
      assert.equal(error.reason, 'rejected_key');
      assert.match(error.message, /رفضه المزوّد/);
      assert.doesNotMatch(error.message, /401|invalid_api_key|Error/i, 'لا رمز ولا مصطلح');
      return true;
    });
  });

  test('٤٢٩ ⇦ حصة، و٥٠٠ ⇦ عطل مؤقّت — إجراءان مختلفان', async () => {
    await assert.rejects(() => failing(429).listModels('k'), (error) => {
      assert.equal(error.reason, 'quota');
      assert.match(error.message, /الحصة المسموحة/);
      return true;
    });

    await assert.rejects(() => failing(503).listModels('k'), (error) => {
      assert.equal(error.reason, 'provider_error');
      return true;
    });
  });

  test('انقطاع الشبكة ⇦ offline لا «مفتاح مرفوض»', async () => {
    const adapter = createAdapter('openai', {
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });

    await assert.rejects(() => adapter.listModels('sk-test'), (error) => {
      assert.equal(error.reason, 'offline');
      assert.match(error.message, /اتصال هذا الجهاز بالإنترنت/);
      return true;
    });
  });
});

describe('التوليد', () => {
  test('passes an explicit output budget to the SDK', async () => {
    let seen;
    const adapter = createAdapter('ollama', {
      generate: async (options) => { seen = options; return { text: 'تلميح', usage: {} }; },
    });
    await adapter.complete({ key: '', model: 'fixture', messages: [], maxOutputTokens: 1000 });
    assert.equal(seen.maxOutputTokens, 1000);
  });
  test('يفصل تعليمات النظام عن سؤال المعلم ويعيد عدد الوحدات', async () => {
    let seen = null;
    const adapter = createAdapter('openai', {
      generate: async (options) => {
        seen = options;
        return { text: 'نصّ مبسَّط', usage: { totalTokens: 42 } };
      },
    });

    const result = await adapter.complete({
      key: 'sk-test',
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'أنت مساعد معلم' },
        { role: 'user', content: 'بسّط هذه الفقرة' },
      ],
    });

    assert.equal(result.text, 'نصّ مبسَّط');
    assert.equal(result.tokens, 42);
    assert.equal(seen.system, 'أنت مساعد معلم');
    assert.equal(seen.prompt, 'بسّط هذه الفقرة');
  });

  test('فشل التوليد يُترجَم كما يُترجَم فشل الاختبار', async () => {
    const adapter = createAdapter('anthropic', {
      generate: async () => {
        throw new TypeError('fetch failed');
      },
    });

    await assert.rejects(
      () => adapter.complete({ key: 'k', model: 'm', messages: [] }),
      (error) => {
        assert.ok(error instanceof AiFailure);
        assert.equal(error.reason, 'offline');
        return true;
      },
    );
  });

  test('كل المزوّدين المعتمدين لهم محوّل', () => {
    assert.deepEqual(
      createAllAdapters().map((adapter) => adapter.provider),
      ['openai', 'anthropic', 'google', 'openrouter', 'lmstudio', 'ollama'],
    );
  });
});

describe('صياغة الطلب — FR-010', () => {
  test('كل إجراء يحمل تعليمته، والنصّ يأتي بعدها بفاصل', () => {
    const messages = buildMessages({ action: 'simplify', content: '  فقرة الدرس  ' });

    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, 'system');
    assert.match(messages[1].content, /أعد صياغة النصّ التالي بلغة أبسط/);
    assert.match(messages[1].content, /--- النصّ ---\nفقرة الدرس$/);
  });

  test('التعليمات الثابتة تفرض العربية والنصّ العادي', () => {
    const [system] = buildMessages({ action: 'summary', content: 'x' });

    assert.match(system.content, /بالعربية/);
    assert.match(system.content, /نصّاً عادياً/);
    assert.match(system.content, /بلا مقدّمة/);
  });

  test('«تعليمات أخرى» تستعمل ما كتبه المعلم', () => {
    const messages = buildMessages({
      action: 'custom',
      content: 'الفقرة',
      instructions: 'اجعلها مناسبة للصف السادس',
    });

    assert.match(messages[1].content, /^اجعلها مناسبة للصف السادس/);
  });

  test('«تعليمات أخرى» بلا نصّ لا تُرسل طلباً فارغاً', () => {
    const messages = buildMessages({ action: 'custom', content: 'الفقرة', instructions: '   ' });
    assert.match(messages[1].content, /^تعليمات أخرى/);
  });
});

describe('أسباب الأعطال — NFR-006', () => {
  test('لكل سبب رسالة تقول للمعلم ما يفعله، وبلا مصطلحات', () => {
    const expectations = {
      rejected_key: /رفضه المزوّد/,
      offline: /اتصال هذا الجهاز بالإنترنت/,
      quota: /الحصة المسموحة/,
      timeout: /نصّاً أقصر/,
      provider_error: /أعد المحاولة بعد قليل/,
    };

    for (const [reason, pattern] of Object.entries(expectations)) {
      const failure = new AiFailure(reason);
      assert.match(failure.message, pattern, reason);
      assert.doesNotMatch(failure.message, /[A-Za-z]{3,}|\d{3}/, `تسرّب مصطلح في: ${reason}`);
    }
  });

  test('الأسباب متمايزة — لا سبب جامع يقول «حدث خطأ»', () => {
    const messages = ['rejected_key', 'offline', 'quota', 'timeout', 'provider_error'].map(
      (reason) => new AiFailure(reason).message,
    );

    assert.equal(new Set(messages).size, messages.length, 'كل سبب برسالته');
  });

  test('الإلغاء يصل كـ AbortError فيُقرأ انقطاعاً لا عطلاً في المزوّد', () => {
    const aborted = new DOMException('aborted', 'AbortError');
    assert.equal(reasonForThrown(aborted), 'offline');
  });
});
