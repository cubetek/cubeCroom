'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Icon,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StudentActivityView,
  Switch,
  Textarea,
  ar,
  cn,
} from '@cubecroom/ui';
import {
  publishBlockers,
  toStudentActivity,
  type TeacherActivityDetail,
  type TeacherLessonSummary,
  type TeacherQuestion,
} from '@cubecroom/contracts';
import { bridge } from '../lib/bridge';
import { useFlushOnExit } from '../lib/useFlushOnExit';
import { createSaveQueue } from '../lib/save-queue';
import { QuestionGenerator } from './QuestionGenerator';
import { when } from './Lessons';

/**
 * T16 — بناء النشاط.
 *
 * الهيكل هو هيكل محرر الدرس عمداً (ورقة على اليمين، عمود جانبي على اليسار):
 * المعلم ينتقل بينهما في الحصة نفسها، وتغيّر الهيكل بينهما يكلّفه إعادة توجيه
 * في كل مرة.
 *
 * النوع على السؤال لا على النشاط، كما في اللوح: مبدّل «اختيار من متعدد /
 * إجابة قصيرة» يقف فوق كل سؤال وحده.
 *
 * والمعاينة ليست رسماً ثانياً لما في المحرر: هي `StudentActivityView` نفسه
 * الذي سترسمه بوابة الطالب في `S07`، ومدخله ناتج `toStudentActivity` — النوع
 * الذي **لا يحمل مفتاح الإجابة أصلاً**. فلو أراد أحدٌ يوماً أن يرسم علامة
 * الصواب في المعاينة لم يجد حقلاً يقرؤها منه.
 *
 * الحفظ تلقائي بعد سكوت المعلم ثانية، كما في `T13`.
 */

/**
 * «بلا درس مرتبط» — بقيمةٍ صريحة لا بسلسلةٍ فارغة.
 *
 * السلسلة الفارغة محجوزة عند Radix لحالة «لا قيمة»: بندٌ قيمته `""` يُختار ثم
 * تعود القائمة إلى النائب كأنّ شيئاً لم يقع، بلا خطأ في الطرفية. فتُحمل الحالة
 * هنا باسمٍ، وتُترجم عند الحفظ إلى `null` — وهو ما تكتبه القاعدة كما كتبته من
 * قبل، فلم يتغيّر شيء تحت الشاشة.
 */
const NO_LESSON = 'none';

/**
 * مبدّل نوع السؤال — قرصان داخل غلافٍ واحد لا زرّان متجاوران.
 *
 * الغلاف هو ما يقول إن الاختيار بينهما لا بين كلٍّ منهما وما حوله: قرصٌ واحد
 * مضيء داخل مسارٍ واحد يُقرأ حالةً، وزرّان مؤطّران يُقرآن فعلين.
 */
const TYPE = 'h-7.5 cursor-pointer rounded-full px-3.5 text-t-label text-text-2';
const TYPE_ON = 'bg-primary-soft font-semibold text-primary-on-soft';

/**
 * زرّ الحذف — رماديّ ساكن يحمرّ تحت المؤشّر.
 *
 * الفعل مدمّر ولا نصّ معه يقوله (أيقونة `x` وحدها)، فالحمرة عند المرور هي
 * الإنذار الوحيد قبل النقرة. واسمُه المسموع يبقى هو الذي يقولها لمن لا يرى.
 */
const REMOVE = 'cursor-pointer rounded-sm p-1.5 text-text-muted hover:bg-error-bg hover:text-error-text';

export type ActivityBuilderProps = {
  readonly id: string;
  readonly classId: string;
  readonly className: string;
  readonly onClose: () => void;
  readonly onOpenAiSettings: () => void;
};

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';
type ActivityDraft = { title: string; lessonId: string | null; questions: TeacherQuestion[] };

