import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lessonPageAgentInputSchema,
  lessonPagePlanSchema,
  lessonPageBlocks,
  LESSON_PAGE_AGENT_LIMITS,
} from '../dist/lesson-agent.js';
import { lessonPreparationSchema } from '../dist/lesson-preparation.js';
import { lessonBlocksSchema } from '../dist/lessons.js';
import { lessonPageFixture } from './fixtures/lesson-page.mjs';

test('a full plan accepts mixed question types and teacher-only preparation', () => {
  const plan = lessonPageFixture();
  assert.deepEqual(lessonPagePlanSchema.parse(plan), plan);
  assert.deepEqual(lessonPreparationSchema.parse(plan.preparation), plan.preparation);
});

test('starting from a topic allows empty material while bounding teacher instructions', () => {
  const input = {
    title: 'درس جديد',
    content: '',
    instructions: 'ابدأ من موضوع الماء.',
    context: { stage: 'primary', support: 'balanced', durationMinutes: 45 },
  };
  assert.equal(lessonPageAgentInputSchema.safeParse(input).success, true);
  assert.equal(
    lessonPageAgentInputSchema.safeParse({
      ...input,
      instructions: 'س'.repeat(LESSON_PAGE_AGENT_LIMITS.instructions + 1),
    }).success,
    false,
  );
  assert.equal(
    lessonPageAgentInputSchema.safeParse({ ...input, context: undefined }).success,
    false,
  );
});

test('unknown fields and malformed nested fields reject the entire plan without stripping', () => {
  for (const change of [
    (plan) => {
      plan.secret = 'unexpected';
    },
    (plan) => {
      plan.blocks[0].html = '<p>unsupported</p>';
    },
    (plan) => {
      plan.activity.questions[0].expectedAnswer = 'unexpected';
    },
    (plan) => {
      plan.preparation.steps[0].resource = 'unexpected';
    },
    (plan) => {
      plan.activity.questions[1].expectedAnswer = '';
    },
    (plan) => {
      plan.blocks[0].kind = 'unknown';
    },
    (plan) => {
      plan.summary = [];
    },
  ]) {
    const plan = lessonPageFixture();
    change(plan);
    assert.equal(lessonPagePlanSchema.safeParse(plan).success, false);
  }
});

test('choice questions need distinct options and exactly one correct choice', () => {
  for (const options of [
    [
      { text: 'أ', isCorrect: false },
      { text: 'ب', isCorrect: false },
    ],
    [
      { text: 'أ', isCorrect: true },
      { text: 'ب', isCorrect: true },
    ],
    [
      { text: ' ماء ', isCorrect: true },
      { text: 'ماء', isCorrect: false },
    ],
  ]) {
    const plan = lessonPageFixture();
    plan.activity.questions[0].options = options;
    assert.equal(lessonPagePlanSchema.safeParse(plan).success, false);
  }
});

test('excessive counts and content are rejected rather than truncated or dropped', () => {
  for (const change of [
    (plan) => {
      plan.blocks = Array.from(
        { length: LESSON_PAGE_AGENT_LIMITS.blocks + 1 },
        () => plan.blocks[0],
      );
    },
    (plan) => {
      plan.blocks[0].body = 'م'.repeat(LESSON_PAGE_AGENT_LIMITS.blockBody + 1);
    },
    (plan) => {
      plan.activity.questions = Array.from(
        { length: LESSON_PAGE_AGENT_LIMITS.questions + 1 },
        () => plan.activity.questions[0],
      );
    },
    (plan) => {
      plan.preparation.steps[0].minutes = 2.5;
    },
  ]) {
    const plan = lessonPageFixture();
    change(plan);
    assert.equal(lessonPagePlanSchema.safeParse(plan).success, false);
  }
});

test('student projection preserves card content and sections without teacher preparation or keys', () => {
  const plan = lessonPageFixture();
  const before = structuredClone(plan);
  const blocks = lessonPageBlocks(plan);
  assert.equal(lessonBlocksSchema.safeParse(blocks).success, true);
  assert.deepEqual(
    blocks.map((block) => block.section),
    ['content', 'outcomes', 'summary'],
  );
  const cards = blocks[0].document.content.slice(1);
  assert.deepEqual(
    cards.map((card) => card.attrs),
    plan.blocks.map(({ kind, title }) => ({ kind, title })),
  );
  assert.deepEqual(
    cards.map((card) => card.content[0].content[0].text),
    plan.blocks.map((block) => block.body),
  );
  assert.deepEqual(blocks[1].items, plan.outcomes);
  assert.deepEqual(blocks[2].items, plan.summary);
  const visible = JSON.stringify(blocks);
  assert.equal(visible.includes(plan.preparation.overview), false);
  assert.equal(visible.includes(plan.activity.questions[1].expectedAnswer), false);
  assert.equal(visible.includes('isCorrect'), false);
  assert.deepEqual(plan, before, 'projection does not mutate the reviewed plan');
});

test('many line breaks stay intact without expanding into an invalid document tree', () => {
  const plan = lessonPageFixture();
  plan.blocks[0].body = 'س\n'.repeat(1_500).trim();
  const blocks = lessonPageBlocks(plan);
  assert.equal(blocks[0].document.content[1].content.length, 1);
  assert.equal(blocks[0].document.content[1].content[0].content[0].text, plan.blocks[0].body);
});
