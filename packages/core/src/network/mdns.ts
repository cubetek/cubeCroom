import makeMdns from 'multicast-dns';

/**
 * اسمٌ يُكتب بدل عنوان يُملى — §22.
 *
 * **المشكلة التي يحلّها:** الطالب على حاسوب يكتب بلوحة مفاتيح
 * `http://192.168.4.20:4317` — أربعة أرقام ونقاط ونقطتان ومنفذ. وخطأٌ في رقم
 * واحد يعطيه صفحةً لا تُفتح بلا أن يعرف أين أخطأ. وثلاثون طالباً يكتبونه في
 * أول خمس دقائق من الحصة.
 *
 * فيُعلَن اسمٌ على الشبكة المحلية: `cubecroom.local`. ويندوز وmacOS يحلّان
 * أسماء `.local` أصلاً بلا تثبيت شيء على جهاز الطالب.
 *
 * **وهذا إعلانٌ لا خادم أسماء:** نردّ على من يسأل عن اسمنا وحده، ولا نجيب عن
 * غيره. وما يُعلَن هو عنوان المعلم على الشبكة نفسها التي يسأل منها الطالب.
 */

export const LOCAL_HOSTNAME = 'cubecroom.local';

export type MdnsResponder = {
  readonly hostname: string;
  readonly stop: () => Promise<void>;
};

type Query = {
  readonly questions?: ReadonlyArray<{ name?: string; type?: string }>;
};

/**
 * يبدأ الردّ على `cubecroom.local`.
 *
 * ولا يرمي أبداً: إعلان الاسم **تحسينٌ للراحة لا شرطٌ للعمل**. شبكةٌ تمنع
 * البثّ المتعدد، أو منفذ ٥٣٥٣ مشغول ببرنامج آخر — كلاهما يُسقط الاسم ويُبقي
 * العنوان يعمل. وحصةٌ تتوقف لأن اسماً لطيفاً لم يُعلَن عطلٌ صنعناه بأيدينا.
 */
export function startHostnameResponder(
  address: string,
  hostname: string = LOCAL_HOSTNAME,
): MdnsResponder | null {
  let mdns: ReturnType<typeof makeMdns>;
  try {
    mdns = makeMdns();
  } catch {
    return null;
  }

  const answer = (query: Query): void => {
    const asked = (query.questions ?? []).some(
      (question) =>
        (question.name ?? '').toLowerCase() === hostname &&
        (question.type === 'A' || question.type === 'ANY'),
    );
    if (!asked) return;

    mdns.respond({
      answers: [{ name: hostname, type: 'A', ttl: 120, data: address }],
    });
  };

  mdns.on('query', answer);
  // خطأ في المقبس لا يُسقط التطبيق: الاسم يسقط وحده والعنوان يبقى.
  mdns.on('error', () => undefined);

  return {
    hostname,
    stop: () =>
      new Promise<void>((resolve) => {
        try {
          mdns.removeListener('query', answer);
          mdns.destroy(() => resolve());
        } catch {
          resolve();
        }
      }),
  };
}
