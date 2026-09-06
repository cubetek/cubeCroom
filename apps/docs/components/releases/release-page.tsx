import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { BrandSignature } from '@/components/landing/brand-signature';

export function ReleasePage({ title, description, active, children }: { title: string; description: string; active: 'download' | 'changelog'; children: ReactNode }) {
  return <div className="min-h-screen bg-stone-50 text-base leading-relaxed text-slate-900 [color-scheme:light] [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-4 [&_a:focus-visible]:outline-teal-700">
    <header className="border-b border-stone-200"><div className="mx-auto flex min-h-20 max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
      <Link href="/" aria-label="CubeCroom — الرئيسية"><BrandSignature /></Link>
      <nav aria-label="الإصدارات والدليل" className="flex flex-wrap gap-x-5 text-sm font-semibold text-teal-800">
        <Link href="/download" aria-current={active === 'download' ? 'page' : undefined} className="inline-flex min-h-11 items-center hover:underline">تنزيل التطبيق</Link>
        <Link href="/changelog" aria-current={active === 'changelog' ? 'page' : undefined} className="inline-flex min-h-11 items-center hover:underline">سجل التغييرات</Link>
        <Link href="/docs" className="inline-flex min-h-11 items-center hover:underline">دليل الاستخدام</Link>
      </nav>
    </div></header>
    <main className="mx-auto max-w-5xl px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
      <Link href="/" className="mb-8 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-slate-600 hover:text-teal-700"><ArrowRight className="size-4" aria-hidden="true" /> العودة للرئيسية</Link>
      <div className="mb-10"><h1 className="text-4xl font-bold leading-snug sm:text-5xl">{title}</h1><p className="mt-5 max-w-3xl text-lg leading-9 text-slate-600">{description}</p></div>
      {children}
    </main>
  </div>;
}
