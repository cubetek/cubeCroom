import { z } from 'zod';

/** Teacher-only preparation. This contract never enters student lesson projections. */
export const LESSON_PREPARATION_LIMITS = {
  overview: 2_000,
  steps: 10,
  stepTitle: 160,
  instructions: 1_500,
  misconceptions: 6,
  idea: 600,
  response: 1_000,
} as const;

export const lessonPreparationSchema = z
  .object({
    overview: z.string().trim().min(1).max(LESSON_PREPARATION_LIMITS.overview),
    steps: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(LESSON_PREPARATION_LIMITS.stepTitle),
            minutes: z.number().int().min(1).max(120),
            instructions: z.string().trim().min(1).max(LESSON_PREPARATION_LIMITS.instructions),
          })
          .strict(),
      )
      .min(2)
      .max(LESSON_PREPARATION_LIMITS.steps),
    misconceptions: z
      .array(
        z
          .object({
            idea: z.string().trim().min(1).max(LESSON_PREPARATION_LIMITS.idea),
            response: z.string().trim().min(1).max(LESSON_PREPARATION_LIMITS.response),
          })
          .strict(),
      )
      .max(LESSON_PREPARATION_LIMITS.misconceptions),
  })
  .strict();

export type LessonPreparation = z.infer<typeof lessonPreparationSchema>;
