import { z } from 'zod';
import { teacherAiContextSchema, MAX_TEACHER_AI_CONTENT } from './ai-actions.js';
import { lessonPreparationSchema } from './lesson-preparation.js';
import { lessonBlocksSchema, lessonTitleSchema, type LessonBlock } from './lessons.js';
import { LEARNING_CARD_KINDS, type RichTextNode } from './rich-text.js';

export const LESSON_PAGE_AGENT_LIMITS = {
  instructions: 2_000,
  introduction: 3_000,
  outcomes: 8,
  outcome: 500,
  blocks: 12,
  blockTitle: 160,
  blockBody: 4_000,
  summary: 8,
  summaryItem: 600,
  questions: 10,
  question: 1_000,
  options: 6,
  option: 300,
  expectedAnswer: 1_000,
  maxOutputCharacters: 100_000,
  maxOutputTokens: 8_000,
  maxCalls: 2,
  timeoutMs: 120_000,
} as const;

/** Empty material is intentional: the teacher can begin with a topic and instructions. */
export const lessonPageAgentInputSchema = z
  .object({
    title: lessonTitleSchema,
    content: z.string().trim().max(MAX_TEACHER_AI_CONTENT),
    instructions: z.string().trim().max(LESSON_PAGE_AGENT_LIMITS.instructions),
    context: teacherAiContextSchema,
  })
  .strict();

export type LessonPageAgentInput = z.infer<typeof lessonPageAgentInputSchema>;

const optionSchema = z
  .object({
    text: z.string().trim().min(1).max(LESSON_PAGE_AGENT_LIMITS.option),
    isCorrect: z.boolean(),
  })
  .strict();

export const lessonPageQuestionSchema = z
  .discriminatedUnion('type', [
    z
      .object({
        type: z.literal('choice'),
        prompt: z.string().trim().min(1).max(LESSON_PAGE_AGENT_LIMITS.question),
        options: z.array(optionSchema).min(2).max(LESSON_PAGE_AGENT_LIMITS.options),
      })
      .strict(),
    z
      .object({
        type: z.literal('text'),
        prompt: z.string().trim().min(1).max(LESSON_PAGE_AGENT_LIMITS.question),
        expectedAnswer: z.string().trim().min(1).max(LESSON_PAGE_AGENT_LIMITS.expectedAnswer),
      })
      .strict(),
  ])
  .superRefine((question, context) => {
    if (question.type !== 'choice') return;
    if (question.options.filter((option) => option.isCorrect).length !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'يجب أن يحتوي السؤال على خيار صحيح واحد فقط.',
      });
    }
    const distinct = new Set(question.options.map((option) => option.text.toLocaleLowerCase('ar')));
    if (distinct.size !== question.options.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['options'],
        message: 'خيارات السؤال يجب أن تكون مختلفة.',
      });
    }
  });

export type LessonPageQuestion = z.infer<typeof lessonPageQuestionSchema>;

/** Model output is all-or-nothing: unknown keys, missing fields and invalid items are rejected. */
export const lessonPagePlanSchema = z
  .object({
    title: lessonTitleSchema,
    introduction: z.string().trim().min(1).max(LESSON_PAGE_AGENT_LIMITS.introduction),
    outcomes: z
      .array(z.string().trim().min(1).max(LESSON_PAGE_AGENT_LIMITS.outcome))
      .min(1)
      .max(LESSON_PAGE_AGENT_LIMITS.outcomes),
    blocks: z
      .array(
        z
          .object({
            kind: z.enum(LEARNING_CARD_KINDS),
            title: z.string().trim().min(1).max(LESSON_PAGE_AGENT_LIMITS.blockTitle),
            body: z.string().trim().min(1).max(LESSON_PAGE_AGENT_LIMITS.blockBody),
          })
          .strict(),
      )
      .min(2)
      .max(LESSON_PAGE_AGENT_LIMITS.blocks),
    summary: z
      .array(z.string().trim().min(1).max(LESSON_PAGE_AGENT_LIMITS.summaryItem))
      .min(1)
      .max(LESSON_PAGE_AGENT_LIMITS.summary),
    preparation: lessonPreparationSchema,
    activity: z
      .object({
        title: lessonTitleSchema,
        questions: z.array(lessonPageQuestionSchema).min(1).max(LESSON_PAGE_AGENT_LIMITS.questions),
      })
      .strict(),
  })
  .strict();

export type LessonPagePlan = z.infer<typeof lessonPagePlanSchema>;

function paragraph(text: string): RichTextNode {
  // Preserve every line without turning unbounded newline counts into document nodes.
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

/** Single student-facing projection for preview and persistence; no preparation or answer keys. */
export function lessonPageBlocks(plan: LessonPagePlan): LessonBlock[] {
  const checked = lessonPagePlanSchema.parse(plan);
  return lessonBlocksSchema.parse([
    {
      type: 'richText',
      section: 'content',
      document: {
        type: 'doc',
        content: [
          paragraph(checked.introduction),
          ...checked.blocks.map((block): RichTextNode => ({
            type: 'learningCard',
            attrs: { kind: block.kind, title: block.title },
            content: [paragraph(block.body)],
          })),
        ],
      },
    },
    { type: 'list', section: 'outcomes', items: checked.outcomes },
    { type: 'list', section: 'summary', items: checked.summary },
  ]);
}
