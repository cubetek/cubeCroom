'use client';

import Link from 'next/link';
import { ArrowLeft, Download, FileText } from 'lucide-react';
import { Card } from '@cubecroom/ui/components/card';
import { buttonVariants } from '@cubecroom/ui/lib/button-variants';
import { cn } from '@cubecroom/ui/lib/utils';
import type { ReleaseSource } from '@/lib/releases/data';
import { useReleases } from '@/lib/releases/use-releases';
import { ReleaseNotes } from '@/components/releases/release-notes';
import { ReleaseDate, ReleaseFeedback, ReleaseVerification, ReleaseVersion } from '@/components/releases/release-status';

const linkClass = 'inline-flex min-h-11 items-center gap-2 font-semibold text-teal-800 underline-offset-4 hover:underline';

export function Downloads({ source }: { source: ReleaseSource }) {
  const { state, refresh } = useReleases(source);
  const release = state.status === 'ready' ? state.catalog.current : null;
  const policyRef = release ? encodeURIComponent(release.tag) : 'main';
  return (
    <>
      <section aria-label="التنزيلات المتاحة">
        <ReleaseFeedback state={state} source={source} refresh={refresh} />
        {release && <>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div><h2 className="text-2xl font-bold"><ReleaseVersion release={release} /></h2><p className="mt-2 text-sm text-slate-500">نُشر في <ReleaseDate release={release} /></p></div>
            <Link href="/changelog" className={linkClass}>سجل التغييرات <ArrowLeft className="size-4" aria-hidden="true" /></Link>
          </div>
          <p className="mb-6 rounded-xl border border-stone-200 bg-white px-5 py-4 text-sm leading-8 text-slate-600">
            {release.preview ? 'المتاح حالياً إصدار تجريبي. ' : 'هذا هو الإصدار المستقر المتاح حالياً. '}
            راجع <a href="#installation-notes" className="font-semibold text-teal-800 underline">ملاحظات التثبيت والتوقيع والتحديث الخاصة بهذه النسخة</a> قبل تشغيلها.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {release.files.map((file) => <Card key={file.id} className="gap-4 rounded-2xl border-stone-200 bg-white p-6 text-slate-900 shadow-none">
              <div><h3 className="text-xl font-semibold"><bdi>{file.label}</bdi></h3><p className="mt-1 text-sm text-slate-500">{file.architecture}</p></div>
              <p className="text-sm text-slate-600">حجم التنزيل: <bdi>{new Intl.NumberFormat('ar-AE', { maximumFractionDigits: 1 }).format(file.size / 1024 ** 2)}</bdi> م.ب</p>
              <a href={file.url} className={cn(buttonVariants({ variant: 'secondary' }), 'min-h-12 justify-between gap-3 rounded-xl bg-teal-700 px-5 text-white hover:bg-teal-800')}>
                تنزيل <bdi>{file.label}</bdi><span className="sr-only"> {file.architecture}</span><Download className="size-4" aria-hidden="true" />
              </a>
            </Card>)}
          </div>
          {release.missingTargets.length > 0 && <p className="mt-5 text-sm leading-8 text-slate-600">لم تُنشر ملفات هذه الأنظمة ضمن هذا الإصدار: {release.missingTargets.map(target => target.label + ' (' + target.architecture + ')').join('، ')}. راجع صفحة الإصدار لمعرفة الملفات المتاحة.</p>}
          <p className="mt-5 text-sm leading-7 text-slate-500">على Mac، اختر Apple Silicon لأجهزة شرائح M، أو Intel للأجهزة الأقدم. تجد نوع الشريحة في «حول هذا الـ Mac».</p>
          <ReleaseVerification release={release} />
          <section id="installation-notes" className="mt-8 scroll-mt-8 rounded-2xl border border-stone-200 bg-white p-6 sm:p-8" aria-labelledby="installation-notes-title">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id="installation-notes-title" className="text-xl font-semibold">ملاحظات الإصدار والتثبيت</h2><a href={release.releaseUrl} className={linkClass}>اقرأها على GitHub <ArrowLeft className="size-4" aria-hidden="true" /></a></div>
            <ReleaseNotes release={release} />
          </section>
        </>}
      </section>
      <section className="mt-12 border-t border-stone-200 pt-8" aria-labelledby="download-license-title">
        <h2 id="download-license-title" className="text-xl font-semibold">الاستخدام والمساهمة</h2>
        <p className="mt-3 max-w-3xl leading-8 text-slate-600">CubeCroom مفتوح المصدر تحت <bdi>AGPL-3.0-only</bdi>. يمكنك استخدامه وتعديله وبيعه واستضافته للتعليم ولأي غرض تجاري أو غير تجاري، وفق شروط الرخصة. الترخيص التجاري البديل اختياري لمن يحتاج شروطاً أخرى.</p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          <a href={`${source.repositoryUrl}/tree/${policyRef}`} className={linkClass}><FileText className="size-4" aria-hidden="true" /> الشيفرة المصدرية</a>
          <a href={`${source.repositoryUrl}/blob/${policyRef}/LICENSE`} className={linkClass}><FileText className="size-4" aria-hidden="true" /> الرخصة وشروط الاستخدام</a>
          <a href={`${source.repositoryUrl}/blob/${policyRef}/COMMERCIAL-LICENSE.md`} className={linkClass}><FileText className="size-4" aria-hidden="true" /> الترخيص التجاري البديل</a>
          <a href={`${source.repositoryUrl}/blob/${policyRef}/CONTRIBUTING.md`} className={linkClass}><FileText className="size-4" aria-hidden="true" /> دليل المساهمة</a>
        </div>
      </section>
      <noscript><p className="mt-6 leading-8 text-slate-600">للاطّلاع على التنزيلات مع تعطيل JavaScript، افتح <a href={`${source.repositoryUrl}/releases`} className="font-semibold text-teal-800 underline">صفحة الإصدارات</a>. إذا لم يتوفر إصدار عام بعد، يمكنك البدء من <a href="/docs/start/getting-started" className="font-semibold text-teal-800 underline">دليل الاستخدام</a>.</p></noscript>
    </>
  );
}
