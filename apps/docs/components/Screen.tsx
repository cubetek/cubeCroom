import type { CSSProperties } from 'react';

/**
 * لقطة شاشة **مشروحة عليها** — الإشارة مربوطة بموضع نصٍّ حقيقي.
 *
 * المواضع تُقاس لحظة الالتقاط من العنصر الذي يحمل النصّ، وتُكتب هنا نِسَباً
 * مئوية لا بكسلات: فالصورة تُعرَض بأيّ عرض والإشارة تبقى فوق ما تشير إليه.
 *
 * وإن اختفى العنصر من الواجهة **فشل الالتقاط** قبل أن يُبنى الدليل — فلا
 * يُنشر سهمٌ يشير إلى فراغ. وهذا هو الفرق بين دليلٍ يشيخ بصمت ودليلٍ يسقط
 * بصوت حين يشيخ.
 */

export type Mark = {
  readonly n: number;
  readonly at: string;
  readonly text: string;
  readonly rect: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
};

export type ScreenProps = {
  readonly src: string;
  readonly alt: string;
  readonly view: { readonly width: number; readonly height: number };
  readonly marks?: readonly Mark[];
};

const percent = (value: number) => `${value.toFixed(2)}%`;

export function Screen({ src, alt, view, marks = [] }: ScreenProps) {
  return (
    <figure className="not-prose my-6">
      {/*
       * `direction: ltr` على غلاف الصورة — **والصفحة كلّها من اليمين إلى اليسار**.
       *
       * المواضع تُقاس بـ`getBoundingClientRect().x`: مسافةٌ من الحافة **اليسرى**
       * دائماً، لا من حافة البداية. وخاصيّة `inset-inline-start` تعني «اليمين»
       * في صفحةٍ عربية — فتنقلب كل إشارة إلى الجهة المقابلة، وتشير إلى ما
       * ليس المقصود بدل أن تختفي. عطلٌ لا يُرى إلّا بمقارنةٍ متأنّية.
       *
       * فتُثبَّت الجهة هنا وتُستعمل `left` الفيزيائية: الصورة نقشٌ ثابت لا
       * يتبع اتجاه النصّ حوله.
       */}
      {/*
       * الصورة تتجاوز حشوة المقال، والقائمة تحتها لا تتجاوزها.
       *
       * ‏`md:-mx-6` و`xl:-mx-8` ليسا مقاسين مختارين: هما حشوة المقال نفسها
       * في fumadocs (`px-4 md:px-6` وxl:px-8‎)، بالسالب. فالصورة تلامس حافّة
       * ‎#nd-page‎ ولا تتجاوزها — لا شريط تمرير أفقيّ (مقيس: ‎scrollWidth‎
       * يساوي عرض النافذة عند 768 و1024 و1280 و1920). وتكسب 48px عند شاشة
       * المعلّم 1024×768: من 688px إلى 736px من أصل 1264px التُقطت بها.
       *
       * والإزاحة هنا لا على `figure`: لو وُضعت على الشكل كلّه لاتّسعت معها
       * قائمةُ الشروح فخرج سطرُها عن محاذاة النصّ حولها.
       *
       * و`@container` لأجل الدبّوس أدناه — يقيس نفسه بعرض الصورة لا بعرض
       * النافذة، وعرضُ الصورة هو ما يتغيّر هنا.
       */}
      <div
        dir="ltr"
        className="@container relative overflow-hidden rounded-lg border border-fd-border bg-fd-card md:-mx-6 xl:-mx-8"
      >
        <img src={src} alt={alt} width={view.width} height={view.height} className="block h-auto w-full" loading="lazy" />

        {marks.map((mark) => {
          const halo = {
            '--mark-left': percent((mark.rect.x / view.width) * 100),
            '--mark-top': percent((mark.rect.y / view.height) * 100),
            '--mark-width': percent((mark.rect.w / view.width) * 100),
            '--mark-height': percent((mark.rect.h / view.height) * 100),
          } as CSSProperties;
          const pin = {
            '--mark-left': percent(((mark.rect.x + mark.rect.w / 2) / view.width) * 100),
            '--mark-top': percent(((mark.rect.y + mark.rect.h / 2) / view.height) * 100),
          } as CSSProperties;
          return (
            <span key={mark.n}>
              <span
                aria-hidden
                className="absolute left-(--mark-left) top-(--mark-top) h-(--mark-height) w-(--mark-width) rounded-md border-2 border-red-600"
                style={halo}
              />
              <span
                aria-hidden
                // الرقم يتمركز على النقطة: نصف عرضه ونصف ارتفاعه إلى الخلف.
                //
                // ومقاسه يتبع عرض الصورة (cqw) لا البكسل الثابت: الهالة نِسَبٌ
                // مئوية فتتقلّص مع الصورة، والدبّوس كان 24px في كل عرض. من ٣٦
                // إشارة في الدليل صارت ٢٩ هالةً أضيق من دبّوسها عند 1024×768 —
                // وأسوأها إشارة «قبول» في t10-requests (26×22 عند الالتقاط):
                // تصير 14×12px تحت قرصٍ 24px، فيغطّي الدبّوس الزرَّ الذي يشير
                // إليه كلَّه.
                //
                // مقيساً بعد الإصلاح: 14px عند نافذة 768، و19.6px عند 1024،
                // و24px عند 1920. فالحدّ الأعلى 24px يُبقي المظهر كما هو على
                // الشاشات العريضة، والأدنى 14px يُبقي الرقم مقروءاً على اللوحيّ
                // الرأسيّ بدل أن يتلاشى.
                //
                // والحشوة بـ`em` لا بـ`px-1` الثابتة: 4px ثابتة تتجاوز `min-w`
                // عند أصغر مقاس فيصير القرص بيضةً 17×14 بدل دائرة. وبالـ`em`
                // تتبع الحشوةُ حجمَ الرقم فيبقى `min-w` هو الحاكم — ويتّسع
                // القرص وحده إن جاء رقمٌ من خانتين.
                className="absolute left-(--mark-left) top-(--mark-top) grid h-[clamp(14px,2.6cqw,24px)] min-w-[clamp(14px,2.6cqw,24px)] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white bg-red-600 px-[0.25em] text-[clamp(9px,1.6cqw,14px)] font-bold text-white"
                style={pin}
              >
                {mark.n}
              </span>
            </span>
          );
        })}
      </div>

      {marks.length > 0 ? (
        <ol className="mt-4 grid list-none gap-3 p-0">
          {marks.map((mark) => (
            <li key={mark.n} className="flex items-start gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-red-600 text-[13px] font-bold text-white">
                {mark.n}
              </span>
              <span className="text-sm">
                <strong className="block">{mark.at}</strong>
                <span className="text-fd-muted-foreground">{mark.text}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </figure>
  );
}

/** شارة الجهاز — «هل هذه شاشة المعلم أم شاشة الطالب؟» أول ما يسأله القارئ. */
export function Device({ who }: { who: 'المعلم' | 'الطالب' }) {
  const teacher = who === 'المعلم';
  return (
    <span
      className={`not-prose inline-block rounded-full px-3 py-1 text-xs font-semibold text-white ${
        teacher ? 'bg-indigo-600' : 'bg-teal-700'
      }`}
    >
      جهاز {who}
    </span>
  );
}
