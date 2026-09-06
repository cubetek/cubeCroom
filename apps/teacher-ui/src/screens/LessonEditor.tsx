'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Icon,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@cubecroom/ui';
import {
  LESSON_SECTIONS,
  lessonSectionDocument,
  replaceLessonSection,
  type LessonSection,
  type TeacherLessonDetail,
  type RichTextDocument,
  type TeacherAiContext,
} from '@cubecroom/contracts';
import { LessonContent } from '@cubecroom/ui/components/lesson-content';
import { bridge } from '../lib/bridge';
import { useLessonDraft, type LessonSaveState } from '../lessons/use-lesson-draft';
import { LessonAgentPanel } from '../lessons/LessonAgentPanel';
import { TeacherPreparation } from '../lessons/TeacherPreparation';
import { LessonCheckActivity } from '../lessons/LessonCheckActivity';
import { Attachments } from './Attachments';
import { when } from './Lessons';

const RichEditor = dynamic(
  () =>
    import('@cubecroom/ui/components/lesson-rich-editor').then((module) => module.LessonRichEditor),
  {
    ssr: false,
    loading: () => (
      <p className="p-8 text-text-muted" role="status">
        نجهّز محرّر الدرس…
      </p>
    ),
  },
);

export type LessonEditorProps = {
  readonly id: string;
  readonly className: string;
  readonly onClose: () => void;
  readonly onOpenAiSettings: () => void;
};

export function LessonEditor(props: LessonEditorProps) {
  const [lesson, setLesson] = useState<TeacherLessonDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setLesson(null);
    setError(null);
    void bridge()
      .lessonGet({ id: props.id })
      .then((found) => {
        if (alive) setLesson(found);
      })
      .catch((cause: unknown) => {
        if (alive) setError(cause instanceof Error ? cause.message : 'تعذّر فتح الدرس.');
      });
    return () => {
      alive = false;
    };
  }, [props.id]);
  if (!lesson || lesson.id !== props.id)
    return (
      <p role="status" className="p-8 text-text-muted">
        {error ?? 'نفتح الدرس…'}
      </p>
    );
  return <LessonWorkspace key={lesson.id} {...props} initial={lesson} />;
}

type LessonView = 'page' | 'preparation' | 'edit' | 'attachments';
type ActiveOperation = { requestId: string; started: boolean; cancelled: boolean };

