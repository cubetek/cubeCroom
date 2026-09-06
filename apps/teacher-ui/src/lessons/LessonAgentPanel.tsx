'use client';

import { useState } from 'react';
import {
  DEFAULT_TEACHER_AI_CONTEXT,
  LESSON_PAGE_AGENT_LIMITS,
  TEACHER_AI_STAGES,
  TEACHER_AI_SUPPORT,
  type TeacherAiContext,
} from '@cubecroom/contracts';
import {
  Alert,
  Button,
  Icon,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  ar,
} from '@cubecroom/ui';

export type LessonAgentPanelProps = {
  busy: boolean;
  hasPreparation: boolean;
  published: boolean;
  publishing: boolean;
  undoing: boolean;
  needsProvider: boolean;
  canUndo: boolean;
  message: string | null;
  error: string | null;
  onRun: (instructions: string, context: TeacherAiContext) => void;
  onCancel: () => void;
  onUndo: () => void;
  onOpenSettings: () => void;
};

/** One natural request prepares the complete saved lesson; there is no insertion workflow. */
export function LessonAgentPanel({
  busy,
  hasPreparation,
  published,
  publishing,
  undoing,
  needsProvider,
  canUndo,
  message,
  error,
  onRun,
  onCancel,
  onUndo,
  onOpenSettings,
}: LessonAgentPanelProps) {
  const [instructions, setInstructions] = useState('');
  const [context, setContext] = useState<TeacherAiContext>({ ...DEFAULT_TEACHER_AI_CONTEXT });
  const [editingRequest, setEditingRequest] = useState(false);
  const expanded = !hasPreparation || editingRequest;
  const actions = (
    <>
      <Button
        type="submit"
        variant="primary"
        aria-disabled={busy}
        icon={<Icon name="sparkles" size={17} />}
      >
        {publishing
          ? 'جارٍ تحديث النشر…'
          : busy
            ? undoing
              ? 'نستعيد الدرس السابق…'
              : 'نجهّز الدرس ونحفظه…'
            : 'جهّز الدرس كاملاً'}
      </Button>
      {hasPreparation && !busy ? (
        <Button
          type="button"
          variant="ghost"
          aria-expanded={expanded}
          aria-controls="lesson-agent-fields"
          onClick={() => setEditingRequest((current) => !current)}
        >
          {expanded ? 'إخفاء الطلب' : 'تعديل الطلب'}
        </Button>
      ) : null}
      {busy && !undoing && !publishing ? (
        <Button type="button" variant="ghost" onClick={onCancel}>
          إلغاء التجهيز
        </Button>
      ) : null}
      {canUndo && !busy ? (
        <Button
          type="button"
          variant="ghost"
          title="يمكن التراجع حتى تعديل الدرس أو نشره مجدداً."
          onClick={onUndo}
        >
          تراجع عن التجهيز
        </Button>
      ) : null}
    </>
  );
  return (
    <section
      aria-label="وكيل إعداد الدرس"
      className="rounded-xl border border-primary/20 bg-surface p-4"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) {
            setEditingRequest(false);
            onRun(instructions.trim(), context);
          }
        }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-lg bg-ai-bg p-2 text-ai-text">
            <Icon name="sparkles" size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">
              {hasPreparation ? 'الدرس جاهز' : 'حوّل فكرتك إلى درس جاهز'}
            </h2>
            <p
              className="mt-1 text-xs leading-5 text-text-2"
              role={!expanded && message ? 'status' : undefined}
            >
              {expanded
                ? 'يقرأ الوكيل محتوى الدرس ويجهّز صفحة الطالب وخطتك للتدريس ونشاط التحقق، ثم يحفظها معاً.'
                : (message ?? 'صفحة الطالب وخطة المعلم ونشاط التحقق محفوظة.')}
            </p>
          </div>
          {!expanded ? (
            <div className="ms-auto flex flex-wrap items-center gap-1.5">{actions}</div>
          ) : null}
        </div>
        <div id="lesson-agent-fields" hidden={!expanded} className="mt-3">
          <Label htmlFor="lesson-agent-request" className="sr-only">
            ما الذي تريد تحضيره في الدرس؟
          </Label>
          <Textarea
            id="lesson-agent-request"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            disabled={busy}
            rows={3}
            maxLength={LESSON_PAGE_AGENT_LIMITS.instructions}
            className="resize-y text-base leading-7"
            placeholder="مثال: جهّز درس دورة الماء، ابدأ بموقف من الحياة اليومية، ثم مثال وتجربة بسيطة وأسئلة تكشف الفهم. يمكنك ترك الطلب فارغاً ليعتمد على الدرس الحالي."
          />
          <fieldset disabled={busy} className="mt-3 grid gap-3 sm:grid-cols-3">
            <legend className="sr-only">سياق التدريس</legend>
            <ContextSelect
              id="lesson-agent-stage"
              label="المرحلة"
              value={context.stage}
              options={TEACHER_AI_STAGES}
              disabled={busy}
              onChange={(stage) => setContext({ ...context, stage })}
            />
            <ContextSelect
              id="lesson-agent-duration"
              label="وقت الحصة"
              value={String(context.durationMinutes)}
              options={[15, 30, 45, 60, 90].map((minutes) => ({
                value: String(minutes),
                label: `${ar(minutes)} دقيقة`,
              }))}
              disabled={busy}
              onChange={(value) => setContext({ ...context, durationMinutes: Number(value) })}
            />
            <ContextSelect
              id="lesson-agent-support"
              label="مستوى الدعم"
              value={context.support}
              options={TEACHER_AI_SUPPORT}
              disabled={busy}
              onChange={(support) => setContext({ ...context, support })}
            />
          </fieldset>
        </div>
        {expanded ? <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div> : null}
        {!busy && (published || expanded) ? (
          <p className="mt-2 text-xs leading-5 text-text-muted">
            {published
              ? 'سيُحدّث محتوى الدرس المنشور ونشاطه لطلابك عند اكتمال التجهيز.'
              : 'يعيد تنظيم الدرس ويحفظه كمسودة. انشره عندما يصبح مناسباً لطلابك.'}
          </p>
        ) : null}
      </form>
      {busy ? (
        <p className="mt-3 text-sm text-text-2" role="status">
          {publishing
            ? 'نحدّث ظهور الدرس ونشاطه لطلابك.'
            : undoing
              ? 'نستعيد الصفحة وخطة المعلم والنشاط السابق.'
              : 'يقرأ محتوى الدرس ويعدّ الشرح والأمثلة والتطبيق وأسئلة التحقق. قد يستغرق ذلك قليلاً.'}
        </p>
      ) : null}
      {needsProvider ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-ai-bg p-3 text-sm text-ai-text">
          <p>اختر المزوّد والنموذج لبدء تجهيز الدرس.</p>
          <Button variant="secondary" onClick={onOpenSettings}>
            إعداد الذكاء الاصطناعي
          </Button>
        </div>
      ) : null}
      {error ? (
        <Alert className="mt-3" tone="error" live>
          {error}
        </Alert>
      ) : null}
      {message && expanded ? (
        <p className="mt-3 text-sm text-ok-text" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}

function ContextSelect<T extends string>({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: T;
  disabled: boolean;
  options: readonly { readonly value: T; readonly label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Select disabled={disabled} value={value} onValueChange={(next) => onChange(next as T)}>
        <SelectTrigger id={id} className="w-full text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
