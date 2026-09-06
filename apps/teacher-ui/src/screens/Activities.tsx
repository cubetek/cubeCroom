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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ar,
  cn,
} from '@cubecroom/ui';
import type { TeacherActivitySummary } from '@cubecroom/contracts';
import { bridge } from '../lib/bridge';
import { ActivityBuilder } from './ActivityBuilder';
import { Submissions } from './Submissions';

/**
 * T15 — الأنشطة والنتائج.
 *
 * الجدول يتقاسم أنماطه مع `T12`: هما جدولان لنفس المعلم في نفس الفصل، وفرقٌ
 * بصريٌّ بينهما يجعله يظنّ أنه في مكان آخر. وما كان يتقاسمانه ورقةَ أنماط
 * (`Lessons.module.css`) صار يتقاسمانه مكوّن `Table` من المكتبة — والمصدر
 * واحد في الحالين، لكنّ الثاني لا يجعل شاشةً تستورد ملفّ شاشةٍ أخرى.
 *
 * عمود «الإجابات» يقرأ حاله من عدد المسلَّم: ما دام النشاط مسودة فلا كسر ولا
 * صفر — بل شرطة، لأن «٠ من ٢١» تُقرأ إخفاقاً وهي ليست إخفاقاً.
 */

type Filter = 'all' | 'published' | 'draft';

/**
 * ميزانية الأعمدة الضيّقة — **١٤٠px فوق الأساس و١٠٠px تحته**.
 *
 * ثلاثة أعمدة ثابتة بـ140px تبتلع 420px من 720px عند 1024×768 — أكثر من نصف
 * الجدول لمحتوى شبه فارغ («سؤالان» و«٣ من ٢١») — فينهار عمود «النشاط»، وهو
 * محور الشاشة، ويلتفّ عنوانه أسطراً، وينهار معه عمود الإجراءات وأزراره الأربعة
 * فتلتفّ هي الأخرى. ارتفاع الصفّ يرتفع، فلا تُقرأ ثلاثة أنشطة دفعةً واحدة في
 * منفذ ارتفاعه 768px.
 *
 * وخفضُ ميزانية الأعمدة لا تصغيرُ الخطّ: هذا جدولٌ يتابع منه المعلّم طلابه.
 *
 * و`max-[1280px]` عند Tailwind تعني `width < 1280px` — أي «كلّ ما دون الأساس
 * 1280 المعتمد، فلا يمسّ الأساس» حرفياً، وهي مكافئة لـ`max-width: 1279px`
 * التي كانت في الورقة.
 */
const NARROW = 'w-35 max-[1280px]:w-25';

export type ActivitiesProps = {
  readonly classId: string;
  readonly className: string;
  readonly onOpenAiSettings: () => void;
};

