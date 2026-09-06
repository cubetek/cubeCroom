import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANSWER_MATCH_THRESHOLD,
  NEGATION_PARTICLES,
  answerSimilarity,
  answerTokens,
  countNegations,
  groupAnswers,
  negationParity,
  normalizeAnswer,
} from '../dist/index.js';

/*
 * ما يُفحص هنا ليس «هل الدالّة تعيد رقماً» بل الحكم الذي يبني عليه المعلم
 * درجةً تنزل على أربعة عشر طفلاً دفعةً واحدة. ولذلك أوّل ما يُفحص هو الفخّ:
 * نصّان متطابقان إلا أداةَ نفي.
 */

/* ── الفخّ ───────────────────────────────────────────────────────────── */

test('النفي والإثبات لا يجتمعان — وإن تطابق كلّ ما عداهما', () => {
  const positive = 'الماء يتبخر بالحرارة';
  const negative = 'الماء لا يتبخر بالحرارة';

  assert.equal(answerSimilarity(positive, negative), 0);

  const clusters = groupAnswers([
    { id: 's1', text: positive },
    { id: 's2', text: negative },
  ]);
  assert.equal(clusters.length, 2);
});

/*
 * والصفر أعلاه ليس صفراً لأن المقياس متزمّت: الزيادةُ نفسها بكلمةٍ محايدة
 * تُبقي النصّين في عنقود واحد. الفرقُ أداةُ النفي وحدها.
 */
test('وزيادةُ كلمةٍ محايدة على النصّ نفسه لا تفرّقه', () => {
  const score = answerSimilarity('الماء يتبخر بالحرارة', 'الماء دائما يتبخر بالحرارة');
  assert.ok(score >= ANSWER_MATCH_THRESHOLD, `التشابه ${score}`);
});

test('وكلّ أداة نفي مذكورة تفعل ذلك، لا «لا» وحدها', () => {
  for (const particle of ['لا', 'ليس', 'لم', 'لن', 'ما', 'غير', 'بدون', 'عدا']) {
    const negated = `الماء ${particle} يتبخر بالحرارة`;
    assert.equal(
      answerSimilarity('الماء يتبخر بالحرارة', negated),
      0,
      `الأداة «${particle}» لم تمنع الضمّ`,
    );
  }
});

test('والأدوات الثمانية كلّها في القائمة المصدَّرة', () => {
  for (const particle of ['لا', 'ليس', 'لم', 'لن', 'ما', 'غير', 'بدون', 'عدا']) {
    assert.ok(NEGATION_PARTICLES.includes(particle), particle);
  }
});

/*
 * الأدوات تُقارَن بالرموز المطبَّعة مباشرةً. فلو كُتبت واحدةٌ منها بهمزةٍ أو
 * تشكيل لما طابقت شيئاً أبداً — وسقط الحارس في صمتٍ تامّ: لا خطأ، ولا فحص
 * أحمر، بل نفيٌ يُضمّ إلى إثبات.
 */
test('وكلُّ أداةٍ مكتوبةٌ بصورتها المطبَّعة — وإلا لما طابقت شيئاً', () => {
  for (const particle of NEGATION_PARTICLES) {
    assert.equal(normalizeAnswer(particle), particle, particle);
    assert.equal(countNegations(particle), 1, particle);
  }
});

/*
 * أشيعُ صورةٍ للنفي الثاني في جملة الطفل هي «ولا» — ملتصقةً بواو. والالتصاق
 * يُخفيها عن قائمةٍ تُقارن الرموز كما هي.
 */
test('وأداةُ النفي الملتصقة بواو أو فاء أو باء تُرى', () => {
  assert.equal(countNegations('يتبخر ولا يذوب'), 1);
  assert.equal(countNegations('يتبخر فلا يذوب'), 1);
  assert.equal(countNegations('يتبخر بلا حرارة'), 1);
  assert.equal(countNegations('وليس صحيحا'), 1);
});

test('ولا يُفصل حرفٌ عن كلمةٍ ليس باقيها أداةَ نفي', () => {
  assert.equal(normalizeAnswer('وجد'), 'وجد');
  assert.equal(normalizeAnswer('فهم'), 'فهم');
  assert.equal(normalizeAnswer('بيت'), 'بيت');
  assert.equal(countNegations('وجد الطالب بيت الحل'), 0);
});

