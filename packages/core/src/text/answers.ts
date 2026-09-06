/**
 * تجميع الإجابات النصّية المتقاربة — ثلاثون إجابة تُقرأ خمس مرات.
 *
 * سؤالٌ مفتوح في نشاطٍ لصفٍّ من ثلاثين طالباً يُنتج ثلاثين نصّاً، أكثرها
 * إعادةُ صياغةٍ لخمس إجاباتٍ لا أكثر. والمعلم الذي يصحّحها واحدةً واحدةً
 * يتعب في العاشرة ويُجحف في العشرين — لا لأنه مقصّر بل لأن المهمة مُصاغة
 * خطأً. فإن رأى خمسة عناقيد صحّح خمس مرات وكان حكمه على المتشابهين واحداً.
 *
 * وكلّه عملُ نصوصٍ محلّي: لا مفتاح، ولا شبكة، ولا قاعدة بيانات. مفتاح
 * المزوّد اختياريّ في هذا المنتج، وتجميعٌ يتوقّف على وجوده يتوقّف في أول
 * فصلٍ بلا إنترنت — وهي حالة الفصول لا استثناؤها.
 *
 * ## الفخّ الذي يُبنى هذا الملف حوله
 *
 * «الماء يتبخر بالحرارة» و«الماء لا يتبخر بالحرارة» يتشاركان كلَّ كلمة إلا
 * واحدة: تقاطعُ الرموز يعطيهما ‏٠٫٩‏ تقريباً. وهما **إجابتان متعاكستان**:
 * إحداهما صحيحة والأخرى خطأ. وضمُّهما في عنقودٍ واحد لا يعني درجةً واحدة
 * غير دقيقة، بل درجةً واحدة خاطئة تنزل على كلّ طفلٍ في العنقود دفعةً واحدة
 * دون أن يقرأها المعلم ثانيةً — والخطأ الذي يُنتجه التجميع لا يراه أحد.
 *
 * ## ولذلك ثلاثة حرّاسٍ لا حارسٌ واحد
 *
 * الحارس الأول لا يعدّ أدوات النفي بل **يقرأ ما تنفيه كلُّ واحدة**: «لا،
 * الماء يتبخر» و«الماء لا يتبخر» فيهما الرموز نفسها بالعدد نفسه، والأولى
 * جوابٌ صحيح والثانية خطأ — وعدٌّ بلا موضعٍ يراهما إجابةً واحدة.
 *
 * والثاني أن الأرقام لا تُقارَب: «١٤٩٢» و«١٤٩٣» ليستا كلمةً وخطأها
 * الإملائي بل جوابين، أحدهما صحيح.
 *
 * والثالث أن **التبادل ليس زيادة**: نصٌّ يزيد على الآخر تفصيلاً هو هو،
 * ونصّان يختلفان في كلمةٍ متقابلة («يغلي»/«يتجمد»، «قبل»/«بعد») جوابان
 * متناقضان مهما تطابق ما حولهما. والسياق المشترك في جملةٍ طويلة يبتلع
 * الكلمة الفاصلة إن حُسب التشابهُ نسبةَ تقاطعٍ لا أكثر.
 */

import { toLatinDigits } from '@cubecroom/contracts';
import { normalizeArabic } from './arabic.js';

/**
 * كلُّ ما ليس حرفاً ولا رقماً ولا مسافة — فراغ.
 *
 * وخاصّيتا `\p{L}` و`\p{N}` بدل قائمةٍ مكتوبة (؟ ، ؛ « » . ! :) لأن القائمة
 * تُنسى منها واحدة دائماً: طالبٌ ختم إجابته بنقطتين وآخر بلا نقطتين ليسا
 * إجابتين. والخاصّيتان تغطّيان علامات العربية واللاتينية والرموز معاً.
 */
const PUNCTUATION = /[^\p{L}\p{N} ]+/gu;

/** طول ما يبقى بعد «ال» حتى يُعدّ الباقي كلمةً قائمة. */
const ARTICLE_KEEP = 3;

