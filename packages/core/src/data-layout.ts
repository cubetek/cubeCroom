import { stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * تخطيط مجلد بيانات المعلم.
 *
 *   <مجلد البيانات>/
 *     cubecroom.sqlite     القاعدة
 *     files/               نسخ المرفقات بأسماء UUID
 *     Backups/             النسخ الاحتياطية (المكان الافتراضي، قابل للتغيير)
 *
 * اسم ملف القاعدة معرَّف هنا مرة واحدة: تكراره في القشرة وفي صيغة الأرشيف
 * يعني ملفين يفترقان يوم يتغيّر أحدهما.
 */

export const DATABASE_FILE_NAME = 'cubecroom.sqlite';

/**
 * هل في هذا المجلد بيانات CubeCroom؟
 *
 * حارس مسار الاسترجاع في `T01States/٣`: المعلم هناك يبحث عن بياناته الضائعة،
 * وفتحُ مجلد خالٍ ينشئ قاعدة فارغة جديدة — فيرى تطبيقاً يعمل بلا فصوله ويظنّ
 * أن كل شيء ضاع. الرفض قبل الفتح أصدق.
 */
export async function hasExistingData(dataDirectory: string): Promise<boolean> {
  try {
    const info = await stat(join(dataDirectory, DATABASE_FILE_NAME));
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}