/*
 * أداةُ النفي كلمةٌ شائعة قصيرة — وهي بالضبط شكلُ كلمة الوقف التي تُحذف.
 * فيُفحص بقاؤها في الرموز لا أثرُها في النتيجة فقط.
 */
test('وأداةُ النفي تبقى رمزاً ولا تُحذف مع حروف الرَّبط', () => {
  const tokens = answerTokens('الماء لا يتبخر في الغرفة');
  assert.ok(tokens.includes('لا'));
  assert.ok(!tokens.includes('في'), 'حرف الجرّ كان يجب أن يسقط');
});

/*
 * التكافؤ وحده لا يكفي: نفيان في جملة يعطيان تكافؤاً صفراً كالإثبات تماماً.
 * والبوّابة تساوي العدد، فتصمد حيث يسقط التكافؤ.
 */
test('ونفيٌ مزدوج لا يُقرأ إثباتاً — تساوي التكافؤ لا يكفي', () => {
  const twice = 'الماء لا يتبخر ولا يذوب';
  const plain = 'الماء يتبخر ويذوب';

  assert.equal(negationParity(twice), negationParity(plain));
  assert.equal(countNegations(twice), 2);
  assert.equal(answerSimilarity(twice, plain), 0);
});

test('ونفيان متقابلان يجتمعان — الحارس يمنع الخلط لا التجميع', () => {
  const clusters = groupAnswers([
    { id: 's1', text: 'الماء لا يتبخر بالحرارة' },
    { id: 's2', text: 'الماء لا يتبخر بالحراره' },
  ]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].negations, 1);
});

/* ── التطبيع ─────────────────────────────────────────────────────────── */

test('التشكيل والهمزات والتاء المربوطة تُطوى — بالمنطق المشترك لا بنسخة ثانية', () => {
  assert.equal(normalizeAnswer('الْمَاءُ'), normalizeAnswer('الماء'));
  assert.equal(normalizeAnswer('إجابة'), normalizeAnswer('اجابه'));
});

test('والترقيم العربي واللاتيني يسقط', () => {
  assert.equal(normalizeAnswer('الماء، يتبخر بالحرارة؟'), normalizeAnswer('الماء يتبخر بالحرارة'));
  assert.equal(normalizeAnswer('«التبخر»؛ نعم!'), normalizeAnswer('التبخر نعم'));
  assert.equal(normalizeAnswer('الحل: تبخر.'), normalizeAnswer('الحل تبخر'));
});

test('والأرقام العربية تصير لاتينية — بمحوّل الحزمة لا بنسخة رابعة', () => {
  assert.equal(normalizeAnswer('١٠٠ درجة'), normalizeAnswer('100 درجة'));
});

test('و«ال» التعريف تسقط فيلتقي «التبخر» و«تبخر»', () => {
  assert.equal(normalizeAnswer('التبخر'), 'تبخر');
  assert.equal(normalizeAnswer('الماء'), 'ماء');
});

/*
 * وقصُّ «ال» بلا شرطٍ يأكل كلماتٍ ليست معرَّفة، وأخطرُه أن يصنع أداةَ نفيٍ
 * من كلمةٍ ليست نفياً فينقلب الحارس على نفسه.
 */
test('ولا تسقط من كلمةٍ يفنيها قصُّها', () => {
  assert.equal(normalizeAnswer('ألم'), 'الم');
  assert.equal(normalizeAnswer('الله'), 'الله');
});

test('ولا تُصنَع أداةُ نفيٍ بقصِّ «ال»', () => {
  assert.equal(countNegations('الما'), 0);
});

test('والفراغ المتكرّر يُضغط', () => {
  assert.equal(normalizeAnswer('  الماء    يتبخر  '), 'ماء يتبخر');
  assert.equal(normalizeAnswer('   '), '');
});

/* ── التشابه ─────────────────────────────────────────────────────────── */

