/**
 * صياغة ما يُعرض — **الأصل الواحد**.
 *
 * كانت هذه الدوالّ منسوخة عبر التطبيقين بصياغات متباينة، والتباين كان يظهر
 * للمستخدم لا في الشيفرة وحدها:
 *
 *   • الطلب المعلَّق ثلاث ساعات يُقرأ «قبل ١٨٠ دقيقة» في الرئيسية و«قبل ٣
 *     ساعات» في شاشة الطلبات — الصفّ نفسه، شاشتان.
 *   • مرفقٌ حجمه ١٫٥ ج.ب يراه المعلم كذلك ويراه الطالب «١٥٣٦ م.ب».
 *   • «أمس» تظهر في ثلاث شاشات من عشر، والسبع الباقية تعرض تاريخاً مجرّداً.
 *   • وتسع نسخ من عشر تعرض `Invalid Date` على ختمٍ تالف بدل أن تحتاط له.
 *
 * وموضعها في `contracts` لا في `ui`: صفحات الخادم في بوابة الطالب تحتاجها،
 * وحزمة `ui` مكوّنات React — فاستيرادها هناك يجرّ React إلى ما لا يحتاجه.
 * و`ui` تُعيد تصديرها فلا ينكسر مستهلك قائم.
 */

const ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'] as const;

/** الأرقام اللاتينية إلى عربية — قرار `D6`: ما يراه المستخدم عربيّ الأرقام. */
export function ar(value: string | number): string {
  return String(value).replace(/[0-9]/g, (digit) => ARABIC_INDIC[Number(digit)] ?? digit);
}

/** هل الختم قابل للقراءة أصلاً؟ */
function readable(iso: string): Date | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function clock(date: Date): string {
  return ar(date.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit', hour12: true }));
}

function day(date: Date): string {
  return ar(date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' }));
}

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

export type WhenOptions = {
  /**
   * `'auto'` — الوقت مع اليوم وأمس فقط، وتاريخٌ مجرّد لما قبلهما (اللوح).
   * `'always'` — الوقت مع التاريخ دائماً، لقوائم يُميَّز فيها ملفّان في يوم.
   * `'never'` — يومٌ بلا ساعة: قوائم الطالب تقول «اليوم» ولا تقول متى،
   *   فساعةُ النشر لا تعنيه وتزحم سطراً يقرؤه على هاتف أو لوحيّ.
   */
  readonly time?: 'auto' | 'always' | 'never';
  /** ما يُعرض حين يتعذّر قراءة الختم — بدل `Invalid Date`. */
  readonly fallback?: string;
};

/**
 * «اليوم ٨:٢٠ ص» · «أمس ٤:٠٥ م» · «٢ سبتمبر» — كما في اللوح.
 *
 * والتاريخ يُصاغ عند العرض لا يُخزَّن مصوغاً: ختمٌ مخزَّن بالعربية لا يُرتَّب
 * ولا يُقارَن ولا يُقرأ من نظام آخر.
 */
export function when(iso: string, options: WhenOptions = {}): string {
  const date = readable(iso);
  if (date === null) return options.fallback ?? '—';

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const bare = options.time === 'never';
  const time = bare ? null : clock(date);
  if (sameDay(date, today)) return bare ? 'اليوم' : `اليوم ${time}`;
  if (sameDay(date, yesterday)) return bare ? 'أمس' : `أمس ${time}`;
  return options.time === 'always' ? `${day(date)} ${time}` : day(date);
}

/**
 * «الآن» · «قبل دقيقتين» · «قبل ٣ ساعات».
 *
 * والتصعيد إلى الساعات شرط لا زينة: بلاه يُقرأ طلبٌ عمره ثلاث ساعات «قبل
 * ١٨٠ دقيقة» — وهو رقمٌ يُحسب ولا يُفهم.
 */
export function ago(iso: string, fallback = 'الآن'): string {
  const date = readable(iso);
  if (date === null) return fallback;

  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return 'الآن';
  if (minutes === 1) return 'قبل دقيقة';
  if (minutes === 2) return 'قبل دقيقتين';
  if (minutes < 60) return `قبل ${ar(minutes)} دقيقة`;

  const hours = Math.floor(minutes / 60);
  if (hours === 1) return 'قبل ساعة';
  if (hours === 2) return 'قبل ساعتين';
  return `قبل ${ar(hours)} ساعات`;
}

/**
 * حجم الملف — «٨٤٠ ك.ب» · «١٫٤ م.ب» · «٣١٤ م.ب» · «١٫٥ ج.ب».
 *
 * والفاصلة العربية `٫` فاصلة عشرية حقيقية لا فاصل أجزاء. وفرع الجيجابايت
 * موجود: نسخةٌ بلاه كانت تُري الطالب «١٥٣٦ م.ب» لملفٍّ يراه معلمه «١٫٥ ج.ب».
 */
export function formatBytes(value: number): string {
  if (value < 1024) return `${ar(value)} بايت`;

  const kilobytes = value / 1024;
  if (kilobytes < 1024) return `${ar(Math.round(kilobytes))} ك.ب`;

  const megabytes = kilobytes / 1024;
  if (megabytes < 1024) return `${ar(round(megabytes))} م.ب`;

  return `${ar(round(megabytes / 1024))} ج.ب`;
}

/** فوق المئة يُقرَّب إلى صحيح: «٣١٤٫٢ م.ب» دقّةٌ لا تنفع أحداً. */
function round(value: number): string {
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return String(rounded).replace('.', '٫');
}
