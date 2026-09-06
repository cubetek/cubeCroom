'use client';

import { useEffect, useState } from 'react';
import { legalInfoSchema, type LegalInfo } from '@cubecroom/contracts';
import { Button } from '#components/button';
import { BrandMark } from '#components/brand';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '#components/dialog';

/** Load notices on request; no network access outside the app or classroom portal. */
export function LegalNotice() {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<LegalInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<string | null>(null);
  const [loadingNotices, setLoadingNotices] = useState(false);
  useEffect(() => {
    if (!open || info) return;
    const controller = new AbortController();
    setError(null);
    void fetch('/legal/info.json', { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('Legal information unavailable');
      const value = legalInfoSchema.parse(await response.json());
      if (!controller.signal.aborted) setInfo(value);
    }).catch(() => { if (!controller.signal.aborted) setError('تعذّر فتح معلومات الرخصة. أغلق النافذة ثم حاول مجدداً.'); });
    return () => controller.abort();
  }, [open, info]);

  const loadNotices = async () => {
    setLoadingNotices(true);
    setError(null);
    try {
      const response = await fetch('/legal/notices.txt', { signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error('Third-party notices unavailable');
      setNotices(await response.text());
    } catch { setError('تعذّر فتح إشعارات المكتبات. أعد المحاولة.'); }
    finally { setLoadingNotices(false); }
  };
  return <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) setNotices(null); }}>
    <DialogTrigger asChild><Button variant="ghost" size="sm" data-legal-notice>حول البرنامج والرخصة</Button></DialogTrigger>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3"><BrandMark decorative className="size-9" />حول CubeCroom</DialogTitle>
        <DialogDescription>الرخصة والشيفرة المصدرية وإشعارات المكتبات.</DialogDescription>
      </DialogHeader>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      {!info && !error ? <p role="status">نفتح معلومات الرخصة…</p> : null}
      {info ? <div className="flex min-w-0 flex-col gap-3 text-sm">
        <p>الإصدار {info.version} · <span dir="ltr">{info.license}</span></p>
        <p dir="ltr" className="break-words text-start text-xs text-text-muted">{info.copyright}</p>
        <p>يمكنك استخدام البرنامج وتعديله وإعادة توزيعه وفق AGPL-3.0. يُقدَّم دون ضمان؛ راجع نص الرخصة للتفاصيل.</p>
        <div className="flex flex-wrap gap-4">
          <a className="text-primary underline underline-offset-4" href={info.sourceUrl} target="_blank" rel="noreferrer">الشيفرة المصدرية</a>
          {info.sourceArchiveUrl ? <a className="text-primary underline underline-offset-4" href={info.sourceArchiveUrl} target="_blank" rel="noreferrer">تنزيل مصدر هذه النسخة</a> : null}
        </div>
        <details>
          <summary className="cursor-pointer py-2 font-semibold">نص الرخصة الكامل</summary>
          <pre dir="ltr" className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-hairline p-3 text-left font-mono text-xs">{info.licenseText}</pre>
        </details>
        {info.noticesAvailable ? <Button variant="secondary" onClick={() => void loadNotices()} {...(loadingNotices ? { disabled: true as const, disabledReason: 'نفتح الإشعارات…' } : {})}>تراخيص المكتبات وإشعاراتها</Button> : null}
        {notices ? <pre dir="ltr" className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-hairline p-3 text-left font-mono text-xs">{notices}</pre> : null}
      </div> : null}
    </DialogContent>
  </Dialog>;
}