test('التشابه في المدى ٠..١ ومتماثل في الطرفين', () => {
  const pairs = [
    ['الماء يتبخر', 'الماء يتبخر بالحرارة'],
    ['التبخر', 'تبخر الماء'],
    ['لا أعرف', 'الإجابة هي التبخر'],
    ['', 'شيء'],
  ];
  for (const [a, b] of pairs) {
    const score = answerSimilarity(a, b);
    assert.ok(score >= 0 && score <= 1, `${a} / ${b} = ${score}`);
    assert.equal(score, answerSimilarity(b, a));
  }
});

test('والنصّ يشبه نفسه تماماً', () => {
  assert.equal(answerSimilarity('الماء يتبخر بالحرارة', 'الماء يتبخر بالحرارة'), 1);
});

test('وإجابتان فارغتان إجابةٌ واحدة، والفارغةُ لا تشبه المكتوبة', () => {
  assert.equal(answerSimilarity('', '؟؟'), 1);
  assert.equal(answerSimilarity('', 'التبخر'), 0);
});

test('وإجابتان لا تشتركان في شيء لا تجتمعان', () => {
  const score = answerSimilarity('التبخر بالحرارة', 'عاصمة مصر القاهرة');
  assert.ok(score < ANSWER_MATCH_THRESHOLD, `التشابه ${score}`);
});

/*
 * الطفل يكتب «تتبخر» و«يتبخرر»؛ وحرفٌ واحد ليس إجابةً أخرى. والتساهل مقصور
 * على الكلمات الطويلة: كلمتان قصيرتان بينهما حرفٌ مختلف كلمتان مختلفتان.
 */
test('وخطأٌ إملائيّ في كلمةٍ طويلة لا يفرّق إجابتين', () => {
  const score = answerSimilarity('الماء يتبخر بالحرارة', 'الماء تتبخر بالحرارة');
  assert.ok(score >= ANSWER_MATCH_THRESHOLD, `التشابه ${score}`);
});

/* حرف المضارعة أشيع فرقٍ بين إجابتين متطابقتين — ويقع على حدّ الأربعة. */
test('وحرفُ المضارعة وحده لا يفرّق إجابتين', () => {
  const score = answerSimilarity('تحول الماء الى بخار', 'يتحول الماء إلى بخار');
  assert.ok(score >= ANSWER_MATCH_THRESHOLD, `التشابه ${score}`);
});

/*
 * وهذا هو حدّ التساهل: كلمتان بينهما حرفٌ ولا شيء غيرهما ليستا كلمةً
 * وخطأها. «كبير» و«كثير» إجابتان، وضمُّهما يعطي إحداهما درجةَ الأخرى.
 */
test('ولا يقوم التقارب الإملائي وحده مقام الإجابة', () => {
  assert.equal(answerSimilarity('كبير', 'كثير'), 0);
  assert.equal(answerSimilarity('يزيد', 'يزيل'), 0);
  assert.equal(groupAnswers([
    { id: 'k1', text: 'كبير' },
    { id: 'k2', text: 'كثير' },
  ]).length, 2);
});

/* ── التجميع ─────────────────────────────────────────────────────────── */

const CLASS_ANSWERS = [
  { id: 'a1', text: 'الماء يتبخر بالحرارة' },
  { id: 'a2', text: 'الماء يتبخر بالحراره' },
  { id: 'a3', text: 'الماءُ يتبخّر بالحرارة.' },
  { id: 'a4', text: 'يتبخر الماء بالحرارة' },
  { id: 'a5', text: 'الماء لا يتبخر بالحرارة' },
  { id: 'a6', text: 'الماء لا يتبخر بالحراره' },
  { id: 'a7', text: 'التبخر' },
  { id: 'a8', text: 'تبخر' },
  { id: 'a9', text: '' },
  { id: 'a10', text: '؟' },
];

test('ثلاثون إجابة تصير عناقيد قليلة، والمعرّفات تعود إلى أصحابها', () => {
  const clusters = groupAnswers(CLASS_ANSWERS);
  assert.ok(clusters.length < CLASS_ANSWERS.length);

  const ids = clusters.flatMap((cluster) => cluster.ids);
  assert.equal(ids.length, CLASS_ANSWERS.length, 'ضاع أو تكرّر طالب');
  assert.deepEqual([...ids].sort(), CLASS_ANSWERS.map((entry) => entry.id).sort());

  for (const cluster of clusters) assert.equal(cluster.size, cluster.ids.length);
});

