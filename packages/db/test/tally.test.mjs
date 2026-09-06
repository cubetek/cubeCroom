import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, createRepositories } from '../dist/index.js';

/**
 * تجميع الخيارات المختارة في نشاط اختيار — ما يُري المعلم أكثر خطأ متكرر
 * فيعالج الوهم مرّةً واحدة لا ثلاثين.
 */

let handle;
let repos;
let dir;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cubecroom-tally-'));
  handle = openDatabase({ file: join(dir, 'test.sqlite') });
  repos = createRepositories(handle);
});

afterEach(async () => {
  handle.close();
  // كما في بقية الاختبارات: ويندوز يحرّر مقابض -wal و -shm بعد الإغلاق بلحظة.
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

/** سؤال اختيار بأربعة خيارات، الصحيح منها بالحرف المُمرَّر. */
const choice = (id, correct, texts = ['أ', 'ب', 'ج', 'د']) => ({
  id,
  type: 'choice',
  prompt: `سؤال ${id}`,
  points: 1,
  expectedAnswer: null,
  options: ['a', 'b', 'c', 'd'].map((letter, at) => ({
    id: `${id}-${letter}`,
    text: texts[at],
    isCorrect: letter === correct,
  })),
});

const text = (id) => ({
  id,
  type: 'text',
  prompt: `اشرح ${id}`,
  points: 1,
  expectedAnswer: null,
  options: [],
});

const roster = (classId, size) =>
  Array.from({ length: size }, (_, at) =>
    repos.students.add({ classId, name: `طالب ${at + 1}` }),
  );

/** يوزّع الطلاب على الخيارات: `[['q1-c', 12], ...]` — اثنا عشر اختاروا «ج». */
const answerWith = (activityId, students, plan) => {
  let at = 0;
  for (const [optionId, howMany] of plan) {
    const questionId = optionId.slice(0, optionId.lastIndexOf('-'));
    for (let i = 0; i < howMany; i += 1) {
      repos.submissions.submit({
        activityId,
        studentId: students[at].id,
        answers: [{ type: 'choice', questionId, optionId }],
      });
      at += 1;
    }
  }
};

const build = (questions, { students = 0 } = {}) => {
  const cls = repos.classes.create({ name: 'الصف السادس — علوم' });
  const lesson = repos.lessons.create({ classId: cls.id, title: 'دورة الماء في الطبيعة' });
  const activity = repos.activities.create({
    classId: cls.id,
    title: 'سؤال قصير: مراحل دورة الماء',
    lessonId: lesson.id,
  });
  repos.activities.replaceQuestions(activity.id, questions);
  return { cls, activity, students: roster(cls.id, students) };
};

describe('تجميع الاختيارات — أكثر خطأ متكرر', () => {
  test('أكثر خيار خاطئ يُلتقط من بين ثلاثين إجابة', () => {
    const { activity, students } = build([choice('q1', 'b')], { students: 30 });
    answerWith(activity.id, students, [
      ['q1-a', 10],
      ['q1-b', 8],
      ['q1-c', 12],
    ]);

    const breakdown = repos.submissions.choiceBreakdown(activity.id);
    assert.equal(breakdown.submitted, 30);
    assert.equal(breakdown.staleAnswers, 0);
    assert.equal(breakdown.questions.length, 1);

    const [question] = breakdown.questions;
    assert.equal(question.questionId, 'q1');
    assert.equal(question.answered, 30);
    assert.equal(question.correctCount, 8);
    assert.equal(question.topWrong.optionId, 'q1-c', 'الأكثر تكراراً لا الأول ترتيباً');
    assert.equal(question.topWrong.picked, 12);
    assert.equal(question.topWrong.isCorrect, false);
  });

  /**
   * «لم يختر أحدٌ الصحيح» خبرٌ يبني عليه المعلم درسه، وإسقاطُ الخيار الذي لم
   * يختره أحد من العرض يخفيه عنه.
   */
  test('الخيار الذي لم يخترْه أحد يظهر بصفر — ولو كان هو الصحيح', () => {
    const { activity, students } = build([choice('q1', 'd')], { students: 6 });
    answerWith(activity.id, students, [
      ['q1-a', 4],
      ['q1-b', 2],
    ]);

    const [question] = repos.submissions.choiceBreakdown(activity.id).questions;
    assert.equal(question.options.length, 4, 'الخيارات الأربعة كلّها');
    assert.equal(question.correctCount, 0, 'لم يختر أحدٌ الصحيح');

    const correct = question.options.find((option) => option.isCorrect);
    assert.equal(correct.optionId, 'q1-d');
    assert.equal(correct.picked, 0, 'يظهر بصفر لا يغيب');
    assert.equal(
      question.options.find((option) => option.optionId === 'q1-c').picked,
      0,
      'والخيار الخاطئ المهجور كذلك',
    );
  });

  test('نشاط بلا تسليمات يعيد أسئلته كاملةً بأصفارها', () => {
    const { activity } = build([choice('q1', 'b')]);

    const breakdown = repos.submissions.choiceBreakdown(activity.id);
    assert.equal(breakdown.submitted, 0);
    assert.equal(breakdown.questions.length, 1);
    assert.equal(breakdown.questions[0].answered, 0);
    assert.deepEqual(
      breakdown.questions[0].options.map((option) => option.picked),
      [0, 0, 0, 0],
    );
    assert.equal(breakdown.questions[0].topWrong, null, 'لا خطأ متكرر — لا خطأ أصلاً');
  });

  test('حين يصيب الجميع لا يُختلق خطأ شائع', () => {
    const { activity, students } = build([choice('q1', 'b')], { students: 5 });
    answerWith(activity.id, students, [['q1-b', 5]]);

    const [question] = repos.submissions.choiceBreakdown(activity.id).questions;
    assert.equal(question.correctCount, 5);
    assert.equal(question.topWrong, null, 'صفرٌ لكل الخيارات الخاطئة ليس «أكثرها»');
  });

  /** الاستقرار مقصود: لوحٌ يتبدّل بين نداءين يُوهم المعلم أن الصورة تغيّرت. */
  test('عند التساوي يفوز الأسبق ترتيباً، والنتيجة نفسها في كل نداء', () => {
    const { activity, students } = build([choice('q1', 'b')], { students: 6 });
    answerWith(activity.id, students, [
      ['q1-a', 3],
      ['q1-c', 3],
    ]);

    const first = repos.submissions.choiceBreakdown(activity.id).questions[0];
    const second = repos.submissions.choiceBreakdown(activity.id).questions[0];
    assert.equal(first.topWrong.optionId, 'q1-a', 'ترتيب الخيارات هو الفاصل');
    assert.equal(first.topWrong.picked, 3);
    assert.deepEqual(second.topWrong, first.topWrong);
  });

  test('السؤال النصّيّ لا يدخل التجميع ولا إجابته', () => {
    const { activity, students } = build([choice('q1', 'b'), text('q2')], { students: 3 });
    for (const student of students) {
      repos.submissions.submit({
        activityId: activity.id,
        studentId: student.id,
        answers: [
          { type: 'choice', questionId: 'q1', optionId: 'q1-a' },
          { type: 'text', questionId: 'q2', text: 'التبخّر ثم التكاثف' },
        ],
      });
    }

    const breakdown = repos.submissions.choiceBreakdown(activity.id);
    assert.deepEqual(
      breakdown.questions.map((question) => question.questionId),
      ['q1'],
      'أسئلة الاختيار وحدها',
    );
    assert.equal(
      breakdown.staleAnswers,
      0,
      'الإجابة النصّية بلا خيار بطبيعتها — ليست إجابةً فقدت خيارها',
    );
    assert.equal(breakdown.questions[0].topWrong.picked, 3);
  });
});

/*
 * الحصر في الاستعلام لا في JavaScript.
 *
 * `answers` أكبر جداول القاعدة (طلاب × أسئلة)، ولا فهرس على `questionId`. فما
 * يُفحص هنا أن إجابات نشاطٍ آخر **لا تدخل الحساب** — وأن الطالب نفسه الذي سلّم
 * النشاطين لا يخلط بينهما.
 */
describe('تجميع الاختيارات محصورٌ بنشاطه', () => {
  test('تسليمات نشاط آخر — للطلاب أنفسهم — لا تظهر في الحساب', () => {
    const cls = repos.classes.create({ name: 'الصف السادس — علوم' });
    const here = repos.activities.create({ classId: cls.id, title: 'نشاط الماء' });
    const there = repos.activities.create({ classId: cls.id, title: 'نشاط الكسور' });
    repos.activities.replaceQuestions(here.id, [choice('q1', 'b')]);
    repos.activities.replaceQuestions(there.id, [choice('x1', 'b')]);
    const students = roster(cls.id, 10);

    answerWith(here.id, students, [
      ['q1-a', 3],
      ['q1-b', 7],
    ]);
    // الطلاب العشرة أنفسهم يسلّمون النشاط الثاني كلُّهم بخيار خاطئ.
    answerWith(there.id, students, [['x1-c', 10]]);

    const breakdown = repos.submissions.choiceBreakdown(here.id);
    assert.equal(breakdown.submitted, 10, 'تسليمات هذا النشاط لا عشرون');
    assert.deepEqual(
      breakdown.questions.map((question) => question.questionId),
      ['q1'],
      'سؤال النشاط الآخر لا يظهر',
    );
    assert.equal(breakdown.questions[0].answered, 10);
    assert.equal(breakdown.questions[0].correctCount, 7);
    assert.equal(breakdown.questions[0].topWrong.optionId, 'q1-a');
    assert.equal(breakdown.questions[0].topWrong.picked, 3, 'لا يتسرّب إليه عشرة النشاط الآخر');

    // والنشاط الآخر يقرأ نفسه كاملاً غير منقوص.
    const other = repos.submissions.choiceBreakdown(there.id);
    assert.equal(other.questions[0].topWrong.optionId, 'x1-c');
    assert.equal(other.questions[0].topWrong.picked, 10);
    assert.equal(other.questions[0].correctCount, 0);
  });

  test('نشاطٌ بلا أسئلة اختيار لا يعيد شيئاً', () => {
    const { activity } = build([text('q1')]);
    assert.deepEqual(repos.submissions.choiceBreakdown(activity.id).questions, []);
  });
});

/*
 * خيارٌ **يحذفه المعلم** يُفرّغ `answers.optionId` بـ`on delete set null`، وذلك
 * صواب: الخيار لم يعد موجوداً. ولو طُويت تلك الإجابات في الصفر لقال اللوح
 * للمعلم بثقة «لا أخطاء شائعة» عن إجاباتٍ فُقدت لا عن إجاباتٍ صحّت.
 *
 * وكان هذا يقع عند **أيّ** حفظ — ولو بلا تغيير — لأن الخيارات كانت تُستبدل
 * كاملةً. أُصلح ذلك في `replaceQuestions`، ويحرسه `answer-safety.test.mjs`.
 * فلم يبقَ التفريغ إلا لحذفٍ قصده المعلم — وهو ما يُفحص هنا.
 */
describe('الإجابات التي فقدت خيارها بحذف المعلم إياه', () => {
  test('تُعدّ وتُقال، ولا تُطوى في الصفر', () => {
    const { activity, students } = build([choice('q1', 'b')], { students: 8 });
    answerWith(activity.id, students, [
      ['q1-a', 5],
      ['q1-b', 3],
    ]);
    assert.equal(repos.submissions.choiceBreakdown(activity.id).questions[0].answered, 8);

    // المعلم يحذف الخيارين اللذين اختارهما الطلاب ويُبقي غيرهما.
    repos.activities.replaceQuestions(activity.id, [
      {
        id: 'q1',
        type: 'choice',
        prompt: 'سؤال ١',
        points: 1,
        expectedAnswer: null,
        options: [
          { id: 'q1-c', text: 'ج', isCorrect: true },
          { id: 'q1-d', text: 'د', isCorrect: false },
        ],
      },
    ]);

    const breakdown = repos.submissions.choiceBreakdown(activity.id);
    assert.equal(breakdown.submitted, 8, 'التسليمات باقية');
    assert.equal(breakdown.staleAnswers, 8, 'الثماني إجابات فقدت خيارها — تُقال ولا تُبتلع');
    assert.equal(breakdown.questions[0].answered, 0);
    assert.equal(
      breakdown.questions[0].topWrong,
      null,
      'ولا يُختلق خطأ شائع من إجاباتٍ لم تعد مقروءة',
    );
  });
});
