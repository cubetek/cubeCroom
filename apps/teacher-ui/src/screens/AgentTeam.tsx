'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  AGENT_SPECIALISTS,
  AGENT_WORKFLOWS,
  LEARNING_METHODS,
  type AgentProfile,
  type AgentMemory,
  type AgentRun,
  type ClassSummary,
  type TeacherLessonSummary,
  type AgentMethod,
} from '@cubecroom/contracts';
import { Alert, Button, Textarea, Input, cn } from '@cubecroom/ui';
import { bridge } from '../lib/bridge';
import { readLearningContext, rememberLearningContext } from '../lib/learning-context';

const field = 'flex flex-col gap-2 text-sm font-medium';
const select = 'min-h-10 rounded-lg border border-hairline bg-surface px-3 text-sm';
const statuses: Record<AgentRun['status'], string> = {
  queued: 'في قائمة العمل',
  running: 'يعمل الآن',
  completed: 'مكتملة',
  failed: 'تحتاج معالجة',
  cancelled: 'ملغاة',
  interrupted: 'توقفت ويمكن استئنافها',
};

export function AgentTeam({ onOpenLearning }: { onOpenLearning: () => void }) {
  const [profiles, setProfiles] = useState<AgentProfile[]>([]);
  const [selected, setSelected] = useState<AgentProfile | null>(null);
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [classId, setClassId] = useState('');
  const [lessons, setLessons] = useState<TeacherLessonSummary[]>([]);
  const [lessonId, setLessonId] = useState('');
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [memory, setMemory] = useState('');
  const [prompt, setPrompt] = useState<string>(AGENT_WORKFLOWS[0].prompt);
  const [method, setMethod] = useState<AgentMethod>('auto');
  const [advanced, setAdvanced] = useState(false);
  const [runAt, setRunAt] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void Promise.all([bridge().agentProfiles(), bridge().classesList({ includeArchived: false }), bridge().homeState()])
      .then(([p, c, home]) => {
        setProfiles(p);
        setSelected(p[0] ?? null);
        setClasses(c);
        const recent = readLearningContext();
        setClassId(c.find((row) => row.id === recent?.classId)?.id ?? c.find((row) => row.id === home.session?.classId)?.id ?? c[0]?.id ?? '');
      })
      .catch((e) => setError(String(e)));
  }, []);
  const refresh = useCallback(async () => {
    if (classId) {
      const [m, r] = await Promise.all([
        bridge().agentMemories({ classId }),
        bridge().agentRuns({ classId }),
      ]);
      setMemories(m);
      setRuns(r);
    }
  }, [classId]);
  useEffect(() => {
    let alive = true;
    if (classId)
      void bridge()
        .lessonsList({ classId })
        .then((l) => {
          if (alive) {
            setLessons(l);
            const recent = readLearningContext();
            const nextLesson = recent?.classId === classId && l.some((row) => row.id === recent.lessonId) ? recent.lessonId : l[0]?.id ?? '';
            setLessonId(nextLesson);
            rememberLearningContext(classId, nextLesson);
          }
        })
        .catch((e) => {
          if (alive) setError(String(e));
        });
    return () => {
      alive = false;
    };
  }, [classId]);
  useEffect(() => {
    void refresh().catch((e) => setError(String(e)));
    const timer = setInterval(() => void refresh().catch(() => undefined), 3000);
    return () => clearInterval(timer);
  }, [refresh]);
  const action = async (run: () => Promise<unknown>, success: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await run();
      await refresh();
      setMessage(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const def = AGENT_SPECIALISTS.find((d) => d.id === selected?.id);
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-semibold text-primary">خبرات متعددة، وهدف تعليمي واحد</p>
          <h1 className="text-2xl font-bold">فريق المساعدين</h1>
          <p className="mt-2 text-text-muted">
            أخبرنا بالنتيجة التي تريدها. يختار المنسق الأسلوب والمختصين ويجهّز العمل من درسك.
          </p>
        </div>
        <Button variant="secondary" onClick={onOpenLearning}>
          افتح تجارب التعلّم
        </Button>
        <Button variant="ghost" onClick={() => { setAdvanced(!advanced); if (advanced) { setSelected(profiles[0] ?? null); setMethod('auto'); setRunAt(''); } }}>
          {advanced ? 'العودة إلى الطلب المبسط' : 'تخصيص الفريق (اختياري)'}
        </Button>
      </header>
      {error && <Alert tone="error">{error}</Alert>}
      {message && <Alert tone="ok">{message}</Alert>}
      <label className="flex max-w-sm flex-col gap-2 text-sm font-medium">
        الفصل الذي يعمل فيه الفريق
        <select className={select} value={classId} onChange={(e) => setClassId(e.target.value)}>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {advanced && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {AGENT_SPECIALISTS.map((d) => (
          <button
            key={d.id}
            onClick={() => setSelected(profiles.find((p) => p.id === d.id) ?? null)}
            className={cn(
              'space-y-2 rounded-2xl border p-4 text-start transition-colors',
              selected?.id === d.id
                ? 'border-primary bg-primary-soft'
                : 'border-hairline bg-surface hover:border-primary',
            )}
          >
            <div className="mb-3 flex size-9 items-center justify-center rounded-xl bg-canvas text-lg">
              ✦
            </div>
            <h2 className="font-bold">{d.name}</h2>
            <p className="text-sm leading-relaxed text-text-muted">{d.role}</p>
          </button>
        ))}
      </div>}
      {selected && def && (
        <div className={cn('grid gap-5', advanced && 'xl:grid-cols-[1fr_1.3fr]')}>
          {advanced && <section className="space-y-4 rounded-2xl border border-hairline bg-surface p-5">
            <h2 className="text-lg font-bold">شخصية {def.name}</h2>
            <label className={field}>
              رسالته وطريقة تعامله
              <Textarea
                rows={3}
                value={selected.soul}
                onChange={(e) => setSelected({ ...selected, soul: e.target.value })}
              />
            </label>
            <label className={field}>
              تعليماتك المستمرة
              <Textarea
                rows={3}
                placeholder="استخدم أمثلة من البيئة المحلية، واجعل التعليمات قصيرة…"
                value={selected.instructions}
                onChange={(e) => setSelected({ ...selected, instructions: e.target.value })}
              />
            </label>
            <div>
              <p className="mb-2 text-sm font-semibold">مهاراته</p>
              <div className="flex flex-wrap gap-2">
                {def.skills.map((s) => (
                  <span key={s} className="rounded-full bg-canvas px-3 py-1 text-xs">
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-sm leading-relaxed text-text-muted">
              الأدوات: قراءة الدرس، مراجعة الذاكرة والنتائج، إعداد تجربة وحفظها، استشارة مختص،
              والنشر وفق التفويض.
            </p>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={selected.enabled}
                onChange={(e) => setSelected({ ...selected, enabled: e.target.checked })}
              />
              تفعيل هذا المساعد
            </label>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={selected.publishClassIds.includes(classId)}
                onChange={(e) =>
                  setSelected({
                    ...selected,
                    publishClassIds: e.target.checked
                      ? [...new Set([...selected.publishClassIds, classId])]
                      : selected.publishClassIds.filter((id) => id !== classId),
                  })
                }
              />
              <span>
                تفويض بالنشر داخل الفصل المختار بعد التحقق من التجربة. دون هذا التفويض يحفظ مسودة
                جاهزة.
              </span>
            </label>
            <Button
              onClick={() =>
                void action(async () => {
                  const saved = await bridge().agentProfileSave(selected);
                  setProfiles((ps) => ps.map((p) => (p.id === saved.id ? saved : p)));
                  setSelected(saved);
                }, 'حُفظ تعريف المساعد.')
              }
              aria-disabled={busy}
            >
              حفظ الشخصية والتفويض
            </Button>
          </section>}
          <section className="space-y-4 rounded-2xl border border-hairline bg-surface p-5">
            <h2 className="text-lg font-bold">مهمة جديدة</h2>
            <div className="flex flex-wrap gap-2">
              {AGENT_WORKFLOWS.map((workflow) => <Button key={workflow.id} variant="secondary" onClick={() => setPrompt(workflow.prompt)}>{workflow.title}</Button>)}
            </div>
            <label className={field}>
              الدرس
              <select
                className={select}
                value={lessonId}
                onChange={(e) => { setLessonId(e.target.value); rememberLearningContext(classId, e.target.value); }}
              >
                {lessons.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}
                  </option>
                ))}
              </select>
            </label>
            <label className={field}>
              ما النتيجة التي تريدها؟
              <Textarea
                rows={5}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="جهّز تجربة من هذا الدرس للصف الخامس بثلاثة أسئلة، وتلميحات قصيرة وتفسير بعد كل محاولة."
              />
            </label>
            <details className="space-y-3 text-sm">
            <summary className="cursor-pointer font-medium">تحديد الأسلوب أو الموعد (اختياري)</summary>
            <label className={field}>أسلوب التعلم
              <select className={select} value={method} onChange={(e) => setMethod(e.target.value as AgentMethod)}>
                <option value="auto">يختاره المساعد حسب الهدف والنتائج</option>
                {LEARNING_METHODS.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            </label>
            <label className={field}>
              موعد التنفيذ (اختياري)
              <Input
                type="datetime-local"
                value={runAt}
                onChange={(e) => setRunAt(e.target.value)}
              />
            </label>
            <p className="text-xs leading-relaxed text-text-muted">
              تنفذ المواعيد أثناء تشغيل التطبيق. تظهر المهام المتأخرة عند فتحه، ويمكن استئناف المهام
              التي انقطعت.
            </p>
            </details>
            {!advanced && <label className="flex items-start gap-3 rounded-xl bg-canvas p-3 text-sm">
              <input type="checkbox" disabled={busy} checked={profiles.find((p) => p.id === selected.id)?.publishClassIds.includes(classId) ?? false} onChange={(event) => {
                const enabled = event.target.checked;
                void action(async () => {
                  const latest = (await bridge().agentProfiles()).find((p) => p.id === selected.id)!;
                  const saved = await bridge().agentProfileSave({ ...latest, publishClassIds: enabled ? [...new Set([...latest.publishClassIds, classId])] : latest.publishClassIds.filter((id) => id !== classId) });
                  setProfiles((ps) => ps.map((p) => p.id === saved.id ? saved : p)); setSelected(saved);
                }, enabled ? 'حُفظ التفويض لهذا الفصل؛ لا تحتاج إلى تكراره مع كل مهمة.' : 'ستُحفظ المهام الجديدة كمسودات.');
              }} />
              <span>انشر التجارب الجاهزة في هذا الفصل بعد فحص الجودة. يُحفظ اختياري للمهام التالية؛ عند إيقافه يحفظ المساعد مسودة.</span>
            </label>}
            <Button
              variant="primary"
              aria-disabled={busy}
              onClick={() => {
                if (!classId || !lessonId) {
                  setError('اختر فصلاً ودرساً أولاً.');
                  return;
                }
                void action(async () => {
                  await bridge().agentStart({
                    requestId: crypto.randomUUID(),
                    agentId: selected.id,
                    classId,
                    lessonId,
                    prompt,
                    method,
                    ...(!advanced ? { delivery: profiles.find((p) => p.id === selected.id)?.publishClassIds.includes(classId) ? 'publish' as const : 'draft' as const } : {}),
                    ...(runAt ? { runAt: new Date(runAt).toISOString() } : {}),
                  });
                  setRunAt('');
                }, 'بدأ الفريق العمل. يمكنك متابعة التدريس والعودة إلى النتيجة هنا.');
              }}
            >
              ابدأ المهمة
            </Button>
          </section>
          {advanced && <section className="space-y-4 rounded-2xl border border-hairline bg-surface p-5">
            <h2 className="text-lg font-bold">ذاكرة المساعد في هذا الفصل</h2>
            <p className="text-sm text-text-muted">
              معلومات وتفضيلات يستطيع الرجوع إليها. يمكنك تصحيحها أو حذفها.
            </p>
            <Textarea
              aria-label="ذكرى جديدة"
              value={memory}
              onChange={(e) => setMemory(e.target.value)}
              placeholder="مثلاً: يفضل هذا الصف أمثلة قصيرة قبل محاولة الحل المستقل."
            />
            <Button
              variant="secondary"
              onClick={() =>
                void action(async () => {
                  await bridge().agentMemorySave({
                    agentId: selected.id,
                    classId,
                    content: memory,
                  });
                  setMemory('');
                }, 'حُفظت المعلومة في ذاكرة المساعد.')
              }
              aria-disabled={busy}
            >
              أضف إلى الذاكرة
            </Button>
            {memories
              .filter((m) => m.agentId === selected.id)
              .map((m) => (
                <MemoryCard key={m.id} memory={m} onSaved={refresh} onError={setError} />
              ))}
          </section>}
          <section className="space-y-4 rounded-2xl border border-hairline bg-surface p-5">
            <h2 className="text-lg font-bold">سجل المهام</h2>
            {runs.length === 0 && (
              <p className="text-sm text-text-muted">
                ستظهر هنا الخطوات والنتائج والأعمال التي حفظها المساعد.
              </p>
            )}
            {runs.map((r, index) => (
              <article key={r.id} className="space-y-3 rounded-xl border border-hairline p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="text-sm font-bold">
                    {AGENT_SPECIALISTS.find((a) => a.id === r.input.agentId)?.name}
                  </span>
                  <span className="rounded-full bg-canvas px-2 py-1 text-xs">
                    {statuses[r.status]}
                  </span>
                </div>
                <details className="text-sm"><summary className="cursor-pointer text-text-muted">الطلب وخطوات التنفيذ</summary>
                <p className="my-2">{r.input.prompt}</p>
                {r.input.runAt && (
                  <p className="text-xs text-text-muted">
                    الموعد: {new Date(r.input.runAt).toLocaleString('ar')}
                  </p>
                )}
                <ol className="space-y-1 border-s-2 border-primary-soft ps-3 text-sm text-text-muted">
                  {r.events.map((e, i) => (
                    <li key={`${e.at}-${i}`}>{e.message}</li>
                  ))}
                </ol>
                </details>
                {r.result && (
                  <details open={index === 0} className="text-sm"><summary className="cursor-pointer font-medium">النتيجة</summary><p className="mt-2 whitespace-pre-wrap leading-relaxed">{r.result}</p></details>
                )}
                <div className="flex gap-2">
                  {['queued', 'running'].includes(r.status) && (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        void action(
                          () => bridge().agentControl({ id: r.id, action: 'cancel' }),
                          'أُلغي طلب التنفيذ.',
                        )
                      }
                    >
                      إلغاء
                    </Button>
                  )}
                  {['failed', 'interrupted'].includes(r.status) && (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        void action(
                          () => bridge().agentControl({ id: r.id, action: 'resume' }),
                          'أعيدت المهمة إلى قائمة العمل.',
                        )
                      }
                    >
                      استئناف
                    </Button>
                  )}
                  {r.status === 'completed' && (
                    <Button variant="ghost" onClick={onOpenLearning}>
                      افتح النتائج
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}

function MemoryCard({
  memory,
  onSaved,
  onError,
}: {
  memory: AgentMemory;
  onSaved: () => Promise<void>;
  onError: (s: string) => void;
}) {
  const [content, setContent] = useState(memory.content);
  return (
    <div className="space-y-2 rounded-xl bg-canvas p-3">
      <Textarea
        aria-label="تعديل الذكرى"
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <p className="text-xs text-text-muted">المصدر: {memory.source}</p>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          onClick={() =>
            void bridge()
              .agentMemorySave({
                id: memory.id,
                agentId: memory.agentId,
                classId: memory.classId,
                content,
              })
              .then(onSaved)
              .catch((e) => onError(String(e)))
          }
        >
          حفظ التعديل
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            void bridge()
              .agentMemoryDelete({ id: memory.id })
              .then(onSaved)
              .catch((e) => onError(String(e)))
          }
        >
          حذف
        </Button>
      </div>
    </div>
  );
}
