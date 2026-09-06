import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ago, ar, formatBytes, when } from '../dist/index.js';

/*
 * هذه الدوالّ كانت منسوخة بصياغات متباينة، والتباين كان يظهر للمستخدم.
 * فما يُفحص هنا هو **الفروق التي كانت**، لئلّا تعود.
 */

test('الأرقام تُعرض عربية — D6', () => {
  assert.equal(ar(2026), '٢٠٢٦');
  assert.equal(ar('4 من 5'), '٤ من ٥');
});

/* الفرق الذي كان: الرئيسية بلا فرع ساعات تقول «قبل ١٨٠ دقيقة». */
test('«ago» تتصاعد إلى الساعات — لا «قبل ١٨٠ دقيقة»', () => {
  const threeHours = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  assert.equal(ago(threeHours), 'قبل ٣ ساعات');
  assert.equal(ago(new Date(Date.now() - 60 * 60 * 1000).toISOString()), 'قبل ساعة');
  assert.equal(ago(new Date(Date.now() - 2 * 60 * 1000).toISOString()), 'قبل دقيقتين');
  assert.equal(ago(new Date().toISOString()), 'الآن');
});

/* الفرق الذي كان: الطالب يرى «١٥٣٦ م.ب» والمعلم «١٫٥ ج.ب» للملفّ نفسه. */
test('«formatBytes» تبلغ الجيجابايت — لا تتوقّف عند الميجا', () => {
  assert.equal(formatBytes(512), '٥١٢ بايت');
  assert.equal(formatBytes(1024 * 840), '٨٤٠ ك.ب');
  assert.equal(formatBytes(Math.round(1024 * 1024 * 1.4)), '١٫٤ م.ب');
  assert.equal(formatBytes(1024 * 1024 * 314), '٣١٤ م.ب');
  assert.equal(formatBytes(Math.round(1024 * 1024 * 1024 * 1.5)), '١٫٥ ج.ب');
});

test('و«أمس» تُعرض — كانت تظهر في ثلاث شاشات من عشر', () => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  assert.match(when(yesterday.toISOString()), /^أمس /);
  assert.match(when(new Date().toISOString()), /^اليوم /);
});

/*
 * الأهم: ختمٌ تالف كان يُعرض `Invalid Date` في تسع نسخ من عشر — نصٌّ
 * إنكليزيّ تقنيّ وسط واجهة عربية، أمام طفل أحياناً.
 */
test('وختمٌ تالف لا يُعرض «Invalid Date»', () => {
  assert.equal(when('ليس تاريخاً'), '—');
  assert.equal(when('', { fallback: 'قبل قليل' }), 'قبل قليل');
  assert.equal(ago('ليس تاريخاً'), 'الآن');
  assert.doesNotMatch(when('x'), /Invalid|NaN/);
});

test('و«always» تُلحق الوقت بالتاريخ القديم — لتمييز ملفّين في يوم', () => {
  const old = new Date('2026-01-15T09:30:00Z').toISOString();
  assert.doesNotMatch(when(old), /:/);
  assert.match(when(old, { time: 'always' }), /\d|[٠-٩]/);
});

/*
 * قوائم الطالب تقول «اليوم» ولا تقول متى — وتوحيدُ التنفيذ لا يجوز أن يغيّر
 * ما يراه الطالب. سقط هذا في أول ترحيل، فصار له فحص.
 */
test('و«never» تُبقي اليوم بلا ساعة — كما كانت قوائم الطالب', () => {
  assert.equal(when(new Date().toISOString(), { time: 'never' }), 'اليوم');
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  assert.equal(when(yesterday.toISOString(), { time: 'never' }), 'أمس');
});
