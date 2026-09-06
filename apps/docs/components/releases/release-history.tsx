'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { Button } from '@cubecroom/ui/components/button';
import { Card } from '@cubecroom/ui/components/card';
import { useReleases } from '@/lib/releases/use-releases';
import type { PublishedRelease, ReleaseSource } from '@/lib/releases/data';
import { ReleaseNotes } from './release-notes';
import { ReleaseDate, ReleaseFeedback, ReleaseVerification, ReleaseVersion } from './release-status';

function HistoryEntry({ release, expanded }: { release: PublishedRelease; expanded: boolean }) {
  const [open, setOpen] = useState(expanded);
  return <Card id={release.tag} className="scroll-mt-8 gap-4 rounded-2xl border-stone-200 bg-white p-6 text-slate-900 shadow-none sm:p-8">
    <div className="flex flex-wrap items-start justify-between gap-3"><h2 className="text-xl font-semibold"><ReleaseVersion release={release} /></h2><span className="text-sm text-slate-500"><ReleaseDate release={release} /></span></div>
    {release.name !== release.tag && <p className="font-medium text-slate-700">{release.name}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button type="button" variant="ghost" aria-expanded={open} aria-controls={`notes-${release.tag}`} onClick={() => setOpen(value => !value)}>ملاحظات الإصدار <ChevronDown className={open ? 'size-4 rotate-180' : 'size-4'} aria-hidden="true" /></Button>
      <a href={release.releaseUrl} className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-800 hover:underline">الإصدار والملفات على GitHub</a>
    </div>
    {open && <div id={`notes-${release.tag}`}><ReleaseNotes release={release} /><ReleaseVerification release={release} /></div>}
  </Card>;
}

export function ReleaseHistory({ source }: { source: ReleaseSource }) {
  const { state, refresh } = useReleases(source);
  const [visible, setVisible] = useState(10);
  const catalog = state.status === 'ready' ? state.catalog : null;
  return <>
    <ReleaseFeedback state={state} source={source} refresh={refresh} />
    {catalog?.current && <p className="mb-7 flex flex-wrap items-center gap-3 text-sm text-slate-600">متاح للتنزيل: <Link href="/download" className="font-semibold text-teal-800 hover:underline"><ReleaseVersion release={catalog.current} /></Link></p>}
    <div className="grid gap-6">{catalog?.history.slice(0, visible).map((release, index) => <HistoryEntry key={release.tag} release={release} expanded={index === 0} />)}</div>
    {catalog && catalog.history.length > visible && <Button className="mt-7" variant="secondary" onClick={() => setVisible(value => value + 10)}>عرض إصدارات أقدم</Button>}
    <p className="mt-8 text-sm leading-8 text-slate-500">{catalog?.limitReached ? 'يعرض السجل أحدث 100 إصدار، وتتوفر الإصدارات الأقدم على GitHub. ' : 'تُقرأ النسخ وتواريخها وملاحظاتها من الإصدارات المنشورة على GitHub. '}<a href={`${source.repositoryUrl}/releases`} className="font-medium text-teal-800 underline">افتح سجل GitHub الكامل</a>.</p>
    <noscript><p className="mt-5">لعرض سجل التغييرات دون JavaScript، افتح <a href={`${source.repositoryUrl}/releases`}>الإصدارات على GitHub</a>.</p></noscript>
  </>;
}
