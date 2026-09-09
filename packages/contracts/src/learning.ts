import { z } from 'zod';

export const LEARNING_METHODS = [
  {
    id: 'retrieval',
    title: 'تحدي الاسترجاع',
    description: 'استحضر الفكرة قبل كشف الإجابة، ثم جرّب سؤالاً جديداً.',
    icon: 'bolt',
  },
  {
    id: 'spaced',
    title: 'بطاقات المراجعة',
    description: 'مراجعات قصيرة تعود في موعدها لتثبيت التعلم.',
    icon: 'clock',
  },
  {
    id: 'steps',
    title: 'سُلّم الحل',
    description: 'مثال يساعدك، وخطوات تكملها، ثم محاولة مستقلة.',
    icon: 'list',
  },
  {
    id: 'explain',
    title: 'اشرح لماذا',
    description: 'اشرح الفكرة والسبب بمثال من عندك.',
    icon: 'message',
  },
  {
    id: 'errors',
    title: 'محقق الأخطاء',
    description: 'اكتشف الخطأ وصححه وفسّر السبب.',
    icon: 'search',
  },
  {
    id: 'concepts',
    title: 'خريطة المفاهيم',
    description: 'ابنِ الروابط بين المفاهيم من ذاكرتك.',
    icon: 'link',
  },
  {
    id: 'diagram',
    title: 'أكمل المخطط',
    description: 'أكمل مراحل مخطط متسلسل من ذاكرتك.',
    icon: 'image',
  },
  {
    id: 'peer',
    title: 'فكّر وناقش',
    description: 'فكّر وحدك، ناقش زميلاً، ثم أجب مرة أخرى.',
    icon: 'users',
  },
  {
    id: 'quest',
    title: 'مهمة تطبيقية',
    description: 'اتخذ قراراً في موقف جديد واكتشف نتيجته.',
    icon: 'compass',
  },
  {
    id: 'exit',
    title: 'بطاقة الخروج',
    description: 'تحقق من فهمك وحدد ما تريد مراجعته.',
    icon: 'check',
  },
] as const;
export const learningMethodSchema = z.enum([
  'retrieval',
  'spaced',
  'steps',
  'explain',
  'errors',
  'concepts',
  'diagram',
  'peer',
  'quest',
  'exit',
]);
export type LearningMethod = z.infer<typeof learningMethodSchema>;
const id = z.string().min(1).max(128);
export const learningOptionSchema = z
  .object({ id, text: z.string().trim().min(1).max(500) })
  .strict();
export const learningItemSchema = z
  .object({
    id,
    kind: z.enum(['choice', 'recall', 'order', 'match', 'explain']),
    objective: z.string().trim().min(1).max(300),
    prompt: z.string().trim().min(1).max(2000),
    options: z.array(learningOptionSchema).max(12).default([]),
    targets: z.array(learningOptionSchema).max(12).default([]),
    // Private answer: option id, text, ordered ids, or one target id per option.
    answer: z.array(z.string().trim().min(1).max(2000)).min(1).max(12),
    explanation: z.string().trim().min(1).max(2000),
    hint: z.string().trim().max(1000).default(''),
    rubric: z.array(z.string().trim().min(1).max(300)).max(6).default([]),
    example: z.string().trim().max(2000).default(''),
    next: id.nullable().default(null),
    alternate: id.nullable().default(null),
  })
  .strict()
  .superRefine((item, ctx) => {
    const optionIds = item.options.map((o) => o.id);
    const targetIds = item.targets.map((o) => o.id);
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (
      new Set(optionIds).size !== optionIds.length ||
      new Set(targetIds).size !== targetIds.length
    )
      fail('معرّفات الخيارات مكررة.');
    if (['choice', 'order', 'match'].includes(item.kind) && item.options.length < 2)
      fail('أضف خيارين على الأقل.');
    if (
      item.kind === 'choice' &&
      (item.answer.length !== 1 || !optionIds.includes(item.answer[0]!))
    )
      fail('اختر إجابة صحيحة واحدة.');
    if (
      item.kind === 'order' &&
      (item.answer.length !== optionIds.length ||
        new Set(item.answer).size !== optionIds.length ||
        item.answer.some((a) => !optionIds.includes(a)))
    )
      fail('رتّب جميع الخيارات مرة واحدة.');
    if (
      item.kind === 'match' &&
      (item.targets.length < 2 ||
        item.answer.length !== optionIds.length ||
        item.answer.some((a) => !targetIds.includes(a)))
    )
      fail('حدد المقابل الصحيح لكل عنصر.');
    if (item.kind === 'explain' && item.rubric.length === 0)
      fail('أضف معياراً واحداً على الأقل للتقييم.');
  });
