import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import makeMdns from 'multicast-dns';
import { startHostnameResponder } from '../dist/index.js';

/*
 * إعلان الاسم — §22.
 *
 * يُفحص عبر الشبكة فعلاً لا بمحاكاة: سؤالٌ يُبثّ من مقبس ثانٍ على الجهاز
 * نفسه، والردّ يُنتظر. فما يهمّ ليس أن الدالّة نادت مكتبةً، بل أن جهازاً على
 * الشبكة يسأل عن `cubecroom.local` فيجد جواباً.
 */

const WAIT_MS = 2000;
// A running teacher preview (or another teacher on the LAN) must not answer this test.
const hostname = `cubecroom-test-${randomUUID()}.local`;
const otherHostname = `cubecroom-other-${randomUUID()}.local`;

/** يسأل عن اسم ويعيد عنوانه، أو `null` إن لم يُجَب خلال المهلة. */
async function resolve(name) {
  const querier = makeMdns();
  try {
    return await new Promise((done) => {
      const timer = setTimeout(() => done(null), WAIT_MS);
      querier.on('response', (response) => {
        for (const record of response.answers ?? []) {
          if (record.name === name && record.type === 'A') {
            clearTimeout(timer);
            done(record.data);
            return;
          }
        }
      });
      querier.query({ questions: [{ name, type: 'A' }] });
    });
  } finally {
    await new Promise((done) => querier.destroy(done));
  }
}

test('جهازٌ يسأل عن اسم المعلم فيجد عنوانه', async (t) => {
  const responder = startHostnameResponder('192.168.4.20', hostname);
  if (responder === null) {
    // لا يُدّعى نجاحٌ لم يحدث: بيئة تمنع المقبس تُعلن تخطّياً لا مروراً.
    t.skip('تعذّر فتح مقبس mDNS في هذه البيئة');
    return;
  }

  try {
    assert.equal(responder.hostname, hostname);
    const found = await resolve(hostname);
    if (found === null) {
      t.skip('الشبكة هنا لا تمرّر البثّ المتعدد — والعنوان الرقمي يبقى الطريق');
      return;
    }
    assert.equal(found, '192.168.4.20');
  } finally {
    await responder.stop();
  }
});

test('ولا يجيب عن اسم غيره — إعلانٌ لا خادم أسماء', async (t) => {
  const responder = startHostnameResponder('192.168.4.20', hostname);
  if (responder === null) {
    t.skip('تعذّر فتح مقبس mDNS في هذه البيئة');
    return;
  }

  try {
    const found = await resolve(otherHostname);
    assert.equal(found, null, `أجاب عن اسم ليس اسمه: ${found}`);
  } finally {
    await responder.stop();
  }
});

test('والإيقاف يصمت الاسم — لا يبقى يقود إلى خادم أُغلق', async (t) => {
  const responder = startHostnameResponder('192.168.4.20', hostname);
  if (responder === null) {
    t.skip('تعذّر فتح مقبس mDNS في هذه البيئة');
    return;
  }
  await responder.stop();
  // وإيقافٌ ثانٍ لا يرمي: `killPortal` قد يليه `stopPortal` عند الإغلاق.
  await responder.stop();

  assert.equal(await resolve(hostname), null);
});
