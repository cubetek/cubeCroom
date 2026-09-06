import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJoinCode } from '../dist/index.js';
import { sameJoinCode } from '@cubecroom/contracts';

test('الرمز المولَّد ستّ خانات دائماً — بما فيها ما يبدأ بصفر', () => {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const code = createJoinCode();
    assert.match(code, /^[0-9]{6}$/, code);
  }
});

test('والرمز المولَّد يطابق نفسه عبر المقارنة التي يستعملها الخادم', () => {
  const code = createJoinCode();
  assert.equal(sameJoinCode(code, code), true);
});

/*
 * لا يُفحص هنا «عشوائيٌّ كفاية» — لا يُثبت بعيّنة. يُفحص أنه لا يخرج ثابتاً:
 * مولّدٌ يعيد الرمز نفسه في كل حصة يجعل رمز الأمس يفتح باب اليوم.
 */
test('ولا يخرج ثابتاً بين حصة وأخرى', () => {
  const seen = new Set();
  for (let attempt = 0; attempt < 200; attempt += 1) seen.add(createJoinCode());
  assert.ok(seen.size > 150, `تكرار مريب: ${seen.size} من ٢٠٠`);
});
