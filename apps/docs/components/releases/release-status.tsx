'use client';

import Link from 'next/link';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import { Button } from '@cubecroom/ui/components/button';
import { Card } from '@cubecroom/ui/components/card';
import { useReleases } from '@/lib/releases/use-releases';
import type { ReleaseState } from '@/lib/releases/client';
import { RELEASE_VERIFICATION_LABELS, type PublishedRelease, type ReleaseSource } from '@/lib/releases/data';

export function ReleaseVersion({ release }: { release: PublishedRelease }) {
  return <span className="inline-flex flex-wrap items-center gap-2"><span>الإصدار <bdi>{release.version}</bdi></span><span className={release.preview ? 'rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900' : 'rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-xs font-medium text-teal-800'}>{release.preview ? 'تجريبي · Preview' : 'مستقر'}</span></span>;
}

export function ReleaseDate({ release }: { release: PublishedRelease }) {
  return <time dateTime={release.publishedAt}>{new Date(release.publishedAt).toLocaleDateString('ar-AE', { timeZone: 'UTC' })}</time>;
}

export function CurrentVersion({ source }: { source: ReleaseSource }) {
  const { state } = useReleases(source);
  const current = state.status === 'ready' ? state.catalog.current : null;
  return <p className="mt-4 text-sm leading-7 text-slate-600" aria-live="polite">
    {current ? <Link href="/download" className="inline-flex min-h-11 items-center gap-2 font-medium hover:text-teal-800"><ReleaseVersion release={current} />{state.status === 'ready' && state.stale && <span className="text-xs text-slate-500">آخر بيانات متاحة</span>}</Link>
      : state.status === 'loading' ? 'جارٍ التحقق من الإصدار المتاح…'
        : state.status === 'error' ? <a href={`${source.repositoryUrl}/releases`} className="font-medium text-teal-800 underline">الإصدارات المتاحة على GitHub</a> : 'لم يُنشر إصدار عام بعد.'}
  </p>;
}

export function ReleaseFeedback({ state, source, refresh }: { state: ReleaseState; source: ReleaseSource; refresh: () => Promise<void> }) {
  if (state.status === 'ready' && state.catalog.current && !state.stale) return null;
  const title = state.status === 'loading' ? 'نتحقق من الإصدارات المنشورة…' : state.status === 'error' ? 'تعذّر التحقق من الإصدارات الآن.' : state.stale ? 'نعرض آخر بيانات متاحة.' : 'لم يُنشر إصدار عام بعد.';
  const description = state.status === 'error'
    ? state.failure === 'rate-limit' ? 'وصل GitHub إلى حد الطلبات المتاحة حالياً. يمكنك المحاولة لاحقاً أو فتح صفحة الإصدارات مباشرة.' : 'تحقق من الاتصال، ثم حاول مرة أخرى أو افتح صفحة الإصدارات مباشرة.'
    : state.status === 'ready' && state.stale ? 'تعذّر تحديث البيانات. راجع صفحة الإصدار على GitHub قبل التنزيل إذا كنت تحتاج التأكد من أحدث نسخة.' : 'تظهر النسخة والملفات وسجل التغييرات تلقائياً عند نشر إصدار على GitHub.';
  return <Card className="mb-6 gap-3 rounded-2xl border-stone-200 bg-white p-6 text-slate-900 shadow-none" role="status" aria-busy={state.status === 'loading'}>
    <p className="flex items-center gap-3 font-semibold">{state.status === 'loading' && <LoaderCircle className="size-5 motion-safe:animate-spin" aria-hidden="true" />}{title}</p>
    {state.status !== 'loading' && <><p className="text-sm leading-8 text-slate-600">{description}</p><div className="flex flex-wrap items-center gap-4">
      <Button type="button" variant="secondary" onClick={() => { void refresh(); }}><RefreshCw className="size-4" aria-hidden="true" /> إعادة المحاولة</Button>
      <a href={`${source.repositoryUrl}/releases`} className="inline-flex min-h-11 items-center font-semibold text-teal-800 hover:underline">صفحة الإصدارات على GitHub</a>
    </div></>}
  </Card>;
}

export function ReleaseVerification({ release }: { release: PublishedRelease }) {
  if (!release.verification.length) return null;
  return <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm">{release.verification.map(file => <a key={file.name} href={file.url} className="inline-flex min-h-11 items-center font-medium text-teal-800 underline underline-offset-4">{RELEASE_VERIFICATION_LABELS[file.name]}</a>)}</div>;
}
