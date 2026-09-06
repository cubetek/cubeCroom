import { answerDraftSchema, validate, type AnswerDraft } from '@cubecroom/contracts';

/**
 * مسوّدة إجابات الطالب على جهازه — FR-013.
 *
 * **هذا الملف هو الوعد المكتوب في لوحَي `S07` و`S07SendFail`:** «إجاباتك
 * محفوظة على هذا الجهاز — لو أُغلقت الصفحة ستجدها كما تركتها»، و«إجابتك
 * محفوظة على هذا الجهاز ولم تضِع».
 *
 * والشكل يمرّ بمخططه عند القراءة كأي مدخل غير موثوق (`answerDraftSchema`):
 * `localStorage` قد يكون فيه ما كتبه إصدارٌ سابق أو ما تلف. وقد يكون الوصول
 * إليه ممنوعاً أصلاً في تصفّح خاص — وفي كل ذلك يبدأ الطالب من فارغ، ولا تسقط
 * الصفحة عليه وسط الحصة.
 */

export type Draft = AnswerDraft;

export function draftKey(activityId: string): string {
  return `cubecroom:activity:${activityId}`;
}

export function readDraft(activityId: string): Draft | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(draftKey(activityId));
  } catch {
    return null;
  }
  if (raw === null) return null;

  try {
    const parsed = validate(answerDraftSchema, JSON.parse(raw));
    return parsed.ok ? parsed.value : null;
  } catch {
    return null;
  }
}

/**
 * الكتابة لا ترمي أبداً.
 *
 * امتلاء المخزَّن أو منعُه لا يجوز أن يقطع على الطالب إجابته: تبقى في الصفحة،
 * ويبقى الإرسال ممكناً. الفشل هنا يعني «لن تنجو من إغلاق الصفحة» لا «ضاعت».
 */
export function writeDraft(activityId: string, answers: Record<string, string>): Draft {
  const draft: Draft = { answers, savedAt: new Date().toISOString() };
  try {
    window.localStorage.setItem(draftKey(activityId), JSON.stringify(draft));
  } catch {
    // مقصود: انظر تعليق الدالة.
  }
  return draft;
}

export function clearDraft(activityId: string): void {
  try {
    window.localStorage.removeItem(draftKey(activityId));
  } catch {
    // بقاؤها لا يضرّ: القاعدة تمنع إرسالاً ثانياً، والشاشة صارت إيصالاً.
  }
}
