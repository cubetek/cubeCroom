import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import {
  createRateLimiter,
  findAvailablePort,
  isPortAvailable,
  primeFirewallPrompt,
  isInsideDirectory,
  PathOutsideError,
  isOnline,
  looksLikeSecret,
  maskKey,
  redactSecrets,
  normalizeArabic,
  PRESENCE_WINDOW_MS,
  pickLanAddress,
  similarNames,
  studentAiAllowed,
  STUDENT_AI_NOTICE,
  PortUnavailableError,
} from '../dist/index.js';

/**
 * معيار إنجاز P2-1: اختيار عنوان LAN ومنفذ متاح.
 *
 * اختيار العنوان دالة صافية عمداً: بطاقات جهاز المطوّر ليست بطاقات جهاز
 * المعلم في المدرسة، ولا يصحّ أن يكون الفحص الوحيد «جرّبه على جهازك».
 */

const wifi = (address) => [{ address, family: 'IPv4', internal: false }];

describe('اختيار عنوان الشبكة', () => {
  test('يفضّل البطاقة اللاسلكية على السلكية', () => {
    const chosen = pickLanAddress({
      'Ethernet': wifi('192.168.1.9'),
      'Wi-Fi': wifi('192.168.1.24'),
    });

    assert.deepEqual(chosen, { address: '192.168.1.24', adapter: 'Wi-Fi' });
  });

  test('يتجاهل المحوّلات الوهمية — وهي أكثر ما يخدع على جهاز مطوّر', () => {
    const chosen = pickLanAddress({
      'vEthernet (WSL)': wifi('172.20.16.1'),
      'VirtualBox Host-Only Network': wifi('192.168.56.1'),
      'Docker Desktop': wifi('10.9.9.1'),
      'Wi-Fi': wifi('192.168.1.24'),
    });

    assert.equal(chosen.address, '192.168.1.24');
  });

  test('يتجاهل الداخلي و IPv6 و 169.254', () => {
    assert.equal(
      pickLanAddress({
        'Loopback Pseudo-Interface 1': [
          { address: '127.0.0.1', family: 'IPv4', internal: true },
        ],
        'Wi-Fi': [
          { address: 'fe80::1', family: 'IPv6', internal: false },
          // عنوان يمنحه النظام لنفسه حين يفشل DHCP — «لا شبكة» متنكّرة.
          { address: '169.254.31.7', family: 'IPv4', internal: false },
        ],
      }),
      null,
    );
  });

  test('لا بطاقة صالحة ⇦ null، وهي حالة T09NoLan', () => {
    assert.equal(pickLanAddress({}), null);
    assert.equal(pickLanAddress({ 'Wi-Fi': undefined }), null);
  });

  test('يقبل family رقمياً كما تعيده بعض إصدارات Node', () => {
    const chosen = pickLanAddress({ 'Wi-Fi': [{ address: '10.0.0.5', family: 4, internal: false }] });
    assert.equal(chosen.address, '10.0.0.5');
  });

  test('العنوان العام يأتي بعد الخاص لا قبله', () => {
    const chosen = pickLanAddress({
      'Ethernet 2': wifi('93.184.216.34'),
      'Ethernet': wifi('10.0.0.7'),
    });

    assert.equal(chosen.address, '10.0.0.7');
  });
});

describe('اختيار المنفذ', () => {
  const occupy = (port) =>
    new Promise((resolve, reject) => {
      const server = createServer();
      server.once('error', reject);
      server.listen({ port, host: '0.0.0.0', exclusive: true }, () => resolve(server));
    });

  const close = (server) => new Promise((resolve) => server.close(resolve));

  test('المنفذ المشغول يُكتشف ولا يُعاد', async () => {
    const base = 47310;
    const held = await occupy(base);
    try {
      assert.equal(await isPortAvailable(base), false);
      assert.equal(await findAvailablePort(base), base + 1);
    } finally {
      await close(held);
    }
  });

  test('المنفذ الحر يُعاد كما هو — الرابط يبقى ثابتاً بين الحصص', async () => {
    const base = 47330;
    assert.equal(await findAvailablePort(base), base);
  });

  test('امتلاء المدى كله ⇦ خطأ يصف الإجراء لا الرقم', async () => {
    const base = 47350;
    const held = [];
    try {
      for (let port = base; port <= base + 10; port += 1) held.push(await occupy(port));

      await assert.rejects(() => findAvailablePort(base), (error) => {
        assert.ok(error instanceof PortUnavailableError);
        assert.equal(error.code, 'port_unavailable');
        assert.match(error.message, /تعذّر فتح باب الدخول/);
        assert.doesNotMatch(error.message, /\d/, 'لا أرقام منافذ في نصّ المعلم');
        return true;
      });
    } finally {
      for (const server of held) await close(server);
    }
  });
});

