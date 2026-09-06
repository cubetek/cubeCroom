import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROVIDERS,
  providerIdSchema,
  saveKeySchema,
  localProviderUrlSchema,
  validate,
  setModelSchema,
  writeSettingSchema,
} from '../dist/index.js';

test('all six providers can be selected; unknown providers are rejected', () => {
  for (const provider of PROVIDERS)
    assert.equal(providerIdSchema.safeParse(provider).success, true);
  assert.equal(providerIdSchema.safeParse('unknown').success, false);
});

test('local connections allow no key and normalize IPv4, IPv6 and host URLs', () => {
  for (const provider of ['lmstudio', 'ollama']) {
    const result = validate(saveKeySchema, { provider, baseURL: ' http://localhost:1234/ ' });
    assert.equal(result.ok, true);
    assert.equal(result.value.key, '');
    assert.equal(result.value.baseURL, 'http://localhost:1234/v1');
    assert.equal(
      saveKeySchema.safeParse({ provider, key: 'x', baseURL: 'http://[::1]:11434/v1/' }).success,
      true,
    );
  }
  assert.equal(
    localProviderUrlSchema.parse('https://ai.school.local/proxy/v1/'),
    'https://ai.school.local/proxy/v1',
  );
});

test('cloud connections still require keys and cannot override the destination', () => {
  for (const provider of ['openai', 'anthropic', 'google', 'openrouter']) {
    assert.equal(saveKeySchema.safeParse({ provider, key: '' }).success, false);
    assert.equal(saveKeySchema.safeParse({ provider, key: 'test-key-123' }).success, true);
    assert.equal(
      saveKeySchema.safeParse({ provider, key: 'test-key-123', baseURL: 'https://example.com/v1' })
        .success,
      false,
    );
  }
});

test('malformed URLs and embedded credentials fail validation without throwing', () => {
  for (const baseURL of [
    '',
    'not a URL',
    'file:///tmp/models',
    'ftp://localhost',
    'http://user:secret@localhost:1234/v1',
    'http://localhost:1234/v1?key=secret',
    'http://localhost:1234/#secret',
  ]) {
    assert.equal(validate(saveKeySchema, { provider: 'ollama', baseURL }).ok, false, baseURL);
  }
});

test('model names preserve OpenRouter slashes and Ollama tags; active selection is validated', () => {
  assert.equal(
    setModelSchema.parse({ provider: 'openrouter', model: 'vendor/model:free' }).model,
    'vendor/model:free',
  );
  assert.equal(
    setModelSchema.parse({ provider: 'ollama', model: 'llama3.2:3b' }).model,
    'llama3.2:3b',
  );
  assert.equal(validate(writeSettingSchema, { key: 'activeAiProvider', value: 'ollama' }).ok, true);
  assert.equal(
    validate(writeSettingSchema, { key: 'activeAiProvider', value: 'unknown' }).ok,
    false,
  );
});
