import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createBackup,
  createFileStore,
  deleteBackup,
  listBackups,
  verifyBackup,
  restoreBackup,
  describeLoss,
  appendCrashEntry,
  readCrashLog,
  clearCrashLog,
  formatCrashEntry,
  quarantineData,
  listQuarantined,
  BackupFailedError,
  DATABASE_NAME,
  FILES_DIR,
  MANIFEST_NAME,
} from '../dist/index.js';
import { openDatabase, createRepositories, SCHEMA_VERSION } from '@cubecroom/db';

/**
 * معيار إنجاز P1-5: «Archive يُنشأ ويُفحص».
 * الفحص هنا يشمل ما لا يظهر بالنظر: أن قاعدة النسخة تُفتح فعلاً، وأن تلفاً
 * لا يغيّر الحجم يُكتشف بالفحص العميق وحده.
 */

let root;
let dataDirectory;
let backupsRoot;
let handle;
let repos;
let store;

// وقت محلي لا UTC: اسم المجلد يُبنى من مكوّنات الوقت المحلي.
const backupNow = new Date(2026, 8, 4, 7, 15, 0);

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cubecroom-backup-'));
  dataDirectory = join(root, 'data');
  backupsRoot = join(dataDirectory, 'Backups');
  await mkdir(dataDirectory, { recursive: true });

  handle = openDatabase({ file: join(dataDirectory, 'cubecroom.sqlite') });
  repos = createRepositories(handle);
  store = createFileStore(dataDirectory);
  await store.ensureReady();
});

