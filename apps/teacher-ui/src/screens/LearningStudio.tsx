'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  LEARNING_METHODS,
  LEARNING_METHOD_DEFAULT_KIND,
  type LearningMethod,
  learningMaterialSchema,
  toStudentLearning,
  type LearningExperience,
  type LearningItem,
  type LearningMaterial,
  type LearningProgress,
  type ClassSummary,
  type TeacherLessonSummary,
} from '@cubecroom/contracts';
import { Alert, Button, Input, Textarea, LearningInteraction, cn } from '@cubecroom/ui';
import { bridge } from '../lib/bridge';
import { useFlushOnExit } from '../lib/useFlushOnExit';
import { rememberLearningContext } from '../lib/learning-context';

const draftKey = 'cubecroom:learning-editor:v1';

const field = 'flex flex-col gap-2 text-sm font-medium';
const select = 'min-h-10 rounded-lg border border-hairline bg-surface px-3 text-sm';
const blankOptions = () => [
  { id: crypto.randomUUID(), text: '' },
  { id: crypto.randomUUID(), text: '' },
];
const newItem = (method: LearningMethod = 'retrieval'): LearningItem => {
  const kind = LEARNING_METHOD_DEFAULT_KIND[method];
  return {
    id: crypto.randomUUID(),
    kind,
    objective: '',
    prompt: '',
    options: blankOptions(),
    targets:
      kind === 'match'
        ? [
            { id: crypto.randomUUID(), text: '' },
            { id: crypto.randomUUID(), text: '' },
          ]
        : [],
    answer: [],
    explanation: '',
    hint: '',
    rubric: kind === 'explain' ? ['صحة الفكرة', 'تفسير السبب', 'مثال مناسب'] : [],
    example: '',
    next: null,
    alternate: null,
  };
};
const empty = (): LearningMaterial => ({
  schemaVersion: 1,
  title: '',
  method: 'retrieval',
  stage: 'الصف الخامس',
  instructions: '',
  items: [newItem()],
});

