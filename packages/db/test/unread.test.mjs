import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, createRepositories, NotFoundError } from '../dist/index.js';

/** «من لم يقرأ الدرس» في T12 — الأسماء التي يلاحق بها المعلم، لا العدد وحده. */

let handle;
let repos;
let dir;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cubecroom-unread-'));
  handle = openDatabase({ file: join(dir, 'test.sqlite') });
  repos = createRepositories(handle);
});

afterEach(async () => {
  handle.close();
  // ويندوز يحرّر مقابض -wal و -shm بعد الإغلاق بلحظة، فيفشل الحذف بلا إعادة محاولة.
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

const names = (rows) => rows.map((row) => row.name);

describe('من لم يقرأ الدرس', () => {
  test('القارئ يخرج من القائمة، ومن بقي يعود مرتّباً بالاسم', () => {
    const cls = repos.classes.create({ name: 'الصف السادس — علوم' });
    // الإدخال بغير ترتيب الأسماء: الترتيب مطلوب من الاستعلام لا من الصدفة.
    const maryam = repos.students.add({ classId: cls.id, name: 'مريم القحطاني' });
    const badr = repos.students.add({ classId: cls.id, name: 'بدر الشمري' });
    const reem = repos.students.add({ classId: cls.id, name: 'ريم عبدالله' });
    const lesson = repos.lessons.create({ classId: cls.id, title: 'دورة الماء' });

    assert.deepEqual(
      names(repos.lessons.unreadStudents(lesson.id)),
      ['بدر الشمري', 'ريم عبدالله', 'مريم القحطاني'],
      'قبل أي قراءة: الفصل كلّه، مرتّباً',
    );

    repos.lessons.markRead(lesson.id, reem.id);

    const remaining = repos.lessons.unreadStudents(lesson.id);
    assert.deepEqual(names(remaining), ['بدر الشمري', 'مريم القحطاني']);
    assert.ok(!remaining.some((row) => row.id === reem.id), 'من قرأ لا يُلاحَق');
    assert.deepEqual(
      remaining.map((row) => row.id),
      [badr.id, maryam.id],
    );

    // إعادة الفتح لا تُغيّر شيئاً — الأثر واحد ولو تكرّر.
    repos.lessons.markRead(lesson.id, reem.id);
    assert.equal(repos.lessons.unreadStudents(lesson.id).length, 2);

    repos.lessons.markRead(lesson.id, badr.id);
    repos.lessons.markRead(lesson.id, maryam.id);
    assert.deepEqual(repos.lessons.unreadStudents(lesson.id), [], 'قرأه الجميع: لا أحد يُلاحَق');
  });

  test('المُخرَج من الفصل لا يُلاحَق — قرأ أو لم يقرأ', () => {
    const cls = repos.classes.create({ name: 'الصف السادس — علوم' });
    const stays = repos.students.add({ classId: cls.id, name: 'نورة الحربي' });
    const removedSilent = repos.students.add({ classId: cls.id, name: 'خالد الدوسري' });
    const removedReader = repos.students.add({ classId: cls.id, name: 'سارة العتيبي' });
    const lesson = repos.lessons.create({ classId: cls.id, title: 'الكسور العشرية' });

    // القراءة أوّلاً ثم الإخراج: `remove` علامة، وأثر القراءة يبقى في الجدول.
    repos.lessons.markRead(lesson.id, removedReader.id);
    repos.students.remove(removedReader.id);
    repos.students.remove(removedSilent.id);

    const unread = repos.lessons.unreadStudents(lesson.id);
    assert.deepEqual(names(unread), ['نورة الحربي']);
    assert.equal(unread[0].id, stays.id);
    assert.ok(
      !unread.some((row) => row.id === removedSilent.id),
      'معلمٌ يلاحق من أخرجه بنفسه ينتظر قراءةً لن تأتي',
    );
    assert.ok(!unread.some((row) => row.id === removedReader.id), 'ولا يعود المُخرَج من باب القراءة');
    assert.equal(
      repos.students.listByClass(cls.id, { includeRemoved: true }).length,
      3,
      'والصفوف لم تُحذف — الإخراج علامة لا حذف',
    );
  });

  test('طالب فصلٍ آخر لا يظهر في قائمة هذا الدرس', () => {
    const sixth = repos.classes.create({ name: 'الصف السادس — علوم' });
    const fifth = repos.classes.create({ name: 'الصف الخامس — علوم' });
    repos.students.add({ classId: sixth.id, name: 'ريم عبدالله' });
    repos.students.add({ classId: fifth.id, name: 'بدر الشمري' });
    const lesson = repos.lessons.create({ classId: sixth.id, title: 'دورة الماء' });

    assert.deepEqual(
      names(repos.lessons.unreadStudents(lesson.id)),
      ['ريم عبدالله'],
      'القائمة فصل الدرس وحده',
    );

    // ودرس الفصل الآخر يرى طلابه هو.
    const other = repos.lessons.create({ classId: fifth.id, title: 'الكسور العشرية' });
    assert.deepEqual(names(repos.lessons.unreadStudents(other.id)), ['بدر الشمري']);
  });

  test('درسٌ لا وجود له يرمي NotFoundError برسالة عربية', () => {
    assert.throws(
      () => repos.lessons.unreadStudents('لا-وجود-له'),
      (error) => {
        assert.ok(error instanceof NotFoundError);
        assert.match(error.message, /لم نعثر على الدرس/);
        return true;
      },
    );
  });

  test('فصلٌ بلا طلاب: قائمة فارغة لا خطأ', () => {
    const cls = repos.classes.create({ name: 'الصف السادس — علوم' });
    const lesson = repos.lessons.create({ classId: cls.id, title: 'دورة الماء' });
    assert.deepEqual(repos.lessons.unreadStudents(lesson.id), []);
  });
});