/**
 * أدواتُ النفي وفئةُ كلٍّ منها — تُصان ولا تُحذف.
 *
 * والمقارنة بالفئة لا بالصورة المكتوبة: الطفل يكتب «مش» و«مو» و«ماكو»
 * و«مافي» أكثر مما يكتب «ليس»، وقائمةٌ فصيحة بحتة تمرّر نفيَه كلَّه إلى
 * عنقود الإثبات — وهو أخطر ما يقع لأن المعلم يصحّح العنقود بنقرة. وردُّ
 * الصور إلى فئة واحدة يجعل «ليس صحيحاً» و«مش صحيح» جواباً واحداً كما هما.
 *
 * وثلاث فئات لا فئة: النفي (لا)، والاستثناء (عدا)، والسلب (دون). فـ«يتبخر
 * دون غليان» ليست «لا يتبخر بغليان»، والخلط بينها يضمّ متعاكسين. أما
 * «بدون» و«دون» و«بلا» فواحدة، و«إلا» و«عدا» و«سوى» واحدة — والنقصُ في
 * إحداها هو نفسه الذي يمرّر نفياً حقيقياً ويفرّق جوابين متطابقين، من ثغرةٍ
 * واحدة في اتجاهين.
 *
 * والزيادة آمنة باتجاه واحد: أداةٌ زائدة تُفرّق عنقوداً كان يصحّ ضمُّه —
 * فيصحّح المعلم ستّ مرات بدل خمس — وأداةٌ فائتة تضمّ نفياً إلى إثبات.
 * والثمن ليس متساوياً.
 *
 * وهي مكتوبة بصورتها المطبَّعة أصلاً (لا تشكيل ولا همزات ولا «ال»)، فتُقارَن
 * بالرموز مباشرةً — وذلك مفحوصٌ في الاختبار كي لا ينكسر بصمت.
 */
const NEGATION_CLASSES: ReadonlyMap<string, string> = new Map([
  ['لا', 'لا'],
  ['ليس', 'لا'],
  ['ليست', 'لا'],
  ['ليسا', 'لا'],
  ['ليسوا', 'لا'],
  ['لست', 'لا'],
  ['لسنا', 'لا'],
  ['لستم', 'لا'],
  ['لم', 'لا'],
  ['لن', 'لا'],
  ['ما', 'لا'],
  ['مش', 'لا'],
  ['مو', 'لا'],
  ['مافي', 'لا'],
  ['مافيش', 'لا'],
  ['ماكو', 'لا'],
  ['غير', 'غير'],
  ['دون', 'دون'],
  ['بدون', 'دون'],
  ['بلا', 'دون'],
  ['عدا', 'عدا'],
  ['الا', 'عدا'],
  ['سوي', 'عدا'],
]);

export const NEGATION_PARTICLES: readonly string[] = [...NEGATION_CLASSES.keys()];

const NEGATIONS: ReadonlySet<string> = new Set(NEGATION_PARTICLES);

/**
 * ما يصحّ أن يلتصق بواوٍ أو فاءٍ أو باء — وهي التي تبدأ باللام وحدها.
 *
 * «الماء لا يتبخر ولا يذوب» يُقرأ بلا هذا الفصل نفياً واحداً لا نفيين،
 * فيصير تكافؤه فردياً كتكافؤ «الماء لا يتبخر» ويُضمّ إليه. وحرفٌ واحد
 * ملتصقٌ لا يُرى في القائمة يُسقط الحارس في أشيع صيغةٍ يكتبها الطفل.
 *
 * وقصرُ الفصل على «لـ» لا على كلّ أداة: «بما» و«وما» و«فما» حروفُ ربطٍ
 * ومصدرٌ لا نفي، وفصلُها يصنع نفياً من العدم ويخلّف حرفاً وحيداً لا معنى
 * له — فتُفرَّق «بما أنّ الحرارة ترتفع» عن «لأنّ الحرارة ترتفع» وهما جوابٌ
 * واحد، وتُضمّ إلى نفيٍ حقيقيّ وليست منه.
 */
