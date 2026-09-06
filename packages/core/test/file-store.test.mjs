import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createFileStore,
  classify,
  hasExistingData,
  DATABASE_FILE_NAME,
  FileCopyFailedError,
  FileDataMissingError,
  UnsafeStorageNameError,
} from '../dist/index.js';
import { openDatabase, createRepositories } from '@cubecroom/db';

/**
 * معيار إنجاز P1-4: «المرفق يُنسخ ويُقرأ باسم UUID مع metadata في DB».
 * الاختبار الأخير يثبت نصفَي الجملة معاً — القرص والقاعدة.
 */

const UUID_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]+)?$/;

let root;
let source;
let store;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cubecroom-files-'));
  source = join(root, 'source');
  await mkdir(source, { recursive: true });
  store = createFileStore(join(root, 'data'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

const write = async (name, bytes) => {
  const path = join(source, name);
  await writeFile(path, bytes);
  return path;
};

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

describe('نسخ المرفق', () => {
  test('يُخزَّن باسم UUID مع امتداده، والاسم الأصلي يبقى في البيانات الوصفية', async () => {
    const bytes = randomBytes(2048);
    const added = await store.add(await write('ورقة عمل — دورة الماء.pdf', bytes));

    assert.match(added.storageName, UUID_NAME);
    assert.ok(added.storageName.endsWith('.pdf'));
    assert.equal(added.name, 'ورقة عمل — دورة الماء.pdf');
    assert.equal(added.kind, 'مستند PDF');
    assert.equal(added.mimeType, 'application/pdf');
    assert.equal(added.category, 'document');
    assert.equal(added.badge, 'PDF');
    assert.equal(added.sizeBytes, bytes.length);
    assert.equal(added.sha256, sha256(bytes));

    // اسم المستخدم لا يظهر على القرص إطلاقاً.
    const onDisk = await readdir(store.directory);
    assert.deepEqual(onDisk, [added.storageName]);
  });

  test('المصدر لا يُمَسّ — نسخ لا نقل', async () => {
    const bytes = randomBytes(512);
    const path = await write('مخطط الدورة.png', bytes);
    await store.add(path);

    assert.deepEqual(await readFile(path), bytes);
  });

  test('القراءة تعيد البايتات نفسها', async () => {
    const bytes = randomBytes(4096);
    const added = await store.add(await write('خطة الدرس.docx', bytes));

    assert.deepEqual(await store.read(added.storageName), bytes);

    const chunks = [];
    for await (const chunk of store.openRead(added.storageName)) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks), bytes);
  });

  test('التقدّم يبلغ الحجم الكامل ولا يتجاوزه', async () => {
    const bytes = randomBytes(300_000);
    const seen = [];
    const added = await store.add(await write('تجربة التبخّر.mp4', bytes), {
      onProgress: (progress) => seen.push(progress),
    });

    assert.ok(seen.length > 0);
    assert.equal(seen.at(-1).copied, bytes.length);
    assert.ok(seen.every((p) => p.copied <= p.total));
    assert.equal(added.kind, 'مقطع فيديو');
  });

  test('اسم بلا امتداد صالح يُخزَّن بـ UUID مجرّد ويُصنَّف «ملف»', async () => {
    const added = await store.add(await write('notes', randomBytes(64)));

    assert.match(added.storageName, /^[0-9a-f-]{36}$/);
    assert.equal(added.kind, 'ملف');
    assert.equal(added.category, 'other');
    assert.equal(added.mimeType, 'application/octet-stream');
  });

  test('مصدر مفقود ⇦ رسالة اللوح نفسها لا خطأ نظام', async () => {
    await assert.rejects(() => store.add(join(source, 'لا-وجود-له.pdf')), (error) => {
      assert.ok(error instanceof FileCopyFailedError);
      assert.equal(error.code, 'file_copy_failed');
      assert.match(error.message, /توقّف النسخ قبل أن يكتمل/);
      return true;
    });
  });
});

describe('انقطاع النسخ', () => {
  test('الإلغاء لا يترك ملفاً ولا بقايا في المخزن', async () => {
    const bytes = randomBytes(8 * 1024 * 1024);
    const path = await write('مقطع طويل.mp4', bytes);
    const controller = new AbortController();

    await assert.rejects(
      () =>
        store.add(path, {
          signal: controller.signal,
          onProgress: () => controller.abort(),
        }),
      FileCopyFailedError,
    );

    assert.deepEqual(await readdir(store.directory), []);
  });

  test('sweepPartials يمسح البقايا وحدها', async () => {
    const added = await store.add(await write('ملف صالح.pdf', randomBytes(128)));
    await writeFile(join(store.directory, 'leftover.part'), 'x');

    assert.equal(await store.sweepPartials(), 1);
    assert.deepEqual(await readdir(store.directory), [added.storageName]);
  });

  test('sweepPartials على مخزن لم يُنشأ بعد لا يفشل', async () => {
    const fresh = createFileStore(join(root, 'never-used'));
    assert.equal(await fresh.sweepPartials(), 0);
  });
});

