'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ar,
  cn,
  formatBytes,
} from '@cubecroom/ui';
import type { StoredFile } from '@cubecroom/contracts';
import { bridge } from '../lib/bridge';
import { when } from './Lessons';

/**
 * T18 — مكتبة الملفات.
 *
 * محور الشاشة عمود **«مستخدَم في»**: بدونه يستحيل تنفيذ الملاحظة الوحيدة التي
 * يفردها المصدر لهذه الشاشة — «تحذير قبل حذف ملف مستخدَم» — فالعمود شرطٌ لا
 * زينة، والمواضع تُعرض بأسمائها لا بعددها.
 */

type Filter = 'all' | 'document' | 'image' | 'clip';

export function Files() {
  const [rows, setRows] = useState<StoredFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<StoredFile | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await bridge().filesList());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر فتح مكتبة ملفاتك.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim();
    return (rows ?? [])
      .filter((row) => filter === 'all' || row.category === filter)
      .filter((row) => needle === '' || row.name.includes(needle));
  }, [rows, filter, query]);

  const totalBytes = (rows ?? []).reduce((sum, row) => sum + row.sizeBytes, 0);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await bridge().filesPick();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر إضافة الملف.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (file: StoredFile, mode: 'guarded' | 'cascade') => {
    setBusy(true);
    setError(null);
    try {
      const result = await bridge().filesRemove({ id: file.id, mode });
      if (result.status === 'in_use') {
        // الحارس في القاعدة هو المرجع لا الواجهة: قد يكون درسٌ ارتبط بالملف
        // في نافذة أخرى بعد آخر قراءة هنا.
        setConfirm({ ...file, usedBy: result.usedBy });
        setAcknowledged(false);
        return;
      }
      setConfirm(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر حذف الملف.');
    } finally {
      setBusy(false);
    }
  };

  const openFolder = async () => {
    const result = await bridge().filesOpenFolder();
    if (result.status === 'failed') setError(result.message);
  };

  if (rows === null) {
    return <div className="m-auto text-text-muted">{error ?? 'نقرأ مكتبة ملفاتك…'}</div>;
  }

  return (
    <div className="flex min-h-0 grow flex-col gap-3 overflow-auto">
      {/* الشريط يلتفّ: أزراره لا تنكمش دون كلماتها، ورقائق الترشيح لا تُقصّ. */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="text-t-h3 tabular-nums">
          {rows.length === 0
            ? 'لا ملفات بعد'
            : `${ar(rows.length)} ${rows.length === 1 ? 'ملف' : rows.length === 2 ? 'ملفان' : 'ملفاً'} · ${formatBytes(totalBytes)}`}
        </div>
        <Input
          size="sm"
          /* حقل بحثٍ لا يتمدّد مع الشريط: اسم الملف قصير، والمتمدّد يزاحم الرقائق. */
          className="w-auto min-w-[200px] max-w-[300px]"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ابحث باسم الملف"
          aria-label="ابحث باسم الملف"
        />
        <div className="flex gap-1.5" role="tablist" aria-label="ترشيح الملفات">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
            الكل
          </Chip>
          <Chip active={filter === 'document'} onClick={() => setFilter('document')}>
            مستندات
          </Chip>
          <Chip active={filter === 'image'} onClick={() => setFilter('image')}>
            صور
          </Chip>
          <Chip active={filter === 'clip'} onClick={() => setFilter('clip')}>
            مقاطع
          </Chip>
        </div>
        <div className="grow" />
        <Button
          variant="secondary"
          onClick={() => void openFolder()}
          icon={<Icon name="folder" size={16} />}
        >
          فتح المجلد على الجهاز
        </Button>
        {busy ? (
          <Button variant="primary" disabled disabledReason="جارٍ النسخ…">
            رفع ملف
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={() => void add()}
            icon={<Icon name="plus" size={16} />}
          >
            رفع ملف
          </Button>
        )}
      </div>

      {error !== null ? (
        <Alert tone="error" live>
          {error}
        </Alert>
      ) : null}

      {rows.length === 0 ? (
        /* الحدّ المتقطّع يقول إن المكان ينتظر محتوى، لا أنه بطاقةٌ فارغة. */
        <div className="rounded-lg border border-dashed border-input bg-surface p-8 text-center text-text-muted">
          مكتبتك فارغة. الملفات التي ترفعها في الدروس تظهر هنا، وتبقى على هذا الجهاز.
        </div>
      ) : visible.length === 0 ? (
        <div className="m-auto text-text-muted">لا ملف يطابق بحثك.</div>
      ) : (
        <Table label="مكتبة الملفات">
          <TableHeader>
            <TableRow>
              <TableHead>الملف</TableHead>
              {/* عمودان بعرضٍ ثابت: الحجم والتاريخ قصيران، فلا يقتطعان من «مستخدَم في». */}
              <TableHead className="w-[130px]">الحجم</TableHead>
              <TableHead>مستخدَم في</TableHead>
              <TableHead className="w-[130px]">تاريخ الإضافة</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    {/* لاحقة الملفّ في مربّعٍ بعرضٍ أدنى: الأسماء تبقى على خطّ واحد. */}
                    <span className="flex h-7 min-w-[42px] shrink-0 items-center justify-center rounded-sm border border-hairline bg-canvas px-1.5 text-t-caption font-bold text-text-2">
                      {row.badge}
                    </span>
                    <span>
                      <span className="block text-t-body font-semibold">{row.name}</span>
                      <span className="block text-t-caption text-text-muted">{row.kind}</span>
                    </span>
                  </div>
                </TableCell>
                <TableCell className="tabular-nums text-text-2">
                  {formatBytes(row.sizeBytes)}
                </TableCell>
                <TableCell>
                  {row.usedBy.length === 0 ? (
                    <span className="text-text-muted">غير مستخدَم</span>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {row.usedBy.map((use) => (
                        <li key={`${use.kind}-${use.id}`}>
                          {use.kind === 'lesson' ? 'درس' : 'نشاط'}
                          {use.published ? '' : ' مسودة'}: {use.title}
                        </li>
                      ))}
                    </ul>
                  )}
                </TableCell>
                <TableCell className="tabular-nums text-text-2">{when(row.createdAt)}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAcknowledged(false);
                      void remove(row, 'guarded');
                    }}
                  >
                    حذف
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {confirm !== null ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirm(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{`حذف «${confirm.name}»؟`}</DialogTitle>
            </DialogHeader>

            <DialogDescription className="text-t-body text-text-2">
              هذا الملف مستخدَم الآن — حذفه يزيله من كل ما يستعمله.
            </DialogDescription>

            <div className="flex flex-col gap-2 rounded-md border border-error-border bg-error-bg px-3.5 py-3">
              <div className="text-t-label font-semibold text-error-text">
                سيُزال المرفق من {countLabel(confirm.usedBy.length)}:
              </div>
              <ul className="flex flex-col gap-1.5">
                {confirm.usedBy.map((use) => (
                  <li
                    key={`${use.kind}-${use.id}`}
                    className="flex flex-wrap items-center gap-1.5 text-t-label"
                  >
                    <span className="text-text-muted">
                      {use.kind === 'lesson' ? 'درس' : 'نشاط'}:
                    </span>
                    <span className="font-semibold">{use.title}</span>
                    {use.published ? (
                      <Badge tone="ok">منشور للطلاب</Badge>
                    ) : (
                      <Badge tone="draft">مسودة</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* العنوان يلفّ المربّع، فنصّ الإقرار كلّه هدفُ نقرٍ واحد. */}
            <Label className="cursor-pointer items-start gap-2.5">
              <Checkbox
                checked={acknowledged}
                onCheckedChange={(next) => setAcknowledged(next === true)}
              />
              <span>أفهم أن الحذف نهائي، وأن ما يستعمله سيفقد هذا المرفق.</span>
            </Label>

            <DialogFooter>
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                إبقاء الملف
              </Button>
              {/* التعطيل مصحوب بنصّ الإقرار نفسه، فلا يحمل اللون المعنى وحده. */}
              {acknowledged ? (
                <Button variant="danger" onClick={() => void remove(confirm, 'cascade')}>
                  حذف نهائياً
                </Button>
              ) : (
                <Button variant="danger" disabled disabledReason="علّم الإقرار أولاً.">
                  حذف نهائياً
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        'h-(--height-control-sm) cursor-pointer rounded-full border px-3 text-t-label',
        'transition-colors duration-200 ease-motion',
        // المختارة تُعرف بحدّها ولونها وثقلها معاً — لا باللون وحده.
        active
          ? 'border-primary bg-primary-soft font-semibold text-primary-on-soft'
          : 'border-hairline bg-surface text-text-2',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function countLabel(count: number): string {
  if (count === 1) return 'موضع واحد';
  if (count === 2) return 'موضعين';
  return `${ar(count)} مواضع`;
}
