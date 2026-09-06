import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, createRepositories } from '../dist/index.js';

let handle, repos, lesson;
beforeEach(() => {
  handle = openDatabase({ file: ':memory:' });
  repos = createRepositories(handle);
  const klass = repos.classes.create({ name: 'فصل العلوم' });
  lesson = repos.lessons.create({ classId: klass.id, title: 'الماء' });
  repos.lessons.update(lesson.id, { blocks: [{ type: 'paragraph', text: 'المادة الأصلية' }] });
});
afterEach(() => handle.close());

const material = (suffix = '1') => ({
  title: `دورة الماء ${suffix}`,
  blocks: [{ type: 'paragraph', text: `صفحة الطالب ${suffix}` }],
  preparation: {
    overview: `خطة خاصة بالمعلم ${suffix}`,
    steps: [
      { title: 'تمهيد', minutes: 5, instructions: 'اربط الموضوع بالحياة اليومية' },
      { title: 'تطبيق', minutes: 10, instructions: 'راقب المحاولة دون إعطاء الإجابة' },
    ],
    misconceptions: [{ idea: 'فهم غير مكتمل', response: 'اسأل عن الدليل' }],
  },
  activity: {
    title: `تحقق من الفهم ${suffix}`,
    questions: [
      {
        id: `question-${suffix}`,
        type: 'text',
        prompt: 'فسر ما حدث',
        points: 1,
        expectedAnswer: `مفتاح إجابة خاص ${suffix}`,
      },
    ],
  },
});
const apply = (next = material()) =>
  repos.lessonWorkspaces.apply(lesson.id, repos.lessonWorkspaces.fingerprint(lesson.id), next);

test('one transaction prepares a draft page, private teaching plan and linked activity', () => {
  const saved = apply();
  assert.equal(saved.lesson.status, 'draft');
  assert.equal(saved.lesson.title, 'دورة الماء 1');
  assert.equal(repos.activities.get(saved.activityId).lessonId, lesson.id);
  assert.equal(repos.activities.get(saved.activityId).status, 'draft');
  assert.deepEqual(repos.lessonWorkspaces.get(lesson.id).preparation, material().preparation);
  assert.equal(repos.lessonWorkspaces.undoToken(lesson.id), saved.undoToken);
  assert.doesNotMatch(JSON.stringify(saved.lesson), /خطة خاصة|مفتاح إجابة/);
  repos.lessonWorkspaces.setPublished(lesson.id, true);
  assert.equal(repos.activities.get(saved.activityId).status, 'published');
  assert.doesNotMatch(
    JSON.stringify(repos.lessons.findPublished(lesson.id, lesson.classId)),
    /خطة خاصة|مفتاح إجابة/,
  );
  assert.equal(repos.lessonWorkspaces.undoToken(lesson.id), null, 'publishing ends undo revision');
});

test('undo restores the original material and removes only the generated activity', () => {
  const unrelated = repos.activities.create({ classId: lesson.classId, title: 'نشاط مستقل' });
  const saved = apply();
  repos = createRepositories(handle); // The token is persisted, independent of repository instances.
  assert.equal(repos.lessonWorkspaces.undoToken(lesson.id), saved.undoToken);
  repos.lessonWorkspaces.undo(lesson.id, saved.undoToken);
  assert.equal(repos.lessons.get(lesson.id).title, 'الماء');
  assert.deepEqual(repos.lessons.get(lesson.id).blocks, [
    { type: 'paragraph', text: 'المادة الأصلية' },
  ]);
  assert.equal(repos.lessonWorkspaces.get(lesson.id), null);
  assert.deepEqual(
    repos.activities.listByClass(lesson.classId).map((row) => row.id),
    [unrelated.id],
  );
});

test('regeneration reuses an unanswered activity and undo restores its exact questions', () => {
  const first = apply();
  repos.activities.setStudentAiEnabled(first.activityId, true);
  const before = repos.activities.questions(first.activityId);
  const second = apply(material('2'));
  assert.equal(second.activityId, first.activityId);
  assert.equal(repos.activities.listByClass(lesson.classId).length, 1);
  repos.lessonWorkspaces.undo(lesson.id, second.undoToken);
  assert.deepEqual(repos.activities.questions(first.activityId), before);
  assert.equal(repos.activities.get(first.activityId).studentAiEnabled, true);
  assert.equal(repos.lessonWorkspaces.get(lesson.id).preparation.overview, 'خطة خاصة بالمعلم 1');
});

test('regeneration of a published page preserves publication for page and activity', () => {
  repos.lessons.setPublished(lesson.id, true);
  const first = apply();
  const second = apply(material('2'));
  assert.equal(second.lesson.status, 'published');
  assert.equal(repos.activities.get(second.activityId).status, 'published');
  repos.lessonWorkspaces.undo(lesson.id, second.undoToken);
  assert.equal(repos.lessons.get(lesson.id).status, 'published');
  assert.equal(repos.activities.get(first.activityId).status, 'published');
});