test('والمثبتون في عنقود والنافون في آخر — داخل الصفّ نفسه', () => {
  const clusters = groupAnswers(CLASS_ANSWERS);
  const of = (id) => clusters.find((cluster) => cluster.ids.includes(id));

  assert.equal(of('a1'), of('a2'));
  assert.equal(of('a1'), of('a3'));
  assert.equal(of('a5'), of('a6'));
  assert.notEqual(of('a1'), of('a5'), 'اجتمع النفي والإثبات في عنقود');
});

test('و«التبخر» تلتقي «تبخر»، والفارغتان تلتقيان', () => {
  const clusters = groupAnswers(CLASS_ANSWERS);
  const of = (id) => clusters.find((cluster) => cluster.ids.includes(id));
  assert.equal(of('a7'), of('a8'));
  assert.equal(of('a9'), of('a10'));
});

test('والأكبر أولاً، والتعادل بأوّل ظهور', () => {
  const clusters = groupAnswers(CLASS_ANSWERS);
  for (let i = 1; i < clusters.length; i += 1) {
    assert.ok(clusters[i - 1].size >= clusters[i].size, 'العناقيد ليست مرتّبة بالحجم');
  }

  const tie = groupAnswers([
    { id: 'x', text: 'التبخر' },
    { id: 'y', text: 'الغليان' },
  ]);
  assert.equal(tie.length, 2);
  assert.deepEqual(
    tie.map((cluster) => cluster.ids[0]),
    ['x', 'y'],
  );
});

/*
 * المعلم الذي يُحدّث الصفحة يجب أن يرى التوزيع نفسه. ولذلك يُفحص الثبات
 * على ترتيبٍ مقلوب لا على النداء مرتين: الأخير يجتازه حتى تجميعٌ جشِع.
 */
test('والتجميع لا يتغيّر بتغيّر ترتيب ورود الطلاب', () => {
  const forward = groupAnswers(CLASS_ANSWERS);
  const reversed = groupAnswers([...CLASS_ANSWERS].reverse());

  const shape = (clusters) =>
    clusters
      .map((cluster) => [...cluster.ids].sort().join(','))
      .sort()
      .join(' | ');

  assert.equal(shape(forward), shape(reversed));
});

test('والنداء مرتين على المدخل نفسه يعطي المخرج نفسه حرفياً', () => {
  assert.deepEqual(groupAnswers(CLASS_ANSWERS), groupAnswers(CLASS_ANSWERS));
});

test('ونموذجُ العنقود أكثرُ الصياغات تكراراً لا أوّلُها', () => {
  const clusters = groupAnswers([
    { id: 'p1', text: 'الماء يتبخر بالحراره' },
    { id: 'p2', text: 'الماء يتبخر بالحرارة' },
    { id: 'p3', text: 'الماء يتبخر بالحرارة' },
  ]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].sample, 'الماء يتبخر بالحرارة');
  assert.deepEqual(clusters[0].variants, ['الماء يتبخر بالحراره', 'الماء يتبخر بالحرارة']);
});

test('وقائمة فارغة تعطي عناقيد فارغة', () => {
  assert.deepEqual(groupAnswers([]), []);
});

test('وحدٌّ أعلى يفرّق ما كان مجتمعاً — والحدّ يُقيَّد في المدى', () => {
  const entries = [
    { id: 'q1', text: 'الماء يتبخر بالحرارة' },
    { id: 'q2', text: 'الماء يتبخر' },
  ];
  assert.equal(groupAnswers(entries).length, 1);
  assert.equal(groupAnswers(entries, { threshold: 1 }).length, 2);
  assert.equal(groupAnswers(entries, { threshold: 0 }).length, 1);

  /* حدٌّ خارج المدى يُقيَّد ولا يُسقط التجميع كلَّه. */
  assert.equal(groupAnswers(entries, { threshold: 12 }).length, 2);
  assert.equal(groupAnswers(entries, { threshold: -3 }).length, 1);
  /* وحدٌّ لا يُقرأ رقماً يعود إلى الافتراضيّ. */
  assert.equal(groupAnswers(entries, { threshold: Number.NaN }).length, 1);
});

