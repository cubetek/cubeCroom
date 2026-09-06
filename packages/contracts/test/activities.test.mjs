import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  activityKind,
  answerDraftSchema,
  readableAnswers,
  publishBlockers,
  studentActivitySchema,
  toStudentActivity,
  validate,
} from '../dist/index.js';

/**
 * معيار إنجاز P5-1: «معاينة ما يراه الطالب بلا مفتاح الإجابة».
 *
 * الاختبار لا يفحص شاشةً ترسم أو لا ترسم علامة الصواب — يفحص **البيانات
 * نفسها**: ما يخرج من `toStudentActivity` هو ما يصل جهاز الطالب، فإن لم يكن
 * المفتاح فيه لم يصله بأي طريق.
 */

const activity = {
  id: 'act-1',
  title: 'اختبار قصير: الكائنات الحية',
  questions: [
    {
      type: 'choice',
      id: 'q1',
      prompt: 'أيّ ممّا يلي يُعدّ من خصائص الكائنات الحية؟',
      points: 1,
      options: [
        { id: 'o1', text: 'أن يكون له لون ثابت', isCorrect: false },
        { id: 'o2', text: 'أن ينمو ويتكاثر', isCorrect: true },
        { id: 'o3', text: 'أن يكون صلباً', isCorrect: false },
      ],
    },
    {
      type: 'text',
      id: 'q2',
      prompt: 'اذكر مرحلتين من مراحل دورة الماء.',
      points: 2,
      expectedAnswer: 'التبخّر ثم التكاثف',
    },
  ],
};

describe('منظور الطالب من النشاط', () => {
  test('مفتاح الإجابة لا يظهر في أي موضع من الناتج', () => {
    const serialized = JSON.stringify(toStudentActivity(activity));

    assert.equal(serialized.includes('isCorrect'), false, 'لا حقل للإجابة الصحيحة');
    assert.equal(serialized.includes('expectedAnswer'), false, 'لا إجابة متوقَّعة');
    assert.equal(
      serialized.includes('التبخّر ثم التكاثف'),
      false,
      'ولا نصّ الإجابة المتوقَّعة نفسه',
    );
  });

  test('الخيار عند الطالب معرّفٌ ونصّ فقط — لا ثالث لهما', () => {
    const student = toStudentActivity(activity);
    const [first] = student.questions;

    assert.equal(first.type, 'choice');
    assert.deepEqual(Object.keys(first.options[0]).sort(), ['id', 'text']);
  });

  test('السؤال ونصّه وترتيبه يصل كما هو — الإخفاء يخصّ المفتاح وحده', () => {
    const student = toStudentActivity(activity);

    assert.equal(student.questions.length, 2);
    assert.equal(student.questions[0].prompt, activity.questions[0].prompt);
    assert.equal(student.questions[0].options.length, 3);
    assert.equal(student.questions[1].type, 'text');
  });

  test('الناتج يطابق مخطط الطالب — والمخطط لا يقبل حقلاً زائداً بمفتاح', () => {
    assert.equal(validate(studentActivitySchema, toStudentActivity(activity)).ok, true);

    const leaked = toStudentActivity(activity);
    leaked.questions[0].options[0].isCorrect = true;
    const parsed = validate(studentActivitySchema, leaked);
    assert.equal(parsed.ok, true, 'zod يُسقط الزائد لا يرفضه');
    assert.equal(
      JSON.stringify(parsed.value).includes('isCorrect'),
      false,
      'والحقل المدسوس لا يعبر المخطط',
    );
  });
});

