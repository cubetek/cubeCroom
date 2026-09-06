import { cp, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { isInsideDirectory } from '../security/paths.js';

/**
 * نقل بيانات المعلم إلى مجلد آخر — `T22`.
 *
 * **ينسخ ولا يَنقل، ولا يحذف القديم أبداً.**
 *
 * النقل الحقيقي (نسخ ثم حذف) يجعل لحظةً واحدة لا توجد فيها إلا نسخة واحدة
 * نصف مكتوبة. وهذه بيانات معلمٍ لا نسخة لها عند أحد — دروسه، وإجابات طلابه،
 * وتصحيحه. فالقديم يبقى حيث هو، ويُقال للمعلم أين هو ليحذفه بنفسه **حين
 * يطمئن** أن الجديد يعمل.
 *
 * والثمن مساحةُ قرصٍ مضاعفة مؤقتاً. وهو ثمنٌ زهيد مقابل احتمال أن يفقد معلمٌ
 * سنةً من عمله لأن النسخ انقطع في منتصفه.
 */

export type MoveDataOptions = {
  readonly from: string;
  readonly to: string;
};

export type MoveDataResult =
  | { readonly status: 'moved'; readonly to: string; readonly oldPath: string }
  | { readonly status: 'refused'; readonly message: string };

/**
 * يرفض ما لا يجوز **قبل** أن يُنسخ بايت واحد.
 *
 * والرفض المبكّر ليس تجميلاً: نسخٌ يبدأ ثم يفشل يترك مجلداً نصفَ ممتلئ يظنّه
 * المعلم بياناته.
 */
export async function moveData(options: MoveDataOptions): Promise<MoveDataResult> {
  const { from, to } = options;

  if (from === to) {
    return { status: 'refused', message: 'هذا هو مكان بياناتك الحالي.' };
  }

  /*
   * المجلد الهدف داخل المصدر يعني نسخاً لا ينتهي: كل ما يُكتب يصير مصدراً
   * جديداً يُنسخ. والعكس — المصدر داخل الهدف — يعني أن الهدف يحوي البيانات
   * أصلاً، فالنسخ فوقها يخلط نسختين.
   */
  if (isInsideDirectory(from, to)) {
    return { status: 'refused', message: 'لا يمكن النقل إلى مجلد داخل مجلد بياناتك الحالي.' };
  }
  if (isInsideDirectory(to, from)) {
    return { status: 'refused', message: 'لا يمكن النقل إلى مجلد يحوي بياناتك الحالية.' };
  }

  try {
    await mkdir(to, { recursive: true });
  } catch {
    return { status: 'refused', message: 'تعذّر إنشاء المجلد الجديد. اختر مكاناً آخر.' };
  }

  // مجلدٌ فيه شيء لا يُكتب فوقه: قد تكون فيه بيانات شخصٍ آخر أو نسخةٌ أقدم.
  const existing = await readdir(to).catch(() => [] as string[]);
  if (existing.length > 0) {
    return {
      status: 'refused',
      message: 'المجلد الجديد ليس فارغاً. اختر مجلداً فارغاً حتى لا تختلط بياناتك بما فيه.',
    };
  }

  try {
    await cp(from, to, { recursive: true });
  } catch {
    return {
      status: 'refused',
      message: 'تعذّر نسخ بياناتك إلى المكان الجديد. بياناتك القديمة سليمة كما هي.',
    };
  }

  return { status: 'moved', to, oldPath: from };
}

/** ملفّ القاعدة في مجلد بيانات — يُفحص وجوده بعد النسخ. */
export function databaseFileIn(directory: string): string {
  return join(directory, 'cubecroom.sqlite');
}
