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
import { when } from '@cubecroom/contracts';
import type { TeacherLessonSummary, UnreadStudents } from '@cubecroom/contracts';
import { bridge } from '../lib/bridge';
import { LessonEditor } from './LessonEditor';

/**
 * T12 — الدروس والمحتوى.
 *
 * عمود «الحالة» هو محور الشاشة: FR-009 يقول إن المسودة لا يراها أي طالب،
 * فالحالة تُكتب نصّاً («مسودة» و«لا يراها الطلاب») لا لوناً وحده.
 *
 * الحماية نفسها ليست هنا: هي في استعلام `listPublished` داخل القاعدة. إخفاء
 * المسودة عند العرض ليس كافياً — بوابة الطالب لا تمرّ بهذه الشاشة أصلاً.
 */

/**
 * الأعمدة الأربعة الضيّقة — **وعرضها يُخفَض دون الأساس 1280 لا يُلغى**.
 *
 * أربعة أعمدة ثابتة بـ140px تبتلع 548px من 720px عند 1024×768 — 76% من الجدول
 * لمحتوى شبه فارغ («٣» و«أمس ٠٩:٤٥») — فينهار عمود «عنوان الدرس»، وهو محور
 * الشاشة، إلى 74px يلتفّ فيها العنوان أربعة أسطر، وينهار عمود الإجراءات إلى
 * 98px وأزراره الأربعة تحتاج 261px فتلتفّ هي الأخرى. ارتفاع الصفّ يرتفع 77%،
 * فلا تُقرأ ثلاثة دروس دفعةً واحدة في منفذ ارتفاعه 768px.
 *
 * والقاعدة تسري على «كلّ ما دون الأساس 1280 المعتمد»، فلا تمسّ الأساس.
 *
 * **و`max-[1280px]` لا `max-[1279px]`**: مُعدِّل `max-*` في Tailwind حاصر لا
 * شامل — يبني `(width < N)` لا `max-width: N`. فالمكتوب 1279 يترك المنفذ الذي
 * عرضه 1279px بالضبط بلا قاعدة، وهو داخل المدى المكسور. و1280 هنا تعني «دون
 * الأساس» حرفياً: تسري على 1279 وما تحتها، وتتوقّف عند 1280 نفسها.
 *
 * وخفضُ ميزانية الأعمدة لا تصغيرُ الخطّ: هذا جدولٌ يتابع منه المعلّم طلابه.
 * وجُرّب البديل — عرضٌ أدنى على الجدول ليحتفظ بنسب 1280 — فأعاد عرض العنوان
 * لكنه خلق تمريراً أفقياً داخل الشاشة يجرّ الشريط والشرائح خارجها.
 */
const NARROW = 'w-[140px] max-[1280px]:w-[100px]';

type Filter = 'all' | 'published' | 'draft';

export type LessonsProps = {
  readonly classId: string;
  readonly className: string;
  readonly onOpenAiSettings: () => void;
  readonly onEditorChange?: (editing: boolean) => void;
};