export type LearningItem = z.infer<typeof learningItemSchema>;
export const LEARNING_METHOD_DEFAULT_KIND: Record<LearningMethod, LearningItem['kind']> = {
  retrieval: 'recall',
  spaced: 'recall',
  steps: 'order',
  explain: 'explain',
  errors: 'explain',
  concepts: 'match',
  diagram: 'order',
  peer: 'choice',
  quest: 'choice',
  exit: 'recall',
};
export const learningMaterialSchema = z
  .object({
    schemaVersion: z.literal(1).default(1),
    title: z.string().trim().min(2).max(150),
    method: learningMethodSchema,
    stage: z.string().trim().min(1).max(100).default('الصفوف الرابع إلى التاسع'),
    instructions: z.string().trim().max(2000).default(''),
    items: z.array(learningItemSchema).min(1).max(30),
  })
  .strict()
  .superRefine((material, ctx) => {
    if (material.method === 'diagram' && material.items.some((i) => i.kind !== 'order'))
      ctx.addIssue({
        code: 'custom',
        message: 'أكمل المخطط يستخدم ترتيب المراحل. اختر «ترتيب خطوات» لكل سؤال.',
      });
    if (material.method === 'concepts' && material.items.some((i) => i.kind !== 'match'))
      ctx.addIssue({
        code: 'custom',
        message: 'خريطة المفاهيم تستخدم مطابقة المفاهيم والعلاقات لكل سؤال.',
      });
    const ids = material.items.map((item) => item.id);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: 'custom', message: 'معرّفات الأسئلة مكررة.' });
    for (const item of material.items)
      for (const next of [item.next, item.alternate]) {
        if (next !== null && (!ids.includes(next) || ids.indexOf(next) <= ids.indexOf(item.id)))
          ctx.addIssue({ code: 'custom', message: 'تفرعات المهمة يجب أن تتجه إلى سؤال لاحق.' });
      }
  });
export type LearningMaterial = z.infer<typeof learningMaterialSchema>;
export const learningSaveSchema = z
  .object({
    id: id.optional(),
    classId: id,
    lessonId: id.nullable(),
    expectedVersion: z.number().int().nonnegative(),
    material: learningMaterialSchema,
  })
  .strict();
export type LearningSaveInput = z.infer<typeof learningSaveSchema>;
export const learningIdSchema = z.object({ id }).strict();
export const learningListSchema = z.object({ classId: id }).strict();
export const learningPublishSchema = z
  .object({ id, published: z.boolean(), expectedVersion: z.number().int().positive() })
  .strict();
export type LearningExperience = {
  id: string;
  classId: string;
  lessonId: string | null;
  version: number;
  published: boolean;
  material: LearningMaterial;
  updatedAt: string;
};
export type StudentLearningItem = Pick<
  LearningItem,
  'id' | 'kind' | 'objective' | 'prompt' | 'options' | 'targets' | 'hint' | 'rubric' | 'example'
>;
export type StudentLearningExperience = Omit<
  LearningExperience,
  'material' | 'classId' | 'lessonId' | 'published'
> & { material: Omit<LearningMaterial, 'items'> & { items: StudentLearningItem[] } };
export function toStudentLearning(experience: LearningExperience): StudentLearningExperience {
  const material = experience.material;
  return {
    id: experience.id,
    version: experience.version,
    updatedAt: experience.updatedAt,
    material: {
      schemaVersion: 1,
      title: material.title,
      method: material.method,
      stage: material.stage,
      instructions: material.instructions,
      items: material.items.map((i) => ({
        id: i.id,
        kind: i.kind,
        objective: i.objective,
        prompt: i.prompt,
        options: i.options.map((o) => ({ id: o.id, text: o.text })),
        targets: i.targets.map((o) => ({ id: o.id, text: o.text })),
        hint: i.hint,
        rubric: [...i.rubric],
        example: i.example,
      })),
    },
  };
}
export const learningResponseSchema = z
  .object({
    requestId: id,
    sessionId: id,
    itemId: id,
    answer: z.array(z.string().trim().max(3000)).min(1).max(12),
    confidence: z.enum(['unsure', 'partly', 'sure']),
    usedHint: z.boolean(),
    initialAnswer: z.array(z.string().trim().max(3000)).min(1).max(12).nullable().default(null),
  })
  .strict();
export type LearningResponse = z.infer<typeof learningResponseSchema>;
export type LearningFeedback = {
  correct: boolean | null;
  score: number | null;
  explanation: string;
  expected: string[];
  nextItemId: string | null;
  dueAt: string | null;
};
export type LearningAttempt = {
  id: string;
  itemId: string;
  answer: string[];
  confidence: LearningResponse['confidence'];
  usedHint: boolean;
  feedback: LearningFeedback;
  createdAt: string;
};
export type LearningSession = {
  id: string;
  experience: StudentLearningExperience;
  attempts: LearningAttempt[];
  completed: boolean;
};
export type LearningHistory = Array<{
  prompt: string;
  answer: string[];
  initialAnswer: string[] | null;
  confidence: LearningResponse['confidence'];
  feedback: LearningFeedback;
  createdAt: string;
}>;
export type LearningProgress = {
  studentId: string;
  studentName: string;
  objective: string;
  attempts: number;
  correct: number;
  pendingReview: number;
  graded: number;
  scoreTotal: number;
  dueAt: string | null;
};
export const learningGradeSchema = z
  .object({
    attemptId: id,
    score: z.number().min(0).max(1),
    comment: z.string().trim().min(1).max(2000),
  })
  .strict();
export interface LearningBridge {
  learningList(input: { classId: string }): Promise<LearningExperience[]>;
  learningGet(input: { id: string }): Promise<LearningExperience>;
  learningSave(input: LearningSaveInput): Promise<LearningExperience>;
  learningPublish(input: z.infer<typeof learningPublishSchema>): Promise<LearningExperience>;
  learningProgress(input: { id: string }): Promise<LearningProgress[]>;
  learningReview(input: {
    id: string;
  }): Promise<
    Array<{ id: string; studentName: string; prompt: string; answer: string[]; rubric: string[] }>
  >;
  learningGrade(input: z.infer<typeof learningGradeSchema>): Promise<void>;
}
export const LEARNING_IPC = {
  list: 'learning:list',
  get: 'learning:get',
  save: 'learning:save',
  publish: 'learning:publish',
  progress: 'learning:progress',
  review: 'learning:review',
  grade: 'learning:grade',
} as const;