/*
 * البوّابة أقوى من التسلسل: مركّبات الرسم قد توسّع العنقود عبر وسيط، لكن
 * تساوي عدد أدوات النفي علاقةُ تكافؤ — فلا يدخل نفيٌ إلى إثبات بالوراثة.
 */
test('ولا يتسلّل النفي إلى عنقود الإثبات عبر وسيط', () => {
  const clusters = groupAnswers([
    { id: 'r1', text: 'الماء يتبخر بالحرارة' },
    { id: 'r2', text: 'الماء يتبخر بالحرارة العالية' },
    { id: 'r3', text: 'الماء لا يتبخر بالحرارة العالية' },
  ]);
  for (const cluster of clusters) {
    const mixed = cluster.ids.includes('r1') && cluster.ids.includes('r3');
    assert.equal(mixed, false, 'اختلط النفي بالإثبات عبر وسيط');
  }
});

/*
 * لا مفتاح ولا شبكة: العمل كلّه نصوصٌ محلّية. ولو نادى الملفُّ الشبكةَ
 * لسقط هذا الفحص، ولسقط معه أوّلُ فصلٍ بلا إنترنت.
 */
test('ولا يمسّ التجميع الشبكةَ ولا يطلب مفتاحاً', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error('التجميع نادى الشبكة');
  };
  try {
    assert.ok(groupAnswers(CLASS_ANSWERS).length > 0);
  } finally {
    globalThis.fetch = original;
  }
});

/* ── ما كسره الخصم ───────────────────────────────────────────────────── */

/*
 * نصّان برموزٍ متطابقة عدداً وصورةً، وأداةُ نفيٍ واحدة في كلٍّ — وأحدهما
 * صحيح والآخر خطأ. فحارسٌ يعدّ الأدوات ولا يقرأ ما تنفيه كلُّ واحدة يعطي
 * الاثنين ‏١٫٠‏ بالضبط، فيقرأ المعلم الصحيحَ ويصحّح على أساسه طفلين أخطآ.
 */
test('وموضعُ النفي يُقرأ لا عددُه — «لا، الماء يتبخر» ليست «الماء لا يتبخر»', () => {
  assert.equal(answerSimilarity('لا، الماء يتبخر بالحرارة', 'الماء لا يتبخر بالحرارة'), 0);

  const clusters = groupAnswers([
    { id: 'w1', text: 'لا، الماء يتبخر بالحرارة' },
    { id: 'w2', text: 'الماء لا يتبخر بالحرارة' },
    { id: 'w3', text: 'الماء لا يتبخر بالحراره' },
  ]);
  assert.equal(clusters.length, 2);
  const of = (id) => clusters.find((cluster) => cluster.ids.includes(id));
  assert.notEqual(of('w1'), of('w2'), 'اجتمع الإثبات المصدَّر بـ«لا» مع النفي');
  assert.equal(of('w2'), of('w3'));
});

/*
 * «ما» الموصولة جوابٌ مثبَت شائع في العلوم. وقراءتُها نفياً أسوأ من الحالة
 * أعلاه: النصّ المعروض يكون النافيَ لأنه الأكثر تكراراً، فيصحّح المعلم
 * العنقود خطأً ويسقط وحده من أصاب — بلا أن يُقرأ له سطر.
 */
test('و«ما» أوّلَ الجواب اسمٌ موصول لا أداةَ نفي', () => {
  assert.equal(countNegations('ما يحدث للماء هو التبخر'), 0);

  const clusters = groupAnswers([
    { id: 'c1', text: 'ما يحدث للماء هو التبخر' },
    { id: 'c2', text: 'لا يحدث للماء التبخر' },
    { id: 'c3', text: 'لا يحدث للماء التبخر' },
  ]);
  const of = (id) => clusters.find((cluster) => cluster.ids.includes(id));
  assert.notEqual(of('c1'), of('c2'), 'اجتمع المثبَت بالنافي');
  assert.equal(of('c2'), of('c3'));
});

/*
 * والتخفيف لا يفتح باباً: «ما» تبقى رمزاً يجب أن يقابله مثلُه، وإلا لضُمّت
 * «ما تبخّر الماء» إلى «تبخّر الماء» ضمَّ الكلمة الزائدة.
 */
