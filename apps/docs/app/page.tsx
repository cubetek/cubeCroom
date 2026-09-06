import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, BookOpen, Check, ChevronDown, Monitor, ShieldCheck, Wifi } from 'lucide-react';
import { Card } from '@cubecroom/ui/components/card';
import { LandingLink } from '@/components/landing/landing-link';
import { EmiratiMotif } from '@/components/landing/emirati-motif';
import { BrandSignature } from '@/components/landing/brand-signature';
import { ProductShowcase } from '@/components/landing/product-showcase';
import { communityLinks, features, guideHighlights, questions, steps } from '@/components/landing/content';

export const metadata: Metadata = {
  title: 'CubeCroom — فصلك معك، والتعلّم يجمعكم',
  description: 'مساحة عربية لإدارة الدروس والأنشطة والحصص على الشبكة المحلية. تطبيق للمعلم، ومتصفح للطالب، وبيانات الفصل على جهازك.',
};

const container = 'mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-12';
const textLink = 'inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-teal-800 hover:underline underline-offset-4';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-stone-50 text-base leading-relaxed text-slate-900 [color-scheme:light] [&_:is(a,summary):focus-visible]:outline-2 [&_:is(a,summary):focus-visible]:outline-offset-4 [&_:is(a,summary):focus-visible]:outline-teal-700">
      <a href="#main" className="sr-only z-50 rounded-lg bg-white p-4 focus:not-sr-only focus:fixed focus:start-4 focus:top-4">انتقل إلى المحتوى</a>
      <header className="border-b border-stone-200 bg-stone-50">
        <div className={`${container} flex min-h-20 flex-wrap items-center justify-between gap-3 py-4`}>
          <Link href="/" aria-label="CubeCroom — الرئيسية"><BrandSignature /></Link>
          <nav aria-label="التنقل الرئيسي" className="order-3 flex w-full flex-wrap justify-center gap-x-6 gap-y-1 text-sm font-medium text-slate-600 lg:order-none lg:w-auto">
            <a href="#features" className="inline-flex min-h-11 items-center hover:text-teal-700">لماذا CubeCroom؟</a>
            <a href="#how-it-works" className="inline-flex min-h-11 items-center hover:text-teal-700">كيف يعمل</a>
            <Link href="/download" className="inline-flex min-h-11 items-center hover:text-teal-700">تنزيل التطبيق</Link>
            <a href="#questions" className="inline-flex min-h-11 items-center hover:text-teal-700">أسئلة شائعة</a>
            <a href="#community" className="inline-flex min-h-11 items-center hover:text-teal-700">المجتمع والتواصل</a>
          </nav>
          <Link href="/docs" className={textLink}>دليل الاستخدام <BookOpen className="size-4" aria-hidden="true" /></Link>
        </div>
      </header>

      <main id="main">
        <section className={`${container} relative grid items-center gap-12 py-14 md:py-20 lg:grid-cols-[1fr_1.1fr] lg:gap-10 lg:py-24`} aria-labelledby="hero-title">
          <div className="relative">
            <EmiratiMotif className="pointer-events-none absolute -top-12 start-0 w-40 text-amber-800/20" />
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-4 py-1.5 text-sm font-medium text-teal-800">
              <Wifi className="size-4" aria-hidden="true" /> مساحة تعلّم، على شبكتك المحلية
            </p>
            <h1 id="hero-title" className="text-4xl font-bold leading-[1.35] sm:text-5xl lg:text-6xl">
              فصلك معك.<br /><span className="text-teal-700">والتعلّم يجمعكم.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-9 text-slate-600">
              دروسك، أنشطتك، وإجابات طلابك في مساحة واحدة. يثبّت المعلم التطبيق على حاسوبه، ويدخل الطلاب من المتصفح عبر رابط يشاركه معهم.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LandingLink href="/download">تنزيل التطبيق</LandingLink>
              <LandingLink href="/docs/start/getting-started">جهّز فصلك الأول</LandingLink>
              <LandingLink href="#product" secondary>شاهد البرنامج</LandingLink>
            </div>
            <Link href="/docs/start/getting-started#student" className={`${textLink} mt-4`}>أنا طالب، كيف أدخل؟ <ArrowLeft className="size-4" aria-hidden="true" /></Link>
            <p className="mt-6 flex items-center gap-2 text-sm text-slate-500"><Check className="size-4 text-teal-700" aria-hidden="true" /> بلا حساب للبدء. والمساعد الذكي اختياري.</p>
          </div>
          <figure className="min-w-0 overflow-hidden rounded-3xl bg-teal-950 p-3 pb-6 sm:p-5">
            <figcaption className="mb-5 flex items-center justify-between gap-3 text-sm text-teal-100">
              <span className="inline-flex items-center gap-2"><Monitor className="size-4" aria-hidden="true" /> لحظة التحضير</span>
              <span className="rounded-full border border-teal-700 px-3 py-1 text-xs">كل شيء يبدأ بهدوء</span>
            </figcaption>
            <a href="/landing/teacher-preparing-emirati.jpg" target="_blank" rel="noreferrer" aria-label="افتح صورة معلم إماراتي يحضّر درسه بالحجم الكامل في تبويب جديد" className="block overflow-hidden rounded-2xl border border-white/20 bg-white shadow-2xl transition-transform motion-safe:hover:-translate-y-1">
              <Image src="/landing/teacher-preparing-emirati.jpg" alt="معلم إماراتي يحضّر درسه في فصل هادئ، مع عبارة مرسومة بقلم أبيض: بدأ الدرس يتشكّل" width={1536} height={1024} priority sizes="(min-width: 1024px) 550px, 90vw" className="h-auto w-full" />
            </a>
            <div className="mt-6 flex items-start gap-3 text-white">
              <ShieldCheck className="mt-1 size-6 shrink-0 text-teal-300" aria-hidden="true" />
              <div><p className="font-semibold">المحتوى عندك، والقرار بيدك.</p><p className="mt-1 text-sm leading-6 text-teal-100">جهّز الدرس بهدوء، وانشره للطلاب عندما تكون مستعدًا.</p></div>
            </div>
          </figure>
        </section>

        <div className="border-y border-stone-200 bg-white/70">
          <div className={`${container} grid gap-6 py-7 text-center text-sm text-slate-600 sm:grid-cols-3`}>
            <p><strong className="mb-1 block text-base text-slate-900">المعلم على جهازه</strong>مصمّم لـ <span dir="ltr" className="inline-block">Linux · macOS · Windows</span></p>
            <p><strong className="mb-1 block text-base text-slate-900">الطالب من المتصفح</strong>دون تثبيت تطبيق على جهاز الطالب</p>
            <p><strong className="mb-1 block text-base text-slate-900">الحصة على شبكتك</strong>الوظائف الأساسية دون إنترنت</p>
          </div>
        </div>

        <section id="features" className={`${container} scroll-mt-8 py-16 md:py-24`} aria-labelledby="features-title">
          <div className="mb-10 grid gap-4 md:grid-cols-2 md:items-end">
            <div><p className="mb-3 text-sm font-semibold text-teal-700">مساحة واحدة للحصة</p><h2 id="features-title" className="text-3xl font-bold leading-snug sm:text-4xl">اهتمامك بالشرح.<br />وأدواتك قريبة منك.</h2></div>
            <p className="max-w-md leading-8 text-slate-600">من تحضير أول درس إلى مراجعة آخر إجابة، كل خطوة مرتبطة بفصلك وطلابك.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, text, href }, index) => (
              <Card key={title} className="group gap-4 rounded-2xl border-stone-200 bg-white p-6 text-slate-900 shadow-none transition-colors hover:border-teal-300">
                <div className="flex items-center justify-between"><Icon className="size-11 rounded-2xl bg-teal-50 p-2.5 text-teal-700" aria-hidden="true" /><span aria-hidden="true" className="text-xs tracking-widest text-stone-400">{String(index + 1).padStart(2, '0')}</span></div>
                <h3 className="text-xl font-semibold">{title}</h3>
                <p className="flex-1 text-base leading-8 text-slate-600">{text}</p>
                <Link href={href} className={textLink}>اكتشف كيف <ArrowLeft className="size-4" aria-hidden="true" /><span className="sr-only">: {title}</span></Link>
              </Card>
            ))}
          </div>
        </section>

        <ProductShowcase />

        <section className={`${container} py-16 md:py-20`} aria-labelledby="guide-updates-title">
          <div className="mb-8 max-w-2xl">
            <p className="mb-3 text-sm font-semibold text-teal-700">خطوتك التالية في الدليل</p>
            <h2 id="guide-updates-title" className="text-3xl font-bold leading-snug sm:text-4xl">من التحضير إلى الفهم، ثم التحديث.</h2>
            <p className="mt-4 leading-8 text-slate-600">شروح للمعلم والطالب، وإعداد المساعد، وحماية البيانات، والمشاركة في تطوير البرنامج.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {guideHighlights.map(({ icon: Icon, title, text, href, label }) => (
              <Card key={href} className="gap-4 rounded-2xl border-stone-200 bg-white p-6 text-slate-900 shadow-none">
                <Icon className="size-6 text-teal-700" aria-hidden="true" />
                <h3 className="text-lg font-semibold">{title}</h3>
                <p className="flex-1 text-sm leading-7 text-slate-600">{text}</p>
                <Link href={href} className={textLink}>{label}<ArrowLeft className="size-4 shrink-0" aria-hidden="true" /></Link>
              </Card>
            ))}
          </div>
        </section>

        <section id="how-it-works" className="relative isolate overflow-hidden scroll-mt-8 bg-teal-950 py-16 text-white md:py-24" aria-labelledby="steps-title">
          <EmiratiMotif className="pointer-events-none absolute -end-12 top-8 -z-10 w-80 text-teal-800/60" />
          <div className={container}>
            <p className="mb-3 text-sm font-medium text-teal-300">من التحضير إلى المشاركة</p>
            <h2 id="steps-title" className="text-3xl font-bold leading-snug sm:text-4xl">ثلاث خطوات. وحصتك تبدأ.</h2>
            <div className="mt-12 grid gap-10 md:grid-cols-3">
              {steps.map((step) => (
                <div key={step.number} className="border-t border-teal-800 pt-6">
                  <span className="text-4xl font-light text-teal-300">{step.number}</span>
                  <h3 className="mt-5 text-2xl font-semibold">{step.title}</h3>
                  <p className="mt-3 leading-8 text-teal-50/80">{step.text}</p>
                  <Link href={step.href} className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-teal-200 underline-offset-4 hover:underline">شاهد الخطوات <ArrowLeft className="size-4" aria-hidden="true" /><span className="sr-only">: {step.title}</span></Link>
                </div>
              ))}
            </div>
            <div className="mt-14 grid gap-5 md:grid-cols-2">
              <figure className="overflow-hidden rounded-3xl border border-teal-800 bg-teal-900/40 p-3">
                <Image
                  src="/landing/class-connected-emirati.jpg"
                  alt="معلمة إماراتية وطلاب متصلون بالحصة من أجهزتهم، مع عبارة مرسومة بقلم أبيض: كلّنا هنا"
                  width={1536}
                  height={1024}
                  sizes="(min-width: 768px) 50vw, 100vw"
                  className="h-auto w-full rounded-2xl"
                />
                <figcaption className="px-3 pb-2 pt-5 text-sm leading-7 text-teal-50/80">ينضم الطلاب من أجهزتهم، وتبقى الحصة أمام المعلم.</figcaption>
              </figure>
              <figure className="overflow-hidden rounded-3xl border border-teal-800 bg-teal-900/40 p-3 md:mt-12">
                <Image
                  src="/landing/review-results-emirati.jpg"
                  alt="معلم إماراتي يراجع نتائج الطلاب بعد الحصة، مع عبارة مرسومة بقلم أبيض: خطوة حلوة اليوم"
                  width={1536}
                  height={1024}
                  sizes="(min-width: 768px) 50vw, 100vw"
                  className="h-auto w-full rounded-2xl"
                />
                <figcaption className="px-3 pb-2 pt-5 text-sm leading-7 text-teal-50/80">بعد المشاركة، تتحول الإجابات إلى صورة أوضح عن التعلّم.</figcaption>
              </figure>
            </div>
          </div>
        </section>

        <section id="questions" className={`${container} grid scroll-mt-8 gap-8 py-16 md:grid-cols-[1fr_1.5fr] md:py-24`} aria-labelledby="questions-title">
          <div><p className="mb-3 text-sm font-semibold text-teal-700">قبل أول حصة</p><h2 id="questions-title" className="text-3xl font-bold sm:text-4xl">أسئلة في محلّها.</h2><p className="mt-4 leading-8 text-slate-600">تفاصيل تساعدك على معرفة ما تحتاجه للبدء.</p><Link href="/docs" className={`${textLink} mt-4`}>تصفّح الدليل الكامل <ArrowLeft className="size-4" aria-hidden="true" /></Link></div>
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {questions.map(({ question, answer }) => (
              <details key={question} className="group py-1">
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold [&::-webkit-details-marker]:hidden">{question}<ChevronDown className="size-5 shrink-0 text-slate-500 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
                <p className="pb-5 pe-8 leading-8 text-slate-600">{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section id="community" className={`${container} scroll-mt-8 pb-16 md:pb-24`} aria-labelledby="community-title">
          <div className="mb-8">
            <p className="mb-3 text-sm font-semibold text-teal-700">نبقى على تواصل</p>
            <h2 id="community-title" className="text-3xl font-bold leading-snug sm:text-4xl">مجتمع CubeCroom قريب منك.</h2>
            <p className="mt-4 leading-8 text-slate-600">انضم إلى المجتمع، أو شاركنا أسئلتك واقتراحاتك.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {communityLinks.map(({ icon: Icon, title, text, href, label }) => (
              <Card key={href} className="min-w-0 gap-4 rounded-2xl border-stone-200 bg-white p-6 text-slate-900 shadow-none">
                <Icon className="size-11 rounded-2xl bg-teal-50 p-2.5 text-teal-700" aria-hidden="true" />
                <h3 className="text-xl font-semibold">{title}</h3>
                <p className="flex-1 leading-8 text-slate-600">{text}</p>
                <a href={href} className={`${textLink} self-start`}>
                  <span className="sr-only">{title}: </span>
                  <span dir="ltr" className="break-all">{label}</span>
                  <ArrowLeft className="size-4 shrink-0" aria-hidden="true" />
                </a>
              </Card>
            ))}
          </div>
        </section>

        <section className={`${container} pb-16`} aria-labelledby="start-title">
          <div className="relative isolate overflow-hidden flex flex-col items-start justify-between gap-6 rounded-3xl border border-amber-900/10 bg-amber-50 p-8 sm:p-12 md:flex-row md:items-center">
            <EmiratiMotif className="pointer-events-none absolute -bottom-3 start-8 -z-10 w-72 text-amber-800/10" />
            <div><h2 id="start-title" className="text-3xl font-bold leading-snug text-teal-950">لنجهّز فصلك الأول.</h2><p className="mt-3 text-teal-800">دليل مصوّر يرافقك، خطوة بخطوة.</p></div>
            <LandingLink href="/docs/start/getting-started">افتح دليل البداية</LandingLink>
          </div>
        </section>
      </main>
      <footer className="border-t border-slate-200">
        <div className={`${container} flex flex-wrap items-center justify-between gap-4 py-8 text-sm text-slate-500`}>
          <Link href="/" aria-label="CubeCroom — الرئيسية"><BrandSignature /></Link>
          <Link href="/docs/project/license" className="inline-flex min-h-11 items-center hover:text-teal-700">الرخصة</Link>
          <Link href="/docs/project/contributing" className="inline-flex min-h-11 items-center hover:text-teal-700">المساهمة</Link>
          <Link href="/docs" className="inline-flex min-h-11 items-center hover:text-teal-700">دليل الاستخدام <ArrowLeft className="ms-2 size-4" aria-hidden="true" /></Link>
        </div>
      </footer>
    </div>
  );
}
