import { z } from 'zod';
import { richTextDocumentSchema } from './rich-text.js';
import { lessonPreparationSchema } from './lesson-preparation.js';

/**
 * عقود الدروس — FR-008 و FR-009.
 *
 * كتل المحتوى مُصنَّفة لا HTML خام: HTML من مصدر غير موثوق يُعرض على صفحة
 * الطالب يفتح باب تنفيذ شيفرة في متصفّحه. الكتل القديمة تبقى مقروءة؛
 * المحرر الغني يحفظ وثيقة JSON محدودة الأنواع داخل قسم مستقل.
 */

export const LESSON_SECTIONS = [
  { id: 'content', label: 'محتوى الدرس', description: 'اكتب الشرح والأمثلة، ونسّق الأفكار بعناوين وقوائم.' },
  { id: 'outcomes', label: 'مخرجات التعلّم', description: 'حدّد ما سيتمكّن الطالب من معرفته أو تطبيقه بعد الدرس.' },
  { id: 'summary', label: 'الخلاصة', description: 'اجمع أهم الأفكار التي تريد أن يتذكّرها الطالب.' },
] as const;
export const lessonSectionSchema = z.enum(['content', 'outcomes', 'summary']);
export type LessonSection = z.infer<typeof lessonSectionSchema>;
const section = lessonSectionSchema.optional();

export const lessonBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('heading'), text: z.string().max(200), section }),
  z.object({ type: z.literal('paragraph'), text: z.string().max(5000), section }),
  z.object({ type: z.literal('list'), items: z.array(z.string().max(600)).max(50), section }),
  z.object({ type: z.literal('richText'), document: richTextDocumentSchema, section }),
]);

export type LessonBlock = z.infer<typeof lessonBlockSchema>;

export const lessonBlocksSchema = z.array(lessonBlockSchema).max(200);

export const lessonTitleSchema = z
  .string()
  .trim()
  .min(2, 'اكتب عنواناً للدرس حتى يعرفه طلابك.')
  .max(150, 'العنوان طويل أكثر من اللازم.');

export const lessonStatusSchema = z.enum(['draft', 'published']);

export type LessonStatus = z.infer<typeof lessonStatusSchema>;

export const createLessonSchema = z.object({
  classId: z.string().min(1),
  title: lessonTitleSchema,
});

export type CreateLessonInput = z.infer<typeof createLessonSchema>;

export const updateLessonSchema = z.object({
  id: z.string().min(1),
  title: lessonTitleSchema.optional(),
  blocks: lessonBlocksSchema.optional(),
});

export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;

export const publishLessonSchema = z.object({
  id: z.string().min(1),
  published: z.boolean(),
});

export type PublishLessonInput = z.infer<typeof publishLessonSchema>;

export const lessonIdSchema = z.object({ id: z.string().min(1) });
export const classIdSchema = z.object({ classId: z.string().min(1) });

/**
 * صفّ جدول T12 — منظور المعلم.
 *
 * مُسمّى بالمعلم صراحةً لأن للطالب منظوراً آخر لنفس الدرس في `student.ts`:
 * هناك مقتطف وعلامة «مقروء» ولا وجود لكلمة «مسودة» أصلاً، فالمسودة لا تصل
 * إليه (FR-009). خلط الاثنين في اسم واحد يجعل حقلاً للمعلم يتسرّب إلى ردّ
 * الطالب بلا أن ينتبه أحد.
 */
export const teacherLessonSummarySchema = z.object({
  id: z.string().min(1),
  classId: z.string().min(1),
  title: z.string().min(1),
  status: lessonStatusSchema,
  publishedAt: z.string().nullable(),
  updatedAt: z.string(),
  attachments: z.number().int().nonnegative(),
  reads: z.number().int().nonnegative(),
});

export type TeacherLessonSummary = z.infer<typeof teacherLessonSummarySchema>;

/** الدرس كاملاً في محرر T13. */
export const teacherLessonDetailSchema = teacherLessonSummarySchema.extend({
  blocks: lessonBlocksSchema,
  preparation: lessonPreparationSchema.nullable().optional(),
  generatedActivityId: z.string().min(1).nullable().optional(),
  agentUndoToken: z.string().min(1).nullable().optional(),
});

export type TeacherLessonDetail = z.infer<typeof teacherLessonDetailSchema>;

/**
 * من لم يقرأ الدرس — يخدم `T12`.
 *
 * **ما يحلّه:** المعلم يرى عدداً («قرأه ٥») ولا يرى مَن. فالمتابعة تعني أن
 * يفتح قائمة طلابه ويقارنها بذاكرته — أو لا يتابع.
 *
 * **ومسودةٌ ليست حالة إهمال:** درسٌ لم يُنشر لم يره أحد بحكم `FR-009`، فقولُ
 * «ثلاثون لم يقرأوا» عنه يتّهم الطلاب بما فعله المعلم. ولذلك حالتان لا قائمة
 * واحدة — والتمييز في العقد لا في نصّ الشاشة.
 */
export const unreadStudentsSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('draft') }),
  z.object({
    status: z.literal('published'),
    /** عدد الفصل كلّه — مقام «٥ من ٣٠». */
    roster: z.number().int().nonnegative(),
    students: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) })),
  }),
]);

export type UnreadStudents = z.infer<typeof unreadStudentsSchema>;
