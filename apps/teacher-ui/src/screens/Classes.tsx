'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Card, Icon, Input, Separator, ar, cn } from '@cubecroom/ui';
import type { ClassSummary } from '@cubecroom/contracts';
import { bridge } from '../lib/bridge';
import { ClassDialog } from './ClassDialog';
import { ClassView } from './ClassView';

/**
 * T06 — الفصول.
 *
 * ثلاث حالات في شاشة واحدة: قائمة · فارغة (`T06Empty`) · تعذّر القراءة
 * (`T06Error`). والأرشفة إجراء أصيل هنا لا حذف — FR-003 وقرار D8.
 *
 * ما ليس هنا وهو في اللوح: حالة الجلسة («دخول الطلاب متاح · ١٨ متصلاً»)
 * و«آخر حصة» وشريحتا الترشيح «جلسة نشطة/متوقفة» — كلها تحتاج جلسات لم تُبنَ
 * (P2-5). عرضها بقيم مخترَعة يجعل المعلم يقرأ حالةً لا وجود لها.
 */

type Dialog = { readonly mode: 'create' } | { readonly mode: 'edit'; readonly row: ClassSummary };

/** فتحٌ قادم من شاشة أخرى: الرئيسية تفتح فصلاً على قسم بعينه. */
export type OpenTarget = {
  readonly classId: string;
  readonly section: 'access' | 'requests' | 'lessons' | 'students';
};

export type ClassesProps = {
  readonly openTarget?: OpenTarget | null | undefined;
  readonly onOpened?: (() => void) | undefined;
  readonly onOpenAiSettings: () => void;
  readonly onOpenDiagnostics: () => void;
};

