'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
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
} from '@cubecroom/ui';
import type { RosterRow, RosterState } from '@cubecroom/contracts';
import { bridge } from '../lib/bridge';

/**
 * T11 — طلاب الفصل.
 *
 * محور الشاشة تمييز حالتين يخلطهما الناس: **«مقبول» يبقى بين الحصص، و«على
 * الشبكة» هو الموجود في هذه اللحظة**. التمييز بثلاثة: لون، وأيقونة، ونصّ —
 * فمن لا يميّز الأخضر من الرمادي يقرأ الحالة كما يقرؤها غيره.
 *
 * النصّ في اللوح مذكّر ومؤنّث («متصلة الآن» · «متصل الآن»)، والتطبيق لا يسأل
 * الطالب عن جنسه ولا يخمّنه من اسمه — فالعبارة هنا لا تحمل تذكيراً ولا
 * تأنيثاً: «على الشبكة الآن» و«خارج الشبكة». قرار D9.
 */

export type StudentsProps = {
  readonly classId: string;
};

/**
 * الأعمدة الثلاثة الضيّقة — **والحدّ ١٢٨٠ هو الأساس المعتمد لا رقمٌ مختار**.
 *
 * ثلاثة أعمدة ثابتة بـ170px تبتلع 497px من 720px عند 1024×768، فلا يبقى لعمود
 * «الطالب» إلا 127px تأكل منها الحشوة والصورة الرمزية 72px: 55px لاسمٍ مثل
 * «عبد الرحمن الحارثي» يلتفّ ثلاثة أسطر — والاسم هو ما يبحث عنه المعلّم في
 * الصفّ. وينهار عمود الإجراءات إلى 94px فتلتفّ أزرار الطالب المتصل أربعة أسطر.
 *
 * و`max-xl` تعني «كلّ ما دون الأساس 1280 المعتمد»، فلا تمسّ الأساس نفسه.
 *
 * ويبقى عمود «الحالة» فوق المعلن قليلاً لأن الشارة تمنع التفاف «مقبول — خارج
 * الشبكة»؛ ورفع nowrap دون 1280 لم يُقَس أثره فلم يُرفع هنا.
 */
const NARROW = 'w-42.5 max-xl:w-27.5';