afterEach(async () => {
  handle.close();
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

/** يزرع فصلاً ودرسين وملفين — ما يكفي ليكون للفهرس محتوى حقيقي. */
async function seed() {
  const klass = repos.classes.create({ name: 'الصف السادس — علوم' });
  repos.lessons.create({ classId: klass.id, title: 'دورة الماء في الطبيعة' });
  repos.lessons.create({ classId: klass.id, title: 'أجزاء النبات' });

  const source = join(root, 'source');
  await mkdir(source, { recursive: true });

  const added = [];
  for (const [name, size] of [
    ['ورقة عمل — دورة الماء.pdf', 3000],
    ['مخطط الدورة.png', 1500],
  ]) {
    const path = join(source, name);
    await writeFile(path, randomBytes(size));
    const file = await store.add(path);
    repos.files.register({
      name: file.name,
      kind: file.kind,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      storageName: file.storageName,
      sha256: file.sha256,
    });
    added.push(file);
  }
  return added;
}

function run(overrides = {}) {
  return createBackup({
    destinationRoot: backupsRoot,
    database: handle.sqlite,
    fileStore: store,
    storageNames: repos.stats.storageNames(),
    contents: repos.stats.contents(),
    appVersion: '0.1.0',
    schemaVersion: SCHEMA_VERSION,
    now: backupNow,
    ...overrides,
  });
}

describe('إنشاء النسخة', () => {
  test('المجلد يحمل الفهرس والقاعدة والمرفقات', async () => {
    const added = await seed();
    const summary = await run();

    assert.equal(summary.name, '2026-09-04_07-15-00');
    const entries = (await readdir(summary.path)).sort();
    assert.deepEqual(entries, [DATABASE_NAME, FILES_DIR, MANIFEST_NAME].sort());

    const copied = (await readdir(join(summary.path, FILES_DIR))).sort();
    assert.deepEqual(copied, added.map((file) => file.storageName).sort());
  });

  test('الفهرس يسجّل ما تشمله النسخة — سطر بطاقة T20', async () => {
    await seed();
    const { manifest } = await run();

    assert.deepEqual(manifest.contents, {
      classes: 1,
      lessons: 2,
      activities: 0,
      submissions: 0,
      files: 2,
      fileBytes: 4500,
    });
    assert.equal(manifest.schemaVersion, SCHEMA_VERSION);
    assert.equal(manifest.app, '0.1.0');
    assert.equal(manifest.files.length, 2);
    assert.equal(
      manifest.totalBytes,
      manifest.database.sizeBytes + manifest.files.reduce((sum, f) => sum + f.sizeBytes, 0),
    );
  });

  /**
   * الفرق D-4 (§16): «افتراضياً لا تُصدَّر secrets إلى Backup العادي».
   * الأرشيف يُبنى من القاعدة ومجلد `files` **بالاسم**، لا بنسخ مجلد البيانات
   * كله — فأي ملف آخر فيه لا يدخل النسخة بحكم البنية لا بقاعدة تُتذكَّر.
   */
  test('النسخة تحمل القاعدة والمرفقات وحدها — ولا تلتقط أسراراً بجوارها', async () => {
    await seed();
    const secret = 'sk-proj-NEVER-IN-A-BACKUP-0000';
    await writeFile(join(dataDirectory, 'secrets.json'), secret, 'utf8');
    await writeFile(join(dataDirectory, 'ملاحظات.txt'), 'شيء آخر', 'utf8');

    const summary = await run();

    const entries = (await readdir(summary.path)).sort();
    assert.deepEqual(entries, [DATABASE_NAME, FILES_DIR, MANIFEST_NAME].sort());

    // ولا حتى داخل الفهرس أو أي بايت من الأرشيف.
    for (const name of entries) {
      const path = join(summary.path, name);
      if ((await stat(path)).isDirectory()) continue;
      assert.ok(!(await readFile(path)).includes(secret), `تسرّب السرّ إلى ${name}`);
    }
  });

  test('نسختان في اللحظة نفسها لا تكتب إحداهما فوق الأخرى', async () => {
    await seed();
    const first = await run();
    const second = await run();

    assert.notEqual(first.name, second.name);
    assert.equal(second.name, '2026-09-04_07-15-00-2');
    assert.equal((await verifyBackup(second.path, { deep: true })).status, 'complete');
  });

  test('قاعدة النسخة تُفتح ويُقرأ منها — لا نسخ ملف خام', async () => {
    await seed();
    const summary = await run();

    const restored = openDatabase({ file: join(summary.path, DATABASE_NAME) });
    try {
      const repositories = createRepositories(restored);
      assert.equal(repositories.stats.contents().lessons, 2);
      assert.equal(repositories.classes.list()[0]?.name, 'الصف السادس — علوم');
    } finally {
      restored.close();
    }
  });

  test('التقدّم يمرّ بالخطوات الثلاث وينتهي عند مجموع الملفات', async () => {
    await seed();
    const seen = [];
    await run({ onProgress: (progress) => seen.push(progress) });

    assert.deepEqual([...new Set(seen.map((p) => p.step))], ['database', 'files', 'manifest']);
    assert.equal(seen.at(-1).copiedFiles, 2);
    assert.equal(seen.at(-1).totalFiles, 2);
  });

  test('مكان حفظ غير صالح ⇦ خطأ مفهوم لا خطأ نظام', async () => {
    await seed();
    // ملف في موضع المجلد: لا يمكن إنشاء مجلد باسمه.
    const blocked = join(root, 'blocked');
    await writeFile(blocked, 'x');

    await assert.rejects(() => run({ destinationRoot: blocked }), (error) => {
      assert.ok(error instanceof BackupFailedError);
      assert.match(error.message, /توقّف إنشاء النسخة الاحتياطية قبل أن يكتمل/);
      return true;
    });
  });
});

describe('فحص النسخة', () => {
  test('النسخة الكاملة تُقبل في الفحصين', async () => {
    await seed();
    const summary = await run();

    for (const deep of [false, true]) {
      const report = await verifyBackup(summary.path, { deep });
      assert.equal(report.status, 'complete', `deep=${deep}`);
      assert.equal(report.reason, undefined);
      assert.equal(report.createdAt.toISOString(), backupNow.toISOString());
      assert.ok(report.sizeBytes > 0);
    }
  });

  test('نسخة بلا فهرس ⇦ نصّ اللوح نفسه', async () => {
    await seed();
    const summary = await run();
    await rm(join(summary.path, MANIFEST_NAME));

    const report = await verifyBackup(summary.path);
    assert.equal(report.status, 'damaged');
    assert.equal(report.reason, 'توقّفت قبل أن تكتمل — لا تصلح للاستعادة.');
    // الحجم يبقى معروضاً رغم التلف — الصفّ الأحمر يعرضه.
    assert.ok(report.sizeBytes > 0);
  });

  test('فهرس غير مقروء ⇦ تلف لا انهيار', async () => {
    await seed();
    const summary = await run();
    await writeFile(join(summary.path, MANIFEST_NAME), '{ نصّ ليس JSON', 'utf8');

    const report = await verifyBackup(summary.path);
    assert.equal(report.status, 'damaged');
    assert.match(report.reason, /غير مقروء/);
  });

  test('فهرس بصيغة أحدث ⇦ يطلب تحديث التطبيق لا يزعم التلف', async () => {
    await seed();
    const summary = await run();
    const manifestPath = join(summary.path, MANIFEST_NAME);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    await writeFile(manifestPath, JSON.stringify({ ...manifest, format: 99 }), 'utf8');

    const report = await verifyBackup(summary.path);
    assert.equal(report.status, 'damaged');
    assert.match(report.reason, /أُنشئت بإصدار أحدث/);
  });

  test('مرفق ناقص يُكتشف بالفحص السطحي', async () => {
    await seed();
    const summary = await run();
    const [first] = await readdir(join(summary.path, FILES_DIR));
    await rm(join(summary.path, FILES_DIR, first));

    const report = await verifyBackup(summary.path);
    assert.equal(report.status, 'damaged');
    assert.match(report.reason, /ناقصة أو تالفة/);
  });

  test('تلف لا يغيّر الحجم يمرّ سطحياً ويُكشف عميقاً', async () => {
    await seed();
    const summary = await run();
    const [first] = await readdir(join(summary.path, FILES_DIR));
    const path = join(summary.path, FILES_DIR, first);
    const bytes = await readFile(path);
    bytes[0] = bytes[0] ^ 0xff;
    await writeFile(path, bytes);

    assert.equal((await stat(path)).size, bytes.length);
    assert.equal((await verifyBackup(summary.path)).status, 'complete');

    const deep = await verifyBackup(summary.path, { deep: true });
    assert.equal(deep.status, 'damaged');
    assert.match(deep.reason, /ناقصة أو تالفة/);
  });

  test('قاعدة تالفة ⇦ رسالة تخصّها', async () => {
    await seed();
    const summary = await run();
    const path = join(summary.path, DATABASE_NAME);
    const bytes = await readFile(path);
    bytes[100] = bytes[100] ^ 0xff;
    await writeFile(path, bytes);

    const report = await verifyBackup(summary.path, { deep: true });
    assert.equal(report.status, 'damaged');
    assert.match(report.reason, /قاعدة البيانات داخل هذه النسخة/);
  });
});

describe('قائمة النسخ — T20', () => {
  test('الأحدث أولاً، والتالفة معروضة لا مخفية', async () => {
    await seed();
    const older = await run({ now: new Date(2026, 8, 2, 7, 10, 0) });
    const newer = await run({ now: backupNow });
    await rm(join(older.path, MANIFEST_NAME));

    // مجلد لا علاقة له بنا داخل مجلد النسخ — يُعرض تالفاً لا يُتجاهل.
    await mkdir(join(backupsRoot, 'مجلد غريب'), { recursive: true });

    const rows = await listBackups(backupsRoot);
    assert.equal(rows.length, 3);
    assert.equal(rows[0].name, newer.name);
    assert.equal(rows[0].status, 'complete');
    assert.equal(rows.filter((row) => row.status === 'damaged').length, 2);
  });

  test('مجلد نسخ لم يُنشأ بعد ⇦ قائمة فارغة لا خطأ', async () => {
    assert.deepEqual(await listBackups(join(root, 'never')), []);
  });

  test('الحذف يزيل الصفّ من القائمة', async () => {
    await seed();
    const summary = await run();
    await deleteBackup(summary.path);

    assert.deepEqual(await listBackups(backupsRoot), []);
  });
});

describe('الاستعادة — FR-015', () => {
  /** يأخذ نسخة، ثم يغيّر الوضع الحالي، فيصير للاستعادة أثرٌ يُقاس. */
  async function backupThenDiverge() {
    await seed();
    const summary = await run();
    handle.close();
    return summary;
  }

  const restoreWith = (summary, overrides = {}) =>
    restoreBackup({
      archivePath: summary.path,
      dataDirectory,
      safetyBackup: async () => ({ path: join(root, 'safety') }),
      appSchemaVersion: SCHEMA_VERSION,
      ...overrides,
    });

  test('الترتيب: تُؤخذ النسخة الوقائية قبل أن يُمسّ شيء', async () => {
    const summary = await backupThenDiverge();
    const order = [];

    await restoreWith(summary, {
      safetyBackup: async () => {
        order.push('safety');
        return { path: join(root, 'safety') };
      },
      onProgress: (step) => order.push(step),
    });

    assert.deepEqual(order, ['verifying', 'safety_backup', 'safety', 'staging', 'swapping', 'done']);
    assert.ok(
      order.indexOf('safety') < order.indexOf('swapping'),
      'لا استبدال قبل نسخة الوضع الحالي — وهو معيار الإنجاز نصّاً',
    );
  });

  test('فشل النسخة الوقائية يوقف كل شيء ولا يمسّ البيانات', async () => {
    const summary = await backupThenDiverge();
    const before = await readFile(join(dataDirectory, 'cubecroom.sqlite'));

    const result = await restoreWith(summary, {
      safetyBackup: async () => {
        throw new Error('القرص ممتلئ');
      },
    });

    assert.equal(result.status, 'refused');
    assert.match(result.message, /لم يتغيّر شيء على جهازك/);
    assert.deepEqual(
      await readFile(join(dataDirectory, 'cubecroom.sqlite')),
      before,
      'القاعدة كما هي بايتاً ببايت',
    );
  });

  /**
   * الأخطر في هذا الملف: نسخةٌ من تطبيق أحدث تحمل مخططاً لا يفهمه هذا
   * الإصدار. استعادتها تُنتج جهازاً لا يُقلع — وقد محا المعلم بياناته الصالحة.
   */
  test('نسخة من إصدار أحدث تُرفض — ولا تُمحى البيانات الصالحة', async () => {
    const summary = await backupThenDiverge();
    const before = await readFile(join(dataDirectory, 'cubecroom.sqlite'));
    let safetyRan = false;

    const result = await restoreWith(summary, {
      appSchemaVersion: SCHEMA_VERSION - 1,
      safetyBackup: async () => {
        safetyRan = true;
        return { path: join(root, 'safety') };
      },
    });

    assert.equal(result.status, 'refused');
    assert.match(result.message, /إصدار أحدث/);
    assert.equal(safetyRan, false, 'الرفض يسبق كل عمل — لا نسخة وقائية لعمل لن يجري');
    assert.deepEqual(await readFile(join(dataDirectory, 'cubecroom.sqlite')), before);
  });

  test('نسخة تالفة تُرفض برسالتها هي', async () => {
    const summary = await backupThenDiverge();
    await rm(join(summary.path, MANIFEST_NAME));

    const result = await restoreWith(summary);
    assert.equal(result.status, 'refused');
    assert.equal(result.message, 'توقّفت قبل أن تكتمل — لا تصلح للاستعادة.');
  });

  /** الفحص عميق: تلفٌ لا يغيّر الحجم لا يمرّ. */
  test('تلفٌ في ملف داخل النسخة يُكتشف قبل الاستبدال', async () => {
    const summary = await backupThenDiverge();
    const names = await readdir(join(summary.path, FILES_DIR));
    const victim = join(summary.path, FILES_DIR, names[0]);
    const original = await readFile(victim);
    const flipped = Buffer.from(original);
    flipped[0] = flipped[0] ^ 0xff;
    await writeFile(victim, flipped);

    const result = await restoreWith(summary);
    assert.equal(result.status, 'refused');
  });

  test('الاستعادة الناجحة تضع قاعدة النسخة وملفاتها مكان القائم', async () => {
    const summary = await backupThenDiverge();

    // نُتلف الوضع الحالي عمداً حتى يكون للاستعادة أثر ظاهر.
    await writeFile(join(dataDirectory, 'cubecroom.sqlite'), Buffer.from('تالف'));

    const result = await restoreWith(summary);
    assert.equal(result.status, 'restored');
    assert.equal(result.safetyBackupPath, join(root, 'safety'));

    const restored = await readFile(join(dataDirectory, 'cubecroom.sqlite'));
    const archived = await readFile(join(summary.path, DATABASE_NAME));
    assert.deepEqual(restored, archived, 'القاعدة صارت قاعدة النسخة');

    const files = await readdir(join(dataDirectory, FILES_DIR));
    assert.equal(files.length, 2);
  });

  test('لا يبقى مجلد مؤقّت بعد النجاح', async () => {
    const summary = await backupThenDiverge();
    await restoreWith(summary);

    const left = await readdir(dataDirectory);
    assert.equal(left.includes('.restore-staging'), false);
    assert.equal(left.includes('.restore-previous'), false);
  });
});

describe('ما سيُفقد بالاستعادة — T20Restore', () => {
  const contents = (over = {}) => ({
    classes: 6,
    lessons: 24,
    activities: 14,
    submissions: 186,
    files: 42,
    fileBytes: 0,
    ...over,
  });

  test('الفرق يُحسب باباً باباً لا مجموعاً', () => {
    const loss = describeLoss(contents(), contents({ lessons: 21, submissions: 174, files: 37 }));
    assert.equal(loss.lessons, 3);
    assert.equal(loss.submissions, 12);
    assert.equal(loss.files, 5);
    assert.equal(loss.classes, 0);
  });

  /** «سيُفقد ‎-٣ دروس» جملة لا معنى لها — والزيادة ليست فقداً. */
  test('النسخة الأغنى من الحالي لا تُنتج فقداً سالباً', () => {
    const loss = describeLoss(contents({ lessons: 10 }), contents({ lessons: 30 }));
    assert.equal(loss.lessons, 0);
  });
});

describe('سجلّ التعطّل — §22', () => {
  const entry = (over = {}) => ({
    at: new Date('2026-09-04T10:00:00.000Z'),
    source: 'main',
    message: 'تعذّر فتح القاعدة',
    ...over,
  });

  /**
   * الشرط الذي يجعل هذا السجلّ جائزاً أصلاً: أثرُ استثناءٍ من مكتبة لا نملكها
   * قد يحمل مفتاح المعلم. وسجلٌّ يكتبه بنصّه على قرصه ينقض SEC-005 من حيث
   * أراد أن يساعد.
   */
  test('المفتاح لا يُكتب في السجلّ ولو جاء داخل أثر الاستثناء', async () => {
    const key = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789';
    await appendCrashEntry(dataDirectory, entry({ message: `فشل الطلب بالمفتاح ${key}` }));

    const log = await readCrashLog(dataDirectory);
    assert.equal(log.includes(key), false, 'المفتاح كاملاً ليس في الملف');
    assert.match(log, /تعذّر|فشل/, 'وبقي ما يفيد التشخيص');
  });

  test('السطر يحمل الوقت والمصدر والرسالة', async () => {
    await appendCrashEntry(dataDirectory, entry());
    const log = await readCrashLog(dataDirectory);

    assert.match(log, /2026-09-04T10:00:00\.000Z/);
    assert.match(log, /main/);
    assert.match(log, /تعذّر فتح القاعدة/);
  });

  test('الأسطر تتراكم ولا يكتب أحدها فوق الآخر', async () => {
    await appendCrashEntry(dataDirectory, entry({ message: 'الأول' }));
    await appendCrashEntry(dataDirectory, entry({ message: 'الثاني' }));

    const log = await readCrashLog(dataDirectory);
    assert.match(log, /الأول/);
    assert.match(log, /الثاني/);
  });

  /** يُنادى من معالج تعطّل: استثناءٌ فيه يُسقط العملية قبل إغلاق القاعدة. */
  test('لا يرمي على مجلد غير موجود', async () => {
    await appendCrashEntry(join(root, 'لا-وجود-له', 'أعمق'), entry());
  });

  test('الحذف يزيل الملف، والقراءة بعده تعيد null لا خطأ', async () => {
    await appendCrashEntry(dataDirectory, entry());
    await clearCrashLog(dataDirectory);
    assert.equal(await readCrashLog(dataDirectory), null);
  });

  test('التنسيق دالة صافية تُفحص وحدها', () => {
    const text = formatCrashEntry(entry({ stack: 'at somewhere (file.ts:1:1)' }));
    assert.match(text, /at somewhere/);
    assert.ok(text.endsWith('\n'), 'كل سطر ينتهي بسطر جديد فلا يلتصق بالتالي');
  });
});

describe('عزل البيانات قبل الاستعادة — §22', () => {
  /**
   * المسار الذي لا تُفتح فيه القاعدة: لا نسخة احتياطية منها لأنها هي العطل.
   * فالأمان يتغيّر شكله ولا يسقط — تُنقل ولا تُحذف.
   */
  test('القاعدة وسجلّها ومجلد الملفات تُنقل معاً ولا تُحذف', async () => {
    await seed();
    handle.close();
    await writeFile(join(dataDirectory, 'cubecroom.sqlite-wal'), 'WAL');

    const result = await quarantineData(dataDirectory, new Date(2026, 8, 4, 7, 15));

    assert.match(result.path, /Recovered-2026-09-04-0715$/);
    assert.ok(result.moved.includes('cubecroom.sqlite'));
    assert.ok(result.moved.includes('cubecroom.sqlite-wal'), 'قاعدة بلا سجلّ كتابتها ناقصة');
    assert.ok(result.moved.includes(FILES_DIR));

    const inside = await readdir(result.path);
    assert.ok(inside.includes('cubecroom.sqlite'));
    assert.ok(inside.includes(FILES_DIR));

    const left = await readdir(dataDirectory);
    assert.equal(left.includes('cubecroom.sqlite'), false, 'نُقلت لا نُسخت — القرص قد يكون ممتلئاً');
  });

  test('مجلد بلا ملفات لا يُفشل العزل', async () => {
    handle.close();
    const empty = join(root, 'فارغ');
    await mkdir(empty, { recursive: true });

    const result = await quarantineData(empty);
    assert.deepEqual(result.moved, []);
    assert.ok((await readdir(empty)).length === 1, 'أُنشئ مجلد العزل ولو فارغاً');
  });

  test('المعزولات تُسرد للمعلم — الأحدث أولاً', async () => {
    handle.close();
    await quarantineData(dataDirectory, new Date(2026, 8, 3, 6, 0));
    await quarantineData(dataDirectory, new Date(2026, 8, 4, 7, 15));

    const listed = await listQuarantined(dataDirectory);
    assert.equal(listed.length, 2);
    assert.match(listed[0], /2026-09-04/);
  });
});