export function Classes({
  openTarget = null,
  onOpened,
  onOpenAiSettings,
  onOpenDiagnostics,
}: ClassesProps) {
  const [rows, setRows] = useState<ClassSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await bridge().classesList({ includeArchived: true }));
    } catch (cause) {
      setRows(null);
      setError(cause instanceof Error ? cause.message : 'تعذّر فتح فصولك.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    if (rows === null) return [];
    const needle = query.trim();
    return rows
      .filter((row) => (showArchived ? row.archivedAt !== null : row.archivedAt === null))
      .filter(
        (row) =>
          needle === '' ||
          row.name.includes(needle) ||
          (row.subject ?? '').includes(needle) ||
          (row.level ?? '').includes(needle),
      );
  }, [rows, showArchived, query]);

  const archivedCount = rows?.filter((row) => row.archivedAt !== null).length ?? 0;
  const activeCount = (rows?.length ?? 0) - archivedCount;

  const upsert = (row: ClassSummary) => {
    setRows((current) => {
      const rest = (current ?? []).filter((one) => one.id !== row.id);
      return [row, ...rest];
    });
  };

  const toggleArchive = async (row: ClassSummary) => {
    setBusyId(row.id);
    setError(null);
    try {
      upsert(await bridge().classesArchive({ id: row.id, archived: row.archivedAt === null }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر تنفيذ هذا الإجراء.');
    } finally {
      setBusyId(null);
    }
  };

  // الفتح القادم من الرئيسية يسبق اختيار المستخدم هنا.
  const targetId = openTarget?.classId ?? openId;
  const open = rows?.find((row) => row.id === targetId) ?? null;
  if (open !== null) {
    return (
      <ClassView
        row={open}
        onOpenAiSettings={onOpenAiSettings}
        onOpenDiagnostics={onOpenDiagnostics}
        {...(openTarget !== null ? { initialSection: openTarget.section } : {})}
        onBack={() => {
          setOpenId(null);
          onOpened?.();
          void load();
        }}
      />
    );
  }

  if (error !== null && rows === null) {
    return (
      <div className={PAGE}>
        {/*
         * لوحُ التعذّر يقف وحده في وسط الشاشة بعرضٍ مقيّد لا مملوءٍ: سطرُ خطأ
         * ممتدّ على ١٢٨٠px يُقرأ سطراً واحداً طويلاً لا فقرةً.
         */}
        <Card className="m-auto w-140 max-w-full items-center gap-3 border-error-border p-7.5 text-center">
          <div className="flex size-14.5 items-center justify-center rounded-full border border-error-border bg-error-bg text-error-text">
            <Icon name="alert-circle" size={28} />
          </div>
          <h2 className={EMPTY_TITLE}>تعذّر فتح فصولك</h2>
          <p className={EMPTY_TEXT}>{error}</p>
          <Button variant="primary" onClick={() => void load()}>
            إعادة المحاولة
          </Button>
        </Card>
      </div>
    );
  }

  if (rows === null) {
    return (
      <div className={PAGE}>
        <div className="m-auto text-text-muted">نقرأ فصولك…</div>
      </div>
    );
  }

  return (
    <div className={PAGE}>
      {rows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-t-h3 tabular-nums">
            {activeCount === 0 ? 'لا فصول نشطة' : `${ar(activeCount)} ${plural(activeCount)}`}
          </div>
          {/*
           * `w-auto` تُبطل `w-full` التي يأتي بها الحقل: المطلوب هنا حقلٌ
           * **يتمدّد بما بقي** من الصفّ بين حدّيه (٢٢٠px…٣٨٠px)، لا حقلٌ يملأ
           * الصفّ فيدفع الشرائح وزرّ الإنشاء إلى سطر ثانٍ.
           */}
          <Input
            className="w-auto grow min-w-55 max-w-95"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث باسم الفصل أو المادة"
            aria-label="ابحث باسم الفصل أو المادة"
          />
          <div className="flex gap-1.5" role="tablist" aria-label="ترشيح الفصول">
            <Chip active={!showArchived} onClick={() => setShowArchived(false)}>
              الكل
            </Chip>
            <Chip active={showArchived} onClick={() => setShowArchived(true)}>
              مؤرشفة {archivedCount > 0 ? `· ${ar(archivedCount)}` : ''}
            </Chip>
          </div>
          <Button variant="primary" onClick={() => setDialog({ mode: 'create' })} icon={<Icon name="plus" size={17} />}>
            إنشاء فصل
          </Button>
        </div>
      ) : null}

      {error !== null ? (
        <Alert tone="error" live>
          {error}
        </Alert>
      ) : null}

      {created !== null ? (
        <Alert tone="ok" live onDismiss={() => setCreated(null)}>
          أُنشئ الفصل «{created}» — ظهر الآن في قائمة فصولك.
        </Alert>
      ) : null}

      {rows.length === 0 ? (
        <Empty onCreate={() => setDialog({ mode: 'create' })} />
      ) : visible.length === 0 ? (
        <div className="m-auto text-text-muted">
          {showArchived ? 'لا فصول مؤرشفة.' : 'لا فصل يطابق بحثك.'}
        </div>
      ) : (
        /*
         * `auto-fill` بحدٍّ أدنى ٣٠٠px: عددُ الأعمدة يتبع العرض المتاح وحده،
         * فتبقى البطاقة مقروءة حين تُطوى القائمة الجانبية أو يضيق حاسوب
         * المدرسة. و`content-start` تمنع صفّاً واحداً من التمدّد في ارتفاع
         * الشاشة كلّها.
         */
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] content-start gap-3.5">
          {visible.map((row) => (
            <Card key={row.id} className="gap-2 p-4 px-4.5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-t-h3 font-bold">{row.name}</h3>
                {row.archivedAt !== null ? <Badge tone="draft">مؤرشف</Badge> : null}
                {row.hasDraft ? <Badge tone="pending">درس مسودة</Badge> : null}
              </div>
              <div className="text-t-label text-text-muted">
                {[row.subject, row.level].filter((part) => part !== null && part !== '').join(' · ') ||
                  'بلا مادة أو مستوى'}
              </div>
              <div className="flex items-center gap-1.5 text-t-label tabular-nums text-text-2">
                <span>{ar(row.students)} {noun(row.students, 'طالباً', 'طالبان', 'طلاب')}</span>
                <span className="text-text-muted">·</span>
                <span>{ar(row.lessons)} {noun(row.lessons, 'درساً', 'درسان', 'دروس')}</span>
                <span className="text-text-muted">·</span>
                <span>{ar(row.activities)} {noun(row.activities, 'نشاطاً', 'نشاطان', 'أنشطة')}</span>
              </div>
              <Separator className="mt-1.5" />
              {/*
               * `me-auto` على «فتح الفصل» بدل حشوةٍ فارغة بينه وبين البقيّة:
               * الفعل الأساسي في البداية، والتعديل والأرشفة في الطرف المقابل.
               */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <Button variant="primary" size="sm" className="me-auto" onClick={() => setOpenId(row.id)}>
                  فتح الفصل
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDialog({ mode: 'edit', row })}>
                  تعديل
                </Button>
                {busyId === row.id ? (
                  <Button variant="ghost" size="sm" disabled disabledReason="جارٍ الحفظ…">
                    {row.archivedAt === null ? 'أرشفة' : 'إلغاء الأرشفة'}
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => void toggleArchive(row)}>
                    {row.archivedAt === null ? 'أرشفة' : 'إلغاء الأرشفة'}
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {dialog !== null ? (
        <ClassDialog
          row={dialog.mode === 'edit' ? dialog.row : null}
          onClose={() => setDialog(null)}
          onSaved={(row, mode) => {
            upsert(row);
            setDialog(null);
            setShowArchived(false);
            if (mode === 'create') setCreated(row.name);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * الشاشة عمودٌ يمرّر في مكانه — `min-h-0` هي ما يسمح بذلك داخل قشرةٍ مرنة،
 * وبدونها يدفع الجدولُ الطويل الصفحةَ كلّها بدل أن يمرّر تحت شريطها.
 */
const PAGE = 'flex min-h-0 grow flex-col gap-3.5 overflow-auto';

/**
 * عنوان الحالة الفارغة والمانعة — `t-h1` أقربُ ما في سلّم المعلّم إلى ٢٤px
 * التي كانت مكتوبة بيد، وليس في السلّم ما بين ٢٢ و٢٨.
 */
const EMPTY_TITLE = 'text-t-h1';
const EMPTY_TEXT = 'text-t-body text-text-2';

/** T06Empty — أول ما يراه المعلم بعد الإعداد. */
function Empty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="m-auto flex w-140 max-w-full flex-col items-center gap-3 text-center">
      <h2 className={EMPTY_TITLE}>ابدأ بإنشاء أول فصل</h2>
      <p className={EMPTY_TEXT}>
        الفصل يجمع طلابك ودروسك وأنشطتك في مكان واحد. تحتاج فقط إلى اسم واضح يعرفه طلابك — والباقي
        يمكن إضافته لاحقاً.
      </p>
      <Button variant="primary" onClick={onCreate} icon={<Icon name="plus" size={17} />}>
        إنشاء فصل
      </Button>
      {/* الخطوات الثلاث صفٌّ لا قائمة رأسية: هي وعدٌ بقِصَر الطريق لا تعليمات. */}
      <ol className="mx-0 mb-0 mt-5.5 flex list-none gap-5.5 p-0 text-t-label text-text-2">
        <li className="flex items-center gap-1.75">
          <span className={STEP_NUMBER}>{ar(1)}</span> سمِّ الفصل
        </li>
        <li className="flex items-center gap-1.75">
          <span className={STEP_NUMBER}>{ar(2)}</span> شغّل دخول الطلاب
        </li>
        <li className="flex items-center gap-1.75">
          <span className={STEP_NUMBER}>{ar(3)}</span> اقبل طلبات الدخول
        </li>
      </ol>
    </div>
  );
}

const STEP_NUMBER =
  'flex size-5.5 items-center justify-center rounded-full bg-primary-soft font-bold text-primary-on-soft';

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
        'h-8.5 shrink-0 rounded-full border border-border bg-surface px-3.25 text-t-label text-text-2',
        // الشريحة المختارة بثلاثة: سطحٌ وحدٌّ ووزن — فلا يحملها اللونُ وحده.
        active && 'border-primary bg-primary-soft font-semibold text-primary-on-soft',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function plural(count: number): string {
  return noun(count, 'فصل', 'فصلان', 'فصول');
}

/** العربية تميّز المفرد والمثنّى والجمع — «١ فصول» خطأ لغوي يراه المعلم. */
function noun(count: number, one: string, two: string, many: string): string {
  if (count === 1) return one;
  if (count === 2) return two;
  return many;
}
