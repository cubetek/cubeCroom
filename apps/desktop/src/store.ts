import { app } from 'electron';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  openDatabase,
  createRepositories,
  DatabaseTooNewError,
  MigrationFailedError,
  MIGRATIONS_DIR,
  type OpenResult,
  type Repositories,
} from '@cubecroom/db';
import { createFileStore, DATABASE_FILE_NAME, type FileStore } from '@cubecroom/core';

/**
 * حالة التخزين في العملية الرئيسية.
 *
 * القاعدة تُفتح مرة واحدة ويُحتفظ بالاتصال: better-sqlite3 متزامن، وفتح
 * اتصال لكل نداء يهدر ويعطّل WAL.
 */

export type StoreState =
  | { readonly status: 'closed' }
  | {
      readonly status: 'open';
      readonly dataDirectory: string;
      readonly repositories: Repositories;
      /** نسخ المرفقات على القرص — بجانب القاعدة لا داخلها (SEC-006). */
      readonly fileStore: FileStore;
    }
  | { readonly status: 'blocked'; readonly message: string; readonly canRetry: boolean };

let handle: OpenResult | null = null;
let state: StoreState = { status: 'closed' };

export function storeState(): StoreState {
  return state;
}

export function repositories(): Repositories {
  if (state.status !== 'open') {
    throw new Error('القاعدة غير مفتوحة — لا يجوز نداء مستودع قبل الإقلاع.');
  }
  return state.repositories;
}

/**
 * الاتصال الخام — للنسخ الاحتياطي وحده (`database.backup(path)`).
 * لا يُستعمل للاستعلام: ذلك عمل المستودعات، وتجاوزُها يتخطّى قواعدها.
 */
export function databaseHandle(): OpenResult {
  if (handle === null) throw new Error('القاعدة غير مفتوحة.');
  return handle;
}

export function fileStore(): FileStore {
  if (state.status !== 'open') {
    throw new Error('مخزن الملفات غير مهيّأ — لا مجلد بيانات قبل الإقلاع.');
  }
  return state.fileStore;
}

export const DB_FILE_NAME = DATABASE_FILE_NAME;

/**
 * يفتح القاعدة في المجلد المعطى.
 *
 * الأخطاء المعروفة تُترجم إلى `blocked` برسالتها كما هي من packages/db —
 * لا يُعاد صياغتها هنا، وإلا تفرّق النصّ على طبقتين.
 */
export function openStore(dataDirectory: string): StoreState {
  closeStore();
  try {
    handle = openDatabase({ file: join(dataDirectory, DB_FILE_NAME), migrationsDir: migrations() });
    state = {
      status: 'open',
      dataDirectory,
      repositories: createRepositories(handle),
      fileStore: createFileStore(dataDirectory),
    };
  } catch (error) {
    handle = null;
    if (error instanceof DatabaseTooNewError) {
      // تحديث التطبيق هو المخرج، وإعادة المحاولة لن تغيّر شيئاً.
      state = { status: 'blocked', message: error.message, canRetry: false };
    } else if (error instanceof MigrationFailedError) {
      state = { status: 'blocked', message: error.message, canRetry: true };
    } else {
      // النصّ من لوح T01States/٣ حرفياً — بلا مسار ولا رمز خطأ ولا اسم ملف.
      state = {
        status: 'blocked',
        message: 'لم نجد مجلد بياناتك في مكانه. ربما نُقل أو أن قرصاً خارجياً غير موصول.',
        canRetry: true,
      };
    }
  }
  return state;
}

/**
 * تجهيز مجلد الملفات بعد فتح القاعدة.
 *
 * منفصل عن `openStore` لأنه غير متزامن: إنشاء المجلد ومسح بقايا النسخ
 * المنقطع عمليتا قرص، و`openStore` يجب أن يبقى متزامناً كما هو
 * better-sqlite3. الفشل هنا لا يمنع الإقلاع — المعلم يستطيع العمل بلا
 * مرفقات، وأول رفع سيعيد المحاولة ويشرح الخطأ حينها.
 */
export async function prepareFileStore(): Promise<void> {
  if (state.status !== 'open') return;
  try {
    await state.fileStore.ensureReady();
    await state.fileStore.sweepPartials();
  } catch {
    // يُتجاهل عمداً — انظر التعليق أعلاه.
  }
}

export function closeStore(): void {
  handle?.close();
  handle = null;
  state = { status: 'closed' };
}

/**
 * مجلد الترحيلات.
 *
 * بعد التغليف يُشحن عبر `extraResource` — لأن ملفات `.sql` ليست شيفرة يجرّها
 * المُجمِّع، فلا تدخل الحزمة إن لم تُشحن صراحةً. **وبلا هذا المجلد لا تُفتح
 * قاعدة على جهاز جديد أصلاً** — وهو بندٌ كان مسجَّلاً في سجلّ الدَّين منذ
 * Phase 1.
 *
 * **وفي التطوير كان `MIGRATIONS_DIR` يكذب.**
 *
 * قيمتُه في `packages/db` تُحسب من موضع ملفّه (`import.meta.url`)، وذلك صحيح
 * ما دام الملفّ في مكانه. لكن القشرة **تُقلع من الحزمة المجمَّعة لا من مخرَج
 * `tsc`** — حتى في التطوير (`dev:electron` يشغّل `bundle-desktop.mjs` ثم
 * `electron .`، و`main` هو `dist-app/main.cjs`). وesbuild يجمع `packages/db`
 * داخل تلك الحزمة ويستبدل `import.meta.url` بموضع الحزمة نفسها، فصار المسار
 * `apps/desktop/migrations` — مجلدٌ لا وجود له.
 *
 * والعطل الناتج لم يكن يقول اسمه: المعلم يختار مجلد بياناته، فيُنشأ ملف
 * القاعدة ويُضبط WAL ثم يفشل الترحيل، فيرى «تعذّر تجهيز بياناتك للفتح» ويبقى
 * في مجلده ملفُّ قاعدة فارغ بلا جدول واحد. أول تشغيل لا يكتمل على أي نظام.
 *
 * فيُسأل القرص لا الحساب: الترحيلات تُنسخ بجانب الحزمة في `bundle-desktop.mjs`،
 * وتُقدَّم على `MIGRATIONS_DIR` — الذي يبقى للمخرَج غير المجمَّع (فحص الدخان
 * والاختبارات) حيث يكون صادقاً.
 */
function migrations(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'migrations');
  const beside = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
  return existsSync(beside) ? beside : MIGRATIONS_DIR;
}
