import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import {
  openDatabase,
  MIGRATIONS_DIR,
  createRepositories,
  SCHEMA_VERSION,
  DatabaseTooNewError,
} from '../dist/index.js';

/**
 * معيار إنجاز P1-1: «migration تعمل على قاعدة فارغة وعلى قاعدة قائمة».
 * ومعها سياسة الحارس المعتمدة: القاعدة الأحدث ⇦ رفض الإقلاع.
 */

async function tempDbPath(name) {
  const dir = await mkdtemp(join(tmpdir(), 'cubecroom-db-'));
  return {
    file: join(dir, `${name}.sqlite`),
    cleanup: () => rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }),
  };
}

function userVersion(file) {
  const raw = new Database(file, { readonly: true });
  const [{ user_version: version }] = raw.pragma('user_version');
  raw.close();
  return version;
}

function tableNames(file) {
  const raw = new Database(file, { readonly: true });
  const rows = raw
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all();
  raw.close();
  return rows.map((r) => r.name);
}

describe('الترحيل', () => {
  test('قاعدة فارغة: تُنشأ الجداول ويُثبَّت الإصدار', async () => {
    const { file, cleanup } = await tempDbPath('empty');
    try {
      const handle = openDatabase({ file });
      handle.close();

      assert.equal(userVersion(file), SCHEMA_VERSION, 'user_version يجب أن يساوي إصدار المخطط');

      const tables = tableNames(file);
      for (const expected of [
        'teacher',
        'classes',
        'students',
        'sessions',
        'join_requests',
        'student_sessions',
        'lessons',
        'lesson_workspaces',
        'files',
        'activities',
        'questions',
        'submissions',
        'ai_providers',
        'audit_log',
      ]) {
        assert.ok(tables.includes(expected), `الجدول ${expected} غير موجود`);
      }
    } finally {
      await cleanup();
    }
  });

  test('قاعدة قائمة: الفتح الثاني لا يغيّر شيئاً ولا يفقد بيانات', async () => {
    const { file, cleanup } = await tempDbPath('existing');
    try {
      const first = openDatabase({ file });
      first.sqlite
        .prepare('INSERT INTO teacher (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run('t1', 'أ. سارة العتيبي', Date.now(), Date.now());
      first.close();

      const tablesBefore = tableNames(file).sort();

      const second = openDatabase({ file });
      const row = second.sqlite.prepare('SELECT name FROM teacher WHERE id = ?').get('t1');
      second.close();

      assert.equal(row.name, 'أ. سارة العتيبي', 'البيانات السابقة يجب أن تبقى');
      assert.equal(userVersion(file), SCHEMA_VERSION);
      assert.deepEqual(tableNames(file).sort(), tablesBefore, 'لا جداول تُضاف أو تُحذف');
    } finally {
      await cleanup();
    }
  });

  test('قاعدة أحدث من التطبيق: يُرفض الإقلاع ولا تُمسّ البيانات', async () => {
    const { file, cleanup } = await tempDbPath('too-new');
    try {
      const handle = openDatabase({ file });
      handle.sqlite
        .prepare('INSERT INTO teacher (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run('t1', 'أ. سارة العتيبي', Date.now(), Date.now());
      // محاكاة: القاعدة أُنشئت بإصدار أحدث من هذا البناء.
      handle.sqlite.pragma(`user_version = ${SCHEMA_VERSION + 1}`);
      handle.close();

      assert.throws(
        () => openDatabase({ file }),
        (error) => {
          assert.ok(error instanceof DatabaseTooNewError, 'يجب أن يكون DatabaseTooNewError');
          assert.equal(error.code, 'db_too_new');
          assert.equal(error.foundVersion, SCHEMA_VERSION + 1);
          // الرسالة للإنسان: تقول ما حدث وما يفعله، بلا مصطلح تقني.
          assert.match(error.message, /حدّث التطبيق/);
          assert.doesNotMatch(error.message, /schema|migration|SQLite|user_version/i);
          return true;
        },
      );

      // الرفض لا يُرحّل ولا يعدّل: الإصدار والبيانات كما هما.
      assert.equal(userVersion(file), SCHEMA_VERSION + 1, 'لا يجوز تعديل إصدار قاعدة أحدث');
      const raw = new Database(file, { readonly: true });
      const row = raw.prepare('SELECT name FROM teacher WHERE id = ?').get('t1');
      raw.close();
      assert.equal(row.name, 'أ. سارة العتيبي');
    } finally {
      await cleanup();
    }
  });
});

test('version 2 upgrade preserves published lessons and answers and adds private workspaces', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cubecroom-v2-upgrade-'));
  const file = join(dir, 'existing.sqlite');
  let opened;
  try {
    const legacy = join(dir, 'migrations');
    await mkdir(join(legacy, 'meta'), { recursive: true });
    const journal = JSON.parse(await readFile(join(MIGRATIONS_DIR, 'meta/_journal.json'), 'utf8'));
    journal.entries = journal.entries.slice(0, 2);
    await writeFile(join(legacy, 'meta/_journal.json'), JSON.stringify(journal));
    for (const entry of journal.entries)
      await copyFile(join(MIGRATIONS_DIR, `${entry.tag}.sql`), join(legacy, `${entry.tag}.sql`));
    opened = openDatabase({ file, migrationsDir: legacy });
    opened.sqlite.pragma('user_version = 2');
    const old = createRepositories(opened);
    const klass = old.classes.create({ name: 'الفصل القديم' });
    const lesson = old.lessons.create({ classId: klass.id, title: 'الدرس المنشور' });
    old.lessons.update(lesson.id, { blocks: [{ type: 'paragraph', text: 'محتوى محفوظ' }] });
    old.lessons.setPublished(lesson.id, true);
    const activity = old.activities.create({
      classId: klass.id,
      lessonId: lesson.id,
      title: 'نشاط سابق',
    });
    const student = old.students.add({ classId: klass.id, name: 'طالب سابق' });
    opened.sqlite
      .prepare(
        'INSERT INTO submissions (id, activity_id, student_id, submitted_at, score) VALUES (?, ?, ?, ?, ?)',
      )
      .run('old-submission', activity.id, student.id, Date.now(), 3);
    opened.close();
    opened = openDatabase({ file });
    const current = createRepositories(opened);
    assert.equal(current.lessons.get(lesson.id).status, 'published');
    assert.equal(current.lessons.get(lesson.id).blocks[0].text, 'محتوى محفوظ');
    assert.equal(current.submissions.find(activity.id, student.id).score, 3);
    assert.equal(current.lessonWorkspaces.get(lesson.id), null);
    assert.equal(opened.sqlite.pragma('user_version', { simple: true }), SCHEMA_VERSION);
    assert.ok(
      opened.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE name = 'lesson_workspaces'")
        .get(),
    );
  } finally {
    opened?.close();
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
});

describe('ضمانات المخطط', () => {
  test('السلامة المرجعية مفعّلة: لا طالب بلا فصل', async () => {
    const { file, cleanup } = await tempDbPath('fk');
    try {
      const handle = openDatabase({ file });
      assert.throws(
        () =>
          handle.sqlite
            .prepare(
              'INSERT INTO students (id, class_id, name, approved_at, created_at) VALUES (?, ?, ?, ?, ?)',
            )
            .run('s1', 'لا-وجود-له', 'ريم', Date.now(), Date.now()),
        /FOREIGN KEY/i,
      );
      handle.close();
    } finally {
      await cleanup();
    }
  });

  test('لا تسليم مكرّر لنفس النشاط من نفس الطالب', async () => {
    const { file, cleanup } = await tempDbPath('dup');
    try {
      const handle = openDatabase({ file });
      const now = Date.now();
      handle.transaction(() => {
        handle.sqlite
          .prepare('INSERT INTO classes (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
          .run('c1', 'الصف السادس — علوم', now, now);
        handle.sqlite
          .prepare(
            'INSERT INTO students (id, class_id, name, approved_at, created_at) VALUES (?, ?, ?, ?, ?)',
          )
          .run('s1', 'c1', 'ريم', now, now);
        handle.sqlite
          .prepare(
            'INSERT INTO activities (id, class_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
          )
          .run('a1', 'c1', 'سؤال قصير', now, now);
      });

      const insertSubmission = () =>
        handle.sqlite
          .prepare(
            'INSERT INTO submissions (id, activity_id, student_id, submitted_at) VALUES (?, ?, ?, ?)',
          )
          .run(`sub-${Math.random()}`, 'a1', 's1', now);

      insertSubmission();
      // «يمنع submit المكرر غير المقصود» — مفروض في القاعدة لا في الواجهة وحدها.
      assert.throws(insertSubmission, /UNIQUE/i);
      handle.close();
    } finally {
      await cleanup();
    }
  });
});
