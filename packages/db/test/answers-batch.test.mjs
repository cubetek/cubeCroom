import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, createRepositories } from '../dist/index.js';

/**
 * `answersByActivity` — قراءة إجابات الفصل كلّه باستعلام واحد.
 *
 * التصدير كان يناديه `answersFor` داخل حلقةٍ على الطلاب: استعلامٌ لكل طالب.
 * وتبديل ذلك بقراءةٍ واحدة تبديلٌ في **الأداء وحده**، فما يقيسه هذا الملفّ
 * ليس السرعة بل أن النتيجة لم تتغيّر: ما يقرؤه المجمَّع هو حرفياً ما كان
 * يقرؤه المفرَّق — وإلا خرج في ملفّ المعلم صفٌّ ناقص لا يشكو منه شيء.
 */

let handle;
let repos;
let dir;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cubecroom-answers-'));
  handle = openDatabase({ file: join(dir, 'test.sqlite') });
  repos = createRepositories(handle);
});

afterEach(async () => {
  handle.close();
  // كما في بقية الاختبارات: ويندوز يحرّر مقابض -wal و -shm بعد الإغلاق بلحظة.
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

const choice = (id) => ({
  id,
  type: 'choice',
  prompt: `سؤال ${id}`,
  points: 1,
  expectedAnswer: null,
  options: ['a', 'b'].map((letter) => ({
    id: `${id}-${letter}`,
    text: letter === 'a' ? 'أ' : 'ب',
    isCorrect: letter === 'a',
  })),
});

const written = (id) => ({
  id,
  type: 'text',
  prompt: `اشرح ${id}`,
  points: 1,
  expectedAnswer: null,
  options: [],
});

function build(title, questions) {
  const cls = repos.classes.create({ name: `الصف السادس — ${title}` });
  const activity = repos.activities.create({ classId: cls.id, title });
  repos.activities.replaceQuestions(activity.id, questions);
  return { cls, activity };
}

/** ترتيبٌ مستقرّ ليُقارَن المجمَّع بالمفرَّق بلا أن يفرّقهما ترتيب السطور. */
const sorted = (rows) => [...rows].sort((one, two) => one.id.localeCompare(two.id));

describe('إجابات النشاط دفعةً واحدة', () => {
  test('ما يعطيه المجمَّع هو ما يعطيه المفرَّق — لكل تسليم في فصلٍ كامل', () => {
    const { cls, activity } = build('دورة الماء', [choice('q1'), written('q2')]);

    const students = Array.from({ length: 30 }, (_, at) =>
      repos.students.add({ classId: cls.id, name: `طالب ${at + 1}` }),
    );

    const submissionIds = students.map(
      (student, at) =>
        repos.submissions.submit({
          activityId: activity.id,
          studentId: student.id,
          answers: [
            { type: 'choice', questionId: 'q1', optionId: at % 2 === 0 ? 'q1-a' : 'q1-b' },
            { type: 'text', questionId: 'q2', text: `جواب الطالب ${at + 1}` },
          ],
        }).submission.id,
    );

    const grouped = repos.submissions.answersByActivity(activity.id);

    assert.equal(grouped.size, submissionIds.length, 'كل تسليم له مدخله في الخريطة');
    for (const id of submissionIds) {
      assert.deepEqual(
        sorted(grouped.get(id) ?? []),
        sorted(repos.submissions.answersFor(id)),
        `إجابات التسليم ${id} تطابق ما يقرؤه النداء المفرَّق`,
      );
    }
  });

  test('لا تتسرّب إجابات نشاطٍ آخر إلى خريطة هذا النشاط', () => {
    // معرّفات الأسئلة مفتاحٌ أساسيّ في القاعدة كلها، لا داخل نشاطها وحده.
    const here = build('دورة الماء', [written('water-q1')]);
    const there = build('الكسور', [written('fractions-q1')]);

    const student = repos.students.add({ classId: here.cls.id, name: 'سارة' });
    const other = repos.students.add({ classId: there.cls.id, name: 'ليان' });

    const mine = repos.submissions.submit({
      activityId: here.activity.id,
      studentId: student.id,
      answers: [{ type: 'text', questionId: 'water-q1', text: 'التبخّر ثم التكاثف' }],
    }).submission.id;

    repos.submissions.submit({
      activityId: there.activity.id,
      studentId: other.id,
      answers: [{ type: 'text', questionId: 'fractions-q1', text: 'البسط والمقام' }],
    });

    const grouped = repos.submissions.answersByActivity(here.activity.id);
    assert.deepEqual([...grouped.keys()], [mine]);
    assert.equal(grouped.get(mine)?.[0]?.text, 'التبخّر ثم التكاثف');
  });

  test('نشاطٌ بلا تسليمات يعطي خريطة فارغة لا خطأً', () => {
    const { activity } = build('لم يُسلَّم بعد', [written('pending-q1')]);
    assert.equal(repos.submissions.answersByActivity(activity.id).size, 0);
  });
});
