import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildDiagnostics, diagnosticsHeadline, diagnosticsSchema, validate } from '../dist/index.js';

/**
 * معيار إنجاز P6-1: «إجراء بجانب كل مشكلة، وبلغة غير تقنية».
 *
 * والقاعدة التي تسبقه ولا تُقال في اللوح: **لا يُقال «يعمل» لما لم يُفحص.**
 * شاشة تشخيص تكذب أسوأ من غيابها — معلمٌ يقرأ «جدار الحماية يسمح» ثم لا يدخل
 * طلابه يفقد ثقته بكل سطر فيها، ويبقى بلا دليل يتّبعه وسط الحصة.
 */

const LAN = { address: '192.168.1.5', adapter: 'Wi-Fi' };
const RUNNING = { state: 'running', port: 4317, url: 'http://192.168.1.5:4317' };
const AT = new Date('2026-09-04T10:00:00.000Z');

const find = (result, id) => result.checks.find((check) => check.id === id);

describe('بناء التشخيص', () => {
  test('الناتج يطابق عقده', () => {
    const result = buildDiagnostics(
      { lan: LAN, portal: RUNNING, reachedByDevice: true, studentsOnline: 3 },
      AT,
    );
    assert.equal(validate(diagnosticsSchema, result).ok, true);
    assert.equal(result.checks.length, 4);
  });

  test('كل فحص فيه مشكلة يحمل إجراءً — صفٌّ بلا زرّ شكوى لا تشخيص', () => {
    const result = buildDiagnostics(
      { lan: null, portal: { state: 'stopped' }, reachedByDevice: false, studentsOnline: 0 },
      AT,
    );

    for (const check of result.checks) {
      if (check.state === 'problem') {
        assert.notEqual(check.action, null, `${check.id} مشكلة بلا إجراء`);
      }
    }
  });

  test('لا سطر تقنيّ في وصف يقرؤه المعلم', () => {
    const result = buildDiagnostics(
      { lan: null, portal: { state: 'stopped' }, reachedByDevice: false, studentsOnline: 0 },
      AT,
    );

    for (const check of result.checks) {
      assert.equal(/TCP|socket|bind|EADDR|0\.0\.0\.0/i.test(check.detail), false, check.detail);
    }
  });
});

describe('الشبكة', () => {
  test('بلا عنوان محلي: مشكلة بإجراء', () => {
    const result = buildDiagnostics(
      { lan: null, portal: RUNNING, reachedByDevice: false, studentsOnline: 0 },
      AT,
    );
    assert.equal(find(result, 'network').state, 'problem');
  });

  test('العنوان يُعرض باسم البطاقة لا باسم الشبكة — لا يُخترع SSID', () => {
    const result = buildDiagnostics(
      { lan: LAN, portal: RUNNING, reachedByDevice: false, studentsOnline: 0 },
      AT,
    );
    const network = find(result, 'network');
    assert.equal(network.state, 'ok');
    assert.match(network.detail, /Wi-Fi/);
    assert.match(network.detail, /192\.168\.1\.5/);
  });
});

describe('البوابة', () => {
  test('متوقّفة: مشكلة وإجراؤها تشغيل الحصة', () => {
    const result = buildDiagnostics(
      { lan: LAN, portal: { state: 'stopped' }, reachedByDevice: false, studentsOnline: 0 },
      AT,
    );
    const portal = find(result, 'portal');
    assert.equal(portal.state, 'problem');
    assert.equal(portal.action, 'start_portal');
  });

  test('شُغِّلت ولا تستجيب: مشكلة تُقال بمنفذها', () => {
    const result = buildDiagnostics(
      {
        lan: LAN,
        portal: { state: 'unreachable', port: 4317 },
        reachedByDevice: false,
        studentsOnline: 0,
      },
      AT,
    );
    assert.equal(find(result, 'portal').state, 'problem');
    assert.match(find(result, 'portal').detail, /٤٣١٧|4317/);
  });
});