export function LearningStudio({ onOpenAgents }: { onOpenAgents: () => void }) {
  const [classes, setClasses] = useState<ClassSummary[]>([]);
  const [classId, setClassId] = useState('');
  const [lessons, setLessons] = useState<TeacherLessonSummary[]>([]);
  const [lessonId, setLessonId] = useState('');
  const [list, setList] = useState<LearningExperience[]>([]);
  const [current, setCurrent] = useState<LearningExperience | null>(null);
  const [material, setMaterial] = useState<LearningMaterial>(empty);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<LearningProgress[] | null>(null);
  const [reviews, setReviews] = useState<
    Awaited<ReturnType<ReturnType<typeof bridge>['learningReview']>>
  >([]);
  useEffect(() => {
    void bridge()
      .classesList({ includeArchived: false })
      .then((rows) => {
        setClasses(rows);
        setClassId(rows[0]?.id ?? '');
        try {
          const raw = localStorage.getItem(draftKey);
          if (!raw) return;
          const draft = JSON.parse(raw) as {
            classId: string;
            lessonId: string;
            current: LearningExperience | null;
            material: LearningMaterial;
          };
          if (
            !rows.some((c) => c.id === draft.classId) ||
            !Array.isArray(draft.material?.items) ||
            !draft.material.items.length
          )
            return;
          setClassId(draft.classId);
          setLessonId(draft.lessonId);
          setCurrent(draft.current);
          setMaterial(draft.material);
          setEditing(true);
          setDirty(true);
          setMessage('استعدنا مسودتك المحلية. راجعها ثم احفظ التجربة.');
        } catch {
          setError('تعذر استعادة المسودة المحلية.');
        }
      })
      .catch((e) => setError(String(e)));
  }, []);
  const refresh = useCallback(async () => {
    if (classId) setList(await bridge().learningList({ classId }));
  }, [classId]);
  useEffect(() => {
    let alive = true;
    if (classId)
      void Promise.all([bridge().learningList({ classId }), bridge().lessonsList({ classId })])
        .then(([rows, ls]) => {
          if (alive) {
            setList(rows);
            setLessons(ls);
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
    if (!dirty) return;
    const prevent = (e: BeforeUnloadEvent) => {
      try {
        localStorage.setItem(draftKey, JSON.stringify({ classId, lessonId, current, material }));
      } catch {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty, classId, lessonId, current, material]);
  const persistDraft = useCallback(() => {
    if (dirty)
      localStorage.setItem(draftKey, JSON.stringify({ classId, lessonId, current, material }));
  }, [dirty, classId, lessonId, current, material]);
  useEffect(() => {
    try {
      persistDraft();
    } catch {
      setError('لم نستطع حفظ المسودة على الجهاز. احفظ التجربة قبل المغادرة.');
    }
  }, [persistDraft]);
  useFlushOnExit(persistDraft, 'learning-editor', material.title || 'مسودة تجربة تعلم');
  const edit = (next: LearningMaterial) => {
    setMaterial(next);
    setDirty(true);
    setMessage('');
  };
  const changeItem = (item: LearningItem) =>
    edit({ ...material, items: material.items.map((i, j) => (j === index ? item : i)) });
  const open = (e: LearningExperience | null) => {
    if (dirty && !window.confirm('لديك تعديلات لم تحفظ. هل تريد تركها؟')) return;
    setCurrent(e);
    setMaterial(e?.material ?? empty());
    setLessonId(e?.lessonId ?? '');
    setEditing(true);
    setIndex(0);
    setPreview(false);
    setDirty(false);
    localStorage.removeItem(draftKey);
    setProgress(null);
    setReviews([]);
    setMessage('');
    setError('');
  };
  const save = async () => {
    // Text questions have no visible options. Strip stale editor fields before validation.
    const checked = learningMaterialSchema.safeParse({
      ...material,
      items: material.items.map((item) => ({
        ...item,
        options: ['choice', 'order', 'match'].includes(item.kind) ? item.options : [],
        targets: item.kind === 'match' ? item.targets : [],
      })),
    });
    if (!checked.success) {
      setError(
        checked.error.issues
          .map((i) => i.message)
          .slice(0, 4)
          .join(' · '),
      );
      return null;
    }
    if (!classId) {
      setError('أنشئ فصلاً أولاً.');
      return null;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await bridge().learningSave({
        ...(current ? { id: current.id } : {}),
        classId,
        lessonId: lessonId || null,
        expectedVersion: current?.version ?? 0,
        material: checked.data,
      });
      setCurrent(saved);
      setMaterial(saved.material);
      setDirty(false);
      localStorage.removeItem(draftKey);
      setMessage('حُفظت التجربة.');
      await refresh();
      return saved;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  };
  const publish = async () => {
    const saved = dirty || !current ? await save() : current;
    if (!saved) return;
    setBusy(true);
    try {
      const result = await bridge().learningPublish({
        id: saved.id,
        published: !saved.published,
        expectedVersion: saved.version,
      });
      setCurrent(result);
      setMessage(result.published ? 'التجربة متاحة للطلاب في فصلك.' : 'أوقف نشر التجربة.');
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const item = material.items[index];
  const student = toStudentLearning({
    id: current?.id ?? 'preview',
    classId,
    lessonId: lessonId || null,
    version: current?.version ?? 1,
    published: false,
    material,
    updatedAt: new Date().toISOString(),
  });
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-sm font-semibold text-primary">تعلمٌ يبقى بعد الحصة</p>
          <h1 className="text-2xl font-bold">تجارب التعلّم</h1>
          <p className="mt-2 text-text-muted">
            عشر طرق للاسترجاع والفهم والتطبيق، مع محاولات مستقلة ونتائج لكل هدف.
          </p>
        </div>
        <Button variant="primary" onClick={() => { rememberLearningContext(classId, lessonId || lessons[0]?.id || ''); onOpenAgents(); }}>
          دع المساعد يجهّز التجربة
        </Button>
      </header>
      <div className="flex flex-wrap items-end gap-3">
        <label className={field}>
          الفصل
          <select
            className={select}
            value={classId}
            disabled={dirty}
            onChange={(e) => {
              setClassId(e.target.value);
              setEditing(false);
            }}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <Button variant="secondary" onClick={() => open(null)}>
          تجربة جديدة
        </Button>
        <span className="text-sm text-text-muted">التحرير اليدوي اختياري؛ يستطيع المساعد اختيار الأسلوب وإعداد الأسئلة وفحصها.</span>
        {dirty && <span className="text-sm text-text-muted">تعديلات بانتظار الحفظ</span>}
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {message && <Alert tone="ok">{message}</Alert>}
      {!classId && (
        <p className="rounded-xl border border-dashed border-hairline p-8">
          أنشئ فصلاً من قسم الفصول لتضيف تجارب طلابك.
        </p>
      )}
      {!editing ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((e) => (
            <button
              key={e.id}
              onClick={() => open(e)}
              className="space-y-3 rounded-2xl border border-hairline bg-surface p-5 text-start transition-colors hover:border-primary"
            >
              <span className="text-sm text-primary">
                {LEARNING_METHODS.find((m) => m.id === e.material.method)?.title}
              </span>
              <h2 className="text-lg font-bold">{e.material.title}</h2>
              <p className="text-sm text-text-muted">
                {e.material.items.length} أسئلة · {e.published ? 'متاحة للطلاب' : 'مسودة'} · النسخة{' '}
                {e.version}
              </p>
            </button>
          ))}
          {list.length === 0 && classId && (
            <p className="col-span-full rounded-2xl border border-dashed border-hairline p-10 text-center text-text-muted">
              ابدأ بتجربة قصيرة من درسك، أو اطلب من المساعد إعدادها.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {LEARNING_METHODS.map((m) => (
              <button
                key={m.id}
                aria-pressed={material.method === m.id}
                onClick={() => {
                  const kind = LEARNING_METHOD_DEFAULT_KIND[m.id];
                  edit({
                    ...material,
                    method: m.id,
                    items: material.items.map((i) =>
                      i.prompt
                        ? i
                        : {
                            ...i,
                            kind,
                            options: i.options.length >= 2 ? i.options : blankOptions(),
                            answer: [],
                            targets:
                              kind === 'match'
                                ? [
                                    { id: crypto.randomUUID(), text: '' },
                                    { id: crypto.randomUUID(), text: '' },
                                  ]
                                : [],
                            rubric:
                              kind === 'explain' ? ['صحة الفكرة', 'تفسير السبب', 'مثال مناسب'] : [],
                          },
                    ),
                  });
                }}
                className={cn(
                  'rounded-xl border p-3 text-start',
                  material.method === m.id
                    ? 'border-primary bg-primary-soft text-primary-on-soft'
                    : 'border-hairline bg-surface',
                )}
              >
                <span className="block text-sm font-bold">{m.title}</span>
                <span className="mt-1 block text-xs leading-relaxed text-text-muted">
                  {m.description}
                </span>
              </button>
            ))}
          </div>
          <div className="grid gap-4 rounded-2xl border border-hairline bg-surface p-5 md:grid-cols-2">
            <label className={field}>
              عنوان التجربة
              <Input
                value={material.title}
                onChange={(e) => edit({ ...material, title: e.target.value })}
                placeholder="مثلاً: رحلة قطرة ماء"
              />
            </label>
            <label className={field}>
              الدرس المرتبط
              <select
                className={select}
                value={lessonId}
                onChange={(e) => {
                  setLessonId(e.target.value);
                  setDirty(true);
                }}
              >
                <option value="">دون درس مرتبط</option>
                {lessons.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title}
                  </option>
                ))}
              </select>
            </label>
            <label className={field}>
              الصف والمستوى
              <Input
                value={material.stage}
                onChange={(e) => edit({ ...material, stage: e.target.value })}
              />
            </label>
            <label className={field}>
              تعليمات الطالب
              <Input
                value={material.instructions}
                onChange={(e) => edit({ ...material, instructions: e.target.value })}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {material.items.map((i, j) => (
              <Button
                key={i.id}
                variant={index === j ? 'primary' : 'secondary'}
                onClick={() => setIndex(j)}
              >
                السؤال {j + 1}
              </Button>
            ))}
            <Button
              variant="ghost"
              onClick={() => {
                if (material.items.length < 30) {
                  edit({ ...material, items: [...material.items, newItem(material.method)] });
                  setIndex(material.items.length);
                }
              }}
            >
              أضف سؤالاً
            </Button>
            <Button variant="secondary" onClick={() => setPreview(!preview)}>
              {preview ? 'تحرير الأسئلة' : 'معاينة الطالب'}
            </Button>
          </div>
          {item &&
            (preview ? (
              <LearningInteraction
                key={`${item.id}-preview`}
                item={student.material.items[index]!}
                method={material.method}
              />
            ) : (
              <section className="space-y-4 rounded-2xl border border-hairline bg-surface p-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className={field}>
                    طريقة الإجابة
                    <select
                      className={select}
                      value={item.kind}
                      onChange={(e) => {
                        const kind = e.target.value as LearningItem['kind'];
                        changeItem({
                          ...item,
                          kind,
                          options: item.options.length >= 2 ? item.options : blankOptions(),
                          answer: [],
                          rubric:
                            kind === 'explain' ? ['صحة الفكرة', 'تفسير السبب', 'مثال مناسب'] : [],
                          targets:
                            kind === 'match'
                              ? [
                                  { id: crypto.randomUUID(), text: '' },
                                  { id: crypto.randomUUID(), text: '' },
                                ]
                              : [],
                        });
                      }}
                    >
                      <option value="choice">اختيار من متعدد</option>
                      <option value="recall">استرجاع كلمة أو عبارة</option>
                      <option value="order">ترتيب خطوات</option>
                      <option value="match">مطابقة مفاهيم وعلاقات</option>
                      <option value="explain">تفسير وفق معايير</option>
                    </select>
                  </label>
                  <label className={field}>
                    هدف التعلم
                    <Input
                      value={item.objective}
                      onChange={(e) => changeItem({ ...item, objective: e.target.value })}
                      placeholder="يميز بين التبخر والتكاثف"
                    />
                  </label>
                </div>
                <label className={field}>
                  السؤال أو الموقف
                  <Textarea
                    rows={3}
                    value={item.prompt}
                    onChange={(e) => changeItem({ ...item, prompt: e.target.value })}
                  />
                </label>
                {['choice', 'order', 'match'].includes(item.kind) && (
                  <div className="space-y-2">
                    <p className="text-sm font-bold">
                      الخيارات {item.kind === 'order' ? '(ترتيب العرض للطالب)' : ''}
                    </p>
                    {item.options.map((o, j) => (
                      <div key={o.id} className="flex gap-2">
                        <Input
                          aria-label={`الخيار ${j + 1}`}
                          value={o.text}
                          onChange={(e) =>
                            changeItem({
                              ...item,
                              options: item.options.map((x, k) =>
                                k === j ? { ...x, text: e.target.value } : x,
                              ),
                            })
                          }
                        />
                        {item.kind === 'choice' && (
                          <label className="flex shrink-0 items-center gap-2 text-sm">
                            <input
                              type="radio"
                              name={`key-${item.id}`}
                              checked={item.answer[0] === o.id}
                              onChange={() => changeItem({ ...item, answer: [o.id] })}
                            />
                            الصحيح
                          </label>
                        )}
                        <Button
                          variant="ghost"
                          onClick={() => {
                            if (item.options.length > 2)
                              changeItem({
                                ...item,
                                options: item.options.filter((x) => x.id !== o.id),
                                answer: [],
                              });
                          }}
                        >
                          حذف
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (item.options.length < 12)
                          changeItem({
                            ...item,
                            options: [...item.options, { id: crypto.randomUUID(), text: '' }],
                          });
                      }}
                    >
                      إضافة خيار
                    </Button>
                  </div>
                )}
                {item.kind === 'match' && (
                  <div className="space-y-2">
                    <p className="text-sm font-bold">المقابلات</p>
                    {item.targets.map((t, j) => (
                      <Input
                        key={t.id}
                        aria-label={`المقابل ${j + 1}`}
                        value={t.text}
                        onChange={(e) =>
                          changeItem({
                            ...item,
                            targets: item.targets.map((x, k) =>
                              k === j ? { ...x, text: e.target.value } : x,
                            ),
                          })
                        }
                      />
                    ))}
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (item.targets.length < 12)
                          changeItem({
                            ...item,
                            targets: [...item.targets, { id: crypto.randomUUID(), text: '' }],
                          });
                      }}
                    >
                      إضافة مقابل
                    </Button>
                  </div>
                )}
                {['order', 'match'].includes(item.kind) && (
                  <div className="grid gap-3 md:grid-cols-2">
                    {item.options.map((o, j) => (
                      <label key={o.id} className={field}>
                        {item.kind === 'order'
                          ? `الصحيح في الخطوة ${j + 1}`
                          : `المقابل الصحيح لـ ${o.text || j + 1}`}
                        <select
                          className={select}
                          value={item.answer[j] ?? ''}
                          onChange={(e) =>
                            changeItem({
                              ...item,
                              answer: item.options.map((_, k) =>
                                k === j ? e.target.value : (item.answer[k] ?? ''),
                              ),
                            })
                          }
                        >
                          <option value="">اختر…</option>
                          {(item.kind === 'order' ? item.options : item.targets).map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.text || 'اكتب نص الخيار'}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                )}
                {['recall', 'explain'].includes(item.kind) && (
                  <label className={field}>
                    مفتاح الإجابة الخاص بالمعلم{' '}
                    {item.kind === 'recall' ? '(صياغة مقبولة في كل سطر)' : ''}
                    <Textarea
                      value={item.answer.join('\n')}
                      onChange={(e) => changeItem({ ...item, answer: e.target.value.split('\n') })}
                    />
                  </label>
                )}
                {item.kind === 'explain' && (
                  <label className={field}>
                    معايير التقييم (معيار في كل سطر)
                    <Textarea
                      value={item.rubric.join('\n')}
                      onChange={(e) => changeItem({ ...item, rubric: e.target.value.split('\n') })}
                    />
                  </label>
                )}
                <label className={field}>
                  التفسير الذي يظهر بعد المحاولة
                  <Textarea
                    value={item.explanation}
                    onChange={(e) => changeItem({ ...item, explanation: e.target.value })}
                  />
                </label>
                <div className="grid gap-4 md:grid-cols-2">
                  <label className={field}>
                    تلميح اختياري
                    <Textarea
                      value={item.hint}
                      onChange={(e) => changeItem({ ...item, hint: e.target.value })}
                    />
                  </label>
                  <label className={field}>
                    مثال مساعد اختياري
                    <Textarea
                      value={item.example}
                      onChange={(e) => changeItem({ ...item, example: e.target.value })}
                    />
                  </label>
                </div>
                {material.method === 'quest' && (
                  <div className="grid gap-4 md:grid-cols-2">
                    {(['next', 'alternate'] as const).map((key) => (
                      <label key={key} className={field}>
                        {key === 'next' ? 'بعد إجابة صحيحة' : 'بعد إجابة تحتاج مراجعة'}
                        <select
                          className={select}
                          value={item[key] ?? ''}
                          onChange={(e) => changeItem({ ...item, [key]: e.target.value || null })}
                        >
                          <option value="">السؤال التالي</option>
                          {material.items.slice(index + 1).map((x, j) => (
                            <option key={x.id} value={x.id}>
                              السؤال {index + j + 2}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                )}
                {material.items.length > 1 && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const removed = item.id;
                      edit({
                        ...material,
                        items: material.items
                          .filter((i) => i.id !== removed)
                          .map((i) => ({
                            ...i,
                            next: i.next === removed ? null : i.next,
                            alternate: i.alternate === removed ? null : i.alternate,
                          })),
                      });
                      setIndex(Math.max(0, index - 1));
                    }}
                  >
                    حذف السؤال
                  </Button>
                )}
              </section>
            ))}
          <div className="sticky bottom-0 flex flex-wrap gap-3 rounded-xl border border-hairline bg-surface p-4">
            <Button
              variant="primary"
              aria-disabled={busy}
              onClick={() => {
                if (!busy) void save();
              }}
            >
              {busy ? 'جارٍ الحفظ…' : 'حفظ التجربة'}
            </Button>
            <Button
              variant="secondary"
              aria-disabled={busy}
              onClick={() => {
                if (!busy) void publish();
              }}
            >
              {current?.published ? 'إيقاف النشر' : 'إتاحة للطلاب'}
            </Button>
            {current && (
              <Button
                variant="secondary"
                onClick={() => {
                  void Promise.all([
                    bridge().learningProgress({ id: current.id }),
                    bridge().learningReview({ id: current.id }),
                  ])
                    .then(([p, r]) => {
                      setProgress(p);
                      setReviews(r);
                    })
                    .catch((e) => setError(String(e)));
                }}
              >
                النتائج والمراجعة
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={() => {
                if (!dirty || window.confirm('ترك التعديلات دون حفظ؟')) {
                  setEditing(false);
                  setDirty(false);
                  localStorage.removeItem(draftKey);
                }
              }}
            >
              العودة للقائمة
            </Button>
          </div>
          {progress && (
            <section className="space-y-3 rounded-xl border border-hairline bg-surface p-5">
              <h2 className="text-lg font-bold">أدلة التعلم</h2>
              <p className="text-sm text-text-muted">
                عدد الإجابات الصحيحة لا يعني وحده إتقان المفهوم. تحقق أيضاً في مراجعة مؤجلة.
              </p>
              {progress.length === 0 && <p>لا توجد محاولات بعد.</p>}
              <div className="overflow-x-auto">
                <table className="w-full text-start text-sm">
                  <thead>
                    <tr>
                      {['الطالب', 'الهدف', 'المحاولات', 'صحيحة', 'بانتظار المراجعة'].map((t) => (
                        <th className="p-3 text-start" key={t}>
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {progress.map((p) => (
                      <tr
                        key={`${p.studentId}-${p.objective}`}
                        className="border-t border-hairline"
                      >
                        <td className="p-3">{p.studentName}</td>
                        <td>{p.objective}</td>
                        <td>{p.attempts}</td>
                        <td>{p.correct}</td>
                        <td>{p.pendingReview}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {reviews.map((r) => (
                <ReviewCard
                  key={r.id}
                  review={r}
                  onSaved={() => {
                    setReviews((rs) => rs.filter((x) => x.id !== r.id));
                    void bridge().learningProgress({ id: current!.id }).then(setProgress);
                  }}
                />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ReviewCard({
  review,
  onSaved,
}: {
  review: { id: string; studentName: string; prompt: string; answer: string[]; rubric: string[] };
  onSaved: () => void;
}) {
  const [score, setScore] = useState('1');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  return (
    <div className="space-y-3 rounded-xl border border-hairline p-4">
      <p className="font-bold">
        {review.studentName} · {review.prompt}
      </p>
      <p className="whitespace-pre-wrap">{review.answer.join('\n')}</p>
      <p className="text-sm text-text-muted">المعايير: {review.rubric.join(' · ')}</p>
      <label className={field}>
        مدى استيفاء المعايير
        <select className={select} value={score} onChange={(e) => setScore(e.target.value)}>
          <option value="1">مستوفاة</option>
          <option value="0.5">مستوفاة جزئياً</option>
          <option value="0">تحتاج مراجعة</option>
        </select>
      </label>
      <Textarea
        aria-label="ملاحظتك للطالب"
        placeholder="تغذية راجعة للطالب"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <Button
        onClick={() => {
          void bridge()
            .learningGrade({ attemptId: review.id, score: Number(score), comment })
            .then(onSaved)
            .catch((e) => setError(String(e)));
        }}
      >
        حفظ المراجعة
      </Button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