export function Students({ classId }: StudentsProps) {
  const [state, setState] = useState<RosterState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<RosterRow | null>(null);
  const [confirm, setConfirm] = useState<RosterRow | null>(null);

  const load = useCallback(async () => {
    try {
      setState(await bridge().rosterList({ classId }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر قراءة قائمة الطلاب.');
    }
  }, [classId]);

  useEffect(() => {
    void load();
    // «تُحدَّث الحالة تلقائياً أثناء الحصة» — والنافذة عشرون ثانية، فأربع
    // ثوانٍ بين القراءات تُظهر الخروج قبل أن يسأل المعلم عنه.
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim();
    return (state?.students ?? []).filter(
      (row) => needle === '' || row.name.includes(needle) || (row.identifier ?? '').includes(needle),
    );
  }, [state, query]);

  const act = async (row: RosterRow, action: 'kick' | 'remove') => {
    setBusyId(row.id);
    setError(null);
    try {
      setState(await bridge().rosterAction({ id: row.id, action }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر تنفيذ هذا الإجراء.');
    } finally {
      setBusyId(null);
    }
  };

  if (state === null) {
    return <div className="m-auto text-text-muted">{error ?? 'نقرأ قائمة الطلاب…'}</div>;
  }

  const offline = state.students.length - state.online;

  return (
    <div className="flex min-h-0 grow flex-col gap-3 overflow-auto">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2.5">
          <Count label="كل المقبولين" value={state.students.length} />
          <Count label="على الشبكة الآن" value={state.online} tone="ok" />
          <Count label="خارج الشبكة" value={offline} />
        </div>
        {/*
         * `ms-auto` تدفع البحث إلى الطرف المقابل للعدّادات — مكانَ حشوةٍ فارغة
         * كانت تفصلهما. و`w-auto` تُبطل `w-full` التي يأتي بها الحقل فيبقى
         * بعرضه المحصور بين ٢٠٠px و٣٠٠px.
         */}
        <Input
          size="sm"
          className="ms-auto w-auto min-w-50 max-w-75"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ابحث باسم الطالب"
          aria-label="ابحث باسم الطالب"
        />
      </div>

      <p className="text-t-label text-text-muted">
        {state.sessionOpen
          ? 'تُحدَّث الحالة تلقائياً أثناء الحصة.'
          : 'دخول الطلاب متوقف، فالجميع خارج الشبكة الآن. القائمة تبقى كما هي بين الحصص.'}
      </p>

      {error !== null ? (
        <Alert tone="error" live>
          {error}
        </Alert>
      ) : null}

      {state.students.length === 0 ? (
        <div className="rounded-lg border border-dashed border-input bg-surface p-8.5 text-center text-text-muted">
          لا طلاب في هذا الفصل بعد. يظهرون هنا حين تقبل طلبات دخولهم.
        </div>
      ) : (
        <Table label="طلاب الفصل">
          <TableHeader>
            <TableRow>
              <TableHead>الطالب</TableHead>
              <TableHead className={NARROW}>المعرّف</TableHead>
              <TableHead className={NARROW}>الحالة</TableHead>
              <TableHead className={NARROW}>آخر نشاط</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <span
                      className="flex size-8.5 shrink-0 items-center justify-center rounded-full bg-canvas font-semibold text-text-2"
                      aria-hidden
                    >
                      {row.name.trim().charAt(0)}
                    </span>
                    <span className="text-t-body font-semibold">{row.name}</span>
                  </div>
                </TableCell>
                <TableCell className={NUMS}>
                  {row.identifier === null || row.identifier === '' ? (
                    <span className="text-text-muted">لم يُدخل</span>
                  ) : (
                    ar(row.identifier)
                  )}
                </TableCell>
                <TableCell>
                  {/* لون + أيقونة + نصّ — ثلاثتها معاً، لا اللون وحده. */}
                  {row.online ? (
                    <Badge tone="ok">على الشبكة الآن</Badge>
                  ) : (
                    /*
                     * `draft` هي الدرجة المحايدة الوحيدة في السلّم، وهي
                     * المقصودة: الخروج من الشبكة ليس خطأً ولا انتظاراً.
                     * والساعة تحلّ محلّ قلم الدرجة لأن المعنى وقتٌ لا مسوّدة.
                     */
                    <Badge tone="draft" icon={<Icon name="clock" size={15} />}>
                      مقبول — خارج الشبكة
                    </Badge>
                  )}
                </TableCell>
                <TableCell className={NUMS}>{activity(row.lastSeenAt)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(row)}>
                      تعديل الاسم
                    </Button>
                    {busyId === row.id ? (
                      <Button variant="ghost" size="sm" disabled disabledReason="جارٍ التنفيذ…">
                        …
                      </Button>
                    ) : (
                      <>
                        {row.online ? (
                          <Button variant="ghost" size="sm" onClick={() => void act(row, 'kick')}>
                            إخراجه من الحصة
                          </Button>
                        ) : null}
                        <Button variant="ghost" size="sm" onClick={() => setConfirm(row)}>
                          إزالته من الفصل
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

      {editing !== null ? (
        <RenameDialog
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
          onError={setError}
        />
      ) : null}

      {confirm !== null ? (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) setConfirm(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{`إزالة «${confirm.name}» من الفصل؟`}</DialogTitle>
              <DialogDescription>
                يخرج من قائمة الفصل ولا يستطيع الدخول من جديد إلا بطلب تقبله. إجاباته السابقة تبقى
                محفوظة كما هي — فلا تنقص نتائج الفصل بلا تفسير.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                إبقاؤه في الفصل
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  const target = confirm;
                  setConfirm(null);
                  void act(target, 'remove');
                }}
              >
                إزالته
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

/** الأرقام في عمودٍ واحد لا تتراقص حين تتغيّر — والقيمة ثانوية فلا تنافس الاسم. */
const NUMS = 'tabular-nums text-text-2';

/** عمودُ حقلٍ واحد داخل الحوار. */
const FIELD = 'flex flex-col gap-1.5';

function RenameDialog({
  row,
  onClose,
  onSaved,
  onError,
}: {
  row: RosterRow;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(row.name);
  const [identifier, setIdentifier] = useState(row.identifier ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await bridge().rosterRename({
        id: row.id,
        name: name.trim(),
        ...(identifier.trim() === '' ? {} : { identifier: identifier.trim() }),
      });
      onSaved();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'تعذّر حفظ التعديل.');
      setBusy(false);
    }
  };

  return (
    // الأب لا يركّب هذا الحوار إلا حين يفتحه، فالفتح ثابتٌ هنا.
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تعديل بيانات الطالب</DialogTitle>
          <DialogDescription>
            التعديل هنا لا يُخرجه من الفصل ولا يمسّ إجاباته — يصحّح ما كتبه عند الدخول فقط.
          </DialogDescription>
        </DialogHeader>

        <div className={FIELD}>
          <Label htmlFor="student-name">الاسم</Label>
          <Input
            id="student-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </div>

        <div className={FIELD}>
          <Label htmlFor="student-identifier">
            المعرّف <span className="text-t-caption font-normal text-text-muted">اختياري</span>
          </Label>
          <Input
            id="student-identifier"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            placeholder="لم يُدخل"
          />
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          {busy ? (
            <Button variant="primary" disabled disabledReason="جارٍ الحفظ…">
              حفظ
            </Button>
          ) : name.trim().length < 2 ? (
            <Button variant="primary" disabled disabledReason="الاسم لا يكفي حرفاً واحداً.">
              حفظ
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void save()}>
              حفظ
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Count({ label, value, tone }: { label: string; value: number; tone?: 'ok' }) {
  return (
    <div
      className={cn(
        'flex min-w-30 flex-col rounded-md border border-border bg-surface px-3.5 py-2.5',
        tone === 'ok' && 'border-ok-border bg-ok-bg text-ok-text',
      )}
    >
      {/*
       * `min-w-[2ch]` بالمحرف لا بالبكسل — ولا رمز في السلّم لعرضٍ يُقاس
       * بالرقم: العدّاد يقفز من ٩ إلى ١٠ كل دقيقة أثناء الحصة، وبلا حدٍّ
       * أدنى بمحرفين يتزحزح عنوانه تحته مع كل قفزة.
       */}
      <span className="min-w-[2ch] text-t-h1 tabular-nums">{ar(value)}</span>
      <span className="text-t-caption">{label}</span>
    </div>
  );
}

function activity(lastSeenAt: string | null): string {
  if (lastSeenAt === null) return 'لم يدخل بعد';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / 60000));
  if (minutes < 1) return 'الآن';
  if (minutes === 1) return 'قبل دقيقة';
  if (minutes === 2) return 'قبل دقيقتين';
  if (minutes < 60) return `قبل ${ar(minutes)} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return 'قبل ساعة';
  if (hours < 24) return `قبل ${ar(hours)} ساعات`;
  return 'قبل أكثر من يوم';
}
