import { z } from 'zod';
import { teacherQuestionsSchema } from './activities.js';
import { lessonBlocksSchema, lessonTitleSchema } from './lessons.js';
import { lessonPreparationSchema } from './lesson-preparation.js';

export const lessonWorkspaceMaterialSchema = z.object({
  title: lessonTitleSchema,
  blocks: lessonBlocksSchema,
  preparation: lessonPreparationSchema,
  activity: z.object({
    title: z.string().min(2).max(150),
    questions: teacherQuestionsSchema.min(1),
  }),
});
export type LessonWorkspaceMaterial = z.infer<typeof lessonWorkspaceMaterialSchema>;

export const lessonWorkspaceUndoSnapshotSchema = z.object({
  title: lessonTitleSchema,
  blocks: lessonBlocksSchema,
  preparation: lessonPreparationSchema.nullable(),
  previousActivity: z
    .object({
      id: z.string().min(1),
      title: z.string().min(2).max(150),
      published: z.boolean(),
      studentAiEnabled: z.boolean(),
      questions: teacherQuestionsSchema,
    })
    .nullable(),
});