describe('حدود المجلد — SEC-006', () => {
  test('كل اسم لا يطابق شكل UUID يُرفض قبل لمس القرص', () => {
    for (const name of [
      '../evil.txt',
      '..\\evil.txt',
      'sub/dir.pdf',
      '/etc/passwd',
      'C:\\Windows\\System32\\config',
      'not-a-uuid.pdf',
      '',
      '00000000-0000-0000-0000-000000000000.pdf/../..',
    ]) {
      assert.throws(() => store.resolve(name), UnsafeStorageNameError, `مرّ: ${name}`);
    }
  });

  test('الاسم المولَّد يُقبل ويقع داخل المجلد', async () => {
    const added = await store.add(await write('صورة.jpg', randomBytes(32)));
    assert.equal(store.resolve(added.storageName), join(store.directory, added.storageName));
  });

  test('قراءة نسخة حُذفت من خارج التطبيق تشرح السبب', async () => {
    const added = await store.add(await write('تمارين.pdf', randomBytes(32)));
    assert.equal(await store.remove(added.storageName), true);

    await assert.rejects(() => store.read(added.storageName), FileDataMissingError);
    assert.equal(await store.exists(added.storageName), false);
    // الحذف مكرّراً لا يفشل: القاعدة قد تُنظَّف مرتين.
    assert.equal(await store.remove(added.storageName), false);
  });
});

describe('حارس مسار الاسترجاع — T01States/٣', () => {
  test('المجلد الخالي لا يُعدّ مجلد بيانات', async () => {
    assert.equal(await hasExistingData(root), false);
    assert.equal(await hasExistingData(join(root, 'لا-وجود-له')), false);
  });

  test('ملف قاعدة فارغ لا يكفي — لا يُفتح على أنه بيانات', async () => {
    const dir = join(root, 'empty-db');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, DATABASE_FILE_NAME), '');

    assert.equal(await hasExistingData(dir), false);
  });

  test('مجلد فيه قاعدة حقيقية يُقبل', async () => {
    const dir = join(root, 'real');
    await mkdir(dir, { recursive: true });
    const handle = openDatabase({ file: join(dir, DATABASE_FILE_NAME) });
    handle.close();

    assert.equal(await hasExistingData(dir), true);
  });
});

describe('التصنيف', () => {
  test('التسميات كما في لوحَي T13Upload و T18Files', () => {
    assert.equal(classify('a.pdf').kind, 'مستند PDF');
    assert.equal(classify('a.PNG').kind, 'صورة');
    assert.equal(classify('a.mp4').kind, 'مقطع فيديو');
    assert.equal(classify('a.docx').kind, 'مستند');
    assert.equal(classify('a.zip').kind, 'ملف');
  });

  test('الفئات ثلاث كشرائح الترشيح في T18', () => {
    assert.equal(classify('a.docx').category, 'document');
    assert.equal(classify('a.jpg').category, 'image');
    assert.equal(classify('a.mp3').category, 'clip');
    assert.equal(classify('a.mp4').category, 'clip');
  });

  test('ما ليس امتداداً لا يصير امتداداً', () => {
    assert.equal(classify('اسم.بالعربية').extension, '');
    assert.equal(classify('archive.tar.gz').extension, 'gz');
    assert.equal(classify('.gitignore').extension, '');
    assert.equal(classify('trailing.').extension, '');
  });
});

describe('الدورة الكاملة — قرص وقاعدة', () => {
  test('المرفق يُنسخ ثم يُسجَّل ثم يُقرأ باسم القاعدة', async () => {
    const bytes = randomBytes(1500);
    const added = await store.add(await write('ورقة عمل — دورة الماء.pdf', bytes));

    const handle = openDatabase({ file: join(root, 'data', 'cubecroom.sqlite') });
    try {
      const repos = createRepositories(handle);
      const row = repos.files.register({
        name: added.name,
        kind: added.kind,
        mimeType: added.mimeType,
        sizeBytes: added.sizeBytes,
        storageName: added.storageName,
        sha256: added.sha256,
      });

      assert.equal(row.storageName, added.storageName);
      assert.equal(row.name, 'ورقة عمل — دورة الماء.pdf');
      assert.equal(row.sizeBytes, bytes.length);
      assert.equal(row.sha256, sha256(bytes));

      // القراءة تبدأ من صفّ القاعدة لا من نتيجة النسخ — كما تفعل الواجهة.
      const stored = repos.files.get(row.id);
      assert.deepEqual(await store.read(stored.storageName), bytes);
    } finally {
      handle.close();
    }
  });
});
