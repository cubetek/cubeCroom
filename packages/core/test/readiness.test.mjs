import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import {
  awaitHttpReady,
  median,
  READY_BUDGET_MS,
  READY_POLL_MS,
  READY_TIMEOUT_MS,
} from '../dist/index.js';

/*
 * الجاهزية — تعريفٌ واحد يستعمله الإنتاج وأدوات الفحص معاً.
 *
 * ولذلك يُفحص بخادم حقيقي لا بمحاكاة: ما يهمّ ليس أن الدالّة نادت `fetch`،
 * بل أنها **تعرف الفرق** بين خادم يردّ وخادم يردّ خطأً وخادم لا وجود له.
 */

async function listen(handler) {
  const server = createServer(handler);
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address();
  return { port, close: () => new Promise((done) => server.close(done)) };
}

test('خادمٌ يردّ ٢٠٠ ⇦ جاهز، والزمن يُعاد', async () => {
  const server = await listen((_, res) => res.end('ok'));
  try {
    const ms = await awaitHttpReady(`http://127.0.0.1:${server.port}/`);
    assert.notEqual(ms, null);
    assert.ok(ms < READY_TIMEOUT_MS, `استغرق ${ms}ms`);
  } finally {
    await server.close();
  }
});

test('وخادمٌ يردّ ٥٠٠ ليس جاهزاً — الردّ وحده لا يكفي', async () => {
  const server = await listen((_, res) => {
    res.statusCode = 500;
    res.end('boom');
  });
  try {
    const ms = await awaitHttpReady(`http://127.0.0.1:${server.port}/`, { timeoutMs: 400 });
    assert.equal(ms, null);
  } finally {
    await server.close();
  }
});

test('ومنفذٌ لا أحد عليه ⇦ null بعد المهلة لا انتظارٌ أبديّ', async () => {
  const began = Date.now();
  const ms = await awaitHttpReady('http://127.0.0.1:1/', { timeoutMs: 300 });
  assert.equal(ms, null);
  assert.ok(Date.now() - began < 3000, 'تجاوز مهلته');
});

/*
 * عمليةٌ ماتت لا تُنتظر: بلا هذا يقول الفحص «تأخّر» عن خادم سقط في أول
 * ثانية — وهما عطلان مختلفان وإصلاحان مختلفان.
 */
test('وموتُ العملية يقطع الانتظار فوراً لا عند المهلة', async () => {
  const began = Date.now();
  const ms = await awaitHttpReady('http://127.0.0.1:1/', {
    timeoutMs: 10_000,
    hasExited: () => true,
  });
  assert.equal(ms, null);
  assert.ok(Date.now() - began < 500, `انتظر ${Date.now() - began}ms`);
});

test('الوسيط لا يتحرّك بعيّنة شاذّة — وهو سبب اختياره', () => {
  assert.equal(median([980, 1000, 3400]), 1000);
  assert.equal(median([1000]), 1000);
  assert.equal(median([]), 0);
  assert.equal(median([2, 4, 6, 8]), 5);
});

test('وإيقاع الاستطلاع أضيق من أن يلوّث قياساً بالثواني', () => {
  assert.ok(READY_POLL_MS <= 100, `${READY_POLL_MS}ms`);
});

/*
 * الميزانية هدفُ أداء، والمهلة حدُّ انتظار — والخلط بينهما كلّف حصّتين.
 * فيُفحص أنهما رقمان مختلفان، وأن المهلة أوسع.
 */
test('ميزانية NFR-002 أضيق من مهلة الانتظار — وليستا الرقم نفسه', () => {
  assert.equal(READY_BUDGET_MS, 3000, 'الميزانية هي ما ينصّ عليه NFR-002');
  assert.ok(READY_TIMEOUT_MS > READY_BUDGET_MS, 'المهلة تتّسع لما تجاوز الميزانية');
});
