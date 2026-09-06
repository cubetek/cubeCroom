'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  Icon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ar,
  cn,
} from '@cubecroom/ui';
import { ago } from '@cubecroom/contracts';
import type { RequestRow, RequestsState } from '@cubecroom/contracts';
import { bridge } from '../lib/bridge';

/**
 * T10 — طلبات الدخول.
 *
 * المقياس في المصدر أن الموافقة «سريعة جداً»: زرّ «قبول» في كل صفّ، بلا حوار
 * تأكيد ولا خطوة وسطى — نقرة واحدة تُنشئ الطالب وتُدخله الفصل.
 *
 * والقائمة تُحدَّث نفسها كل ثلاث ثوانٍ ومكتوبٌ ذلك على الشاشة، فلا يبحث المعلم
 * عن زرّ تحديث وهو منشغل بحصّته.
 *
 * «تراجع» على الرفض وحده: التراجع عن قبولٍ يعني طالباً دخل الفصل ثم أُخرج
 * منه، وذلك إزالة طالب لا تراجع عن قرار — مكانها T11.
 *
 * **ولا صنف حركةٍ في هذه الشاشة.** كل ثلاث ثوانٍ تُعاد الصفوف، وحركةُ دخولٍ
 * أو تلاشٍ عند كل دورة تجذب عين المعلم إلى جدولٍ لم يتغيّر فيه شيء.
 */

/** «معرّف اختياري» و«وقت الطلب» يكفيهما 160px، ويبقى الباقي لاسم الطالب. */
const NARROW = 'w-40';

/** رسائل الحالة الثلاث تقف وسط المساحة بعرض قراءةٍ واحد — لا تملأ الشاشة. */
const CENTER = 'm-auto max-w-115 text-center text-t-body text-text-muted';

/** الحرف الأول بدل صورة — والاسم بجانبه هو ما يُقرأ، فالدائرة `aria-hidden`. */
const AVATAR = cn(
  'flex size-8.5 shrink-0 items-center justify-center rounded-full',
  'bg-canvas font-semibold text-text-2',
);

/** درجات العدّادات الثلاث — سطحٌ وحدٌّ ونصّ لكلٍّ، لا لونٌ واحد. */
const COUNT_TONE = {
  pending: 'border-pending-border bg-pending-bg text-pending-text',
  ok: 'border-ok-border bg-ok-bg text-ok-text',
  muted: 'border-border bg-surface text-text-2',
} as const;

export type RequestsProps = {
  readonly classId: string;
};

