import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';
import { DatabaseTooNewError, MigrationFailedError, SCHEMA_VERSION } from './version.js';

export type Db = BetterSQLite3Database<typeof schema>;

export type OpenResult = {
  readonly db: Db;
  /** الاتصال الخام — للـ PRAGMA والمعاملات والإغلاق. */
  readonly sqlite: Database.Database;
  readonly close: () => void;
  /**
   * كتابة حرجة داخل معاملة واحدة — NFR-005.
   * better-sqlite3 متزامن، فالمعاملة تلتفّ على دالة عادية لا وعد.
   */
  readonly transaction: <T>(fn: () => T) => T;
};

const here = dirname(fileURLToPath(import.meta.url));

/** مجلد الترحيلات المولَّد بـ drizzle-kit. يُشحن مع التطبيق عند التغليف. */
export const MIGRATIONS_DIR = join(here, '..', 'migrations');

export type OpenOptions = {
  /** مسار ملف القاعدة، أو `:memory:` في الاختبارات. */
  readonly file: string;
  readonly migrationsDir?: string | undefined;
};

/**
 * يفتح القاعدة المحلية ويجهّزها للاستعمال.
 *
 * الترتيب مقصود: الحارس قبل الترحيل. لو رحّلنا أولاً على قاعدة أحدث لأفسدناها
 * قبل أن نكتشف أنها ليست لنا.
 */
export function openDatabase({ file, migrationsDir = MIGRATIONS_DIR }: OpenOptions): OpenResult {
  const sqlite = new Database(file);

  // WAL: قراءات متزامنة أثناء الكتابة — بوابة الطالب تقرأ بينما يكتب المعلم.
  sqlite.pragma('journal_mode = WAL');
  // السلامة المرجعية مطفأة افتراضياً في SQLite؛ نفعّلها لكل اتصال.
  sqlite.pragma('foreign_keys = ON');
  // انتظار قصير بدل خطأ فوري عند التزاحم.
  sqlite.pragma('busy_timeout = 5000');

  const found = readUserVersion(sqlite);
  if (found > SCHEMA_VERSION) {
    sqlite.close();
    throw new DatabaseTooNewError(found, SCHEMA_VERSION);
  }

  const db = drizzle(sqlite, { schema });

  if (found < SCHEMA_VERSION) {
    try {
      migrate(db, { migrationsFolder: migrationsDir });
    } catch (cause) {
      sqlite.close();
      throw new MigrationFailedError(cause);
    }
    sqlite.pragma(`user_version = ${SCHEMA_VERSION}`);
  }

  return {
    db,
    sqlite,
    close: () => sqlite.close(),
    transaction: <T>(fn: () => T): T => sqlite.transaction(fn)(),
  };
}

function readUserVersion(sqlite: Database.Database): number {
  const rows = sqlite.pragma('user_version') as ReadonlyArray<{ user_version?: number }>;
  return rows[0]?.user_version ?? 0;
}