test('و«ما» ولو لم تُعدّ نفياً لا تمرّ مرورَ كلمةٍ زائدة', () => {
  assert.equal(answerSimilarity('ما تبخر الماء', 'تبخر الماء'), 0);
  assert.equal(countNegations('ما'), 1);
  assert.equal(answerSimilarity('الماء ما يتبخر بالحرارة', 'الماء يتبخر بالحرارة'), 0);
});

/*
 * الطفل لا يكتب «ليس»؛ يكتب «مش» و«مو» و«مافي» و«ماكو». وقائمةٌ فصيحة بحتة
 * تعطي نفيَه صفرَ أدوات فيركب عنقود الإثبات، ويصحّحه المعلم صحيحاً بنقرة.
 */
test('ونفيُ العاميّة نفيٌ — «مش» و«مو» و«مافي» و«ماكو» و«دون»', () => {
  for (const particle of ['مش', 'مو', 'مافي', 'مافيش', 'ماكو', 'دون']) {
    assert.equal(countNegations(particle), 1, particle);
    assert.equal(
      answerSimilarity('الماء بيتبخر بالحرارة', 'الماء ' + particle + ' بيتبخر بالحرارة'),
      0,
      'الأداة «' + particle + '» لم تمنع الضمّ',
    );
  }

  const clusters = groupAnswers([
    { id: 'm1', text: 'الماء بيتبخر بالحرارة' },
    { id: 'm2', text: 'الماء بيتبخر بالحراره' },
    { id: 'm3', text: 'الماء مش بيتبخر بالحرارة' },
  ]);
  assert.equal(clusters.length, 2);
  const of = (id) => clusters.find((cluster) => cluster.ids.includes(id));
  assert.equal(of('m1'), of('m2'));
  assert.notEqual(of('m1'), of('m3'), 'ركب النفي العاميّ عنقود الإثبات');
});

/*
 * «١٤٩٢» و«١٤٩٣» ليستا كلمةً وخطأَها الإملائي بل جوابين، أحدهما صحيح. وخطأٌ
 * بعشرة أضعاف (١٠٠٠ و٢٠٠٠) أبعدُ ما يكون عن سهو قلم.
 */
test('والرقم جوابٌ لا إملاء — رقمان مختلفان لا يشتركان في درجة', () => {
  const clusters = groupAnswers([
    { id: 'd1', text: 'سقطت غرناطة سنة ١٤٩٢' },
    { id: 'd2', text: 'سقطت غرناطة سنة 1492' },
    { id: 'd3', text: 'سقطت غرناطة سنة ١٤٩٣' },
    { id: 'd4', text: 'سقطت غرناطة سنة 1499' },
  ]);
  assert.equal(clusters.length, 3);
  const of = (id) => clusters.find((cluster) => cluster.ids.includes(id));
  /* والرقم نفسه بأبجديتين جوابٌ واحد. */
  assert.equal(of('d1'), of('d2'));
  assert.notEqual(of('d1'), of('d3'));
  assert.notEqual(of('d3'), of('d4'));

  assert.equal(answerSimilarity('الثمن 1200 ريال', 'الثمن 1300 ريال'), 0);
  assert.equal(answerSimilarity('يغلي الماء عند 1000 درجة', 'يغلي الماء عند 2000 درجة'), 0);
  /* و«ثمانية» و«ثمانين» عددان بينهما عشرة أضعاف لا حرفٌ زائد. */
  assert.equal(answerSimilarity('الناتج ثمانية', 'الناتج ثمانين'), 0);
});

/*
 * التساهل الإملائي لا يُشترى بكلمةٍ محايدة: «كبير» و«كثير» ضدّان في الحكم
 * وإن جاور كلًّا منهما «العدد» و«جدا». و«يذوب» و«يذيب» عكسُ بعضهما في
 * الفاعل والمفعول.
 */
test('وكلمةٌ مشتركة لا تُحيل الفرقَ في الكلمة الأخرى خطأً إملائياً', () => {
  assert.equal(answerSimilarity('العدد كبير جدا', 'العدد كثير جدا'), 0);
  assert.equal(answerSimilarity('السكر يذوب في الماء', 'السكر يذيب الماء'), 0);
  assert.equal(answerSimilarity('التسخين يزيد الحجم', 'التسخين يزيل الحجم'), 0);
});