export function ActivityBuilder({
  id,
  classId,
  className,
  onClose,
  onOpenAiSettings,
}: ActivityBuilderProps) {
  const [activity, setActivity] = useState<TeacherActivityDetail | null>(null);
  const [lessons, setLessons] = useState<TeacherLessonSummary[]>([]);
  const [draft, setDraft] = useState<ActivityDraft>({ title: '', lessonId: null, questions: [] });
  const { title, lessonId, questions } = draft;
  const latestDraft = useRef(draft);
  const [save, setSave] = useState<SaveState>('idle');
  const [preview, setPreview] = useState(0);
  const [generator, setGenerator] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [found, classLessons] = await Promise.all([
          bridge().activityGet({ id }),
          bridge().lessonsList({ classId }),
        ]);
        if (!alive) return;
        setActivity(found);
        const next = { title: found.title, lessonId: found.lessonId, questions: found.questions };
        latestDraft.current = next;
        setDraft(next);
        setLessons(classLessons);
      } catch (cause) {
        if (alive) setError(cause instanceof Error ? cause.message : 'تعذّر فتح النشاط.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, classId]);

  const persist = useCallback(
    async (next: ActivityDraft) => {
      setSave('saving');
      try {
        const saved = await bridge().activityUpdate({
          id,
          title: next.title,
          lessonId: next.lessonId,
          questions: next.questions,
        });
        setActivity(saved);
        setSave('saved');
        setError(null);
      } catch (cause) {
        setSave('failed');
        setError(cause instanceof Error ? cause.message : 'تعذّر حفظ النشاط.');
        throw cause;
      }
    },
    [id],
  );

  const queue = useMemo(() => createSaveQueue<ActivityDraft>(persist), [persist]);
  const flush = useCallback(() => queue.flush(), [queue]);
  useEffect(() => {
    if (!queue.dirty) return;
    const timer = setTimeout(() => {
      void flush().catch(() => undefined);
    }, 1000);
    return () => clearTimeout(timer);
  }, [draft, flush, queue]);

  // §22 — كما في محرّر الدرس: لا تُترك ثانيةُ الانتظار تبتلع آخر تعديل.
  useFlushOnExit(flush, `activity:${id}`, title.trim() || 'نشاط دون عنوان');

  const edit = (change: (current: ActivityDraft) => ActivityDraft) => {
    const next = change(latestDraft.current);
    latestDraft.current = next;
    queue.set(next);
    setDraft(next);
  };

  const setQuestion = (index: number, next: TeacherQuestion) =>
    edit((current) => ({ ...current, questions: current.questions.map((one, at) => (at === index ? next : one)) }));

  const removeQuestion = (index: number) =>
    edit((current) => ({ ...current, questions: current.questions.filter((_, at) => at !== index) }));

  const addQuestion = () =>
    edit((current) => ({ ...current,
      questions: [
        ...current.questions,
        {
          type: 'choice',
          id: freshId(),
          prompt: '',
          points: 1,
          options: [blankOption(), blankOption()],
        },
      ],
    }));

  /**
   * تبديل نوع السؤال يحفظ نصّه ودرجته ويستبدل ما يخصّ النوع وحده.
   * معلمٌ كتب سؤالاً طويلاً ثم بدّل النوع لا يجوز أن يفقد نصّه.
   */
  const switchType = (index: number, question: TeacherQuestion, type: 'choice' | 'text') => {
    if (question.type === type) return;
    setQuestion(
      index,
      type === 'choice'
        ? {
            type: 'choice',
            id: question.id,
            prompt: question.prompt,
            points: question.points,
            options: [blankOption(), blankOption()],
          }
        : {
            type: 'text',
            id: question.id,
            prompt: question.prompt,
            points: question.points,
            expectedAnswer: null,
          },
    );
  };

  const togglePublish = async () => {
    if (activity === null) return;
    setError(null);
    try {
      await flush();
      setActivity(
        await bridge().activityPublish({ id, published: activity.status !== 'published' }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر تغيير حالة النشر.');
    }
  };

  if (activity === null) {
    return <div className="m-auto text-text-muted">{error ?? 'نفتح النشاط…'}</div>;
  }

  const published = activity.status === 'published';
  const blockers = publishBlockers({ title, questions });

  return (
    <div className="flex min-h-0 grow flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2.5">
        <Button
          variant="secondary"
          size="sm"
          icon={<Icon name="chevron-next" size={17} />}
          onClick={onClose}
        >
          {`${className} · الأنشطة`}
        </Button>
        {published ? <Badge tone="ok">منشور للطلاب</Badge> : <Badge tone="draft">مسودة</Badge>}
        <span className="text-t-caption text-text-muted">{saveLabel(save, activity.updatedAt)}</span>
        {/*
          حشوةٌ لا `ms-auto` على الزرّ: الزرّ المعطَّل يلفّه `Button` بعنصرٍ
          يحمل سببَ التعطيل، فالمحاذاة المكتوبة عليه تصيب الزرّ داخل اللفّة
          لا اللفّة نفسها — ويبقى الطرفان متباعدين في حالٍ ومتلاصقين في حال.
        */}
        <div className="grow" />
        {!published && blockers.length > 0 ? (
          <Button variant="primary" disabled disabledReason={blockers[0] ?? 'النشاط غير مكتمل.'}>
            نشر للطلاب
          </Button>
        ) : (
          <Button
            variant={published ? 'secondary' : 'primary'}
            onClick={() => void togglePublish()}
          >
            {published ? 'إلغاء النشر' : 'نشر للطلاب'}
          </Button>
        )}
      </header>

      {error !== null ? (
        <Alert tone="error" live>
          {error}
        </Alert>
      ) : null}

      {/*
        حين يفتح المعلم «توليد أسئلة من الدرس» يصير في هذا الصفّ عمودان لا
        ينكمشان — لوحة التوليد 380px والعمود الجانبي 380px — أي 788px محجوزة مع
        الفجوتين. فلا يبقى للورقة على مقاس الأساس 1280×800 إلا 125px داخل
        حشوتها، وعند 1024×768 تصل إلى صفر ويفيض الصفّ أفقياً: محرّر الأسئلة بلا
        عرض يُكتب فيه.

        والحدّ 1300px لا 1180px لأن الأساس 1280 نفسه داخل التصادم، ونقطةُ كسر
        تحته تترك العطل قائماً على المقاس الموصى به. و`content-start` تمنع أثراً
        جانبياً للالتفاف: بلاها تتمدّد الأسطر بالتساوي فتصير الورقة القصيرة
        فارغةً بطول ثلث الشاشة.
      */}
      <div className="flex min-h-0 grow gap-3.5 overflow-auto max-[1300px]:flex-wrap max-[1300px]:content-start">
        {/*
          **وأرضيةٌ على الورقة لا حجزُ سطرٍ لها.** التصادم أعلاه لا يقع إلّا
          واللوحة مفتوحة، ولا شرط في CSS يعرف أنها مفتوحة — فـ`w-full` على
          العمود الجانبي كان يفكّ العمودين **دائماً** دون 1300، أي على مقاس
          الأساس 1280×800 واللوحةُ مغلقة: مقيسٌ أن الورقة تقفز من 582px إلى 976
          وتهبط «كما يراها الطالب» تحتها بعد 188px من التمرير — وهي الشاشة التي
          صُمّمت عمداً على هيكل محرّر الدرس ولا عطل فيها عند 1280. والأرضية تترك
          الالتفاف يقرّر بنفسه: يبقى العمودان ما اتّسعا (1280 مغلقة: ورقة 582
          وجانبٌ 380)، وتنزل اللوحة سطراً حين تُفتح، ولا يفيض الصفّ حتى 1008px —
          أضيق سطحٍ يبلغه المعلّم بالسحب.
        */}
        <div className="flex min-w-0 grow flex-col gap-2.5 rounded-lg border border-hairline bg-surface px-7.5 py-6.5 max-[1300px]:min-w-90">
          <Label htmlFor="activity-title">عنوان النشاط</Label>
          {/*
            العنوان بحجم عنوان: `h-auto` تفكّ ارتفاع الحقل المعياري لأن سطر
            22px لا يسعه، والنائب يخفّ إلى الوزن العادي فلا يُقرأ عنواناً مكتوباً.
          */}
          <Input
            id="activity-title"
            className="h-auto py-2.5 text-t-h1 placeholder:font-normal"
            value={title}
            onChange={(event) => edit((current) => ({ ...current, title: event.target.value }))}
            placeholder="اضغط لتعديل العنوان"
          />

          <Label htmlFor="activity-lesson">الدرس المرتبط</Label>
          <Select
            value={lessonId ?? NO_LESSON}
            onValueChange={(next) =>
              edit((current) => ({ ...current, lessonId: next === NO_LESSON ? null : next }))
            }
          >
            <SelectTrigger id="activity-lesson">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_LESSON}>بلا درس مرتبط</SelectItem>
              {lessons.map((lesson) => (
                <SelectItem key={lesson.id} value={lesson.id}>
                  {lesson.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {questions.map((question, index) => (
            <section
              key={question.id}
              className="mt-1.5 flex flex-col gap-2 rounded-lg border border-hairline bg-canvas px-4.5 py-4"
            >
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-t-body font-bold">{ordinal(index)}</span>
                <div
                  className="flex gap-1 rounded-full border border-hairline bg-surface p-1"
                  role="radiogroup"
                  aria-label="نوع السؤال"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={question.type === 'choice'}
                    className={cn(TYPE, question.type === 'choice' && TYPE_ON)}
                    onClick={() => switchType(index, question, 'choice')}
                  >
                    اختيار من متعدد
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={question.type === 'text'}
                    className={cn(TYPE, question.type === 'text' && TYPE_ON)}
                    onClick={() => switchType(index, question, 'text')}
                  >
                    إجابة قصيرة
                  </button>
                </div>
                <div className="grow" />
                <button
                  type="button"
                  className={REMOVE}
                  onClick={() => removeQuestion(index)}
                  aria-label={`حذف ${ordinal(index)}`}
                >
                  <Icon name="x" size={16} />
                </button>
              </div>

              <Label htmlFor={`prompt-${question.id}`}>نص السؤال</Label>
              <Textarea
                id={`prompt-${question.id}`}
                rows={2}
                value={question.prompt}
                onChange={(event) =>
                  setQuestion(index, { ...question, prompt: event.target.value })
                }
                placeholder="اكتب السؤال كما سيقرؤه طالبك…"
              />

              {question.type === 'choice' ? (
                <>
                  <div className="flex items-baseline gap-2">
                    <span className="text-t-label text-text-2">الخيارات</span>
                    {/* «علّم الإجابة الصحيحة» — تعليمة للمعلم، ولا وجود لها في شاشة الطالب. */}
                    <span className="text-t-caption text-text-muted">علّم الإجابة الصحيحة</span>
                  </div>
                  {/*
                    مجموعةٌ واحدة لا أزرارٌ متفرّقة: `Tab` يدخلها ويخرج منها مرة
                    واحدة، والأسهم تتنقّل بين الخيارات داخلها — وهي جهةٌ يعرفها
                    Radix من `DirectionProvider` لا من `dir` على الوثيقة.
                  */}
                  <RadioGroup
                    value={question.options.find((one) => one.isCorrect)?.id ?? ''}
                    onValueChange={(next) =>
                      setQuestion(index, {
                        ...question,
                        // إجابة صحيحة واحدة: اللوح يرسم زرّ اختيار لا مربّع.
                        options: question.options.map((one) => ({
                          ...one,
                          isCorrect: one.id === next,
                        })),
                      })
                    }
                  >
                    {question.options.map((option, at) => (
                      <div key={option.id} className="flex items-center gap-2">
                        <RadioGroupItem
                          value={option.id}
                          aria-label={`الإجابة الصحيحة: الخيار ${ar(at + 1)}`}
                        />
                        <Input
                          className="grow"
                          value={option.text}
                          onChange={(event) =>
                            setQuestion(index, {
                              ...question,
                              options: question.options.map((one, where) =>
                                where === at ? { ...one, text: event.target.value } : one,
                              ),
                            })
                          }
                          placeholder={`الخيار ${ar(at + 1)}`}
                          aria-label={`نص الخيار ${ar(at + 1)}`}
                        />
                        {option.isCorrect ? (
                          <Badge tone="ok" size="sm">
                            الإجابة الصحيحة
                          </Badge>
                        ) : null}
                        <button
                          type="button"
                          className={REMOVE}
                          onClick={() =>
                            setQuestion(index, {
                              ...question,
                              options: question.options.filter((_, where) => where !== at),
                            })
                          }
                          aria-label={`حذف الخيار ${ar(at + 1)}`}
                        >
                          <Icon name="x" size={15} />
                        </button>
                      </div>
                    ))}
                  </RadioGroup>
                  {question.options.length < 6 ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setQuestion(index, {
                          ...question,
                          options: [...question.options, blankOption()],
                        })
                      }
                    >
                      إضافة خيار
                    </Button>
                  ) : null}
                </>
              ) : (
                <>
                  <Label htmlFor={`expected-${question.id}`}>الإجابة المتوقَّعة (اختيارية)</Label>
                  <Textarea
                    id={`expected-${question.id}`}
                    rows={2}
                    value={question.expectedAnswer ?? ''}
                    onChange={(event) =>
                      setQuestion(index, {
                        ...question,
                        expectedAnswer: event.target.value === '' ? null : event.target.value,
                      })
                    }
                    placeholder="تظهر لك وحدك عند التصحيح — ولا تصل الطالب."
                  />
                </>
              )}
            </section>
          ))}

          {/* الخطّ المتقطّع يفصل «ما أكتبه» عن «ما أضيفه» بلا أن يقطع الورقة. */}
          <div className="mt-1 flex flex-wrap gap-1.5 border-t border-dashed border-hairline pt-3.5">
            <Button variant="secondary" onClick={addQuestion} icon={<Icon name="plus" size={17} />}>
              إضافة سؤال
            </Button>
            <Button
              variant="ghost"
              onClick={() => setGenerator((open) => !open)}
              icon={<Icon name="sparkles" size={17} />}
            >
              توليد أسئلة من الدرس
            </Button>
          </div>
        </div>

        {generator ? (
          <QuestionGenerator
            activityId={id}
            lessons={lessons}
            defaultLessonId={lessonId}
            onClose={() => setGenerator(false)}
            onOpenSettings={onOpenAiSettings}
            onInsert={(generated) => {
              // الكتابة الوحيدة التي تلمس النشاط — وبضغطة المعلم وحدها.
              edit((current) => ({ ...current, questions: [...current.questions, ...generated] }));
              setGenerator(false);
            }}
          />
        ) : null}

        <aside className="flex w-95 shrink-0 flex-col gap-3">
          <Card className="gap-2.5">
            <CardHeader>
              <CardTitle>
                <h3>كما يراها الطالب</h3>
              </CardTitle>
              <CardDescription>
                هذه هي البيانات التي تصل جهاز طالبك حرفياً — بلا علامة الإجابة الصحيحة، وبلا
                الإجابة المتوقَّعة.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StudentActivityView
                activity={toStudentActivity({ id, title, questions })}
                index={Math.min(preview, Math.max(0, questions.length - 1))}
                onIndexChange={setPreview}
                note="إجاباتك محفوظة على هذا الجهاز — لو أُغلقت الصفحة ستجدها كما تركتها."
                footer={
                  /*
                   * زرّ الإرسال في المعاينة معطّل دائماً: المعاينة تُري المعلم
                   * شكل الشاشة، ولا تُسلّم نشاطاً باسم أحد. وهو مرسومٌ هنا لا
                   * بـ`Button` المعطَّل لأنّ ذاك يطلب سبباً يُكتب تحته نصّاً،
                   * وهذا ليس زرّاً عطّلته حالٌ بل زرٌّ لا يعمل في المعاينة أصلاً.
                   */
                  <button
                    type="button"
                    className="min-h-13 rounded-md bg-draft-border text-t-body font-semibold text-text-muted"
                    disabled
                  >
                    إرسال الإجابة
                  </button>
                }
              />
            </CardContent>
          </Card>

          <Card className="gap-2.5">
            <CardHeader>
              <CardTitle>
                <h3>ظهور النشاط</h3>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              {published ? (
                <p className="text-t-label text-text-2">
                  منشور — يظهر لطلاب {className} وحدهم.
                  {activity.publishedAt === null ? '' : ` نُشر ${when(activity.publishedAt)}.`}
                </p>
              ) : blockers.length === 0 ? (
                <p className="text-t-label text-text-2">
                  مسودة — جاهزة للنشر. لا يراها أحد من طلابك حتى تنشرها.
                </p>
              ) : (
                <>
                  <p className="text-t-label text-text-2">مسودة — ينقصها ما يلي قبل النشر:</p>
                  <ul className="ps-5 text-t-label text-error-text">
                    {blockers.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>

          {/*
            البوّابة الثالثة في قرار D10. مطفأة افتراضياً كأختيها، وفوقها مفتاح
            الفصل والقاطع العام — وإطفاء أيّها يمنع.
          */}
          <Card className="gap-2.5">
            <CardHeader>
              <CardTitle>
                <h3>مساعدة الذكاء الاصطناعي داخل هذا النشاط</h3>
              </CardTitle>
            </CardHeader>
            {/* `items-start` يبقي المفتاح بجانب أوّل سطرٍ من الشرح لا في وسط فقرته. */}
            <CardContent className="flex items-start gap-3">
              <p className="text-t-label text-text-2">
                مطفأة افتراضياً. وفتحها هنا لا يفتحها ما لم يكن مفتاح الفصل والقاطع العام
                مفتوحين معاً.
              </p>
              <Switch
                label="مساعدة الذكاء الاصطناعي داخل هذا النشاط"
                checked={activity.studentAiEnabled}
                onChange={(next) => {
                  setActivity({ ...activity, studentAiEnabled: next });
                  void bridge()
                    .activityStudentAi({ id, enabled: next })
                    .then(setActivity)
                    .catch(() => setActivity({ ...activity, studentAiEnabled: !next }));
                }}
              />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

/**
 * معرّفات تُولَّد في الواجهة وتُكتب في القاعدة كما هي.
 *
 * وهذا مقصود: سؤالٌ لم يُمسّ يبقى معرّفه، فتبقى إجابات الطلاب المرتبطة به
 * مرتبطةً به بعد كل حفظ. توليدُ معرّف جديد عند كل حفظ كان سيقطع تلك الصلة.
 */
function freshId(): string {
  return crypto.randomUUID();
}

function blankOption() {
  return { id: freshId(), text: '', isCorrect: false };
}

const ORDINALS = [
  'السؤال الأول',
  'السؤال الثاني',
  'السؤال الثالث',
  'السؤال الرابع',
  'السؤال الخامس',
] as const;

function ordinal(index: number): string {
  return ORDINALS[index] ?? `السؤال ${ar(index + 1)}`;
}

function saveLabel(state: SaveState, updatedAt: string): string {
  if (state === 'saving') return 'جارٍ الحفظ…';
  if (state === 'failed') return 'لم يُحفظ آخر تعديل';
  if (state === 'saved') return 'حُفظ قبل لحظات';
  return `آخر حفظ: ${when(updatedAt)}`;
}
