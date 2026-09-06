import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { app, safeStorage } from 'electron';

/**
 * خزنة مفاتيح المزوّدين — SEC-005.
 *
 * ثلاث قواعد يفرضها هذا الملف، وكلٌّ منها يمنع تسريباً مختلفاً:
 *
 * ١. **لا مفتاح في SQLite.** جدول `ai_providers` بلا عمود للمفتاح أصلاً
 *    (قرار مخطَّط منذ P1-1)، والمفتاح يعيش هنا مشفَّراً بـ `safeStorage`
 *    الذي يستعمل خزنة نظام التشغيل.
 *
 * ٢. **خارج مجلد البيانات عمداً.** الملف في `userData` لا في مجلد المعلم:
 *    النسخة الاحتياطية تنسخ القاعدة ومجلد `files` بالاسم، فالمفتاح لا يدخلها
 *    **بحكم البنية لا بقاعدة يتذكّرها أحد** — وهو ما يشترطه §16 (الفرق D-4).
 *    والمعلم الذي يزامن مجلد بياناته مع خدمة سحابية لا يرفع مفتاحه معها.
 *
 * ٣. **لا تخزين بلا تشفير.** إن لم تكن خزنة النظام متاحة يُرفض الحفظ ويُقال
 *    السبب — بديلُه كتابة المفتاح نصّاً، وهو بالضبط ما تمنعه SEC-005.
 */

const FILE = 'secrets.json';
const VERSION = 1;

type Vault = {
  readonly version: number;
  /** المزوّد ⇦ المفتاح مشفَّراً بترميز base64. */
  readonly keys: Record<string, string>;
};

const EMPTY: Vault = { version: VERSION, keys: {} };

function vaultPath(): string {
  return join(app.getPath('userData'), FILE);
}

async function readVault(): Promise<Vault> {
  try {
    const raw = await readFile(vaultPath(), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as Vault).version !== VERSION ||
      typeof (parsed as Vault).keys !== 'object'
    ) {
      return EMPTY;
    }
    return { version: VERSION, keys: { ...(parsed as Vault).keys } };
  } catch {
    // غياب الملف حالة طبيعية: معلم لم يربط مزوّداً بعد.
    return EMPTY;
  }
}

async function writeVault(vault: Vault): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true });
  await writeFile(vaultPath(), `${JSON.stringify(vault, null, 2)}\n`, 'utf8');
}

export function encryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export const NO_ENCRYPTION_MESSAGE =
  'لا نستطيع حفظ مفتاحك بأمان على هذا الجهاز، ولن نحفظه بصيغة مقروءة. ' +
  'شغّل خزنة كلمات المرور في نظامك ثم أعد المحاولة.';

/**
 * يحفظ مفتاحاً — أو يرفض.
 * لا مسار ثالث يكتب المفتاح نصّاً مهما كانت الظروف.
 */
export async function saveKey(provider: string, key: string): Promise<boolean> {
  if (!encryptionAvailable()) return false;

  const vault = await readVault();
  await writeVault({
    version: VERSION,
    keys: { ...vault.keys, [provider]: safeStorage.encryptString(key).toString('base64') },
  });
  return true;
}

/**
 * يفكّ تشفير المفتاح للاستعمال اللحظي — لا يُخزَّن الناتج ولا يُسجَّل.
 * يُنادى عند بناء الطلب إلى المزوّد وحده (P4-2 وما بعدها).
 */
export async function readKey(provider: string): Promise<string | null> {
  if (!encryptionAvailable()) return null;

  const vault = await readVault();
  const stored = vault.keys[provider];
  if (stored === undefined) return null;

  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'));
  } catch {
    // مفتاح شُفِّر على جهاز آخر أو بحساب آخر: لا يُفكّ، ويُعامَل كغير موجود.
    return null;
  }
}

export async function hasKey(provider: string): Promise<boolean> {
  const vault = await readVault();
  return vault.keys[provider] !== undefined;
}

export async function deleteKey(provider: string): Promise<void> {
  const vault = await readVault();
  const keys = { ...vault.keys };
  delete keys[provider];
  await writeVault({ version: VERSION, keys });
}

/** المزوّدون الذين لهم مفتاح محفوظ — بلا كشف أي مفتاح. */
export async function providersWithKey(): Promise<string[]> {
  return Object.keys((await readVault()).keys);
}