const ATTACHABLE: ReadonlySet<string> = new Set([
  'لا',
  'ليس',
  'ليست',
  'ليسا',
  'ليسوا',
  'لست',
  'لسنا',
  'لستم',
  'لم',
  'لن',
]);

function splitAttachedNegation(token: string): string {
  if (NEGATIONS.has(token)) return token;
  const head = token.slice(0, 1);
  if (head !== 'و' && head !== 'ف' && head !== 'ب') return token;
  const rest = token.slice(1);
  return ATTACHABLE.has(rest) ? `${head} ${rest}` : token;
}

/**
 * «ال» التعريف تسقط — لكن ليست كلَّ «ال».
 *
 * «التبخر» و«تبخر» إجابةٌ واحدة، ومقارنةٌ حرفية تفرّقهما. غير أن قصَّها بلا
 * شرطٍ تأكل كلماتٍ ليست معرَّفة: «ألم» تصير «م» و«الله» تصير «له».
 * فيُشترط أن يبقى بعدها ثلاثة أحرف.
 *
 * ويُشترط معه ألّا يكون الباقي أداةَ نفي: شرطُ الطول وحده يمنع «الما» ولا
 * يمنع «الغير»، فتصير «احترام الغير» نفياً — يفرّقها عمّا يطابقها ويؤهّلها
 * لتُضمّ إلى نفيٍ حقيقي. والحارس ينقلب على نفسه حين يصنع أداةً من العدم.
 */
function stripArticle(token: string): string {
  if (!token.startsWith('ال')) return token;
  const rest = token.slice(2);
  if (rest.length < ARTICLE_KEEP) return token;
  return NEGATIONS.has(rest) ? token : rest;
}

/**
 * التطبيع للمقارنة وحدها — النصّ يُخزَّن ويُعرض كما كتبه الطالب.
 *
 * الطيّ الإملائي (التشكيل والهمزات والتاء المربوطة) من `normalizeArabic`
 * ولا يُعاد كتابته هنا: نسخةٌ ثانية منه تعني ملفّين يجب أن يتفقا على ما هو
 * الحرف نفسه — وهما لا يتفقان إلا بالصدفة. وتحويل الأرقام من
 * `toLatinDigits` للسبب ذاته. وما يزيده هذا الملف عليهما: الترقيم، و«ال»،
 * وضغط الفراغ بعد أن صار الترقيم فراغاً.
 */
