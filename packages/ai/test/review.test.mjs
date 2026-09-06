import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReviewMessages, parseReviewSuggestion, MAX_GRADE } from '../dist/index.js';

/*
 * قراءة ردّ النموذج هي الجزء الخطر: ما يخرج من هنا يُعرض للمعلم كمسوّدة
 * درجةٍ تصل طفلاً. فالقاعدة واحدة — **ما لا يُقرأ يُترك فارغاً ولا يُخمَّن**.
 */

test('يقرأ الصيغة المطلوبة', () => {
  const parsed = parseReviewSuggestion('الدرجة: 4\nالتعليق: إجابة جيدة، راجِع المصطلح الأخير.');
  assert.equal(parsed.grade, 4);
  assert.equal(parsed.comment, 'إجابة جيدة، راجِع المصطلح الأخير.');
});

test('ويقرأ الأرقام العربية — النموذج قد يكتب «٤»', () => {
  assert.equal(parseReviewSuggestion('الدرجة: ٤\nالتعليق: أحسنت.').grade, 4);
});

test('والنصف يُقبل: ٣٫٥ حكمٌ شائع في التصحيح', () => {
  assert.equal(parseReviewSuggestion('الدرجة: 3.5\nالتعليق: ناقصة قليلاً.').grade, 3.5);
});

/*
 * **الأهم في هذا الملف.** درجةٌ خارج المدى لا تُقصّ إلى ٥: القصّ يخترع حكماً
 * لم يصدر عن النموذج ولا عن المعلم. تُترك فارغة، ويضعها المعلم بنفسه.
 */
test('ورقمٌ خارج المدى لا يُقصّ — يُترك فارغاً', () => {
  assert.equal(parseReviewSuggestion('الدرجة: 9\nالتعليق: ممتاز.').grade, null);
  assert.equal(parseReviewSuggestion('الدرجة: -2\nالتعليق: خطأ.').grade, null);
});

test('والتعليق يبقى نافعاً ولو سقطت الدرجة', () => {
  const parsed = parseReviewSuggestion('الدرجة: تسعة\nالتعليق: راجِع تعريف التبخّر.');
  assert.equal(parsed.grade, null);
  assert.equal(parsed.comment, 'راجِع تعريف التبخّر.');
});

test('وردٌّ لا يشبه الصيغة لا يُنتج شيئاً', () => {
  const parsed = parseReviewSuggestion('أعتقد أن إجابة الطالب جيدة جداً وتستحق الثناء.');
  assert.equal(parsed.grade, null);
  assert.equal(parsed.comment, null);
});

test('ومقدّمةٌ قبل الصيغة لا تمنع قراءتها', () => {
  const parsed = parseReviewSuggestion('حسناً، إليك التقييم:\n\nالدرجة: 5\nالتعليق: إجابة كاملة.');
  assert.equal(parsed.grade, 5);
  assert.equal(parsed.comment, 'إجابة كاملة.');
});

test('الطلب يحمل السؤال ومفتاح الإجابة وإجابة الطالب', () => {
  const [system, user] = buildReviewMessages({
    question: 'ما سبب تكوّن الغيوم؟',
    expectedAnswer: 'تكاثف بخار الماء',
    studentAnswer: 'لما يبرد البخار يصير غيوم',
  });
  assert.equal(system.role, 'system');
  assert.match(user.content, /ما سبب تكوّن الغيوم؟/);
  assert.match(user.content, /تكاثف بخار الماء/);
  assert.match(user.content, /لما يبرد البخار/);
});

/*
 * بلا مفتاح إجابة يُقال ذلك صراحةً للنموذج. وإسكاتُه يجعله يفترض مفتاحاً
 * غير موجود فيصحّح على معيارٍ اخترعه هو.
 */
test('وبلا مفتاح إجابة يُقال ذلك صراحةً لا يُسكت عنه', () => {
  const [, user] = buildReviewMessages({
    question: 'اشرح دورة الماء.',
    expectedAnswer: null,
    studentAnswer: 'الماء يتبخر وينزل مطراً.',
  });
  assert.match(user.content, /لم يكتب المعلم إجابة متوقَّعة/);
});

test('وسقف الدرجة هو سقف D5', () => {
  assert.equal(MAX_GRADE, 5);
});
