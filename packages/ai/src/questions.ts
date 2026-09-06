import type { AiMessage } from './registry.js';

/**
 * توليد أسئلة من درس — FR-012 · لوح `T16AiGenerate`.
 *
 * **لماذا نصّ يُحلَّل لا مخرَج مبنيّ (`generateObject`):** السجلّ كلّه قائم على
 * أن الميزات لا تعرف إلا `complete`، فتبديل المزوّد لا يمسّ منطقها. وإضافة
 * مسار ثانٍ للمخرَج المبنيّ كانت ستكسر ذلك وتُلزم كل محوّل بدعمه. والأهم أن
 * قراءة ردّ النموذج هي **الجزء الخطر** هنا، فبقاؤها دالةً خالصة يجعلها
 * مفحوصةً بلا شبكة ولا مفتاح.
 *
 * وردّ النموذج **مدخلٌ غير موثوق** كأي مدخل: ما لا يُقرأ يُسقَط ولا يُخمَّن.
 */

export type DraftOption = {
  readonly text: string;
  readonly isCorrect: boolean;
};

export type ParsedQuestions = {
  readonly questions: DraftQuestion[];
  /**
   * كتلٌ وصلت بنصّ سؤال وسقطت لأنها لم تستوفِ القواعد.
   * تُعدّ **قبل** قصّ الزائد على المطلوب: نموذجٌ ردّ بثمانية وطُلب خمسة لم
   * يسقط منه شيء — والخلط بين القصّ والإسقاط يقول للمعلم إن درسه أعيا
   * النموذج وهو لم يُعيه.
   */
  readonly dropped: number;
};

export type DraftQuestion =
  | { readonly type: 'choice'; readonly prompt: string; readonly options: DraftOption[] }
  | { readonly type: 'text'; readonly prompt: string; readonly expectedAnswer: string | null };

export type GenerateQuestionsInput = {
  readonly content: string;
  readonly count: number;
  readonly type: 'choice' | 'text';
};

const SYSTEM = [
  'أنت مساعد لمعلّم عربي يضع أسئلة لطلاب المرحلة الابتدائية والمتوسطة.',
  'اكتب بالعربية الفصحى الميسّرة دائماً، مهما كانت لغة النصّ الذي يصلك.',
  'لا تضع سؤالاً عن معلومة ليست في النصّ.',
  'التزم بالصيغة المطلوبة حرفياً: بلا مقدّمة ولا ترقيم ولا علامات تنسيق.',
].join(' ');

/**
 * الصيغة مكتوبة بأمثلة لا بوصف: نموذجٌ يقرأ مثالاً يلتزم به أكثر ممّا يلتزم
 * بشرحٍ نثريّ للقواعد.
 */
const CHOICE_FORMAT = [
  'اكتب كل سؤال في كتلة، وافصل بين الكتل بسطر فارغ. الكتلة هكذا:',
  '',
  'س: نصّ السؤال',
  '- خيار غير صحيح',
  '+ الخيار الصحيح',
  '- خيار غير صحيح',
  '',
  'علامة + توضع على الخيار الصحيح وحده، ولا يجوز أن تتكرر في السؤال الواحد.',
  'اكتب ثلاثة خيارات أو أربعة لكل سؤال.',
].join('\n');

const TEXT_FORMAT = [
  'اكتب كل سؤال في كتلة، وافصل بين الكتل بسطر فارغ. الكتلة هكذا:',
  '',
  'س: نصّ السؤال',
  'ج: الإجابة المتوقَّعة في سطر واحد',
].join('\n');

export function buildQuestionMessages({
  content,
  count,
  type,
}: GenerateQuestionsInput): AiMessage[] {
  const task = [
    `اقرأ النصّ التالي واكتب ${count} ${type === 'choice' ? 'أسئلة اختيار من متعدد' : 'أسئلة قصيرة'} تقيس فهم الطالب له.`,
    '',
    type === 'choice' ? CHOICE_FORMAT : TEXT_FORMAT,
  ].join('\n');

  return [
    { role: 'system', content: SYSTEM },
    // النصّ بعد التعليمة وبفاصل واضح — كما في بقية الطلبات: درسٌ فيه جملة
    // تشبه الأمر يبقى نصّاً يُقرأ لا أمراً يُنفَّذ.
    { role: 'user', content: `${task}\n\n--- النصّ ---\n${content.trim()}` },
  ];
}

const PROMPT_LINE = /^س\s*[:：]\s*(.+)$/;
const ANSWER_LINE = /^ج\s*[:：]\s*(.+)$/;
const OPTION_LINE = /^([+\-−–])\s*(.+)$/;

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 6;

/**
 * قراءة ردّ النموذج.
 *
 * **القاعدة التي تحكم كل سطر هنا: ما لا يُفهم يُسقَط، ولا يُملأ بتخمين.**
 * وأخطرها سؤال اختيار بلا علامة `+`: لو اخترنا له خياراً — الأول مثلاً — لَنشر
 * المعلمُ سؤالاً بمفتاح إجابة **اخترعناه نحن**، ولَصُحِّحت عليه إجابات طلابه.
 * إسقاطُ السؤال يكلّف المعلم أن يكتبه بنفسه؛ وتخمينُ مفتاحه يكلّف طالباً درجةً
 * لا يعرف لماذا خسرها.
 *
 * وكذلك تعدُّد `+`: الشاشة تعرض إجابة واحدة (زرّ اختيار لا مربّع)، ولا سبيل
 * لمعرفة أيّها قصد النموذج — فيُسقَط.
 */
export function parseQuestions(
  raw: string,
  { type, limit }: { type: 'choice' | 'text'; limit: number },
): ParsedQuestions {
  const questions: DraftQuestion[] = [];
  let dropped = 0;
  let prompt: string | null = null;
  let options: DraftOption[] = [];
  let expected: string | null = null;

  const flush = () => {
    const current = prompt;
    prompt = null;
    const collected = options;
    const answer = expected;
    options = [];
    expected = null;

    if (current === null) return;
    if (current.trim() === '') {
      dropped += 1;
      return;
    }

    if (type === 'text') {
      questions.push({ type: 'text', prompt: current.trim(), expectedAnswer: answer });
      return;
    }

    const filled = collected.filter((option) => option.text !== '').slice(0, MAX_OPTIONS);
    if (filled.length < MIN_OPTIONS || filled.filter((option) => option.isCorrect).length !== 1) {
      dropped += 1;
      return;
    }
    questions.push({ type: 'choice', prompt: current.trim(), options: filled });
  };

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    const started = PROMPT_LINE.exec(trimmed);
    if (started !== null) {
      flush();
      prompt = started[1] ?? null;
      continue;
    }
    if (prompt === null) continue;

    const answered = ANSWER_LINE.exec(trimmed);
    if (answered !== null) {
      expected = (answered[1] ?? '').trim() || null;
      continue;
    }

    const option = OPTION_LINE.exec(trimmed);
    if (option !== null) {
      options.push({ text: (option[2] ?? '').trim(), isCorrect: option[1] === '+' });
    }
  }
  flush();

  return { questions: questions.slice(0, limit), dropped };
}
