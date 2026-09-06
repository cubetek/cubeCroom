import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAdapter, createRegistry, parseModelId, AiFailure } from '../dist/index.js';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('OpenRouter verifies authentication before fetching the public catalogue', async () => {
  const calls = [];
  const adapter = createAdapter('openrouter', {
    fetch: async (url, init) => {
      calls.push(String(url));
      assert.equal(new Headers(init.headers).get('authorization'), 'Bearer test-key');
      return String(url).endsWith('/key')
        ? json({ data: {} })
        : json({ data: [{ id: 'vendor/model:free' }] });
    },
  });
  assert.deepEqual(await adapter.listModels('test-key'), ['vendor/model:free']);
  assert.deepEqual(calls, [
    'https://openrouter.ai/api/v1/key',
    'https://openrouter.ai/api/v1/models',
  ]);
});

test('an invalid OpenRouter key cannot pass through the public catalogue', async () => {
  const calls = [];
  const adapter = createAdapter('openrouter', {
    fetch: async (url) => {
      calls.push(String(url));
      return json({ error: 'invalid key' }, 401);
    },
  });
  await assert.rejects(
    adapter.listModels('bad-key'),
    (error) => error instanceof AiFailure && error.reason === 'rejected_key',
  );
  assert.equal(calls.length, 1);
});

for (const [provider, defaultURL] of [
  ['lmstudio', 'http://localhost:1234/v1'],
  ['ollama', 'http://localhost:11434/v1'],
]) {
  test(`${provider}: local catalogue uses its configured endpoint and needs no token`, async () => {
    const calls = [];
    const adapter = createAdapter(provider, {
      fetch: async (url, init) => {
        calls.push(String(url));
        assert.equal(new Headers(init.headers).has('authorization'), false);
        return json({
          data: [{ id: 'local/model:latest' }, { id: 'local/model:latest' }, { id: '' }],
        });
      },
    });
    assert.deepEqual(await adapter.listModels(''), ['local/model:latest']);
    await adapter.listModels('', undefined, 'http://127.0.0.1:12399/');
    assert.deepEqual(calls, [`${defaultURL}/models`, 'http://127.0.0.1:12399/v1/models']);
  });

  test(`${provider}: unavailable servers get a local recovery message`, async () => {
    const adapter = createAdapter(provider, {
      fetch: async () => {
        throw new TypeError('ECONNREFUSED');
      },
    });
    await assert.rejects(
      adapter.listModels(''),
      (error) =>
        error.reason === 'offline' &&
        /الخادم المحلي/.test(error.message) &&
        !/الإنترنت/.test(error.message),
    );
  });

  test(`${provider}: HTML and malformed catalogues are rejected; empty catalogues are valid`, async () => {
    for (const body of [{}, { data: {} }, '<html>']) {
      const adapter = createAdapter(provider, { fetch: async () => json(body) });
      await assert.rejects(adapter.listModels(''), AiFailure);
    }
    assert.deepEqual(
      await createAdapter(provider, { fetch: async () => json({ data: [] }) }).listModels(''),
      [],
    );
  });
}

for (const provider of ['openrouter', 'lmstudio', 'ollama']) {
  for (const key of provider === 'openrouter' ? ['test-key'] : ['', 'local-token']) {
    test(`${provider}: real SDK sends chat completions with ${key === '' ? 'no authorization' : 'a token'}`, async () => {
      let seen;
      const adapter = createAdapter(provider, {
        fetch: async (url, init) => {
          seen = {
            url: String(url),
            headers: new Headers(init.headers),
            body: JSON.parse(init.body),
          };
          return json({
            id: 'test-completion',
            object: 'chat.completion',
            created: 1,
            model: 'vendor/model:tag',
            choices: [
              {
                index: 0,
                message: { role: 'assistant', content: 'نص تجريبي' },
                finish_reason: 'stop',
              },
            ],
            usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
          });
        },
      });
      const result = await adapter.complete({
        key,
        baseURL: 'http://127.0.0.1:12399/v1',
        model: 'vendor/model:tag',
        messages: [
          { role: 'system', content: 'ساعد المعلم' },
          { role: 'user', content: 'اشرح' },
        ],
      });
      assert.equal(
        seen.url,
        provider === 'openrouter'
          ? 'https://openrouter.ai/api/v1/chat/completions'
          : 'http://127.0.0.1:12399/v1/chat/completions',
      );
      assert.equal(seen.headers.get('authorization'), key === '' ? null : `Bearer ${key}`);
      assert.equal(seen.body.model, 'vendor/model:tag');
      assert.deepEqual(
        seen.body.messages.map(({ content }) => content),
        ['ساعد المعلم', 'اشرح'],
      );
      assert.equal(result.text, 'نص تجريبي');
      assert.equal(result.tokens, 6);
    });
  }
}

test('registry forwards saved endpoint and an empty local key, preserving model tags', async () => {
  const registry = createRegistry({
    adapters: [
      {
        provider: 'ollama',
        listModels: async () => [],
        complete: async (input) => {
          assert.equal(input.key, '');
          assert.equal(input.baseURL, 'http://localhost:12399/v1');
          assert.equal(input.model, 'llama3.2:3b');
          return { text: 'ok' };
        },
      },
    ],
    resolveKey: async () => '',
    resolveBaseURL: async () => 'http://localhost:12399/v1',
  });
  assert.equal(
    (await registry.complete({ modelId: 'ollama:llama3.2:3b', messages: [] })).text,
    'ok',
  );
  assert.deepEqual(parseModelId('openrouter:vendor/model:free'), {
    provider: 'openrouter',
    model: 'vendor/model:free',
  });
});

test('model discovery passes cancellation and maps timeout to a useful error', async () => {
  const controller = new AbortController();
  controller.abort();
  const adapter = createAdapter('ollama', {
    fetch: async (_url, init) => {
      assert.equal(init.signal.aborted, true);
      throw new DOMException('timed out', 'TimeoutError');
    },
  });
  await assert.rejects(
    adapter.listModels('', controller.signal),
    (error) => error.reason === 'timeout',
  );
});

test('OpenRouter exhausted credits map to quota for catalogue and generation', async () => {
  const adapter = createAdapter('openrouter', {
    fetch: async () => json({ error: { message: 'credits exhausted', code: 402 } }, 402),
  });
  await assert.rejects(adapter.listModels('test-key'), (error) => error.reason === 'quota');
  await assert.rejects(
    adapter.complete({
      key: 'test-key',
      model: 'vendor/model',
      messages: [{ role: 'user', content: 'hello' }],
    }),
    (error) => error.reason === 'quota',
  );
});
