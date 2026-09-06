import { join } from 'node:path';
import { createRepositories, openDatabase, type OpenResult, type Repositories } from '@cubecroom/db';
import { DATABASE_FILE_NAME } from '@cubecroom/core';

/**
 * وصول بوابة الطالب إلى القاعدة.
 *
 * العملية هنا مستقلة عن Electron، وتفتح **الملف نفسه** لا نسخةً منه: SQLite
 * في وضع WAL يسمح بقارئ وكاتب من عمليتين على الجهاز نفسه، وهو أبسط وأصدق من
 * جسر بين عمليتين محليتين — والبيانات واحدة لا مزامنة بينها.
 *
 * مسار المجلد يأتي في `CUBECROOM_DATA_DIR` من العملية التي أطلقت الخادم.
 * غيابه ليس عطلاً غامضاً: الخادم يُقلع (فحص الدخان يعتمد على ذلك) لكن كل
 * مسار يحتاج بيانات يردّ برسالة مفهومة بدل أن ينهار.
 */

let handle: OpenResult | null = null;
let repositories: Repositories | null = null;
let failure: string | null = null;

export function dataDirectory(): string | null {
  const value = process.env.CUBECROOM_DATA_DIR;
  return value === undefined || value === '' ? null : value;
}

/**
 * «لماذا لا توجد قاعدة؟» — سببان لا واحد، وفرقهما فرقُ رسالتين.
 *
 * **بلا مجلد** حالةٌ سليمة: الخادم يُقلع بلا بيانات في فحص الدخان.
 * **وفشلُ الفتح** عطلٌ دائم: ملفٌّ تالف، أو صلاحيةٌ ممنوعة، أو وحدةٌ أصليّة
 * مبنيّة لمُشغِّل آخر — لا يُصلحه انتظارٌ ولا إعادةُ تحميل.
 *
 * ويُعاد النصّ لا `boolean`: من يعرض العطل يحتاج أن يقوله.
 */
export function storeFailure(): string | null {
  return failure;
}

export function store(): Repositories | null {
  if (repositories !== null) return repositories;

  const directory = dataDirectory();
  if (directory === null) return null;

  try {
    handle = openDatabase({ file: join(directory, DATABASE_FILE_NAME) });
    repositories = createRepositories(handle);
    failure = null;
    return repositories;
  } catch (error) {
    /*
     * **كان هذا `catch` صامتاً — فكذبت الصفحة على الطالب.**
     *
     * `better-sqlite3` وحدةٌ أصليّة مربوطة بـABI المُشغِّل. حين اختلف ABI فشل
     * الفتح، فعادت `null`، فقرأتها `/join` «لا حصة مفتوحة» وقالت للطالب «لم
     * يفتح معلمك الدخول بعد» — وهو يفتحه فعلاً. فينتظر ويعيد التحميل بلا نهاية.
     *
     * ولم يكشفه فحصٌ واحد: الخادم يُقلع، ويردّ ٢٠٠، ويعرض صفحةً سليمة الشكل.
     * فالعطل الصامت هنا ليس نقصَ سجلّ — هو **رسالةٌ خاطئة تُعرض بثقة**.
     */
    failure = error instanceof Error ? error.message : String(error);
    console.error(`[cubecroom] تعذّر فتح القاعدة — كل مسار يحتاج بيانات سيردّ بعطل:
${failure}`);
    handle = null;
    repositories = null;
    return null;
  }
}