/*
 * أخطرُ النفي ما لا أداةَ له: «يغلي» و«يتجمد» في جملةٍ واحدة. والجملة كلّما
 * طالت ودقّت ابتلع سياقُها المشترك كلمتَها الفاصلة — فيصير الجوابُ الأوفى
 * أسهلَ على الخلط لا أصعب.
 */
test('وكلمةٌ متقابلة تفصل ولو تطابق كلُّ ما حولها', () => {
  assert.equal(
    answerSimilarity('الماء يغلي عند 100 درجة مئوية', 'الماء يتجمد عند 100 درجة مئوية'),
    0,
  );
  assert.equal(answerSimilarity('ولد سنة 100 قبل الميلاد', 'ولد سنة 100 بعد الميلاد'), 0);
  assert.equal(answerSimilarity('يغلي الماء عند 100 درجة', 'يغلي الماء عند 200 درجة'), 0);
});

/*
 * والزيادة تفصيلاً ليست تقابلاً: نصٌّ أوفى من نصّ جوابٌ واحد — وهو الفرق
 * الذي يمنع الحارسَ أعلاه من أن يفرّق الصفَّ كلَّه إلى ثلاثين عنقوداً.
 */
test('والتفصيل الزائد يبقى مع أصله في عنقود', () => {
  const score = answerSimilarity('الماء يتبخر', 'الماء يتبخر بالحرارة');
  assert.ok(score >= ANSWER_MATCH_THRESHOLD, 'التشابه ' + score);
});

/*
 * صفرُ الحرّاس رفضٌ لا درجةٌ منخفضة. ومقارنةٌ بـ«أقلّ من الحدّ» وحدها تجعل
 * حدّاً صفريّاً — وهو حدٌّ مشروع لمن يريد عناقيد أوسع — يضمّ الصفَّ كلَّه في
 * عنقود واحد يعرض عنه سطراً واحداً، فيُبطل الحرّاسَ من بابٍ مفتوح.
 */
test('وحدٌّ صفريّ لا يُبطل الحرّاس', () => {
  const entries = [
    { id: 'p', text: 'الماء يتبخر بالحرارة' },
    { id: 'q', text: 'الماء لا يتبخر بالحرارة' },
    { id: 'r', text: 'عاصمة مصر القاهرة' },
  ];
  for (const threshold of [0, -3]) {
    const clusters = groupAnswers(entries, { threshold });
    assert.equal(clusters.length, 3, 'الحدّ ' + threshold);
    for (const cluster of clusters) {
      const mixed = cluster.ids.includes('p') && cluster.ids.includes('q');
      assert.equal(mixed, false, 'اختلط النفي بالإثبات عند حدٍّ صفريّ');
    }
  }
});

/*
 * «دون» و«بدون» أداةٌ واحدة، و«إلا» و«عدا» أداةٌ واحدة. والثغرةُ التي تفرّق
 * جوابين متطابقين هي بعينها التي تمرّر نفياً حقيقياً إلى عنقود الإثبات —
 * اتجاهان من نقصٍ واحد في القائمة.
 */
test('وصورتا الأداة الواحدة لا تفرّقان جوابين', () => {
  assert.equal(answerSimilarity('الماء يتبخر دون غليان', 'الماء يتبخر بدون غليان'), 1);
  assert.equal(answerSimilarity('كل المعادن تتمدد الا الزئبق', 'كل المعادن تتمدد عدا الزئبق'), 1);
});

/*
 * «الغير» و«بما أنّ» عربيةٌ مثبَتة عادية. وصنعُ أداةِ نفيٍ منهما — بقصّ «ال»
 * أو بفصل الباء — يفرّقهما عمّا يطابقهما ويؤهّلهما للاجتماع بنفيٍ حقيقي.
 */
test('ولا تُصنَع أداةُ نفيٍ من كلمةٍ مثبَتة', () => {
  assert.equal(countNegations('احترام الغير'), 0);
  assert.equal(normalizeAnswer('بما ان الحرارة'), 'بما ان حراره');
  assert.equal(countNegations('بما ان الحرارة ترتفع'), 0);

  const score = answerSimilarity(
    'بما ان الحرارة ترتفع فان الماء يتبخر',
    'لان الحرارة ترتفع فان الماء يتبخر',
  );
  assert.ok(score >= ANSWER_MATCH_THRESHOLD, 'التشابه ' + score);
});

