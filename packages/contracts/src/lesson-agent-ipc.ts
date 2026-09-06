import { z } from 'zod';
import { teacherAiContextSchema } from './ai-actions.js';
import type { TeacherLessonDetail } from './lessons.js';

export const lessonAgentRunSchema = z.object({
  requestId: z.string().min(1).max(64),
  id: z.string().min(1).max(128),
  instructions: z.string().trim().max(2000),
  context: teacherAiContextSchema,
});
export type LessonAgentRunInput = z.infer<typeof lessonAgentRunSchema>;
export const lessonAgentUndoSchema = z.object({
  id: z.string().min(1).max(128),
  token: z.string().min(1).max(128),
});
export type LessonAgentUndoInput = z.infer<typeof lessonAgentUndoSchema>;
export type LessonAgentResult =
  | { status: 'ok'; lesson: TeacherLessonDetail; activityId: string; undoToken: string }
  | { status: 'no_provider' | 'cancelled' }
  | { status: 'failed'; message: string };
