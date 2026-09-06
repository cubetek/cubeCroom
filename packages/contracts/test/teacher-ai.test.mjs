import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AI_ACTION_TARGETS,
  DEFAULT_TEACHER_AI_CONTEXT,
  runAiSchema,
  MAX_TEACHER_AI_CONTENT,
} from '../dist/index.js';

const request = {
  requestId: 'request',
  action: 'lesson_plan',
  content: 'دورة الماء',
  context: DEFAULT_TEACHER_AI_CONTEXT,
};

test('teacher context validates at the IPC boundary and remains optional for older callers', () => {
  assert.equal(runAiSchema.safeParse(request).success, true);
  assert.equal(runAiSchema.safeParse({ ...request, context: undefined }).success, true);
  for (const context of [
    { ...request.context, durationMinutes: 0 },
    { ...request.context, durationMinutes: 121 },
    { ...request.context, durationMinutes: 10.5 },
    { ...request.context, stage: 'unknown' },
    { ...request.context, support: 'diagnose' },
  ])
    assert.equal(runAiSchema.safeParse({ ...request, context }).success, false);
});

test('teacher material stays bounded without silently shortening the request', () => {
  assert.equal(
    runAiSchema.safeParse({
      ...request,
      content: 'x'.repeat(MAX_TEACHER_AI_CONTENT),
    }).success,
    true,
  );
  assert.equal(
    runAiSchema.safeParse({
      ...request,
      content: 'x'.repeat(MAX_TEACHER_AI_CONTENT + 1),
    }).success,
    false,
  );
});

test('preparation and diagnostic answers cannot be inserted into a student-facing lesson', () => {
  assert.equal(AI_ACTION_TARGETS.lesson_plan, null);
  assert.equal(AI_ACTION_TARGETS.misconceptions, null);
  assert.equal(AI_ACTION_TARGETS.objectives, 'outcomes');
  assert.equal(AI_ACTION_TARGETS.summary, 'summary');
  assert.equal(AI_ACTION_TARGETS.exit_ticket, 'content');
});