export function normalizeAnswer(text: string): string {
  const plain = toLatinDigits(normalizeArabic(text))
    .replace(PUNCTUATION, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (plain === '') return '';
  return plain
    .split(' ')
    .map((token) => splitAttachedNegation(stripArticle(token)))
    .join(' ');
}

/**
 * حروفُ الرَّبط والإشارة — ضجيجٌ يُخفي التطابق.
 *
 * «الماء يتبخر في الحرارة» و«الماء يتبخر من الحرارة» إجابةٌ واحدة، وحرفُ
 * الجرّ بينهما ينزل بالتقاطع بلا سبب. وأدواتُ التعليل («لأن» و«بما» و«فإن»)
 * معها: الجوابُ عن «لماذا يتبخر» واحدٌ سواء صُدِّر بهذه أو بتلك، وبقاؤها
 * كلمةً مقابلةً لكلمة يجعل صياغتين لجوابٍ واحد متناقضتين بحكم الحارس
 * الثالث. والقائمة مقصورة على ما لا يحمل معنى: «قد» و«كل» و«لكن» ليست منها
 * لأن «قد يتبخر» ليست «يتبخر».
 */
const FUNCTION_WORDS: readonly string[] = [
  'و',
  'في',
  'من',
  'علي',
  'عن',
  'الي',
  'ان',
  'انه',
  'انها',
  'لان',
  'بما',
  'فان',
  'هو',
  'هي',
  'هم',
  'هذا',
  'هذه',
  'ذلك',
  'التي',
  'الذي',
  'ثم',
  'مع',
  'او',
];

/**
 * ولا تدخل أداةُ نفيٍ في كلمات الوقف — لا بالمراجعة بل بالبناء.
 *
 * القائمة أعلاه يقرؤها إنسان ويوافق عليها إنسان، وسطرٌ واحد يُضاف إليها
 * بعد سنةٍ سهواً («ما» تبدو حرفَ وقفٍ لمن يقرأها وحدها) يُسقط الحارس كلَّه
 * بصمت. فالتصفية هنا تجعل ذلك السهو مستحيلاً لا مستبعَداً.
 */
const STOP_WORDS: ReadonlySet<string> = new Set(
  FUNCTION_WORDS.map(normalizeAnswer).filter((word) => !NEGATIONS.has(word)),
);

/** رمزٌ فيه رقم — والأرقام لها حكمٌ غير حكم الكلمات. */
const HAS_DIGIT = /\p{N}/u;

type Reading = {
  /** الرموز المقارَنة، وأدواتُ النفي فيها مردودةٌ إلى فئاتها. */
  readonly tokens: readonly string[];
  /** «فئةُ الأداة + ما تنفيه» لكلّ أداة، مرتَّبة — بها تُقارَن الجملتان. */
  readonly scopes: readonly string[];
  readonly numbers: readonly string[];
};

/**
 * «ما» في أوّل الجواب اسمٌ موصول لا أداةَ نفي.
 *
 * «ما يحدث للماء هو التبخر» جوابٌ صحيح مثبَت، وقراءتُه نفياً تضمّه إلى «لا
 * يحدث للماء التبخر» — وهي الحالة الأسوأ: النصّ المعروض عن العنقود يكون
 * النافي (لأنه الأكثر تكراراً)، فيصحّحه المعلم خطأً ويسقط الطفل الوحيد
 * الذي أصاب دون أن يُقرأ له سطر.
 *
 * وقصرُ التخفيف على أوّل الجواب: «الماء ما يتبخر» نفيٌ لا شكّ فيه، و«ما»
 * وحدها في جوابٍ من كلمة نفيٌ أيضاً. ويبقى «ما» في هذه الحال رمزاً يجب أن
 * يقابله مثلُه في الطرف الآخر (انظر `similarityOf`)، فلا يُضمّ «ما تبخّر
 * الماء» إلى «تبخّر الماء» ولو سقط عدُّه.
 */
function readsAsRelative(word: string, index: number, total: number): boolean {
  return word === 'ما' && index === 0 && total > 1;
}

/**
 * قراءةُ الجواب مرةً واحدة: رموزُه، ومواضعُ نفيه، وأرقامُه.
 *
 * وإن لم يبقَ شيء بعد حذف حروف الرَّبط تُعاد الكلمات كما هي: إجابةٌ كلُّها
 * حروفُ ربط («هو هذا») إجابةٌ قائمة، وردُّها فارغةً يضمّها إلى كلّ فارغٍ آخر.
 */
function readAnswer(text: string): Reading {
  const normalized = normalizeAnswer(text);
  const words = normalized === '' ? [] : normalized.split(' ');
  const kept = words.filter((word) => !STOP_WORDS.has(word));
  const source = kept.length === 0 ? words : kept;

  const tokens: string[] = [];
  const marks: (string | undefined)[] = [];
  source.forEach((word, index) => {
    const negation = NEGATION_CLASSES.get(word);
    if (negation === undefined || readsAsRelative(word, index, source.length)) {
      tokens.push(word);
      marks.push(undefined);
      return;
    }
    tokens.push(negation);
    marks.push(negation);
  });

  const scopes: string[] = [];
  marks.forEach((mark, index) => {
    if (mark === undefined) return;
    scopes.push(`${mark} ${tokens[index + 1] ?? ''}`);
  });

  return {
    tokens,
    scopes: scopes.sort(),
    numbers: [...new Set(tokens.filter((token) => HAS_DIGIT.test(token)))].sort(),
  };
}

/**
 * الرموز التي تُقارَن — بعد التطبيع وبعد حذف حروف الرَّبط.
 */
export function answerTokens(text: string): readonly string[] {
  return readAnswer(text).tokens;
}

/** عدد أدوات النفي في الإجابة. */
export function countNegations(text: string): number {
  return readAnswer(text).scopes.length;
}

/**
 * تكافؤ النفي: ‏١‏ لنفيٍ فردي، و‏٠‏ لإثباتٍ أو نفيٍ مزدوج.
 *
 * يُصدَّر ليُقرأ ويُختبر مباشرةً؛ والبوّابة الفعلية في `answerSimilarity`
 * أشدّ منه (تطابق المواضع لا تساوي التكافؤ) — انظر تعليلها هناك.
 */
export function negationParity(text: string): number {
  return countNegations(text) % 2;
}

/**
 * أقصر رمزٍ يُسمح بمطابقته مطابقةً تقريبية.
 *
 * أربعةٌ لا خمسة لأن أشيع اختلافٍ بين إجابتين متطابقتين في العربية هو حرف
 * المضارعة: «تحول» و«يتحول»، «تبخر» و«يتبخر». وهو يقع على حدّ الأربعة
 * بالضبط، فحدٌّ عند خمسة يُفوّت أكثرَ الحالات لا أندرَها.
 */
const FUZZY_MIN = 4;

/** وزنُ المطابقة التقريبية — دون الواحد كي لا تحمل التشابهَ وحدها. */
const NEAR_WEIGHT = 0.85;

/** حروف المضارعة — ما يصحّ أن يتبادل في أوّل الفعل. */
const IMPERFECT: ReadonlySet<string> = new Set(['ي', 'ت', 'ن', 'ا']);

/** ما يصحّ أن يُزاد في أوّل الكلمة: المضارعة وحروفُ الجرّ والعطف والاستقبال. */
const LEADING: ReadonlySet<string> = new Set(['ي', 'ت', 'ن', 'ا', 'و', 'ف', 'ب', 'ل', 'ك', 'س']);

/**
 * الفرقُ المسموح به بين رمزين حرفٌ **في أوّلهما** لا في أيّ موضع.
 *
 * لأن ما يُراد التساهل معه شيءٌ واحد: صرفُ الفعل وما يلتصق بأوّله —
 * «يتبخر»/«تتبخر»، «تحول»/«يتحول»، «حرارة»/«بحرارة». أما حرفٌ في الوسط أو
 * في الآخر فهو ما يفرّق كلمتين قائمتين لا كلمةً وخطأها: «يذوب» و«يذيب»
 * عكسُ بعضهما في الفاعل والمفعول، و«يزيد» و«يزيل» ضدّان، و«ثمانية»
 * و«ثمانين» عددان بينهما عشرة أضعاف. والتساهل معها يعطي أحدَ الجوابين
 * درجةَ الآخر — وهو ما لا يُرى لأنه يقع داخل عنقودٍ صُحِّح بنقرة.
 */
function withinLeadingEdit(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const shortHead = short.slice(0, 1);
  const longHead = long.slice(0, 1);

  if (short.length === long.length) {
    if (shortHead === longHead) return false;
    if (!IMPERFECT.has(shortHead) || !IMPERFECT.has(longHead)) return false;
    return short.slice(1) === long.slice(1);
  }
  if (long.length !== short.length + 1) return false;
  return LEADING.has(longHead) && long.slice(1) === short;
}

/**
 * أفضل ما يقابل هذا الرمز في الطرف الآخر.
 *
 * وأداةُ النفي لا تُقارَب أبداً: `لست` و`ليست` قريبتان إملائياً من كلماتٍ
 * ليست نفياً، ومطابقةٌ تقريبية تُذيب الحارسَ من داخل الحساب بعد أن صِين
 * من خارجه.
 */
function bestMatch(token: string, pool: readonly string[]): number {
  const negated = NEGATIONS.has(token);
  let score = 0;
  for (const other of pool) {
    if (other === token) return 1;
    if (negated !== NEGATIONS.has(other)) continue;
    if (token.length < FUZZY_MIN || other.length < FUZZY_MIN) continue;
    if (withinLeadingEdit(token, other)) score = NEAR_WEIGHT;
  }
  return score;
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function similarityOf(left: Reading, right: Reading): number {
  /*
   * الرقم جوابٌ لا إملاء.
   *
   * «سقطت غرناطة سنة ١٤٩٢» و«١٤٩٣» بينهما رقمٌ واحد، ومقياسٌ يعامله معاملة
   * الحرف يعطيهما ‏٠٫٩٦‏ ويضمّهما — فيأخذ المخطئ درجةَ المصيب. و«١٠٠٠
   * درجة» و«٢٠٠٠ درجة» خطأٌ بعشرة أضعاف يُقرأ تشابهاً بـ‏٠٫٩٧‏. فتساوي
   * الأرقام شرطٌ قبل الحساب، ولا يُقارَب رقمٌ من رقم أبداً.
   */
  if (!sameList(left.numbers, right.numbers)) return 0;

  /*
   * البوّابة قبل الحساب لا بعده — وعلى الموضع لا على العدد.
   *
   * «لا، الماء يتبخر بالحرارة» و«الماء لا يتبخر بالحرارة» فيهما الرموز
   * نفسها بالعدد نفسه وأداةُ نفيٍ واحدة لكلٍّ: عدٌّ مجرَّد يراهما نصّاً
   * واحداً بتمامه، والأولى جوابٌ صحيح والثانية خطأ. فما يُقارَن هو ما
   * تنفيه الأداة لا كم أداةً في الجملة.
   *
   * وتطابقُ المواضع علاقةُ تكافؤ كتساوي العدد، فتسلسلُ المركّبات المتصلة
   * لا يخترقه (انظر `groupAnswers`)، ويستلزم تساوي العدد فالضمانةُ القديمة
   * قائمة وزيادة.
   */
  if (!sameList(left.scopes, right.scopes)) return 0;

  const a = [...new Set(left.tokens)];
  const b = [...new Set(right.tokens)];
  /* إجابتان فارغتان إجابةٌ واحدة: «لم يجب» عنقودٌ يصحّحه المعلم مرةً. */
  if (a.length === 0 || b.length === 0) return a.length === b.length ? 1 : 0;

  const forward = a.map((token) => bestMatch(token, b));
  const backward = b.map((token) => bestMatch(token, a));

  /*
   * أداةٌ في طرفٍ بلا نظيرٍ في الآخر تفصل، ولو لم تُعدّ نفياً.
   *
   * «ما» أوّلَ الجواب تُقرأ اسماً موصولاً فلا تدخل في المواضع، ولو مرّت
   * بعدها مرورَ كلمةٍ زائدة لضُمّ «ما تبخّر الماء» إلى «تبخّر الماء» — وهي
   * الحالة التي بُني الملف كلُّه لمنعها. فالأداة تُقابَل أو تفصل.
   */
  if (a.some((token, index) => NEGATIONS.has(token) && forward[index] === 0)) return 0;
  if (b.some((token, index) => NEGATIONS.has(token) && backward[index] === 0)) return 0;

  /*
   * التبادل ليس زيادة.
   *
   * نصٌّ يزيد على الآخر تفصيلاً («الماء يتبخر» و«الماء يتبخر بالحرارة»)
   * جوابٌ واحد أحدهما أوفى. أما أن يكون في كلٍّ من الطرفين كلمةٌ لا مقابل
   * لها في الآخر فذلك تقابلٌ لا تفصيل: «يغلي»/«يتجمد»، «قبل»/«بعد»،
   * «كبير»/«كثير». والسياق المشترك — وهو أكثرُ الجملة — يبتلع الكلمة
   * الفاصلة ويرفع التشابه فوق الحدّ، فيصير الجوابُ الأطول والأدقّ أسهلَ
   * على الخلط لا أصعب.
   */
  if (forward.includes(0) && backward.includes(0)) return 0;

  const sum =
    forward.reduce((total, score) => total + score, 0) +
    backward.reduce((total, score) => total + score, 0);
  return sum / (a.length + b.length);
}

/**
 * قربُ إجابتين من ‏٠‏ إلى ‏١‏ — بمعنى «أتستحقّان الدرجة نفسها»، لا بمعنى
 * «أتتشابهان في الحروف».
 *
 * ولذلك تعود صفراً بين نفيٍ وإثبات وإن تطابق كلّ ما عداهما: القيمة
 * المعادة قرارُ تصحيح، والفرق بين المعنيين هو الفرق بين تجميعٍ ينفع
 * وتجميعٍ يظلم.
 */
export function answerSimilarity(a: string, b: string): number {
  return similarityOf(readAnswer(a), readAnswer(b));
}

/** الحدّ الذي يجتمع عنده نصّان في عنقود. */
export const ANSWER_MATCH_THRESHOLD = 0.7;

export type AnswerEntry = {
  /** معرّف الطالب أو التسليم — يعود به النداءُ إلى صاحب الإجابة. */
  readonly id: string;
  readonly text: string;
};

export type AnswerCluster = {
  /** معرّفات الأعضاء بترتيب ورودها — بها يرجع المعلم إلى الأسماء. */
  readonly ids: readonly string[];
  readonly size: number;
  /** النصّ الذي يُعرض عن العنقود، كما كتبه صاحبه لا مطبَّعاً. */
  readonly sample: string;
  readonly normalized: string;
  /** عدد أدوات النفي — واحدٌ لكلّ العنقود بحكم البوّابة. */
  readonly negations: number;
  /** الصياغات المتمايزة داخل العنقود، لمعلّمٍ يريد أن يتحقّق قبل الحكم. */
  readonly variants: readonly string[];
};

export type GroupAnswersOptions = {
  readonly threshold?: number;
};

type Row = {
  readonly index: number;
  readonly id: string;
  readonly text: string;
  readonly normalized: string;
  readonly reading: Reading;
};

function clamp(value: number): number {
  if (!Number.isFinite(value)) return ANSWER_MATCH_THRESHOLD;
  return Math.min(1, Math.max(0, value));
}

/**
 * تجميعٌ بمركّبات الرسم المتصلة — لا بأوّل من يصل.
 *
 * التجميعُ الجشِع (أوّلُ نصٍّ يصير قائدَ عنقود ومن بعده يُقاس إليه) يعطي
 * عناقيد مختلفة لترتيبٍ مختلف للمدخلات، والمعلم الذي يُحدّث الصفحة يرى
 * توزيعاً آخر لنفس الإجابات فلا يثق بالشاشة. والمركّبات المتصلة لا ترتيب
 * لها: العلاقة متماثلة، والنتيجة واحدة مهما ورد الطلاب.
 *
 * وتسلسلُ المركّبات (أ‏~‏ب و ب‏~‏ج فيجتمع الثلاثة وإن لم يتقارب أ وج) لا
 * يخترق حارسَ النفي: تطابقُ مواضع النفي علاقةُ تكافؤ، فما تجمعه السلسلة
 * متساوٍ في النفي بالضرورة. أسوأ ما يفعله التسلسل عنقودٌ أوسع مما ينبغي
 * يقرؤه المعلم فيفرّقه — لا نفيٌ اختلط بإثبات.
 */
export function groupAnswers(
  entries: readonly AnswerEntry[],
  options: GroupAnswersOptions = {},
): readonly AnswerCluster[] {
  const threshold = clamp(options.threshold ?? ANSWER_MATCH_THRESHOLD);
  const rows: Row[] = entries.map((entry, index) => ({
    index,
    id: entry.id,
    text: entry.text,
    normalized: normalizeAnswer(entry.text),
    reading: readAnswer(entry.text),
  }));

  const parent = rows.map((_, index) => index);
  const find = (node: number): number => {
    let root = node;
    for (;;) {
      const up = parent[root];
      if (up === undefined || up === root) break;
      root = up;
    }
    let walk = node;
    for (;;) {
      const up = parent[walk];
      if (up === undefined || up === walk) break;
      parent[walk] = root;
      walk = up;
    }
    return root;
  };

  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const left = rows[i];
      const right = rows[j];
      if (left === undefined || right === undefined) continue;
      const score = similarityOf(left.reading, right.reading);
      /*
       * الصفرُ رفضٌ لا درجةٌ منخفضة.
       *
       * الحرّاس أعلاه يعيدون صفراً حين يكون الضمّ خطأً بيّناً، ومقارنةٌ
       * بـ«أقلّ من الحدّ» وحدها تجعل حدّاً صفريّاً (يطلبه من يريد عناقيد
       * أوسع) يضمّ الصفَّ كلَّه في عنقود واحد — نفيه وإثباته وسؤاله الآخر
       * معاً — ويعرض عنه نصّاً واحداً. فالرفض مطلق، والحدّ فوقه.
       */
      if (score <= 0 || score < threshold) continue;
      const rootLeft = find(i);
      const rootRight = find(j);
      if (rootLeft !== rootRight) parent[rootRight] = rootLeft;
    }
  }

  const components = new Map<number, Row[]>();
  for (const row of rows) {
    const root = find(row.index);
    const bucket = components.get(root);
    if (bucket === undefined) components.set(root, [row]);
    else bucket.push(row);
  }

  const built = [...components.values()].map((members) => ({
    first: members[0]?.index ?? 0,
    cluster: describe(members),
  }));

  /*
   * الأكبر أولاً: العنقود الذي فيه أربعة عشر طالباً هو ما يوفّر الوقت،
   * وإخفاؤه أسفل الشاشة يُبطل الغرض. والتعادل بأوّل ظهور لا بشيء آخر كي
   * يبقى الترتيب هو نفسه في كلّ تحميل.
   */
  built.sort((a, b) => b.cluster.size - a.cluster.size || a.first - b.first);
  return built.map((entry) => entry.cluster);
}