export function Lessons({ classId, className, onOpenAiSettings, onEditorChange }: LessonsProps) {
  const [rows, setRows] = useState<TeacherLessonSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    onEditorChange?.(openId !== null);
    return () => onEditorChange?.(false);
  }, [openId, onEditorChange]);
  /**
   * من لم يقرأ الدرس — يُطلب بالنقر لا مع كل تحديث.
   *
   * الجدول يتحدّث دورياً، وجلبُ قائمة لكل درس في كل دورة عملٌ لا يطلبه أحد.
   */
  const [unreadFor, setUnreadFor] = useState<string | null>(null);
  const [unread, setUnread] = useState<UnreadStudents | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TeacherLessonSummary | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await bridge().lessonsList({ classId }));
    } catch (cause) {
      setRows(null);
      setError(cause instanceof Error ? cause.message : 'تعذّر فتح دروس هذا الفصل.');
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

  const showUnread = async (lessonId: string) => {
    setUnreadFor(lessonId);
    setUnread(null);
    try {
      setUnread(await bridge().lessonUnread({ id: lessonId }));
    } catch {
      setUnreadFor(null);
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
      const created = await bridge().lessonCreate({ classId, title: 'درس بلا عنوان' });
      await load();
      setOpenId(created.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر إنشاء الدرس.');
    }
  };

  if (openId !== null) {
    return (
      <LessonEditor
        id={openId}
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
    return <div className="m-auto text-text-muted">{error ?? 'نقرأ الدروس…'}</div>;
  }

  return (
    <div className="flex min-h-0 grow flex-col gap-3 overflow-auto">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1.5" role="tablist" aria-label="ترشيح الدروس">
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
        {/*
         * الحقل يتمدّد ويقف عند 320px: البحث في الدروس كلمةٌ أو كلمتان، وحقلٌ
         * يبتلع بقية الشريط يدفع «إنشاء درس» إلى سطرٍ ثانٍ بلا سبب.
         */}
        <Input
          size="sm"
          className="w-auto min-w-[200px] grow max-w-[320px]"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ابحث في الدروس"
          aria-label="ابحث في الدروس"
        />
        <Button variant="primary" onClick={() => void create()} icon={<Icon name="plus" size={17} />}>
          إنشاء درس
        </Button>
      </div>

      {error !== null ? (
        <Alert tone="error" live>
          {error}
        </Alert>
      ) : null}

      {rows.length === 0 ? (
        <div className="m-auto flex w-[480px] max-w-full flex-col items-center gap-2.5 text-center">
          <h3 className="text-t-h1">لا دروس في هذا الفصل بعد</h3>
          <p className="text-t-body text-text-2">
            الدرس يبدأ مسودةً لا يراها أحد من طلابك، ولا يظهر لهم إلا حين تنشره بنفسك.
          </p>
          <Button variant="primary" onClick={() => void create()} icon={<Icon name="plus" size={17} />}>
            إنشاء درس
          </Button>
        </div>
      ) : visible.length === 0 ? (
        <div className="m-auto text-text-muted">لا درس يطابق بحثك.</div>
      ) : (
        <Table label="دروس الفصل">
          <TableHeader>
            <TableRow>
              <TableHead>عنوان الدرس</TableHead>
              <TableHead className={NARROW}>الحالة</TableHead>
              <TableHead className={NARROW}>آخر تعديل</TableHead>
              <TableHead className={NARROW}>المرفقات</TableHead>
              <TableHead className={NARROW}>قرأه الطلاب</TableHead>
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
                </TableCell>
                <TableCell>
                  {row.status === 'published' ? (
                    <Badge tone="ok">منشور للطلاب</Badge>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="draft">مسودة</Badge>
                      <span className="text-t-caption text-text-muted">لا يراها الطلاب</span>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-text-2">{when(row.updatedAt)}</TableCell>
                <TableCell className="text-text-2">
                  {row.attachments === 0 ? 'لا مرفقات' : ar(row.attachments)}
                </TableCell>
                {/*
                  العدد صار مدخلاً إلى الأسماء: «قرأه ٥» يخبر المعلم أن أحداً
                  تخلّف ولا يقول من، فتبقى المتابعة على ذاكرته.

                  ويبقى في هيئة العدد لا في هيئة زرّ: الجدول يُقرأ عموداً، وزرٌّ
                  مؤطَّر في كل صفّ يجعل العين تلاحقه بدل أن تقرأ الأرقام. فالخطّ
                  المتقطّع تحته وحده هو ما يقول إنه يُنقر.
                */}
                <TableCell className="text-text-2">
                  <button
                    type="button"
                    className="cursor-pointer border-b border-dashed border-border transition-colors duration-200 ease-motion hover:border-primary hover:text-primary"
                    onClick={() => void showUnread(row.id)}
                  >
                    {row.reads === 0 ? '—' : ar(row.reads)}
                  </button>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center justify-end gap-1">
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
                              bridge().lessonPublish({
                                id: row.id,
                                published: row.status !== 'published',
                              }),
                            )
                          }
                        >
                          {row.status === 'published' ? 'إلغاء النشر' : 'نشر للطلاب'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void act(row.id, () => bridge().lessonDuplicate({ id: row.id }))}
                        >
                          تكرار
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
              <DialogDescription>
                سيُحذف الدرس من هذا الجهاز نهائياً، ولن يعود ظاهراً لطلابه.
                {confirmDelete.attachments > 0
                  ? ' مرفقاته تبقى في مكتبة ملفاتك ولا تُحذف معه.'
                  : ''}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
                إبقاء الدرس
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  const target = confirmDelete;
                  setConfirmDelete(null);
                  void act(target.id, () => bridge().lessonDelete({ id: target.id }));
                }}
              >
                حذف الدرس
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {unreadFor !== null ? (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) setUnreadFor(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>من لم يقرأ هذا الدرس</DialogTitle>
              {/*
               * الجملة الواحدة هنا لا في متن الحوار: `DialogDescription` تُربط
               * بـ`aria-describedby` فتُقرأ بعد العنوان مباشرة — وهي في الحالات
               * الأربع جوابُ السؤال نفسه، والقائمةُ تفصيلٌ بعده.
               */}
              <DialogDescription>
                {unread === null
                  ? 'نقرأ…'
                  : unread.status === 'draft'
                    ? 'هذا الدرس مسودة، فلم يره أحد من طلابك بعد. انشره ليصلهم — ثم تعرف من قرأه.'
                    : unread.students.length === 0
                      ? 'قرأه كل طلاب الفصل.'
                      : `${ar(unread.students.length)} من ${ar(unread.roster)} لم يفتحوا الدرس بعد.`}
              </DialogDescription>
            </DialogHeader>

            {unread !== null && unread.status === 'published' && unread.students.length > 0 ? (
              // سقف الارتفاع يُبقي زرّ الإغلاق مرئياً مهما طالت قائمة فصلٍ كامل.
              <ul className="flex max-h-[320px] flex-col gap-0.5 overflow-y-auto">
                {unread.students.map((student) => (
                  <li key={student.id} className="rounded-md bg-surface-2 px-2.5 py-1.5">
                    {student.name}
                  </li>
                ))}
              </ul>
            ) : null}

            <DialogFooter>
              <Button variant="secondary" onClick={() => setUnreadFor(null)}>
                إغلاق
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

/**
 * شريحة ترشيح — `role="tab"` لا زرّاً عادياً: الثلاث خيارٌ واحد من ثلاثة،
 * وقارئ الشاشة يعلن «١ من ٣» حين يعرف أنها مجموعة.
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
        'h-(--height-control-sm) cursor-pointer rounded-full border border-border bg-surface px-3',
        'text-t-label text-text-2 transition-colors duration-200 ease-motion',
        active && 'border-primary bg-primary-soft font-semibold text-primary-on-soft',
      )}
      onClick={onClick}
    >
      {children} <span className="opacity-75">{ar(count)}</span>
    </button>
  );
}

export { when };
