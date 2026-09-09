import { z } from 'zod';
import { learningMethodSchema, learningMaterialSchema } from './learning.js';

export const AGENT_SPECIALISTS = [
  {
    id: 'coordinator',
    name: 'منسق المعلم',
    role: 'ينظم المهمة ويختار المختصين ويتابع اكتمال العمل.',
    soul: 'أحول هدف المعلم إلى نتيجة واضحة، وأفسر ما أنجزته وما يحتاج متابعة.',
    skills: ['تخطيط المهمة', 'تنسيق المختصين', 'متابعة التنفيذ'],
  },
  {
    id: 'lesson',
    name: 'مصمم الدرس',
    role: 'يربط المحتوى بالأهداف والمرحلة ووقت الحصة.',
    soul: 'أجعل الفكرة واضحة بمثال، ثم أمنح الطالب فرصة ليجرب بنفسه.',
    skills: ['تحليل المادة', 'تدرج الشرح', 'تكييف الصعوبة'],
  },
  {
    id: 'assessment',
    name: 'مختص التقييم',
    role: 'يبني أسئلة تقيس الفهم مع مفاتيح ومعايير واضحة.',
    soul: 'أبحث عن دليل الفهم، وأقبل الصياغات الصحيحة المختلفة.',
    skills: ['بناء الأسئلة', 'معايير التصحيح', 'كشف سوء الفهم'],
  },
  {
    id: 'play',
    name: 'مصمم تجارب اللعب',
    role: 'يحول التعلم إلى تحديات ومهام وتعاون.',
    soul: 'أشجع التقدم الشخصي وتصحيح الخطأ دون أن أجعل سرعة الطالب درجته.',
    skills: ['تصميم التحدي', 'تفرع المهمة', 'التعاون'],
  },
  {
    id: 'memory',
    name: 'مختص المراجعة',
    role: 'ينظم الاسترجاع والمراجعات المتباعدة.',
    soul: 'أعود إلى ما يحتاج تثبيتاً، وأتحقق بسؤال جديد قبل إعلان الإتقان.',
    skills: ['المراجعة المتباعدة', 'الاسترجاع', 'تنظيم الدراسة'],
  },
  {
    id: 'analysis',
    name: 'محلل التعلم',
    role: 'يحلل المحاولات ويقترح ما يحتاج شرحاً أو إثراءً.',
    soul: 'أصف أدلة التعلم والمفاهيم المتعثرة، ولا أطلق صفات ثابتة على الطالب.',
    skills: ['قراءة النتائج', 'التغذية الراجعة', 'اقتراح العلاج'],
  },
  {
    id: 'quality',
    name: 'مراجع الجودة',
    role: 'يراجع الأسئلة والمفاتيح واللغة واتساق الهدف.',
    soul: 'أصرح بنقص الدليل وأراجع المصدر قبل اقتراح تصحيح.',
    skills: ['مراجعة المحتوى', 'اتساق المفاتيح', 'اللغة الواضحة'],
  },
] as const;
export const agentIdSchema = z.enum([
  'coordinator',
  'lesson',
  'assessment',
  'play',
  'memory',
  'analysis',
  'quality',
]);
export type AgentId = z.infer<typeof agentIdSchema>;
const id = z.string().min(1).max(128);
export const agentProfileSchema = z
  .object({
    id: agentIdSchema,
    soul: z.string().trim().min(1).max(3000),
    instructions: z.string().trim().max(4000),
    publishClassIds: z.array(id).max(100).default([]),
    enabled: z.boolean(),
  })
  .strict();