describe('جدار الحماية — القاعدة الأدقّ في هذه الشاشة', () => {
  /**
   * جهازٌ لا يفحص جدار حمايته على نفسه: الاتصال بعنوانه من داخله لا يمرّ به
   * أصلاً. فالادّعاء بأنه «يسمح» بلا دليل كذبٌ يتّبعه المعلم فيضيع وقت حصته.
   */
  test('بلا وصولٍ من الشبكة لا يُقال «يعمل» ولا «مشكلة» — بل لم يُفحص', () => {
    const result = buildDiagnostics(
      { lan: LAN, portal: RUNNING, reachedByDevice: false, studentsOnline: 0 },
      AT,
    );
    const firewall = find(result, 'firewall');

    assert.equal(firewall.state, 'unknown');
    assert.notEqual(firewall.action, null, 'ومع ذلك يُعطى المعلم خطوة يمشي بها');
    assert.equal(/يسمح|يمنع/.test(firewall.detail), false, 'لا حكم بلا دليل');
  });

  test('وصولُ جهاز من الشبكة هو الدليل الوحيد المتاح — وعنده يصير «يعمل»', () => {
    const result = buildDiagnostics(
      { lan: LAN, portal: RUNNING, reachedByDevice: true, studentsOnline: 0 },
      AT,
    );
    const firewall = find(result, 'firewall');
    assert.equal(firewall.state, 'ok');
    assert.equal(firewall.action, null);
  });

  test('والبوابة متوقّفة تجعله متوقّفاً عليها لا مجهولاً', () => {
    const result = buildDiagnostics(
      { lan: LAN, portal: { state: 'stopped' }, reachedByDevice: false, studentsOnline: 0 },
      AT,
    );
    const firewall = find(result, 'firewall');
    assert.equal(firewall.state, 'blocked');
    assert.equal(firewall.action, null, 'لا يُعرض إجراء لفحص لم يحن دوره');
  });
});

describe('وصول جهاز طالب', () => {
  test('طالبٌ على الشبكة الآن: يعمل فعلاً لا نظرياً', () => {
    const result = buildDiagnostics(
      { lan: LAN, portal: RUNNING, reachedByDevice: true, studentsOnline: 3 },
      AT,
    );
    const device = find(result, 'student-device');
    assert.equal(device.state, 'ok');
    assert.match(device.detail, /٣|3/);
  });

  test('لم يصل أحد: لم يُفحص، وإجراؤه أن يجرّبه المعلم بنفسه', () => {
    const result = buildDiagnostics(
      { lan: LAN, portal: RUNNING, reachedByDevice: false, studentsOnline: 0 },
      AT,
    );
    const device = find(result, 'student-device');
    assert.equal(device.state, 'unknown');
    assert.equal(device.action, 'open_access');
  });
});

describe('الأعداد وسطر الخلاصة', () => {
  test('الأعداد الثلاثة تجمع كل الفحوص', () => {
    const result = buildDiagnostics(
      { lan: null, portal: { state: 'stopped' }, reachedByDevice: false, studentsOnline: 0 },
      AT,
    );
    assert.equal(result.ok + result.problems + result.unresolved, result.checks.length);
  });

  test('المشكلة تُذكر بعددها لا بوصف عام', () => {
    assert.equal(
      diagnosticsHeadline({ problems: 1, unresolved: 0 }),
      'وجدنا مشكلة واحدة تمنع طلابك من الدخول',
    );
    assert.equal(
      diagnosticsHeadline({ problems: 2, unresolved: 0 }),
      'وجدنا مشكلتين تمنعان طلابك من الدخول',
    );
  });

  test('بلا مشكلة وبقيَ ما لم يُفحص: لا يُقال «كل شيء يعمل»', () => {
    const headline = diagnosticsHeadline({ problems: 0, unresolved: 2 });
    assert.match(headline, /لم نجد مشكلة/);
    assert.match(headline, /لا نستطيع فحصه/);
  });

  test('وحين لا يبقى شيء: تُقال الحقيقة بحدّها — ما نستطيع فحصه', () => {
    assert.equal(diagnosticsHeadline({ problems: 0, unresolved: 0 }), 'كل ما نستطيع فحصه يعمل');
  });
});
