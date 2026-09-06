import assert from 'node:assert/strict';
import { test } from 'node:test';
import { STUDENT_AI_POLICY } from '@cubecroom/contracts';
import { createStudentAiAdmission, readBoundedJson, JsonBodyTooLargeError } from '../dist/index.js';

test('AI admission bounds parallel work, isolates students and releases slots once', () => {
  const admission = createStudentAiAdmission();
  const first = admission.acquire('session:student', 0);
  assert.equal(first.allowed, true);
  assert.equal(admission.acquire('session:student', 0).allowed, false);
  const others = Array.from({ length: STUDENT_AI_POLICY.concurrency - 1 }, (_, i) =>
    admission.acquire(`session:${i}`, 0),
  );
  assert.ok(others.every((slot) => slot.allowed));
  assert.equal(admission.acquire('session:overflow', 0).allowed, false);
  first.release();
  const replacement = admission.acquire('session:student', 0);
  assert.equal(replacement.allowed, true);
  first.release();
  assert.equal(
    admission.acquire('session:student', 0).allowed,
    false,
    'old release cannot free a new request',
  );
  replacement.release();
  for (const slot of others) slot.release();
  assert.equal(admission.acquire('session:overflow', 0).allowed, true);
});

test('AI rate cap survives completed calls and resets after the window', () => {
  const admission = createStudentAiAdmission();
  for (let i = 0; i < STUDENT_AI_POLICY.requestsPerMinute; i++) {
    const slot = admission.acquire('session:student', 10);
    assert.equal(slot.allowed, true);
    slot.release();
  }
  assert.deepEqual(admission.acquire('session:student', 10), {
    allowed: false,
    retryAfterSeconds: 60,
  });
  assert.equal(admission.acquire('session:another', 10).allowed, true);
  assert.equal(admission.acquire('session:student', 60_010).allowed, true);
});

test('bounded JSON counts UTF-8 bytes and handles multibyte boundaries', async () => {
  const bytes = Buffer.from(JSON.stringify({ question: 'كيف يتكاثف الماء؟' }));
  async function* source() {
    for (const byte of bytes) yield Uint8Array.of(byte);
  }
  assert.deepEqual(await readBoundedJson(source(), bytes.length), {
    question: 'كيف يتكاثف الماء؟',
  });
  await assert.rejects(readBoundedJson(source(), bytes.length - 1), JsonBodyTooLargeError);
});

test('bounded JSON stops consuming oversized input and rejects malformed JSON', async () => {
  let read = 0;
  async function* large() {
    read++;
    yield Buffer.alloc(100);
    read++;
    yield Buffer.alloc(100);
  }
  await assert.rejects(readBoundedJson(large(), 50), JsonBodyTooLargeError);
  assert.equal(read, 1);
  async function* invalid() {
    yield Buffer.from('{');
  }
  await assert.rejects(readBoundedJson(invalid(), 100), SyntaxError);
});