/*
 * السطرُ المعروض عن العنقود هو الحكم عملياً؛ فإن تغيّر بتغيّر ترتيب الورود
 * (تسليماً أوّلاً مرةً واسماً مرة) رأى المعلم صياغةً غير التي رآها لعنقودٍ
 * لم يتغيّر. والتقسيم ثابتٌ أصلاً، فلا يكفي فحصُ المعرّفات وحدها.
 */
test('والنصّ المعروض عن العنقود لا يتغيّر بترتيب ورود الطلاب', () => {
  const rotate = (list, step) => [...list.slice(step), ...list.slice(0, step)];
  const shape = (clusters) =>
    clusters
      .map((cluster) => [...cluster.ids].sort().join(',') + ':' + cluster.sample)
      .sort()
      .join(' | ');

  const trio = [
    { id: 'g1', text: 'الماء يتبخر بالحرارة' },
    { id: 'g2', text: 'الماء يتبخر بالحراره' },
    { id: 'g3', text: 'يتبخر الماء بالحرارة' },
  ];
  const expected = shape(groupAnswers(trio));
  for (let step = 0; step < trio.length; step += 1) {
    assert.equal(shape(groupAnswers(rotate(trio, step))), expected, 'دوران ' + step);
    assert.equal(shape(groupAnswers([...rotate(trio, step)].reverse())), expected, 'عكس ' + step);
  }

  /* وعلى صفٍّ كامل، لا على ثلاثة. */
  const full = shape(groupAnswers(CLASS_ANSWERS));
  for (let step = 0; step < CLASS_ANSWERS.length; step += 1) {
    const order = rotate(CLASS_ANSWERS, step);
    assert.equal(shape(groupAnswers(order)), full, 'دوران ' + step);
    assert.equal(shape(groupAnswers([...order].reverse())), full, 'عكس ' + step);
  }
});

/*
 * حدٌّ معروفٌ لا عطلٌ يُصلَح — يُثبَّت هنا كي لا يُكتشف على ورقة طفل.
 *
 * المقارنة لا تعرف ترتيب الكلمات: «الشمس أكبر من الأرض» و«الأرض أكبر من
 * الشمس» مجموعتا كلماتٍ متطابقتان، بلا أداة نفي ولا رقم. فتتشابهان تماماً
 * وتُدمجان — وإحداهما صواب والأخرى خطأ.
 *
 * **ولا يُصلَح دون كسر ما يعمل:** الخاصيّة نفسها هي التي تدمج بحقٍّ «الماء
 * يتبخر بالحرارة» مع «بالحرارة يتبخر الماء». فمن يجعل الترتيب مهمّاً يكسب
 * أسئلة المقارنة ويخسر إعادةَ الصياغة، وهي أكثر.
 *
 * ولذلك: **التجميع ترتيبُ قراءةٍ لا حكمُ تصحيح** (`D24`). ولا يجوز أن يُبنى
 * فوقه زرٌّ يمنح درجةً لعنقودٍ كامل — ذلك ما يحوّل هذا الحدَّ إلى درجاتٍ خاطئة
 * لأطفال. وأسئلة المقارنة («أيّهما أكبر؟» «ما الذي يسبق؟») شائعةٌ في المدرسة.
 */
test('حدٌّ معروف: انعكاس الترتيب لا يُرى — ولذلك التجميع قراءةٌ لا تصحيح', () => {
  const clusters = groupAnswers([
    { id: 'a', text: 'الشمس أكبر من الأرض' },
    { id: 'b', text: 'الأرض أكبر من الشمس' },
  ]);

  assert.equal(clusters.length, 1, 'إن انفصلا فقد صار الترتيب مهمّاً — راجِع D24 وأعد الفحص');
  assert.equal(
    answerSimilarity('الماء يتبخر بالحرارة', 'بالحرارة يتبخر الماء'),
    1,
    'وإعادة الصياغة ما زالت تُدمج — وهي المكسب الذي يقابل ذلك الحدّ',
  );
});
