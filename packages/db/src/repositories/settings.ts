import { eq } from 'drizzle-orm';
import { SETTING_KEYS, type SettingKey } from '@cubecroom/contracts';
import type { Db } from '../open.js';
import { settings } from '../schema.js';
import { now } from '../ids.js';

/**
 * إعدادات T22 — مفتاح/قيمة، فلا يفرض كل إعداد جديد ترحيلاً.
 *
 * المفاتيح تأتي من `@cubecroom/contracts`: الواجهة تسمّيها عبر IPC، فهي
 * مفردة مشتركة لا تفصيلة تخزين. والقيم الافتراضية تبقى هنا لأنها سلوك
 * تخزين — ما يُقرأ قبل أن يُكتب شيء.
 */
export { SETTING_KEYS };
export type { SettingKey };

/** العربية اللغة الوحيدة — قرار D1. المفتاح موجود ليمهّد للتوسّع بلا كلفة الآن. */
export const SETTING_DEFAULTS: Readonly<Record<SettingKey, string>> = {
  language: 'ar',
  openLastClassOnStart: 'true',
  launchOnSystemStart: 'false',
  checkUpdatesAutomatically: 'true',
  updateChannel: 'stable',
  keepLocalCrashLog: 'true',
  studentAiMasterEnabled: 'false',
  activeAiProvider: '',
};

export function settingsRepository(db: Db) {
  const read = (key: SettingKey): string => {
    const row = db.select().from(settings).where(eq(settings.key, key)).get();
    return row?.value ?? SETTING_DEFAULTS[key];
  };

  return {
    get(key: SettingKey): string {
      return read(key);
    },

    getBoolean(key: SettingKey): boolean {
      return read(key) === 'true';
    },

    /** كل الإعدادات مع افتراضاتها — لا يعيد صفوفاً ناقصة على شاشة T22. */
    all(): Record<SettingKey, string> {
      const stored = new Map(db.select().from(settings).all().map((r) => [r.key, r.value]));
      const result = {} as Record<SettingKey, string>;
      for (const key of SETTING_KEYS) result[key] = stored.get(key) ?? SETTING_DEFAULTS[key];
      return result;
    },

    set(key: SettingKey, value: string): void {
      db.insert(settings)
        .values({ key, value, updatedAt: now() })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now() } })
        .run();
    },
  };
}