test('student submissions and grades survive regeneration; undo cannot discard new submissions', () => {
  const first = apply();
  const student = repos.students.add({ classId: lesson.classId, name: 'طالب التجربة' });
  handle.sqlite
    .prepare(
      'INSERT INTO submissions (id, activity_id, student_id, submitted_at, score) VALUES (?, ?, ?, ?, ?)',
    )
    .run('submission-original', first.activityId, student.id, Date.now(), 1);
  const questions = repos.activities.questions(first.activityId);
  assert.equal(repos.lessonWorkspaces.undoToken(lesson.id), null);
  assert.throws(() => repos.lessonWorkspaces.undo(lesson.id, first.undoToken), /إجابات طلاب/);
  const second = apply(material('2'));
  assert.notEqual(second.activityId, first.activityId);
  assert.deepEqual(repos.activities.questions(first.activityId), questions);
  assert.equal(repos.submissions.find(first.activityId, student.id).score, 1);
  repos.lessonWorkspaces.undo(lesson.id, second.undoToken);
  assert.equal(repos.lessonWorkspaces.get(lesson.id).activityId, first.activityId);
  assert.deepEqual(repos.activities.questions(first.activityId), questions);
  assert.equal(repos.submissions.find(first.activityId, student.id).score, 1);
});

test('optimistic conflict preserves a manual edit and creates no orphan activity', () => {
  const expected = repos.lessonWorkspaces.fingerprint(lesson.id);
  repos.lessons.update(lesson.id, { title: 'تعديل أثناء التجهيز' });
  assert.throws(() => repos.lessonWorkspaces.apply(lesson.id, expected, material()), /تغيّر الدرس/);
  assert.equal(repos.lessons.get(lesson.id).title, 'تعديل أثناء التجهيز');
  assert.equal(repos.activities.listByClass(lesson.classId).length, 0);
});

test('activity edits invalidate pending composition and undo', () => {
  const first = apply();
  const expected = repos.lessonWorkspaces.fingerprint(lesson.id);
  repos.activities.update(first.activityId, { title: 'تعديل النشاط' });
  assert.throws(
    () => repos.lessonWorkspaces.apply(lesson.id, expected, material('2')),
    /تغيّر الدرس/,
  );
  assert.throws(
    () => repos.lessonWorkspaces.undo(lesson.id, first.undoToken),
    /تغيّر الدرس أو النشاط/,
  );
  assert.equal(repos.lessonWorkspaces.undoToken(lesson.id), null);
  assert.equal(repos.activities.get(first.activityId).title, 'تعديل النشاط');
});

test('moving a generated activity keeps the lesson readable and preserves the moved activity', () => {
  const first = apply();
  const other = repos.lessons.create({ classId: lesson.classId, title: 'درس آخر' });
  repos.activities.update(first.activityId, { lessonId: other.id });
  assert.equal(repos.lessonWorkspaces.undoToken(lesson.id), null);
  assert.equal(repos.lessonWorkspaces.get(lesson.id).activityId, null);
  assert.equal(repos.lessonWorkspaces.get(lesson.id).preparation.overview, 'خطة خاصة بالمعلم 1');
  assert.throws(
    () => repos.lessonWorkspaces.undo(lesson.id, first.undoToken),
    /تغيّر الدرس أو النشاط/,
  );
  const next = apply(material('2'));
  assert.notEqual(next.activityId, first.activityId);
  assert.equal(repos.activities.get(first.activityId).lessonId, other.id);
  repos.lessonWorkspaces.undo(lesson.id, next.undoToken);
  assert.equal(repos.activities.get(first.activityId).lessonId, other.id);
});

test('a late write failure rolls back page, activity, questions and private preparation', () => {
  const first = apply();
  const before = repos.lessonWorkspaces.fingerprint(lesson.id);
  handle.sqlite.exec(
    "CREATE TRIGGER reject_preparation BEFORE UPDATE ON lesson_workspaces BEGIN SELECT RAISE(ABORT, 'injected write failure'); END",
  );
  assert.throws(() => apply(material('2')), /injected write failure/);
  assert.equal(repos.lessonWorkspaces.fingerprint(lesson.id), before);
  assert.equal(repos.lessonWorkspaces.undoToken(lesson.id), first.undoToken);
  assert.equal(repos.activities.questions(first.activityId)[0].expectedAnswer, 'مفتاح إجابة خاص 1');
});

test('invalid questions never partially save or publish a generated activity', () => {
  const invalid = material();
  invalid.activity.questions[0].prompt = '';
  assert.throws(() => apply(invalid), /فارغ/);
  assert.equal(repos.activities.listByClass(lesson.classId).length, 0);
  const first = apply();
  repos.activities.replaceQuestions(first.activityId, []);
  assert.throws(() => repos.lessonWorkspaces.setPublished(lesson.id, true), /بلا أسئلة/);
  assert.equal(repos.lessons.get(lesson.id).status, 'draft');
  assert.equal(repos.activities.get(first.activityId).status, 'draft');
});

test('an outer transaction failure also rolls back an otherwise valid generated page', () => {
  assert.throws(
    () =>
      repos.transaction(() => {
        apply();
        throw new Error('usage write failed');
      }),
    /usage write failed/,
  );
  assert.equal(repos.lessons.get(lesson.id).title, 'الماء');
  assert.equal(repos.lessonWorkspaces.get(lesson.id), null);
  assert.equal(repos.activities.listByClass(lesson.classId).length, 0);
});