export function Activities({ classId, className, onOpenAiSettings }: ActivitiesProps) {
  const [rows, setRows] = useState<TeacherActivitySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [resultsId, setResultsId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TeacherActivitySummary | null>(null);
  /**
   * النسخ إلى فصل آخر — الفصول تُجلب عند فتح الحوار لا مع الجدول.
   *
   * أغلب فتحات هذه الشاشة لا تنتهي بنسخ، وجلبُ قائمة الفصول مع كل تحديث
   * دوريّ عملٌ لا يطلبه أحد.
   */
  const [copySource, setCopySource] = useState<TeacherActivitySummary | null>(null);
  const [targets, setTargets] = useState<{ id: string; name: string }[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await bridge().activitiesList({ classId }));
    } catch (cause) {
      setRows(null);
      setError(cause instanceof Error ? cause.message : 'تعذّر فتح أنشطة هذا الفصل.');
    }
  }, [classId]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const all = rows ?? [];
    return {
      all: all.length,
      published: all.filter((row) => row.status === 'published').length,
      draft: all.filter((row) => row.status === 'draft').length,
    };
  }, [rows]);

  const visible = useMemo(() => {
    const needle = query.trim();
    return (rows ?? [])
      .filter((row) => filter === 'all' || row.status === filter)
      .filter((row) => needle === '' || row.title.includes(needle));
  }, [rows, filter, query]);

  const openCopy = async (row: TeacherActivitySummary) => {
    setCopySource(row);
    setCopied(null);
    try {
      const all = await bridge().classesList({ includeArchived: false });
      // الفصل الحالي يُستبعد: نسخه إلى نفسه تكرارٌ لا نقل، وله إجراء آخر.
      setTargets(
        all.filter((one) => one.id !== classId).map((one) => ({ id: one.id, name: one.name })),
      );
    } catch {
      setTargets([]);
    }
  };

  const act = async (id: string, run: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await run();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر تنفيذ هذا الإجراء.');
    } finally {
      setBusyId(null);
    }
  };

  const create = async () => {
    setError(null);
    try {
      const created = await bridge().activityCreate({ classId, title: 'نشاط بلا عنوان' });
      await load();
      setOpenId(created.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر إنشاء النشاط.');
    }
  };

  if (resultsId !== null) {
    return (
      <Submissions
        activityId={resultsId}
        onBack={() => {
          setResultsId(null);
          void load();
        }}
      />
    );
  }

  if (openId !== null) {
    return (
      <ActivityBuilder
        id={openId}
        classId={classId}
        className={className}
        onOpenAiSettings={onOpenAiSettings}
        onClose={() => {
          setOpenId(null);
          void load();
        }}
      />
    );
  }

  if (rows === null) {
    return <div className="m-auto text-text-muted">{error ?? 'نقرأ الأنشطة…'}</div>;
  }

  return (
    <div className="flex min-h-0 grow flex-col gap-3 overflow-auto">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5" role="tablist" aria-label="ترشيح الأنشطة">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')} count={counts.all}>
            الكل
          </Chip>
          <Chip
            active={filter === 'published'}
            onClick={() => setFilter('published')}
            count={counts.published}
          >
            منشورة للطلاب
          </Chip>
          <Chip active={filter === 'draft'} onClick={() => setFilter('draft')} count={counts.draft}>
            مسودات
          </Chip>
        </div>
        {/* الحقل يتمدّد بما بقي من الشريط، ولا يبتلعه: ٢٠٠px أرضيةٌ و٣٢٠px سقف. */}
        <Input
          className="min-w-50 max-w-80 grow"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ابحث في الأنشطة"
          aria-label="ابحث في الأنشطة"
        />
        <Button
          variant="primary"
          onClick={() => void create()}
          icon={<Icon name="plus" size={17} />}
        >
          إنشاء نشاط
        </Button>
      </div>

      {error !== null ? (
        <Alert tone="error" live>
          {error}
        </Alert>
      ) : null}

      {rows.length === 0 ? (
        <div className="m-auto flex w-120 max-w-full flex-col items-center gap-2.5 text-center">
          <h3 className="text-t-h1">لا أنشطة في هذا الفصل بعد</h3>
          <p className="text-t-body text-text-2">
            النشاط يبدأ مسودةً لا يراها أحد من طلابك. تكتب أسئلته، وتعاين ما سيرونه، ثم تنشره
            بنفسك.
          </p>
          <Button
            variant="primary"
            onClick={() => void create()}
            icon={<Icon name="plus" size={17} />}
          >
            إنشاء نشاط
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <div className="m-auto text-text-muted">لا نشاط يطابق بحثك.</div>
      ) : (
        <Table label="أنشطة هذا الفصل">
          <TableHeader>
            <TableRow>
              <TableHead>النشاط</TableHead>
              <TableHead className={NARROW}>النوع</TableHead>
              <TableHead className={NARROW}>الحالة</TableHead>
              <TableHead className={NARROW}>الإجابات</TableHead>
              {/* عمود الإجراءات بلا عرضٍ مفروض: أزراره هي التي تقرّر ما تحتاجه. */}
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <button
                    type="button"
                    className="cursor-pointer text-start text-t-body font-semibold text-text"
                    onClick={() => setOpenId(row.id)}
                  >
                    {row.title}
                  </button>
                  <div className="mt-1 text-t-caption tabular-nums text-text-muted">
                    {ar(row.questionCount)} {row.questionCount === 1 ? 'سؤال' : 'أسئلة'}
                    {row.lessonTitle === null ? '' : ` · مرتبط بدرس: ${row.lessonTitle}`}
                  </div>
                </TableCell>
                <TableCell className="tabular-nums text-text-2">{row.kind}</TableCell>
                <TableCell>
                  {row.status === 'published' ? (
                    <Badge tone="ok">منشور للطلاب</Badge>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="draft">مسودة</Badge>
                      <span className="text-t-caption text-text-muted">لا يراه الطلاب</span>
                    </div>
                  )}
                </TableCell>
                <TableCell className="tabular-nums text-text-2">
                  {row.status !== 'published' ? (
                    '—'
                  ) : (
                    <>
                      {ar(row.submissions)} من {ar(row.roster)}
                      {row.pendingReview > 0 ? (
                        <div className="mt-1 text-t-caption text-pending-text">
                          {ar(row.pendingReview)} بانتظار المراجعة
                        </div>
                      ) : null}
                    </>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {row.status === 'published' ? (
                      <Button variant="secondary" size="sm" onClick={() => setResultsId(row.id)}>
                        {row.pendingReview > 0 ? 'مراجعة الإجابات' : 'عرض النتائج'}
                      </Button>
                    ) : null}
                    <Button variant="ghost" size="sm" onClick={() => setOpenId(row.id)}>
                      متابعة التحرير
                    </Button>
                    {busyId === row.id ? (
                      <Button variant="ghost" size="sm" disabled disabledReason="جارٍ التنفيذ…">
                        …
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant={row.status === 'published' ? 'ghost' : 'secondary'}
                          size="sm"
                          onClick={() =>
                            void act(row.id, () =>
                              bridge().activityPublish({
                                id: row.id,
                                published: row.status !== 'published',
                              }),
                            )
                          }
                        >
                          {row.status === 'published' ? 'إلغاء النشر' : 'نشر للطلاب'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void openCopy(row)}>
                          نسخ إلى فصل
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(row)}>
                          حذف
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

      {copySource !== null ? (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) setCopySource(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{`نسخ «${copySource.title}» إلى فصل آخر`}</DialogTitle>
            </DialogHeader>
            {copied !== null ? (
              <DialogDescription>{copied}</DialogDescription>
            ) : targets.length === 0 ? (
              <DialogDescription>
                لا فصل آخر على هذا الجهاز. أنشئ فصلاً ثانياً أولاً، ثم انسخ إليه.
              </DialogDescription>
            ) : (
              <>
                <DialogDescription>
                  تُنسخ الأسئلة والخيارات ومفتاح الإجابة. ولا تُنسخ إجابات طلابك — هي لهم في فصلهم.
                  وتصل النسخة <strong>مسودةً</strong>، فلا يراها أحد حتى تنشرها.
                </DialogDescription>
                {/* الفصول الهدف أزرارٌ لا قائمة منسدلة: عددها قليل، والنقرة الواحدة أوضح. */}
                <div className="flex flex-wrap gap-2">
                  {targets.map((target) => (
                    <Button
                      key={target.id}
                      variant="secondary"
                      onClick={() => {
                        const source = copySource;
                        void bridge()
                          .activityCopy({ id: source.id, targetClassId: target.id })
                          .then(() => setCopied(`نُسخ إلى «${target.name}» مسودةً. افتح ذلك الفصل لنشره.`))
                          .catch((cause) =>
                            setError(cause instanceof Error ? cause.message : 'تعذّر نسخ النشاط.'),
                          );
                      }}
                    >
                      {target.name}
                    </Button>
                  ))}
                </div>
              </>
            )}
            <DialogFooter>
              <Button variant="secondary" onClick={() => setCopySource(null)}>
                إغلاق
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {confirmDelete !== null ? (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) setConfirmDelete(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{`حذف «${confirmDelete.title}»؟`}</DialogTitle>
            </DialogHeader>
            <DialogDescription>
              سيُحذف النشاط بأسئلته من هذا الجهاز نهائياً.
              {confirmDelete.submissions > 0
                ? ` وتُحذف معه إجابات ${ar(confirmDelete.submissions)} من طلابك — ولا سبيل إلى استرجاعها.`
                : ''}
            </DialogDescription>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
                إبقاء النشاط
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  const target = confirmDelete;
                  setConfirmDelete(null);
                  void act(target.id, () => bridge().activityDelete({ id: target.id }));
                }}
              >
                حذف النشاط
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

/**
 * شريحة الترشيح — قرصٌ مؤطَّر لا زرّ من `Button`.
 *
 * درجات `Button` الخمس كلّها مستطيلة الزوايا وتحمل معنى **فعل**، والشريحة
 * هنا حالةُ عرضٍ مختارة (`role="tab"` و`aria-selected`) لا فعلاً يُنفَّذ.
 * فالشكل يفرّق بينهما قبل أن يقرأ أحدٌ النصّ.
 */
function Chip({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        'h-(--height-control-sm) cursor-pointer rounded-full border border-hairline',
        'bg-surface px-3.5 text-t-label text-text-2',
        active && 'border-primary bg-primary-soft font-semibold text-primary-on-soft',
      )}
      onClick={onClick}
    >
      {children} <span className="tabular-nums opacity-75">{ar(count)}</span>
    </button>
  );
}
