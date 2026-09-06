import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SETTING_KEYS, SETTING_VALUES, validate, writeSettingSchema } from '../dist/index.js';

/**
 * كتابة الإعدادات هي أول مدخل من الواجهة يصل إلى القاعدة بقيمة حرّة.
 * الحارس هنا لا في المعالِج: «كل input غير موثوق يمر validation».
 */

describe('عقد كتابة إعداد', () => {
  test('المفتاح المجهول يُرفض', () => {
    const result = validate(writeSettingSchema, { key: 'enableEverything', value: 'true' });
    assert.equal(result.ok, false);
  });

  test('القيمة خارج المسموح تُرفض على حقلها', () => {
    const result = validate(writeSettingSchema, { key: 'keepLocalCrashLog', value: 'yes' });
    assert.equal(result.ok, false);
    assert.equal(result.error.field, 'value');
    assert.match(result.error.message, /قيمة غير مقبولة/);
  });

  test('لغة غير العربية تُرفض — قرار D1', () => {
    assert.equal(validate(writeSettingSchema, { key: 'language', value: 'en' }).ok, false);
    assert.equal(validate(writeSettingSchema, { key: 'language', value: 'ar' }).ok, true);
  });

  test('كل مفتاح معدود له قيم معدودة وقيمها تُقبل', () => {
    for (const key of SETTING_KEYS) {
      const values = SETTING_VALUES[key];
      assert.ok(values !== undefined && values.length > 0, `بلا قيم: ${key}`);
      for (const value of values) {
        assert.equal(validate(writeSettingSchema, { key, value }).ok, true, `${key}=${value}`);
      }
    }
  });

  test('المدخل الناقص أو غير الكائن يُرفض بلا انهيار', () => {
    for (const input of [null, undefined, 'true', 42, {}, { key: 'language' }]) {
      assert.equal(validate(writeSettingSchema, input).ok, false);
    }
  });
});