export type AgentProfile = z.infer<typeof agentProfileSchema>;
export const agentMethodSchema = z.union([z.literal('auto'), learningMethodSchema]);
export type AgentMethod = z.infer<typeof agentMethodSchema>;
/** One source for teacher shortcuts and the instructions actually executed. */
export const AGENT_WORKFLOWS = [
  { id: 'prepare', title: 'جهّز تجربة للدرس', prompt: 'جهّز تجربة قصيرة جاهزة للاستخدام من هذا الدرس. اختر الأسلوب الأنسب للهدف ومستوى الفصل، وأعد الأسئلة والمفاتيح والتلميحات والتفسيرات. استعن بالمختصين عند الحاجة، وافحص الجودة وعالج ما تستطيع قبل إنهاء العمل. استخدم أدوات الحفظ، ولخّص النتيجة وما يحتاج تدخلي فقط.' },
  { id: 'analyze', title: 'لخّص ما يحتاج انتباهي', prompt: 'اقرأ نتائج تجارب هذا الدرس. ميّز بين عدد الطلاب وعدد المحاولات، وبين الخطأ والإجابة الجزئية وما لم يصحح بعد. لخّص الأدلة وأهم مفهوم يحتاج تدخلي واقترح خطوة تدريسية واحدة؛ لا تنشئ تجارب جديدة.' },
  { id: 'support', title: 'جهّز مراجعة حسب النتائج', prompt: 'اقرأ نتائج تجارب هذا الدرس وحدد مفهوماً يحتاج تثبيتاً بأدلة فعلية. جهّز له تجربة مراجعة قصيرة بتفسير ومثال وتدرج مناسب، واختر الأسلوب والمختصين بنفسك. افحص الجودة واحفظ العمل. إذا لم توجد محاولات كافية، أخبرني بذلك ولا تختلق تعثراً.' },
] as const;
export const agentRunSchema = z
  .object({
    requestId: id,
    agentId: agentIdSchema,
    classId: id,
    lessonId: id,
    prompt: z.string().trim().min(4).max(6000),
    method: agentMethodSchema,
    delivery: z.enum(['draft', 'publish']).optional(),
    runAt: z.string().datetime().optional(),
  })
  .strict();
export type AgentRunInput = z.infer<typeof agentRunSchema>;
export const agentMemorySchema = z
  .object({
    id: id.optional(),
    agentId: agentIdSchema,
    classId: id,
    content: z.string().trim().min(1).max(3000),
  })
  .strict();
export type AgentMemory = {
  id: string;
  agentId: AgentId;
  classId: string;
  content: string;
  source: string;
  updatedAt: string;
};
export type AgentRun = {
  id: string;
  input: AgentRunInput;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  result: string;
  events: Array<{ tool: string; message: string; at: string }>;
  updatedAt: string;
};
export const agentScopeSchema = z.object({ classId: id }).strict();
export const agentControlSchema = z.object({ id, action: z.enum(['cancel', 'resume']) }).strict();
export interface AgentBridge {
  agentProfiles(): Promise<AgentProfile[]>;
  agentProfileSave(input: AgentProfile): Promise<AgentProfile>;
  agentMemories(input: { classId: string }): Promise<AgentMemory[]>;
  agentMemorySave(input: z.infer<typeof agentMemorySchema>): Promise<AgentMemory>;
  agentMemoryDelete(input: { id: string }): Promise<void>;
  agentRuns(input: { classId: string }): Promise<AgentRun[]>;
  agentStart(input: AgentRunInput): Promise<AgentRun>;
  agentControl(input: z.infer<typeof agentControlSchema>): Promise<AgentRun>;
}
export const AGENT_IPC = {
  profiles: 'agents:profiles',
  profileSave: 'agents:profile-save',
  memories: 'agents:memories',
  memorySave: 'agents:memory-save',
  memoryDelete: 'agents:memory-delete',
  runs: 'agents:runs',
  start: 'agents:start',
  control: 'agents:control',
} as const;

export const agentToolSchemas = {
  read: z.object({}).strict(),
  experience: z.object({ id }).strict(),
  save: z
    .object({
      key: id.describe('Stable name for this artifact; reuse when resuming.'),
      material: learningMaterialSchema,
    })
    .strict(),
  revise: z.object({ key: id, id, version: z.number().int().positive(), material: learningMaterialSchema }).strict(),
  publish: z.object({ id, version: z.number().int().positive() }).strict(),
  remember: z.object({ key: id, content: z.string().trim().min(1).max(3000) }).strict(),
  consult: z
    .object({ specialist: agentIdSchema, question: z.string().trim().min(1).max(6000) })
    .strict(),
};
