import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Expand, Monitor, Smartphone } from 'lucide-react';
import { EmiratiMotif } from './emirati-motif';

const screens = [
  { src: '/screens/lesson-editor.png', width: 1280, height: 800, role: 'على جهاز المعلم', title: 'فكرتك تتحوّل إلى درس.', text: 'جهّز صفحة الطالب وخطة الحصة ونشاط التحقق، ثم راجع المحتوى وحرّره وانشره عندما يكون جاهزًا.', alt: 'صفحة الدرس في CubeCroom مع مساحة التجهيز وخطة المعلم والتحرير اليدوي', icon: Monitor },
  { src: '/screens/s07-question.png', width: 1264, height: 749, role: 'في متصفح الطالب', title: 'ومن الدرس، تبدأ المشاركة.', text: 'يصل الطالب إلى النشاط ويجيب من متصفحه على الشبكة نفسها.', alt: 'نشاط الطالب داخل CubeCroom يعرض سؤالًا وخيارات الإجابة', icon: Smartphone },
];

export function ProductShowcase() {
  return (
    <section id="product" className="relative isolate overflow-hidden scroll-mt-8 border-y border-stone-200 bg-white py-16 md:py-24" aria-labelledby="product-title">
      <EmiratiMotif className="pointer-events-none absolute -end-10 bottom-8 -z-10 w-80 text-amber-800/15" />
      <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-12">
        <div className="mb-12 max-w-2xl">
          <p className="mb-3 text-sm font-semibold text-teal-700">من داخل CubeCroom</p>
          <h2 id="product-title" className="text-3xl font-bold leading-snug sm:text-4xl">مساحتك للتحضير.<br />ومساحتهم للاكتشاف.</h2>
          <p className="mt-4 leading-8 text-slate-600">لقطات فعلية من البرنامج، من كتابة الدرس إلى مشاركة الطالب. افتح أي لقطة لرؤية التفاصيل.</p>
        </div>
        <div className="space-y-14">
          {screens.map(({ src, width, height, role, title, text, alt, icon: Icon }, index) => (
            <div key={src} className="grid items-center gap-6 lg:grid-cols-[.65fr_1.6fr] lg:gap-10">
              <div>
                <p className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-teal-800"><Icon className="size-4" aria-hidden="true" />{role}</p>
                <h3 className="text-2xl font-bold leading-relaxed">{title}</h3>
                <p className="mt-3 max-w-sm leading-8 text-slate-600">{text}</p>
                <span aria-hidden="true" className="mt-6 block text-5xl font-light text-stone-200">{index === 0 ? '٠١' : '٠٢'}</span>
              </div>
              <figure className="min-w-0 overflow-hidden rounded-2xl border border-stone-200 bg-stone-50 p-2 shadow-lg shadow-teal-950/5 sm:p-3">
                <a href={src} target="_blank" rel="noreferrer" className="group block rounded-xl" aria-label={`${alt} — فتح الصورة بالحجم الكامل في تبويب جديد`}>
                  <Image src={src} alt={alt} width={width} height={height} sizes="(min-width: 1280px) 780px, (min-width: 1024px) 65vw, 95vw" className="h-auto w-full rounded-lg border border-stone-200" />
                  <span className="flex min-h-11 items-center justify-end gap-2 px-2 pt-2 text-xs font-medium text-teal-800 group-hover:underline"><Expand className="size-3.5" aria-hidden="true" />عرض التفاصيل</span>
                </a>
              </figure>
            </div>
          ))}
        </div>
        <Link href="/docs" className="mt-10 inline-flex min-h-12 items-center gap-3 font-semibold text-teal-800 underline-offset-4 hover:underline">تصفّح الدليل المصوّر<ArrowLeft className="size-4" aria-hidden="true" /></Link>
      </div>
    </section>
  );
}