function LessonWorkspace({
  id,
  className,
  onClose,
  onOpenAiSettings,
  initial,
}: LessonEditorProps & { initial: TeacherLessonDetail }) {
  const { lesson, draft, edit, flush, save, error, setError, setLesson, resetBaseline } =
    useLessonDraft(initial);
  const [view, setView] = useState<LessonView>('page');
  const [section, setSection] = useState<LessonSection>('content');
  const [visited, setVisited] = useState<Set<LessonSection>>(() => new Set(['content']));
  const [operation, setOperation] = useState<'preparing' | 'undoing' | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [agentMessage, setAgentMessage] = useState<string | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [needsProvider, setNeedsProvider] = useState(false);
  const [undoToken, setUndoToken] = useState<string | null>(initial.agentUndoToken ?? null);
  const activeOperation = useRef<ActiveOperation | null>(null);
  const locked = useRef(false);
  const alive = useRef(true);
  const busy = operation !== null;
  const published = lesson.status === 'published';

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      const active = activeOperation.current;
      if (active) {
        active.cancelled = true;
        if (active.started)
          void bridge()
            .aiCancel({ requestId: active.requestId })
            .catch(() => undefined);
      }
    };
  }, []);

  const documents = useMemo(
    () =>
      Object.fromEntries(
        LESSON_SECTIONS.map((one) => [one.id, lessonSectionDocument(draft.blocks, one.id)]),
      ) as Record<LessonSection, RichTextDocument>,
    [draft.blocks],
  );
  const sectionChanges = useMemo(
    () =>
      Object.fromEntries(
        LESSON_SECTIONS.map((one) => [
          one.id,
          (document: RichTextDocument) => {
            if (locked.current) return;
            setUndoToken(null);
            setAgentMessage(null);
            edit((current) => ({
              ...current,
              blocks: replaceLessonSection(current.blocks, one.id, document),
            }));
          },
        ]),
      ) as Record<LessonSection, (document: RichTextDocument) => void>,
    [edit],
  );

  const prepare = async (instructions: string, context: TeacherAiContext) => {
    if (locked.current) return;
    locked.current = true;
    const active: ActiveOperation = {
      requestId: crypto.randomUUID(),
      started: false,
      cancelled: false,
    };
    activeOperation.current = active;
    setOperation('preparing');
    setAgentError(null);
    setAgentMessage(null);
    setNeedsProvider(false);
    try {
      await flush();
      if (!alive.current || active.cancelled) {
        if (alive.current) setAgentMessage('أُلغي التجهيز. بقي الدرس كما كان.');
        return;
      }
      active.started = true;
      const result = await bridge().lessonAgentRun({
        requestId: active.requestId,
        id,
        instructions,
        context,
      });
      if (!alive.current) return;
      if (result.status === 'ok') {
        resetBaseline(result.lesson);
        setUndoToken(result.undoToken);
        setView('page');
        setAgentMessage(
          'الدرس جاهز ومحفوظ: صفحة الطالب وخطة المعلم ونشاط التحقق. يمكنك تعديل التفاصيل أو بدء الحصة.',
        );
      } else if (result.status === 'no_provider') {
        setNeedsProvider(true);
      } else if (result.status === 'cancelled') {
        setAgentMessage('أُلغي التجهيز. بقي الدرس كما كان.');
      } else if (result.status === 'failed') {
        setAgentError(result.message);
      }
    } catch (cause) {
      if (alive.current)
        setAgentError(cause instanceof Error ? cause.message : 'تعذّر تجهيز الدرس. حاول مرة أخرى.');
    } finally {
      activeOperation.current = null;
      locked.current = false;
      if (alive.current) setOperation(null);
    }
  };

  const cancelPrepare = async () => {
    const active = activeOperation.current;
    if (!active) return;
    active.cancelled = true;
    if (!active.started) return;
    try {
      await bridge().aiCancel({ requestId: active.requestId });
    } catch {
      if (alive.current) setAgentError('تعذّر إلغاء التجهيز. ننتظر نتيجة الطلب.');
    }
  };

  const undo = async () => {
    if (locked.current || undoToken === null) return;
    locked.current = true;
    setOperation('undoing');
    setAgentError(null);
    setAgentMessage(null);
    try {
      await flush();
      if (!alive.current) return;
      const previous = await bridge().lessonAgentUndo({ id, token: undoToken });
      if (!alive.current) return;
      resetBaseline(previous);
      setUndoToken(null);
      setView('page');
      setAgentMessage('استُعيد الدرس السابق وخطته ونشاطه.');
    } catch (cause) {
      if (alive.current)
        setAgentError(cause instanceof Error ? cause.message : 'تعذّر التراجع عن التجهيز.');
    } finally {
      locked.current = false;
      if (alive.current) setOperation(null);
    }
  };

  const close = async () => {
    if (locked.current) return;
    try {
      await flush();
      onClose();
    } catch {
      /* Keep the failed draft open. */
    }
  };
  const togglePublish = async () => {
    if (locked.current) return;
    locked.current = true;
    setPublishing(true);
    try {
      await flush();
      setLesson(await bridge().lessonPublish({ id, published: !published }));
      setUndoToken(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر تغيير حالة النشر.');
    } finally {
      locked.current = false;
      setPublishing(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-wrap items-center gap-2.5">
        <Button
          variant="ghost"
          size="sm"
          aria-disabled={busy || publishing}
          onClick={() => void close()}
          icon={<Icon name="chevron-next" size={17} />}
        >
          {className} · الدروس
        </Button>
        <Badge tone={published ? 'ok' : 'draft'}>{published ? 'منشور للطلاب' : 'مسودة'}</Badge>
        <span role="status" className="text-t-caption text-text-muted">
          {saveLabel(save, lesson.updatedAt)}
        </span>
        <div className="ms-auto flex flex-wrap gap-2">
          {save === 'failed' && !busy ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void flush().catch(() => undefined)}
            >
              إعادة الحفظ
            </Button>
          ) : null}
          <Button
            variant={published ? 'secondary' : 'primary'}
            size="sm"
            aria-disabled={busy || publishing}
            onClick={() => void togglePublish()}
          >
            {publishing ? 'جارٍ التحديث…' : published ? 'إلغاء النشر' : 'نشر للطلاب'}
          </Button>
        </div>
      </header>
      {error ? (
        <Alert tone="error" live>
          {error}
        </Alert>
      ) : null}
      <div className="border-b border-hairline pb-4">
        <p className="mb-2 text-sm text-text-muted">{className}</p>
        <input
          className="w-full rounded-sm bg-transparent px-1 py-2 text-3xl font-bold text-text outline-none placeholder:text-text-muted focus:bg-surface sm:text-4xl"
          disabled={busy || publishing}
          value={draft.title}
          onChange={(event) => {
            if (locked.current) return;
            setUndoToken(null);
            setAgentMessage(null);
            edit({ ...draft, title: event.target.value });
          }}
          placeholder="عنوان الدرس"
          aria-label="عنوان الدرس"
        />
      </div>
      <LessonAgentPanel
        busy={busy || publishing}
        hasPreparation={lesson.preparation != null}
        undoing={operation === 'undoing'}
        published={published}
        publishing={publishing}
        needsProvider={needsProvider}
        canUndo={undoToken !== null}
        message={agentMessage}
        error={agentError}
        onRun={(instructions, context) => void prepare(instructions, context)}
        onCancel={() => void cancelPrepare()}
        onUndo={() => void undo()}
        onOpenSettings={onOpenAiSettings}
      />
      <Tabs
        value={view}
        onValueChange={(value) => setView(value as LessonView)}
        dir="rtl"
        className="gap-6"
      >
        <TabsList aria-label="مساحات الدرس" className="h-auto flex-wrap justify-start">
          <TabsTrigger value="page" className="min-h-10 px-4">
            صفحة الطالب
          </TabsTrigger>
          <TabsTrigger value="preparation" className="min-h-10 px-4">
            خطة المعلم
          </TabsTrigger>
          <TabsTrigger value="edit" className="min-h-10 px-4" disabled={busy || publishing}>
            تحرير يدوي
          </TabsTrigger>
          <TabsTrigger value="attachments" className="min-h-10 px-4" disabled={busy || publishing}>
            المرفقات
          </TabsTrigger>
        </TabsList>
        <TabsContent value="page" className="mt-0">
          <div className="mx-auto w-full max-w-4xl space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-text-muted">هكذا تُنظّم صفحة الدرس لطلابك</p>
              <Button
                variant="ghost"
                size="sm"
                aria-disabled={busy || publishing}
                onClick={() => {
                  if (!locked.current) setView('edit');
                }}
              >
                تعديل التفاصيل
              </Button>
            </div>
            <LessonContent blocks={draft.blocks} />
            {lesson.generatedActivityId ? (
              <LessonCheckActivity
                key={`${lesson.generatedActivityId}-${lesson.updatedAt}`}
                activityId={lesson.generatedActivityId}
              />
            ) : null}
          </div>
        </TabsContent>
        <TabsContent value="preparation" className="mt-0">
          <TeacherPreparation preparation={lesson.preparation} />
        </TabsContent>
        <TabsContent value="edit" className="mt-0">
          {!busy && !publishing ? (
            <Tabs
              value={section}
              onValueChange={(value) => {
                const next = value as LessonSection;
                setSection(next);
                setVisited((current) => new Set([...current, next]));
              }}
              dir="rtl"
              className="gap-5"
            >
              <div>
                <h2 className="text-xl font-semibold">تحرير تفاصيل الدرس</h2>
                <p className="mt-1 text-sm leading-7 text-text-muted">
                  تُحفظ تعديلاتك تلقائياً.{' '}
                  {published
                    ? 'تظهر التعديلات المحفوظة لطلاب الفصل.'
                    : 'يمكنك نشر الصفحة عندما تكتمل.'}
                </p>
              </div>
              <TabsList aria-label="أقسام التحرير" className="h-auto flex-wrap justify-start">
                {LESSON_SECTIONS.map((one) => (
                  <TabsTrigger key={one.id} value={one.id} className="min-h-10 px-4">
                    {one.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {LESSON_SECTIONS.map((one) => (
                <TabsContent
                  key={one.id}
                  value={one.id}
                  forceMount
                  className="mt-0 space-y-4 data-[state=inactive]:hidden"
                >
                  <p className="text-sm leading-7 text-text-muted">{one.description}</p>
                  {visited.has(one.id) ? (
                    <RichEditor
                      value={documents[one.id]}
                      label={one.label}
                      onChange={sectionChanges[one.id]}
                    />
                  ) : null}
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <p role="status" className="py-8 text-text-muted">
              نجهّز الصفحة. ستتمكّن من تحرير التفاصيل عند اكتمال التجهيز.
            </p>
          )}
        </TabsContent>
        <TabsContent value="attachments" className="mt-0 space-y-4">
          {!busy && !publishing ? (
            <>
              <h2 className="text-xl font-semibold">مرفقات الدرس</h2>
              <Attachments lessonId={id} onChanged={() => setUndoToken(null)} />
            </>
          ) : (
            <p className="py-8 text-text-muted">تعود إدارة المرفقات بعد اكتمال التجهيز.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function saveLabel(state: LessonSaveState, updatedAt: string): string {
  if (state === 'pending') return 'تعديلات بانتظار الحفظ…';
  if (state === 'saving') return 'جارٍ الحفظ…';
  if (state === 'failed') return 'لم يُحفظ آخر تعديل';
  if (state === 'saved') return 'حُفظ قبل لحظات';
  return 'آخر حفظ: ' + when(updatedAt);
}
