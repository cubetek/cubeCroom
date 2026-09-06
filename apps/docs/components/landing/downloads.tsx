'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BookOpen, Download, FileText, LoaderCircle, Monitor, RefreshCw } from 'lucide-react';
import { Button } from '@cubecroom/ui/components/button';
import { Card } from '@cubecroom/ui/components/card';
import { buttonVariants } from '@cubecroom/ui/lib/button-variants';
import { cn } from '@cubecroom/ui/lib/utils';
import { parsePublishedDownloads, type DownloadSource, type PublishedDownloads } from './downloads-data';

type State = { status: 'loading' | 'empty' | 'error' } | { status: 'ready'; release: PublishedDownloads };
const linkClass = 'inline-flex min-h-11 items-center gap-2 font-semibold text-teal-800 underline-offset-4 hover:underline';

export function Downloads({ source }: { source: DownloadSource }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 10_000);
    async function load() {
      try {
        const response = await fetch(source.apiUrl, { signal: controller.signal, credentials: 'omit', headers: { Accept: 'application/vnd.github+json' } });
        if (!active) return;
        if (response.status === 404) { setState({ status: 'empty' }); return; }
        if (!response.ok) throw new Error('Release lookup failed.');
        const release = parsePublishedDownloads(await response.json(), source);
        if (active) setState({ status: 'ready', release });
      } catch {
        if (active) setState({ status: 'error' });
      } finally { clearTimeout(timeout); }
    }
    void load();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [source, attempt]);

  const policyRef = state.status === 'ready' ? state.release.tag : 'main';
  return (
    <>
      <section aria-labelledby="download-state-title" aria-live="polite" aria-busy={state.status === 'loading'}>
        {state.status === 'loading' && (
          <Card className="flex-row items-center gap-3 border-stone-200 bg-white p-6 text-slate-700 shadow-none">
            <LoaderCircle className="size-5 shrink-0 motion-safe:animate-spin" aria-hidden="true" />
            <h2 id="download-state-title" className="font-medium">نتحقق من أحدث إصدار متاح للتنزيل…</h2>
          </Card>
        )}
        {state.status === 'empty' && (
          <Card className="gap-4 rounded-2xl border-teal-200 bg-teal-50 p-6 text-slate-900 shadow-none sm:p-8">
            <Monitor className="size-9 text-teal-700" aria-hidden="true" />
            <h2 id="download-state-title" className="text-2xl font-bold">أول إصدار عام قيد التجهيز.</h2>
            <p className="max-w-2xl leading-8 text-slate-600">ستظهر هنا ملفات Windows وmacOS وLinux عند نشرها. يمكنك الآن التعرّف على البرنامج وتجهيز خطوات حصتك الأولى من الدليل.</p>
            <Link href="/docs/start/getting-started" className={linkClass}>افتح دليل البداية <BookOpen className="size-4" aria-hidden="true" /></Link>
          </Card>
        )}
        {state.status === 'error' && (
          <Card className="gap-4 rounded-2xl border-stone-200 bg-white p-6 text-slate-900 shadow-none">
            <h2 id="download-state-title" className="text-xl font-semibold">تعذّر التحقق من التنزيلات الآن.</h2>
            <p className="leading-8 text-slate-600">حاول مرة أخرى، أو افتح صفحة الإصدارات للاطّلاع على الملفات المتاحة.</p>
            <div className="flex flex-wrap items-center gap-4">
              <Button type="button" variant="secondary" onClick={() => { setState({ status: 'loading' }); setAttempt((value) => value + 1); }}>
                <RefreshCw className="size-4" aria-hidden="true" /> إعادة المحاولة
              </Button>
              <a href={`${source.repositoryUrl}/releases`} className={linkClass}>صفحة الإصدارات <ArrowLeft className="size-4" aria-hidden="true" /></a>
            </div>
          </Card>
        )}
        {state.status === 'ready' && (
          <>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 id="download-state-title" className="text-2xl font-bold">الإصدار <bdi>{state.release.version}</bdi></h2>
                <p className="mt-2 text-sm text-slate-500">نُشر في <time dateTime={state.release.publishedAt}>{new Date(state.release.publishedAt).toLocaleDateString('ar-AE', { timeZone: 'UTC' })}</time></p>
              </div>
              <a href={state.release.releaseUrl} className={linkClass}>ما الجديد في هذا الإصدار؟ <ArrowLeft className="size-4" aria-hidden="true" /></a>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {state.release.files.map((file) => (
                <Card key={file.id} className="gap-4 rounded-2xl border-stone-200 bg-white p-6 text-slate-900 shadow-none">
                  <div><h3 className="text-xl font-semibold"><bdi>{file.label}</bdi></h3><p className="mt-1 text-sm text-slate-500">{file.architecture}</p></div>
                  <p className="text-sm text-slate-600">حجم التنزيل: <bdi>{new Intl.NumberFormat('ar-AE', { maximumFractionDigits: 1 }).format(file.size / 1024 ** 2)}</bdi> م.ب</p>
                  <a href={file.url} className={cn(buttonVariants({ variant: 'secondary' }), 'min-h-12 justify-between gap-3 rounded-xl bg-teal-700 px-5 text-white hover:bg-teal-800')}>
                    تنزيل <bdi>{file.label}</bdi><span className="sr-only"> {file.architecture}</span><Download className="size-4" aria-hidden="true" />
                  </a>
                </Card>
              ))}
            </div>
            <p className="mt-5 text-sm leading-7 text-slate-500">على Mac، اختر Apple Silicon لأجهزة شرائح M، أو Intel للأجهزة الأقدم. تجد نوع الشريحة في «حول هذا الـ Mac».</p>
          </>
        )}
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
