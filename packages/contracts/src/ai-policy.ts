import { z } from 'zod';
import { studentAiRequestSchema } from './student.js';

/** Shared transport and admission limits; independent of the selected model. */
export const STUDENT_AI_POLICY = {
  requestBytes: 64 * 1024,
  timeoutMs: 60_000,
  proxyTimeoutMs: 65_000,
  concurrency: 4,
  requestsPerMinute: 6,
  maxOutputTokens: 1_000,
} as const;

/** Identity is derived by the student server and never included in model messages. */
export const internalStudentAiRequestSchema = studentAiRequestSchema.extend({
  classId: z.string().min(1).max(128),
  sessionId: z.string().min(1).max(128),
  studentId: z.string().min(1).max(128),
});

export type InternalStudentAiRequest = z.infer<typeof internalStudentAiRequestSchema>;
