import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, createRepositories } from '../dist/index.js';

/**
 * إجابة الطالب لا تُمسّ بحفظ المعلم — انحدارٌ وقع فعلاً.
 *
 * `answers.option_id` مرتبط بالخيارات بـ`on delete set null`، وكان الحفظ
 * يحذف خيارات السؤال كلها ثم يعيد إدراجها. فكل حفظٍ لنشاطٍ منشور — ولو بلا
 * تغيير — كان **يُفرّغ اختيار كل طالب** بصمت، وإيصالُ الطالب يقول له إن
 * إجابته محفوظة.
 *
 * وهذا الملفّ يحرس الوعد لا التنفيذ: مهما تغيّرت طريقة الحفظ، ما أرسله
 * الطالب يبقى.
 */

let dir;
let handle;
let repos;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cubecroom-answers-'));
  handle = openDatabase({ file: join(dir, 'test.sqlite') });
  repos = createRepositories(handle);
});

afterEach(async () => {
  handle.close();
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

function seeded() {
  const cls = repos.classes.create({ name: 'الصف السادس' });
  const activity = repos.activities.create({ classId: cls.id, title: 'اختبار قصير' });
  const questions = [
    {
      id: 'q1',
      type: 'choice',
      prompt: 'ما سبب المطر؟',
      points: 1,
      expectedAnswer: null,
      options: [
        { id: 'o1', text: 'تكاثف بخار الماء', isCorrect: true },
        { id: 'o2', text: 'دوران الأرض', isCorrect: false },
      ],
    },
  ];
  repos.activities.replaceQuestions(activity.id, questions);
  repos.activities.setPublished(activity.id, true);

  const student = repos.students.add({ classId: cls.id, name: 'ريم عبدالله' });
  const receipt = repos.submissions.submit({
    activityId: activity.id,
    studentId: student.id,
    answers: [{ type: 'choice', questionId: 'q1', optionId: 'o1' }],
  });
  return { cls, activity, questions, receipt };
}

const chosen = (submissionId) =>
  repos.submissions.answersFor(submissionId).find((row) => row.questionId === 'q1')?.optionId;

describe('حفظ المعلم لا يمسّ ما أرسله الطالب', () => {
  test('حفظٌ بلا تغيير أصلاً يُبقي اختيار الطالب', () => {
    const { activity, questions, receipt } = seeded();
    assert.equal(chosen(receipt.submission.id), 'o1');

    repos.activities.replaceQuestions(activity.id, questions);

    assert.equal(chosen(receipt.submission.id), 'o1', 'ضاع اختيار الطالب بحفظٍ لم يغيّر شيئاً');
  });

  test('وتصحيح حرفٍ في خيارٍ آخر لا يمسّ ما اختاره', () => {
    const { activity, questions, receipt } = seeded();
    const edited = [
      {
        ...questions[0],
        options: [
          questions[0].options[0],
          { id: 'o2', text: 'دوران الأرض حول نفسها', isCorrect: false },
        ],
      },
    ];

    repos.activities.replaceQuestions(activity.id, edited);

    assert.equal(chosen(receipt.submission.id), 'o1');
  });

  test('وإضافة خيار ثالث لا تمسّ الإجابات القائمة', () => {
    const { activity, questions, receipt } = seeded();
    const edited = [
      {
        ...questions[0],
        options: [
          ...questions[0].options,
          { id: 'o3', text: 'ارتفاع الضغط', isCorrect: false },
        ],
      },
    ];

    repos.activities.replaceQuestions(activity.id, edited);

    assert.equal(chosen(receipt.submission.id), 'o1');
  });

  /*
   * الحالة المقابلة: خيارٌ حذفه المعلم قصداً **يجب** أن يُفرّغ ما أشار إليه —
   * الخيار لم يعد موجوداً، والإبقاء على إشارةٍ إلى محذوف كذبٌ في البيانات.
   */
  test('أمّا حذف الخيار الذي اختاره الطالب فيُفرّغه — وذلك صواب', () => {
    const { activity, questions, receipt } = seeded();
    const edited = [
      {
        ...questions[0],
        options: [{ id: 'o2', text: 'دوران الأرض', isCorrect: false }],
      },
    ];

    repos.activities.replaceQuestions(activity.id, edited);

    assert.equal(chosen(receipt.submission.id), null);
  });

  test('وإجابة السؤال النصّي لا يمسّها الحفظ', () => {
    const cls = repos.classes.create({ name: 'الصف الخامس' });
    const activity = repos.activities.create({ classId: cls.id, title: 'سؤال نصّي' });
    const questions = [
      { id: 'q9', type: 'text', prompt: 'اشرح دورة الماء.', points: 1, expectedAnswer: 'التبخر ثم التكاثف', options: [] },
    ];
    repos.activities.replaceQuestions(activity.id, questions);
    repos.activities.setPublished(activity.id, true);

    const student = repos.students.add({ classId: cls.id, name: 'سارة' });
    const receipt = repos.submissions.submit({
      activityId: activity.id,
      studentId: student.id,
      answers: [{ type: 'text', questionId: 'q9', text: 'الماء يتبخر ثم يتكاثف' }],
    });

    repos.activities.replaceQuestions(activity.id, questions);

    const row = repos.submissions.answersFor(receipt.submission.id).find((one) => one.questionId === 'q9');
    assert.equal(row.text, 'الماء يتبخر ثم يتكاثف');
  });
});
