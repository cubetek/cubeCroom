import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, createRepositories, NotFoundError } from '../dist/index.js';

/**
 * نسخ نشاط إلى فصل آخر — معلّمٌ يدرّس المادة نفسها لفصلين.
 *
 * ما يُختبر هنا ليس «هل نُسخت الأسئلة» وحده، بل ما لا يجوز أن يُنسخ: إجابات
 * الطلاب، وحالة النشر، ومفتاح المساعدة، وارتباط الدرس.
 */

let handle;
let repos;
let dir;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cubecroom-copy-'));
  handle = openDatabase({ file: join(dir, 'test.sqlite') });
  repos = createRepositories(handle);
});

afterEach(async () => {
  handle.close();
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

const count = (table) =>
  handle.db.$client.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

const sourceQuestions = () => [
  {
    id: 'q1',
    type: 'choice',
    prompt: 'أيّ المراحل تأتي بعد التبخّر؟',
    points: 1,
    expectedAnswer: null,
    options: [
      { id: 'q1-a', text: 'الجريان السطحي', isCorrect: false },
      { id: 'q1-b', text: 'التكاثف', isCorrect: true },
    ],
  },
  {
    id: 'q2',
    type: 'text',
    prompt: 'اذكر مرحلتين من دورة الماء.',
    points: 2,
    expectedAnswer: 'التبخّر ثم التكاثف',
    options: [],
  },
];

/** فصلان ونشاطٌ كامل في الأول: أسئلة، ودرس مرتبط، وطالب. */
const build = () => {
  const from = repos.classes.create({ name: 'الصف السادس — علوم' });
  const to = repos.classes.create({ name: 'الصف السادس ب — علوم' });
  const lesson = repos.lessons.create({ classId: from.id, title: 'دورة الماء في الطبيعة' });
  const activity = repos.activities.create({
    classId: from.id,
    title: 'سؤال قصير: مراحل دورة الماء',
    lessonId: lesson.id,
  });
  repos.activities.replaceQuestions(activity.id, sourceQuestions());
  const student = repos.students.add({ classId: from.id, name: 'سارة' });
  return { from, to, lesson, activity, student };
};

describe('نسخ النشاط إلى فصل آخر', () => {
  test('النسخة تنزل في الفصل الهدف بعنوانٍ يميّزها', () => {
    const { from, to, activity } = build();
    const copy = repos.activities.copyToClass(activity.id, to.id);

    assert.notEqual(copy.id, activity.id, 'معرّف جديد لا معرّف الأصل');
    assert.equal(copy.classId, to.id);
    assert.equal(copy.title, 'سؤال قصير: مراحل دورة الماء — نسخة');
    assert.equal(repos.activities.listByClass(to.id).length, 1);
    assert.equal(repos.activities.listByClass(from.id).length, 1, 'الأصل وحده يبقى في فصله');
    assert.equal(repos.activities.get(copy.id).classId, to.id, 'النسخة محفوظة فعلاً');
  });

  test('النسخة مسودّة ولو كان الأصل منشوراً — FR-009', () => {
    const { to, activity } = build();
    const published = repos.activities.setPublished(activity.id, true);
    assert.equal(published.status, 'published');

    const copy = repos.activities.copyToClass(activity.id, to.id);
    assert.equal(copy.status, 'draft', 'النشر قرار المعلّم لا أثر جانبي للنسخ');
    assert.equal(copy.publishedAt, null);
    assert.equal(repos.activities.listPublished(to.id).length, 0, 'لا يصل الطالب قبل المراجعة');
  });

  test('مفتاح مساعدة الطالب يبدأ مطفأً في النسخة ولو كان مفتوحاً في الأصل — قرار D10', () => {
    const { to, activity } = build();
    const opened = repos.activities.setStudentAiEnabled(activity.id, true);
    assert.equal(opened.studentAiEnabled, true);

    const copy = repos.activities.copyToClass(activity.id, to.id);
    assert.equal(copy.studentAiEnabled, false, 'بوّابة لم يفتحها المعلّم هنا تبقى مغلقة');
    assert.equal(repos.activities.get(copy.id).studentAiEnabled, false);
  });

  test('الأسئلة والخيارات تُنسخ بترتيبها ومفتاحها وبمعرّفات جديدة', () => {
    const { to, activity } = build();
    const copy = repos.activities.copyToClass(activity.id, to.id);

    const original = repos.activities.questions(activity.id);
    const copied = repos.activities.questions(copy.id);
    assert.equal(copied.length, 2);

    assert.deepEqual(
      copied.map((question) => question.prompt),
      original.map((question) => question.prompt),
      'النصّ والترتيب كما هما',
    );
    assert.deepEqual(
      copied.map((question) => [question.type, question.points, question.expectedAnswer]),
      original.map((question) => [question.type, question.points, question.expectedAnswer]),
    );
    assert.deepEqual(
      copied[0].options.map((option) => [option.text, option.isCorrect]),
      original[0].options.map((option) => [option.text, option.isCorrect]),
      'مفتاح الإجابة وترتيب الخيارات ينتقلان',
    );
    assert.deepEqual(copied[1].options, [], 'السؤال القصير يبقى بلا خيارات');

    const oldIds = new Set(original.map((question) => question.id));
    for (const question of copied) {
      assert.equal(oldIds.has(question.id), false, `معرّف السؤال أُعيد استعماله: ${question.id}`);
    }
    const oldOptionIds = new Set(original.flatMap((q) => q.options.map((option) => option.id)));
    for (const option of copied[0].options) {
      assert.equal(oldOptionIds.has(option.id), false, `معرّف الخيار أُعيد استعماله: ${option.id}`);
    }
    assert.equal(count('questions'), 4, 'صفوف جديدة لا صفوف مشتركة');
    assert.equal(count('question_options'), 4);
  });

  test('تسليمات الأصل وإجاباتها ودرجاتها لا تُنسخ', () => {
    const { to, activity, student } = build();
    const submitted = repos.submissions.submit({
      activityId: activity.id,
      studentId: student.id,
      answers: [
        { type: 'choice', questionId: 'q1', optionId: 'q1-b' },
        { type: 'text', questionId: 'q2', text: 'التبخّر ثم التكاثف' },
      ],
    });
    repos.submissions.review(submitted.submission.id, { score: 5, comment: 'ممتاز' });

    const copy = repos.activities.copyToClass(activity.id, to.id);

    assert.equal(repos.submissions.listByActivity(copy.id).length, 0, 'إجابة الطالب تبقى في فصلها');
    assert.equal(count('submissions'), 1, 'لم يُنشأ تسليم ثانٍ');
    assert.equal(count('answers'), 2);
    assert.equal(repos.submissions.listByActivity(activity.id).length, 1, 'ولا تُنقل عن الأصل');

    const tally = repos.activities.tally(to.id).get(copy.id);
    assert.equal(tally.submissions, 0, 'النسخة تبدأ بلا تسليمات');
    assert.equal(tally.pendingReview, 0);
    assert.equal(tally.questions, 2);
  });

  test('ارتباط الدرس يسقط لأن الدرس درسُ الفصل الأصل', () => {
    const { to, activity, lesson } = build();
    assert.equal(activity.lessonId, lesson.id);

    const copy = repos.activities.copyToClass(activity.id, to.id);
    assert.equal(copy.lessonId, null, 'درس فصلٍ آخر لا يُعرض على هذا الفصل');
    assert.equal(repos.activities.get(copy.id).lessonId, null);
    assert.equal(repos.activities.lessonTitle(copy.lessonId), null);
  });

  test('النسخ داخل الفصل نفسه يُبقي ارتباط الدرس — صحّته مثبتة', () => {
    const { from, activity, lesson } = build();
    const copy = repos.activities.copyToClass(activity.id, from.id);
    assert.equal(copy.lessonId, lesson.id);
  });

  test('المرفقات تعبر مع النسخة — الملف لا ينتمي إلى فصل', () => {
    const { to, activity } = build();
    const stored = repos.files.register({
      name: 'ورقة عمل.pdf',
      kind: 'مستند PDF',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      storageName: 'worksheet.pdf',
    });
    handle.db.$client
      .prepare('INSERT INTO activity_files (activity_id, file_id, position) VALUES (?, ?, 0)')
      .run(activity.id, stored.id);

    const copy = repos.activities.copyToClass(activity.id, to.id);
    const rows = handle.db.$client
      .prepare('SELECT file_id AS fileId FROM activity_files WHERE activity_id = ?')
      .all(copy.id);
    assert.deepEqual(rows, [{ fileId: stored.id }]);
    assert.equal(repos.files.usage(stored.id).length, 2, 'التحذير يعدّ الموضعين');
  });

  test('الأصل لا يتغيّر بحرف واحد', () => {
    const { to, activity } = build();
    const before = repos.activities.get(activity.id);
    const questionsBefore = repos.activities.questions(activity.id);

    repos.activities.copyToClass(activity.id, to.id);

    assert.deepEqual(repos.activities.get(activity.id), before, 'ولا حتى updatedAt');
    assert.deepEqual(repos.activities.questions(activity.id), questionsBefore);
  });

  test('نشاط غير موجود يرمي NotFoundError بالعربية', () => {
    const { to } = build();
    assert.throws(
      () => repos.activities.copyToClass('لا-وجود-له', to.id),
      (error) => {
        assert.ok(error instanceof NotFoundError);
        assert.match(error.message, /لم نعثر على النشاط/);
        return true;
      },
    );
  });

  /** نسخةٌ بأسئلةٍ بلا خياراتها أسوأ من نسخةٍ لم تُنشأ — NFR-005. */
  test('فشلٌ في منتصف النسخ لا يترك نشاطاً نصف منسوخ', () => {
    const { to, activity } = build();
    // إفشالٌ مصطنع بعد إدراج النشاط وأول أسئلته: الخيارات هي الصفّ التالي.
    handle.db.$client.exec(
      "CREATE TRIGGER copy_boom BEFORE INSERT ON question_options BEGIN SELECT RAISE(ABORT, 'boom'); END;",
    );

    assert.throws(() => repos.activities.copyToClass(activity.id, to.id));

    handle.db.$client.exec('DROP TRIGGER copy_boom');
    assert.equal(count('activities'), 1, 'المعاملة تراجعت: لا نشاط نصف منسوخ');
    assert.equal(count('questions'), 2, 'ولا أسئلة يتيمة');
    assert.equal(repos.activities.listByClass(to.id).length, 0);
  });
});
