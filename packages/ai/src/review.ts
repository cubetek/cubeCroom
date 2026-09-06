import { toLatinDigits } from '@cubecroom/contracts';
import type { AiMessage } from './registry.js';

/**
 * مساعد مراجعة الإجابة النصّية — يخدم `T17Review`.
 *
 * **المشكلة التي يحلّه:** التصحيح الآليّ (`D12`) لا يعمل إلا حين تكون كل
 * الأسئلة اختياراً من متعدد. وسؤالٌ نصّيّ واحد يُعيد المعلم إلى قراءة ثلاثين
 * إجابة بيده — وهو أطول عملٍ متبقٍّ في المنتج كله.
 *
 * فيُقترح عليه **مسوّدة**: درجة وتعليق يقرؤهما ويعدّلهما ثم يعتمدهما بزرّ
 * الحفظ نفسه الذي كان يستعمله. ولا يُحفظ شيء تلقائياً — الدرجة التي تصل
 * الطالب يكتبها معلمه لا آلة.
 *
 * ويتبع النمط نفسه الذي في `questions.ts`: نصٌّ يُحلَّل لا مخرَج مبنيّ، فتبقى
 * الميزة لا تعرف من المزوّد إلا `complete`، ويبقى **الجزء الخطر** — قراءة ردّ
 * النموذج — دالةً خالصة تُفحص بلا شبكة ولا مفتاح.
 */

/** سقف الدرجة — قرار `D5`: رقمية من ٥. */
export const MAX_GRADE = 5;

export type ReviewSuggestionInput = {
  readonly question: string;
  /** مفتاح الإجابة كما كتبه المعلم، إن كتبه. */
  readonly expectedAnswer: string | null;
  readonly studentAnswer: string;
};

export type ReviewSuggestion = {
  /**
   * `null` حين لم يُعِد النموذج درجةً مقروءة **أو أعاد رقماً خارج المدى**.
   *
   * ولا تُقصّ `٧` إلى `٥`: قصُّها يخترع حكماً لم يصدر. والمعلم يضع الدرجة
   * بنفسه عندها، ويبقى التعليق نافعاً.
   */
  readonly grade: number | null;
  /** `null` حين لم يُعِد تعليقاً مقروءاً. */
  readonly comment: string | null;
};

const SYSTEM = [
  'أنت مساعد لمعلّم عربي يصحّح إجابات طلاب المرحلة الابتدائية والمتوسطة.',
  'اكتب بالعربية الفصحى الميسّرة دائماً، مهما كانت لغة ما يصلك.',
  'التعليق موجَّه إلى الطالب مباشرةً، ولا يزيد عن سطرين.',
  'كن منصفاً: إجابةٌ صحيحة بصياغة مختلفة إجابةٌ صحيحة.',
  'لا تخترع خطأً لم يقع، ولا تنسب إلى الطالب ما لم يكتبه.',
  'التزم بالصيغة المطلوبة حرفياً: سطران فقط، بلا مقدّمة ولا تنسيق.',
].join(' ');

export function buildReviewMessages(input: ReviewSuggestionInput): AiMessage[] {
  const key =
    input.expectedAnswer === null || input.expectedAnswer.trim() === ''
      ? 'لم يكتب المعلم إجابة متوقَّعة — احكم على الإجابة بمعناها.'
      : `الإجابة التي يتوقّعها المعلم:\n${input.expectedAnswer.trim()}`;

  const user = [
    `السؤال:\n${input.question.trim()}`,
    key,
    `إجابة الطالب:\n${input.studentAnswer.trim()}`,
    '',
    `أعِد سطرين اثنين فقط بهذه الصيغة حرفياً:`,
    `الدرجة: <رقم من ٠ إلى ${MAX_GRADE}>`,
    'التعليق: <سطر أو سطران للطالب>',
  ].join('\n\n');

  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: user },
  ];
}

/**
 * يقرأ ردّ النموذج — **وهو مدخل غير موثوق كأي مدخل**.
 *
 * ما لا يُقرأ يُترك `null` ولا يُخمَّن: مسوّدةٌ ناقصة يكملها المعلم خيرٌ من
 * درجةٍ اختُرعت له. ولا يُقبل رقمٌ خارج المدى لأن قبوله يعني حكماً لم يصدر.
 */
export function parseReviewSuggestion(raw: string): ReviewSuggestion {
  let grade: number | null = null;
  let comment: string | null = null;

  for (const line of raw.split('\n')) {
    const text = line.trim();
    if (text === '') continue;

    if (grade === null && /^الدرجة\s*[:：]/.test(text)) {
      const digits = toLatinDigits(text).match(/-?\d+(?:[.,]\d+)?/);
      if (digits !== null) {
        const value = Number(digits[0].replace(',', '.'));
        // المدى شرط لا تفضيل: خارجَه لا درجة، لا درجةٌ مقصوصة.
        if (Number.isFinite(value) && value >= 0 && value <= MAX_GRADE) {
          grade = Math.round(value * 2) / 2;
        }
      }
      continue;
    }

    if (comment === null && /^التعليق\s*[:：]/.test(text)) {
      const body = text.replace(/^التعليق\s*[:：]\s*/, '').trim();
      if (body !== '') comment = body;
    }
  }

  return { grade, comment };
}