/**
 * نموذجُ العنقود يُنتخب بمحتوى العنقود وحده — لا بمن سلّم أوّلاً.
 *
 * السطرُ الذي يقرأه المعلم عن أربعة عشر طالباً هو الحكمُ كلُّه عملياً؛
 * فإن تغيّر بتغيّر ترتيب ورود الطلاب (تسليماً أوّلاً مرةً واسماً مرة) رأى
 * المعلم صياغةً غير التي رآها قبل قليل لعنقودٍ لم يتغيّر — والتقسيم ثابت
 * لكنّ ما يُقرأ ليس كذلك.
 *
 * والانتخاب على ثلاث درجات: أكثرُ **صياغةٍ** تكراراً (بالنصّ المطبَّع، فهو
 * ما يجمع «بالحرارة» و«بالحراره» صياغةً واحدة)، ثم أكثرُ إملاءٍ لها
 * تكراراً (بالنصّ كما كُتب، فهو ما يميّزهما)، ثم الأسبقُ ترتيباً حرفياً.
 * والثالثة قاعدةُ فصلٍ لا معنى لها في ذاتها، لكنها من النصّ لا من ترتيبه —
 * وذلك كلُّ المطلوب منها.
 */
function describe(members: readonly Row[]): AnswerCluster {
  const byShape = new Map<string, number>();
  const byText = new Map<string, number>();
  for (const row of members) {
    byShape.set(row.normalized, (byShape.get(row.normalized) ?? 0) + 1);
    byText.set(row.text, (byText.get(row.text) ?? 0) + 1);
  }

  let chosen = members[0];
  for (const row of members) {
    if (chosen === undefined) {
      chosen = row;
      continue;
    }
    const shape = byShape.get(row.normalized) ?? 0;
    const bestShape = byShape.get(chosen.normalized) ?? 0;
    if (shape !== bestShape) {
      if (shape > bestShape) chosen = row;
      continue;
    }
    const text = byText.get(row.text) ?? 0;
    const bestText = byText.get(chosen.text) ?? 0;
    if (text !== bestText) {
      if (text > bestText) chosen = row;
      continue;
    }
    if (row.text < chosen.text) chosen = row;
  }

  /* والصياغات بترتيب الورود كالمعرّفات: سطرٌ يقابل طالباً بعينه. */
  const variants: string[] = [];
  for (const row of members) if (!variants.includes(row.text)) variants.push(row.text);

  return {
    ids: members.map((row) => row.id),
    size: members.length,
    sample: chosen?.text ?? '',
    normalized: chosen?.normalized ?? '',
    negations: chosen?.reading.scopes.length ?? 0,
    variants,
  };
}