describe('ما يمنع النشر', () => {
  test('النشاط المكتمل لا مانع له', () => {
    assert.deepEqual(publishBlockers(activity), []);
  });

  test('النشاط بلا أسئلة يُمنع', () => {
    assert.deepEqual(publishBlockers({ title: 'نشاط', questions: [] }), ['النشاط بلا أسئلة.']);
  });

  test('سؤال اختيار بلا إجابة معلَّمة يُمنع — لأن تصحيحه مستحيل', () => {
    const problems = publishBlockers({
      title: 'نشاط',
      questions: [
        {
          type: 'choice',
          id: 'q1',
          prompt: 'سؤال',
          points: 1,
          options: [
            { id: 'a', text: 'أ', isCorrect: false },
            { id: 'b', text: 'ب', isCorrect: false },
          ],
        },
      ],
    });
    assert.deepEqual(problems, ['السؤال 1: لم تُعلَّم الإجابة الصحيحة.']);
  });

  test('الخيار الفارغ لا يُحتسب خياراً', () => {
    const problems = publishBlockers({
      title: 'نشاط',
      questions: [
        {
          type: 'choice',
          id: 'q1',
          prompt: 'سؤال',
          points: 1,
          options: [
            { id: 'a', text: 'أ', isCorrect: true },
            { id: 'b', text: '   ', isCorrect: false },
          ],
        },
      ],
    });
    assert.deepEqual(problems, ['السؤال 1: يحتاج خيارين على الأقل.']);
  });

  test('سؤال بلا نصّ يُمنع مهما اكتملت خياراته', () => {
    const problems = publishBlockers({
      title: 'نشاط',
      questions: [
        {
          type: 'text',
          id: 'q1',
          prompt: '  ',
          points: 1,
          expectedAnswer: null,
        },
      ],
    });
    assert.deepEqual(problems, ['السؤال 1: نصّ السؤال فارغ.']);
  });
});

describe('عمود النوع في T15', () => {
  test('المتجانس يُسمّى بنوعه', () => {
    assert.equal(activityKind({ choice: 3, text: 0 }), 'اختيار من متعدد');
    assert.equal(activityKind({ choice: 0, text: 2 }), 'إجابة قصيرة');
  });

  test('المختلط يُقال إنه مختلط — لا يُنسب إلى أحد نوعيه', () => {
    assert.equal(activityKind({ choice: 2, text: 1 }), 'مختلط');
  });

  test('بلا أسئلة ليس نوعاً فارغاً بل حالة تُقال', () => {
    assert.equal(activityKind({ choice: 0, text: 0 }), 'بلا أسئلة');
  });
});

describe('مسوّدة الطالب — P5-4', () => {
  const activity = {
    id: 'a1',
    title: 'اختبار',
    questions: [
      {
        type: 'choice',
        id: 'q1',
        prompt: 'أيّ المراحل تأتي بعد التبخّر؟',
        points: 1,
        options: [
          { id: 'o1', text: 'الجريان السطحي' },
          { id: 'o2', text: 'التكاثف' },
        ],
      },
      { type: 'text', id: 'q2', prompt: 'اذكر مرحلتين.', points: 2 },
    ],
  };

  test('المسوّدة السليمة تُقرأ', () => {
    const parsed = validate(answerDraftSchema, {
      answers: { q1: 'o2', q2: 'التبخّر' },
      savedAt: '2026-09-04T10:02:00.000Z',
    });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.value.answers.q1, 'o2');
  });

  test('شكل لا يُفهم يُرفض — ولا تسقط الصفحة على الطالب', () => {
    assert.equal(validate(answerDraftSchema, 'نصّ عابث').ok, false);
    assert.equal(validate(answerDraftSchema, { answers: 'ليست كائناً' }).ok, false);
    assert.equal(validate(answerDraftSchema, { answers: { q1: 5 }, savedAt: 'x' }).ok, false);
  });

  /** نصف معيار الإنجاز الذي يسهل نسيانه: محفوظة **وتظهر له**. */
  test('الإجابة المحفوظة تُعرض بنصّها لا بمعرّفها', () => {
    const readable = readableAnswers(activity, { q1: 'o2', q2: 'التبخّر ثم التكاثف' });

    assert.equal(readable.length, 2);
    assert.equal(readable[0].answer, 'التكاثف', 'الخيار بنصّه — لا "o2"');
    assert.equal(readable[0].prompt, 'أيّ المراحل تأتي بعد التبخّر؟');
    assert.equal(readable[1].answer, 'التبخّر ثم التكاثف');
  });

  test('السؤال غير المُجاب لا يُعرض إجابةً فارغة', () => {
    assert.deepEqual(readableAnswers(activity, { q2: '   ' }), []);
  });

  test('خيار لم يعد موجوداً — عدّل المعلم النشاط — يُسقَط ولا يُعرض معرّفه خاماً', () => {
    const readable = readableAnswers(activity, { q1: 'خيار-محذوف' });
    assert.deepEqual(readable, []);
  });

  test('الترتيب ترتيب الأسئلة لا ترتيب الكتابة', () => {
    const readable = readableAnswers(activity, { q2: 'إجابة', q1: 'o1' });
    assert.deepEqual(
      readable.map((entry) => entry.questionId),
      ['q1', 'q2'],
    );
  });
});