describe('تشابه الأسماء العربية — تنبيه T10', () => {
  test('الهمزات والتاء المربوطة والألف المقصورة لا تصنع اسمين', () => {
    assert.equal(similarNames('أحمد', 'احمد'), true);
    assert.equal(similarNames('هدى', 'هدي'), true);
    assert.equal(similarNames('فاطمة', 'فاطمه'), true);
  });

  test('المسافة داخل الاسم المركّب لا تصنع اسمين', () => {
    assert.equal(similarNames('عبد الرحمن ماجد', 'عبدالرحمن ماجد'), true);
  });

  test('التشكيل والتطويل يُهملان في المقارنة لا في العرض', () => {
    assert.equal(similarNames('مُحَمَّد', 'محمد'), true);
    assert.equal(similarNames('محـمـد', 'محمد'), true);
    assert.equal(normalizeArabic('مُحَمَّد'), 'محمد');
  });

  test('اسمان مختلفان يبقيان مختلفين — التنبيه لا يُطلق بلا سبب', () => {
    assert.equal(similarNames('ريم', 'رنا'), false);
    assert.equal(similarNames('محمد علي', 'محمد سعيد'), false);
    assert.equal(similarNames('', 'محمد'), false);
  });
});

describe('«متصل الآن» — FR-007', () => {
  test('نبضة حديثة تعني حاضراً', () => {
    const now = new Date('2026-09-04T10:00:00Z');
    assert.equal(isOnline(new Date(now.getTime() - 3000), now), true);
    assert.equal(isOnline(new Date(now.getTime() - PRESENCE_WINDOW_MS), now), true);
  });

  test('تجاوز النافذة يعني خارج الشبكة — لا اتصال يُدَّعى بعد انقطاعه', () => {
    const now = new Date('2026-09-04T10:00:00Z');
    assert.equal(isOnline(new Date(now.getTime() - PRESENCE_WINDOW_MS - 1), now), false);
    assert.equal(isOnline(new Date(now.getTime() - 600_000), now), false);
  });

  test('من لم ينبض قط ليس متصلاً — «مقبول» شيء و«حاضر» شيء آخر', () => {
    assert.equal(isOnline(null), false);
    assert.equal(isOnline(undefined), false);
  });

  test('ساعة تقدّمت على الخادم لا تُخرج الطالب', () => {
    const now = new Date('2026-09-04T10:00:00Z');
    assert.equal(isOnline(new Date(now.getTime() + 5000), now), true);
  });
});

describe('حدّ معدّل الطلبات — SEC-008', () => {
  test('السعة تمرّ ثم يُرفض ما بعدها', () => {
    const limiter = createRateLimiter({ capacity: 3, windowMs: 60_000 });
    const now = 1_000_000;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      assert.equal(limiter.check('192.168.1.24', now).allowed, true, `المحاولة ${attempt + 1}`);
    }

    const blocked = limiter.check('192.168.1.24', now);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSeconds > 0, 'يقول للطالب متى يعيد المحاولة');
  });

  test('جهاز لا يخنق زميله — الحدّ لكل عنوان', () => {
    const limiter = createRateLimiter({ capacity: 1, windowMs: 60_000 });
    const now = 1_000_000;

    assert.equal(limiter.check('192.168.1.24', now).allowed, true);
    assert.equal(limiter.check('192.168.1.24', now).allowed, false);
    // زميله على الشبكة نفسها لا يتأثر — مقياس NFR-003 ثلاثون طالباً معاً.
    assert.equal(limiter.check('192.168.1.25', now).allowed, true);
  });

  test('انقضاء النافذة يفتح الباب من جديد', () => {
    const limiter = createRateLimiter({ capacity: 1, windowMs: 60_000 });
    const now = 1_000_000;

    assert.equal(limiter.check('192.168.1.24', now).allowed, true);
    assert.equal(limiter.check('192.168.1.24', now + 59_000).allowed, false);
    assert.equal(limiter.check('192.168.1.24', now + 60_001).allowed, true);
  });
});

