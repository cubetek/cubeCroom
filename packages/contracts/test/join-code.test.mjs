import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  JOIN_CODE_DIGITS,
  formatJoinCode,
  normalizeJoinCode,
  sameJoinCode,
} from '../dist/index.js';

/*
 * رمز الحصة — §22.
 *
 * ما يُفحص هنا ليس الصياغة بل الحدّ بين شيئين: **ما يُتساهل فيه** (كيف كتب
 * الطالب الرمز) و**ما لا يُتساهل فيه** (أن يكون الرمز هو هو). خلطُ الاثنين
 * إمّا يعاقب طفلاً على شرطة، وإمّا يفتح الباب لرمز ناقص.
 */

test('التنظيف يتساهل في الصياغة: أرقام عربية وفراغات وشرطات', () => {
  assert.equal(normalizeJoinCode('٤٨٢٩١٧'), '482917');
  assert.equal(normalizeJoinCode('482 917'), '482917');
  assert.equal(normalizeJoinCode('٤٨٢-٩١٧'), '482917');
  assert.equal(normalizeJoinCode('  482917  '), '482917');
});

test('ولا يتساهل في القيمة: رمز ناقص خانةً ليس بدايةَ رمز صحيح', () => {
  assert.equal(sameJoinCode('48291', '482917'), false);
  assert.equal(sameJoinCode('4829170', '482917'), false);
  assert.equal(sameJoinCode('482918', '482917'), false);
  assert.equal(sameJoinCode('', '482917'), false);
});

test('الصياغات المتساهَل فيها تُقبل فعلاً — لا تُنظَّف ثم تُرفض', () => {
  for (const written of ['482917', '٤٨٢٩١٧', '482 917', '٤٨٢-٩١٧', ' 482917 ']) {
    assert.equal(sameJoinCode(written, '482917'), true, written);
  }
});

test('العرض يفصل الخانات ليُقرأ عن بُعد', () => {
  assert.equal(formatJoinCode('482917'), '482 917');
  assert.equal(formatJoinCode('٤٨٢٩١٧'), '482 917');
});

test('وما ليس رمزاً يُعرض كما هو بلا فصلٍ يُوهم أنه رمز', () => {
  assert.equal(formatJoinCode('48'), '48');
  assert.equal(formatJoinCode(''), '');
});

test('حروفٌ لا أرقام: لا شيء يبقى بعد التنظيف فلا شيء يُطابق', () => {
  assert.equal(normalizeJoinCode('abc'), '');
  assert.equal(sameJoinCode('abc', '482917'), false);
});

test('الطول ستّ خانات — والاختبارات أعلاه مبنيّة عليه', () => {
  assert.equal(JOIN_CODE_DIGITS, 6);
});