export function Requests({ classId }: RequestsProps) {
  const [state, setState] = useState<RequestsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await bridge().requestsList({ classId }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر قراءة الطلبات.');
    }
  }, [classId]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [load]);

  const decide = async (row: RequestRow, decision: 'approve' | 'reject' | 'undo_reject') => {
    setBusyId(row.id);
    setError(null);
    try {
      await bridge().requestDecide({ id: row.id, decision });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر تنفيذ القرار.');
    } finally {
      setBusyId(null);
    }
  };

  const approveAll = async (expected: number) => {
    setBusyId('all');
    setError(null);
    try {
      setState(await bridge().requestsApproveAll({ classId, expected }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر قبول الطلبات.');
    } finally {
      setBusyId(null);
    }
  };

  if (state === null) {
    return <div className={CENTER}>{error ?? 'نقرأ الطلبات…'}</div>;
  }

  if (state.state === 'closed') {
    return (
      <div className={CENTER}>
        دخول الطلاب متوقف — لا تصل طلبات حتى تفتحه من «تشغيل دخول الطلاب».
      </div>
    );
  }

  if (state.state === 'other_class') {
    return (
      <div className={CENTER}>
        الطلبات الواصلة الآن تخصّ «{state.className}» — أنهِ دخوله أولاً ثم افتح دخول هذا الفصل.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 grow flex-col gap-3.5 overflow-auto">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2.5">
          <Count label="بانتظار الموافقة" value={state.pending.length} tone="pending" />
          <Count label="مقبولون" value={state.accepted} tone="ok" />
          <Count label="مرفوضون" value={state.rejected} tone="muted" />
        </div>
        {/* `ms-auto` تدفع السطر وما بعده إلى الطرف المقابل — مكان الفاصل المرن. */}
        <span className="ms-auto flex items-center gap-1.5 text-t-label text-text-muted">
          <Icon name="clock" size={15} />
          تُحدَّث القائمة تلقائياً
        </span>
        {state.pending.length > 0 ? (
          busyId === 'all' ? (
            <Button variant="primary" disabled disabledReason="جارٍ القبول…">
              قبول الكل
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void approveAll(state.pending.length)}>
              قبول الكل ({ar(state.pending.length)})
            </Button>
          )
        ) : null}
      </div>

      {error !== null ? (
        <Alert tone="error" live>
          {error}
        </Alert>
      ) : null}

      {state.pending.length === 0 ? (
        <div
          className={cn(
            'rounded-lg border border-dashed border-input bg-surface p-8.5',
            'text-center text-text-muted',
          )}
        >
          تظهر الطلبات هنا فور وصولها.
        </div>
      ) : (
        <Table label="جدول طلبات الدخول">
          <TableHeader>
            <TableRow>
              <TableHead>اسم الطالب</TableHead>
              <TableHead className={NARROW}>معرّف اختياري</TableHead>
              <TableHead className={NARROW}>وقت الطلب</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.pending.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <span className={AVATAR} aria-hidden>
                      {row.name.trim().charAt(0)}
                    </span>
                    <div>
                      <div className="text-t-body font-semibold">{row.name}</div>
                      {row.similarToAccepted ? (
                        <div className="mt-0.5 flex items-center gap-1.5 text-t-caption text-pending-text">
                          <Icon name="alert-circle" size={14} />
                          اسم مشابه لطالب مقبول بالفعل
                        </div>
                      ) : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="tabular-nums text-text-2">
                  {row.identifier === null || row.identifier === '' ? (
                    <span className="text-text-muted">لم يُدخل</span>
                  ) : (
                    ar(row.identifier)
                  )}
                </TableCell>
                <TableCell className="tabular-nums text-text-2">{ago(row.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1.5">
                    {busyId === row.id ? (
                      <Button variant="primary" size="sm" disabled disabledReason="جارٍ التنفيذ…">
                        قبول
                      </Button>
                    ) : (
                      <>
                        <Button variant="primary" size="sm" onClick={() => void decide(row, 'approve')}>
                          قبول
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void decide(row, 'reject')}>
                          رفض
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {state.decided.length > 0 ? (
        <Card>
          <CardContent>
            <h3 className="mb-2.5 text-t-body font-semibold">بُتَّ فيها في هذه الحصة</h3>
            <ul className="flex flex-col gap-2">
              {state.decided.map((row) => (
                <li
                  key={row.id}
                  className={cn(
                    'flex items-center gap-2.5 border-t border-border pt-2',
                    // أوّل صفّ بلا خطّ: العنوان فوقه يفصل أصلاً.
                    'first:border-t-0 first:pt-0',
                  )}
                >
                  <span className={AVATAR} aria-hidden>
                    {row.name.trim().charAt(0)}
                  </span>
                  <span className="grow">
                    <span className="text-t-body font-semibold">{row.name}</span>
                    <span className="block text-t-caption tabular-nums text-text-muted">
                      {ago(row.createdAt)}
                    </span>
                  </span>
                  {row.status === 'approved' ? (
                    <Badge tone="ok">مقبول</Badge>
                  ) : (
                    <>
                      <Badge tone="error">مرفوض</Badge>
                      {busyId === row.id ? (
                        <Button variant="ghost" size="sm" disabled disabledReason="جارٍ التنفيذ…">
                          تراجع
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void decide(row, 'undo_reject')}
                        >
                          تراجع
                        </Button>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Count({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'pending' | 'ok' | 'muted';
}) {
  return (
    <div className={cn('flex min-w-30 flex-col rounded-md border px-3.5 py-2.5', COUNT_TONE[tone])}>
      {/* عرض ثابت: العدّاد يتغيّر كل ثلاث ثوانٍ، فلا يهتزّ ما حوله. */}
      <span className="min-w-[2ch] text-t-h1 tabular-nums">{ar(value)}</span>
      <span className="text-t-caption">{label}</span>
    </div>
  );
}