describe('حماية المفاتيح — SEC-005', () => {
  // Synthetic provider-shaped input; never use a credential in redaction tests.
  const key = `sk-proj-${'testfixture'.repeat(4)}`;

  test('التقنيع يُبقي الطرفين ويحجب ما بينهما', () => {
    const masked = maskKey(key);
    assert.match(masked, /^sk-…/);
    assert.ok(masked.endsWith(key.slice(-4)));
    assert.ok(masked.length < 12, 'لا يكفي لإعادة تركيب المفتاح');
    assert.ok(!masked.includes(key.slice(3, -4)), 'الوسط محجوب');
  });

  test('المفتاح القصير يُحجب كاملاً — لا طرفان يكشفان نصفه', () => {
    assert.equal(maskKey('abc123'), '••••••');
    assert.equal(maskKey(''), '');
  });

  test('يتعرّف على صيغ المزوّدين الثلاثة', () => {
    assert.equal(looksLikeSecret(key), true);
    assert.equal(looksLikeSecret('AIzaSyD-1234567890abcdefghijklmnopqrst'), true);
    assert.equal(looksLikeSecret('sk-ant-api03-abcdefghijklmnopqrstuvwxyz'), true);
  });

  test('لا يحجب كلاماً عادياً ولا معرّفات قصيرة', () => {
    assert.equal(looksLikeSecret('الصف السادس'), false);
    assert.equal(looksLikeSecret('lesson-42'), false);
    assert.equal(looksLikeSecret('connected'), false);
  });

  test('التنقية تمسح المفتاح من نصّ التشخيص وتُبقي ما حوله', () => {
    const line = `POST /v1/chat authorization=${key} status=200`;
    const clean = redactSecrets(line);

    assert.ok(!clean.includes(key), 'المفتاح لم يعد في النصّ');
    assert.ok(clean.includes('POST /v1/chat'), 'بقية السطر مفهومة');
    assert.ok(clean.includes('status=200'));
  });
});

describe('بوّابة مساعدة الطالب — §23 · D10', () => {
  test('الثلاثة مفتوحة ⇦ مسموح', () => {
    assert.equal(
      studentAiAllowed({ context: 'activity', master: true, classEnabled: true, activityEnabled: true }),
      true,
    );
  });

  test('أي مفتاح مطفأ يمنع — ولو كان الباقي مفتوحاً', () => {
    const activity = { context: 'activity' };
    assert.equal(studentAiAllowed({ ...activity, master: false, classEnabled: true, activityEnabled: true }), false);
    assert.equal(studentAiAllowed({ ...activity, master: true, classEnabled: false, activityEnabled: true }), false);
    assert.equal(studentAiAllowed({ ...activity, master: true, classEnabled: true, activityEnabled: false }), false);
  });

  test('سياق الدرس يحكمه القاطعان الأولان — لا مفتاح نشاط فيه', () => {
    assert.equal(studentAiAllowed({ context: 'lesson', master: true, classEnabled: true }), true);
    assert.equal(studentAiAllowed({ context: 'lesson', master: false, classEnabled: true }), false);
  });

  /*
   * **العطل الذي أُغلق:** كان `activityEnabled` حقلاً اختيارياً، و`undefined`
   * تمرّ. فمن يبني سطح مساعدةٍ داخل نشاط وينسى تمرير المفتاح كان يحصل على
   * سماحٍ صامت — عكس ما وُضع له `D10`.
   *
   * والحارس الآن في النوع لا في الانتباه: سياق النشاط بلا مفتاحه **لا يُترجم**.
   * ولذلك يُفحص هنا بتأكيد نوعيّ لا بنداء وقت تشغيل — الخطأ لم يعد ممكناً
   * أصلاً ليُختبر.
   */
  test('وسياق النشاط بلا مفتاحه يُمنع — لا يُسمح صامتاً', () => {
    // النوع يمنع هذا وقت الترجمة؛ وهذا يثبت أنه ممنوع وقت التشغيل أيضاً —
    // فبناءٌ قديم أو نداءٌ من JavaScript لا يلتفّ على البوّابة.
    assert.equal(studentAiAllowed({ context: 'activity', master: true, classEnabled: true }), false);
  });

  test('التنويه ثابت ويذكر المعلم والاختبارات — US-S09', () => {
    assert.match(STUDENT_AI_NOTICE, /راجِعها مع معلمك/);
    assert.match(STUDENT_AI_NOTICE, /الاختبارات/);
  });
});

