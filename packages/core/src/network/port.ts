import { createServer } from 'node:net';
import { PortUnavailableError } from '../errors.js';

/**
 * اختيار منفذ متاح لبوابة الطالب.
 *
 * ٤٣١٧ هو المنفذ المعروض في ألواح T09، فهو المحاولة الأولى دائماً: رابط ثابت
 * بين الحصص أسهل على المعلم من رابط يتغيّر كل مرة. وإن كان مشغولاً — بنسخة
 * أخرى من التطبيق أو ببرنامج آخر — نتقدّم قليلاً بدل أن نفشل: تعذّر تشغيل
 * الحصة لأن منفذاً محجوز عطلٌ لا يفهمه المعلم ولا يملك حيلة فيه.
 */

export const DEFAULT_PORT = 4317;

/** عدد المنافذ المجرَّبة بعد المفضَّل قبل الاستسلام. */
const SPAN = 10;

export async function isPortAvailable(port: number, host = '0.0.0.0'): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    // بلا `exclusive` قد ينجح الربط فوق منفذ مشغول على بعض الأنظمة.
    probe.listen({ port, host, exclusive: true });
  });
}

export async function findAvailablePort(
  preferred: number = DEFAULT_PORT,
  host = '0.0.0.0',
): Promise<number> {
  for (let port = preferred; port <= preferred + SPAN; port += 1) {
    if (await isPortAvailable(port, host)) return port;
  }
  throw new PortUnavailableError(preferred, preferred + SPAN);
}
