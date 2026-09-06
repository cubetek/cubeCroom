'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@cubecroom/ui';
import type { UpdateChannel, UpdateState } from '@cubecroom/contracts';
import { bridge } from '../lib/bridge';
import { getUpdateFlushIssues, subscribeUpdateFlushIssues, retryUpdateFlushIssue, discardUpdateFlushIssue, type UpdateFlushIssue } from '../lib/update-flush';

export function UpdateSettings() {
  const [state, setState] = useState<UpdateState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<UpdateFlushIssue[]>([]);
  const [discard, setDiscard] = useState<UpdateFlushIssue | null>(null);
  useEffect(() => {
    const refresh = () => setIssues(getUpdateFlushIssues());
    refresh();
    return subscribeUpdateFlushIssues(refresh);
  }, []);
  useEffect(() => {
    let alive = true;
    const api = bridge();
    const off = api.onUpdateState((next) => { if (alive) setState(next); });
    void api.updateState().then((next) => { if (alive) setState(next); }).catch(() => { if (alive) setError('تعذّر قراءة حالة التحديث.'); });
    return () => { alive = false; off(); };
  }, []);
  const run = async (action: () => Promise<UpdateState>) => {
    setError(null);
    try { setState(await action()); } catch { setError('تعذّر تنفيذ الطلب. أعد المحاولة بعد اكتمال العمليات الجارية.'); }
  };
  const busy = state === null || ['checking', 'downloading', 'preparing', 'installing'].includes(state.phase);
  return <div className="flex w-full min-w-0 flex-col gap-3" data-update-settings>
    <p className="text-t-caption text-text-muted" role="status" aria-live="polite">{state?.message ?? 'نقرأ حالة التحديث…'}</p>
    {error ? <Alert tone="error">{error}</Alert> : null}
    {issues.map((issue) => <Alert key={issue.id} tone="error">
      <div className="flex flex-col gap-2">
        <p className="font-semibold">تعديلات معلقة: {issue.label}</p>
        <p>{issue.message}</p>
        <div className="flex flex-wrap gap-2">
          {issue.canRetry ? <Button variant="secondary" onClick={() => {
            setError(null);
            void retryUpdateFlushIssue(issue.id).catch(() => setError('لم تُحفظ التعديلات بعد. راجع مساحة القرص ومحتوى الصفحة ثم حاول مجدداً.'));
          }}>إعادة محاولة الحفظ</Button> : null}
          {issue.canDiscard ? <Button variant="secondary" onClick={() => setDiscard(issue)}>تجاهل التعديلات المعلقة…</Button> : null}
        </div>
      </div>
    </Alert>)}
    <div className="flex flex-wrap items-center gap-2">
      <Select value={state?.channel ?? 'stable'} disabled={busy} onValueChange={(channel) => void run(() => bridge().updateChannel(channel as UpdateChannel))}>
        <SelectTrigger className="w-40" aria-label="قناة التحديث"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="stable">الإصدارات المستقرة</SelectItem><SelectItem value="beta">الإصدارات التجريبية</SelectItem></SelectContent>
      </Select>
      <Button variant="secondary" {...(busy || state?.phase === 'unavailable' ? { disabled: true as const, disabledReason: state?.phase === 'unavailable' ? 'التحديث يحتاج نسخة مثبتة وإصداراً موثّقاً.' : 'انتظر اكتمال العملية الحالية.' } : {})} onClick={() => void run(() => bridge().updateCheck())}>التحقق الآن</Button>
      {state?.phase === 'available' ? <Button onClick={() => void run(() => bridge().updateDownload())}>تنزيل {state.availableVersion}</Button> : null}
      {state?.phase === 'ready' ? <Button onClick={() => void run(() => bridge().updateInstall())}>إعادة التشغيل والتحديث</Button> : null}
    </div>
    {state?.phase === 'downloading' ? <progress className="h-2 w-full accent-primary" aria-label="تقدم تنزيل التحديث" max={100} value={state.progress} /> : null}
    {state?.checkedAt ? <p className="text-t-caption text-text-muted">آخر تحقق: {new Date(state.checkedAt).toLocaleString('ar-AE')}</p> : null}
    <Dialog open={discard !== null} onOpenChange={(open) => { if (!open) setDiscard(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تجاهل التعديلات التي لم تُحفظ؟</DialogTitle>
          <DialogDescription>ستفقد التعديلات المعلقة في «{discard?.label}». تبقى النسخة المحفوظة على جهازك كما هي. راجع عملك قبل المتابعة.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setDiscard(null)}>الاحتفاظ بالتعديلات</Button>
          <Button onClick={() => {
            if (!discard) return;
            try { discardUpdateFlushIssue(discard.id); setDiscard(null); }
            catch { setError('تغيرت حالة الحفظ. انتظر اكتماله ثم راجع المحاولة.'); setDiscard(null); }
          }}>تجاهل هذه التعديلات</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}