describe('استدعاء سؤال جدار الحماية — §22', () => {
  /**
   * الغرض ليس فحص الجدار — بل أن يسأل النظام سؤاله في لحظة هادئة عند أول
   * تشغيل، لا أول مرة يشغّل فيها المعلم حصةً وأمامه صفٌّ ينتظر.
   */
  test('يستمع لحظةً على الشبكة ثم يُغلق — ولا يترك منفذاً مفتوحاً', async () => {
    const port = await findAvailablePort(45210);
    const result = await primeFirewallPrompt(port);

    assert.equal(result.status, 'primed');
    assert.equal(result.port, port);
    assert.equal(
      await isPortAvailable(port),
      true,
      'الفتحة أُغلقت: منفذٌ يبقى مفتوحاً بلا خادم سطحُ هجوم بلا فائدة',
    );
  });

  test('المنفذ المشغول ليس منعاً — يُقال «مشغول» لا «فشل»', async () => {
    const port = await findAvailablePort(45230);
    const holder = createServer();
    await new Promise((resolve) => holder.listen({ port, host: '0.0.0.0' }, resolve));

    try {
      const result = await primeFirewallPrompt(port);
      assert.equal(result.status, 'busy');
    } finally {
      await new Promise((resolve) => holder.close(resolve));
    }
  });

  test('لا يرمي أبداً — أول تشغيل لا يتوقّف على سؤالٍ يسأله النظام أصلاً', async () => {
    // منفذ محجوز للنظام (٠) لا يصلح، والعنوان غير موجود على الجهاز:
    const result = await primeFirewallPrompt(45250, '203.0.113.1');
    assert.equal(result.status, 'failed');
    assert.equal(typeof result.reason, 'string');
  });
});

describe('حصر المسارات — SEC-004', () => {
  const root = join(tmpdir(), 'cubecroom-guard', 'Backups');

  test('المسار داخل المجلد يُقبل', () => {
    assert.equal(isInsideDirectory(root, join(root, '2026-09-04-0715')), true);
    assert.equal(isInsideDirectory(root, join(root, 'a', 'b')), true);
  });

  /** `Backups/../..` نصٌّ يبدأ بالمجلد المسموح ويقع خارجه. */
  test('الصعود بـ .. يُرفض مهما بدت البداية سليمة', () => {
    assert.equal(isInsideDirectory(root, join(root, '..')), false);
    assert.equal(isInsideDirectory(root, join(root, '..', '..')), false);
    assert.equal(isInsideDirectory(root, join(root, 'x', '..', '..', '..')), false);
  });

  /** `Backups-2` يبدأ بـ`Backups` حرفياً وليس داخله — ولهذا لا تُقارَن البادئة. */
  test('المجلد المجاور ذو البادئة نفسها يُرفض', () => {
    assert.equal(isInsideDirectory(root, `${root}-2`), false);
    assert.equal(isInsideDirectory(root, `${root}evil`), false);
  });

  test('المجلد نفسه ليس داخل نفسه — لا يُحذف الجذر', () => {
    assert.equal(isInsideDirectory(root, root), false);
    assert.equal(isInsideDirectory(root, `${root}${sep}`), false);
  });

  test('مسار مطلق في مكان آخر يُرفض', () => {
    assert.equal(isInsideDirectory(root, join(tmpdir(), 'elsewhere')), false);
  });

  test('رسالة الرفض لا تحمل المسار — الرسائل تُسجَّل وقد تُنقل', () => {
    const error = new PathOutsideError('النسخ الاحتياطية');
    assert.equal(error.message.includes(root), false);
    assert.match(error.message, /خارج مجلد النسخ الاحتياطية/);
  });
});

/*
 * البوّابة الثالثة — سطحُها بُني، فصار لها ما تحرسه.
 *
 * وكان المفتاح في `T16` يُخزَّن ويُعرض ولا يحرس شيئاً: كلا الاستدعاءين
 * الحيّين يُغفلانه. فيُثبَّت هنا أن سياق النشاط يحكمه مفتاحه، وأن فتح
 * القاطعين الأولين لا يكفي.
 */
describe('البوّابة الثالثة بعد أن صار لها سطح', () => {
  const open = { master: true, classEnabled: true };

  test('نشاطٌ مطفأ يُمنع ولو كان القاطعان مفتوحين', () => {
    assert.equal(
      studentAiAllowed({ context: 'activity', ...open, activityEnabled: false }),
      false,
    );
  });

  test('ونشاطٌ مفتوح يُسمح حين يُفتح ما فوقه', () => {
    assert.equal(
      studentAiAllowed({ context: 'activity', ...open, activityEnabled: true }),
      true,
    );
  });

  test('وسياق الدرس لا يتأثر بمفتاح نشاطٍ لا يخصّه', () => {
    assert.equal(studentAiAllowed({ context: 'lesson', ...open }), true);
  });
});
