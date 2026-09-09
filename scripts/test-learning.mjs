import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openDatabase, createRepositories } from '@cubecroom/db';
import { gradeLearningItem, nextLearningReview } from '@cubecroom/core';
import { executeAgentRun } from '../apps/desktop/dist/agent-runtime.js';
import { learningMaterialSchema, toStudentLearning } from '../packages/contracts/dist/index.js';

const item = (id = 'q1', changes = {}) => ({
  id,
  kind: 'choice',
  objective: 'تحول الماء',
  prompt: 'متى يتكاثف البخار؟',
  options: [
    { id: 'cool', text: 'عندما يبرد' },
    { id: 'heat', text: 'عندما يسخن' },
  ],
  targets: [],
  answer: ['cool'],
  explanation: 'يتحول البخار عند تبريده إلى قطرات ماء.',
  hint: 'فكر في كوب بارد.',
  rubric: [],
  example: '',
  next: null,
  alternate: null,
  ...changes,
});
const material = (changes = {}) =>
  learningMaterialSchema.parse({
    title: 'التكاثف',
    method: 'retrieval',
    items: [item()],
    ...changes,
  });
async function fixture(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'cubecroom-learning-'));
  let handle = openDatabase({ file: join(dir, 'data.sqlite') });
  try {
    let repos = createRepositories(handle);
    const klass = repos.classes.create({ name: 'الخامس' });
    const other = repos.classes.create({ name: 'السادس' });
    const lesson = repos.lessons.create({
      classId: klass.id,
      title: 'الماء',
      blocks: [{ type: 'paragraph', text: 'يتكاثف بخار الماء عندما يبرد.' }],
    });
    const student = repos.students.add({ classId: klass.id, name: 'طالب تجريبي' });
    const second = repos.students.add({ classId: klass.id, name: 'طالب آخر' });
    const save = (m = material()) =>
      repos.learning.save({
        classId: klass.id,
        lessonId: lesson.id,
        expectedVersion: 0,
        material: m,
      });
    const start = (m) => {
      const e = save(m);
      repos.learning.publish(e.id, true, e.version);
      return repos.learning.start(e.id, student.id, klass.id);
    };
    const submit = (s, id = 'q1', answer = ['cool'], extra = {}) =>
      repos.learning.submit(
        {
          requestId: `${s.id}:${id}`,
          sessionId: s.id,
          itemId: id,
          answer,
          confidence: 'sure',
          usedHint: false,
          initialAnswer: null,
          ...extra,
        },
        student.id,
        klass.id,
        gradeLearningItem,
        nextLearningReview,
      );
    await fn({
      repos,
      handle,
      klass,
      other,
      lesson,
      student,
      second,
      save,
      start,
      submit,
      reopen() {
        handle.close();
        handle = openDatabase({ file: join(dir, 'data.sqlite') });
        repos = createRepositories(handle);
        return repos;
      },
    });
  } finally {
    handle.close();
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

test('contracts reject duplicate IDs, invalid keys and backward quest branches', () => {
  assert.throws(() => material({ items: [item(), item()] }));
  assert.throws(() => material({ items: [item('a', { answer: ['unknown'] })] }));
  assert.throws(() => material({ items: [item('a'), item('b', { next: 'a' })] }));
  assert.throws(() =>
    material({ items: [item('a', { kind: 'order', answer: ['cool', 'cool'] })] }),
  );
});
test('student projection strips keys, explanation and branching answers', () => {
  const e = toStudentLearning({
    id: 'e',
    classId: 'c',
    lessonId: 'l',
    version: 1,
    published: true,
    updatedAt: '',
    material: material(),
  });
  assert.equal('answer' in e.material.items[0], false);
  assert.equal('explanation' in e.material.items[0], false);
  assert.equal('alternate' in e.material.items[0], false);
});
test('drafts, wrong classes, other students and removed students cannot access sessions', () =>
  fixture(({ repos, klass, other, student, second, save, start }) => {
    const draft = save();
    assert.throws(() => repos.learning.start(draft.id, student.id, klass.id));
    const s = start();
    assert.throws(() => repos.learning.start(s.experience.id, student.id, other.id));
    assert.throws(() => repos.learning.session(s.id, second.id, klass.id));
    repos.students.remove(student.id);
    assert.throws(() => repos.learning.session(s.id, student.id, klass.id));
  }));
test('exact retry is idempotent, payload collisions fail, resume does not skip work', () =>
  fixture(({ repos, klass, student, start, submit }) => {
    const s = start(material({ items: [item(), item('q2')] }));
    const result = submit(s);
    assert.deepEqual(submit(s), result);
    assert.throws(() => submit(s, 'q1', ['heat']));
    const resumed = repos.learning.start(s.experience.id, student.id, klass.id);
    assert.equal(resumed.id, s.id);
    assert.equal(resumed.attempts.length, 1);
    assert.equal(resumed.attempts[0].feedback.nextItemId, 'q2');
    submit(s, 'q2');
    assert.equal(repos.learning.session(s.id, student.id, klass.id).completed, true);
  }));
test('immutable versions protect an active student from a teacher edit', () =>
  fixture(({ repos, klass, lesson, start, submit }) => {
    const s = start();
    const e = repos.learning.get(s.experience.id);
    repos.learning.save({
      id: e.id,
      classId: klass.id,
      lessonId: lesson.id,
      expectedVersion: 1,
      material: material({ items: [item('q1', { answer: ['heat'] })] }),
    });
    assert.equal(submit(s).correct, true);
    assert.throws(() =>
      repos.learning.save({
        id: e.id,
        classId: klass.id,
        lessonId: lesson.id,
        expectedVersion: 1,
        material: material(),
      }),
    );
  }));
test('rapid attempts keep sequence even with identical database timestamps', () =>
  fixture(({ repos, klass, student, start, submit }) => {
    const s = start(material({ items: [item('z'), item('a'), item('m')] }));
    submit(s, 'z');
    submit(s, 'a');
    submit(s, 'm');
    assert.deepEqual(
      repos.learning.session(s.id, student.id, klass.id).attempts.map((a) => a.itemId),
      ['z', 'a', 'm'],
    );
  }));
test('server chooses quest branch and rejects skipping and malformed answers', () =>
  fixture(({ start, submit }) => {
    const s = start(
      material({
        method: 'quest',
        items: [item('q1', { next: 'q3', alternate: 'q2' }), item('q2'), item('q3')],
      }),
    );
    assert.throws(() => submit(s, 'q3'));
    assert.throws(() => submit(s, 'q1', ['unknown']));
    assert.equal(submit(s, 'q1', ['cool']).nextItemId, 'q3');
    assert.throws(() => submit(s, 'q2'));
  }));
test('peer discussion requires a first answer and reveals feedback only at final submission', () =>
  fixture(({ start, submit }) => {
    const s = start(material({ method: 'peer' }));
    assert.throws(() => submit(s));
    assert.equal(submit(s, 'q1', ['cool'], { initialAnswer: ['heat'] }).correct, true);
  }));
test('same-day repetitions cannot advance review interval', () =>
  fixture(({ repos, klass, student, start, submit }) => {
    const s = start(material({ method: 'spaced' }));
    const first = submit(s);
    const again = repos.learning.start(s.experience.id, student.id, klass.id);
    const repeated = submit(again);
    assert.ok(Math.abs(Date.parse(first.dueAt) - Date.parse(repeated.dueAt)) < 3000);
  }));
test('Arabic recall normalizes diacritics while explanations require human review', () =>
  fixture(({ repos, start, submit }) => {
    const s = start(
      material({
        items: [
          item('q1', { kind: 'recall', answer: ['تبخر'] }),
          item('q2', { kind: 'explain', rubric: ['صحة التفسير'] }),
        ],
      }),
    );
    assert.equal(submit(s, 'q1', ['تَبَخُّر']).correct, true);
    assert.equal(submit(s, 'q2', ['تفسير الطالب']).score, null);
    const reviews = repos.learning.review(s.experience.id);
    assert.equal(reviews.length, 1);
    repos.learning.grade(reviews[0].id, 0.5, 'أضف أثر التبريد.');
    assert.equal(repos.learning.review(s.experience.id).length, 0);
  }));
test('memory and tasks persist across reopen, and future queue entries cannot starve due work', () =>
  fixture(({ repos, klass, lesson, reopen }) => {
    const memory = repos.agents.saveMemory({
      agentId: 'memory',
      classId: klass.id,
      content: 'ابدأ بمثال قصير.',
    });
    for (let i = 0; i < 25; i++)
      repos.agents.enqueue({
        requestId: randomUUID(),
        agentId: 'memory',
        classId: klass.id,
        lessonId: lesson.id,
        prompt: 'جهز مراجعة قصيرة',
        method: 'spaced',
        runAt: '2099-01-01T00:00:00.000Z',
      });
    const task = repos.agents.enqueue({
      requestId: 'due',
      agentId: 'memory',
      classId: klass.id,
      lessonId: lesson.id,
      prompt: 'جهز مراجعة قصيرة',
      method: 'spaced',
    });
    assert.equal(repos.agents.pending()[0].id, task.id);
    repos.agents.update(task.id, 'running');
    const restored = reopen();
    restored.agents.recover();
    assert.equal(restored.agents.get(task.id).status, 'interrupted');
    assert.equal(restored.agents.memories(klass.id)[0].id, memory.id);
  }));
test('agent scopes tool access, saves once across resume and cannot publish without class permission', () =>
  fixture(async ({ repos, klass, other, lesson }) => {
    const foreign = repos.learning.save({
      classId: other.id,
      lessonId: null,
      expectedVersion: 0,
      material: material(),
    });
    const run = repos.agents.enqueue({
      requestId: 'agent',
      agentId: 'assessment',
      classId: klass.id,
      lessonId: lesson.id,
      prompt: 'جهز تجربة من الدرس',
      method: 'retrieval',
    });
    const registry = {
      async complete({ tools }) {
        assert.ok(tools);
        assert.throws(() => tools.readExperience.execute({ id: foreign.id }));
        const a = tools.saveExperience.execute({ key: 'main', material: material() });
        const b = tools.saveExperience.execute({ key: 'main', material: material() });
        assert.equal(a.id, b.id);
        await assert.rejects(
          () => tools.publishExperience.execute({ id: a.id, version: a.version }),
          /تفويض/,
        );
        return { text: 'المسودة جاهزة.' };
      },
    };
    const options = {
      run,
      repos,
      registry,
      modelId: 'ollama:test',
      signal: new AbortController().signal,
      assertLive() {},
    };
    await executeAgentRun(options);
    await executeAgentRun(options);
    assert.equal(repos.learning.list(klass.id).length, 1);
    assert.equal(repos.learning.list(klass.id)[0].published, false);
  }));
test('publish rechecks authority and version after asynchronous quality review', () =>
  fixture(async ({ repos, klass, lesson }) => {
    const p = repos.agents.profiles().find((p) => p.id === 'assessment');
    repos.agents.saveProfile({ ...p, publishClassIds: [klass.id] });
    const run = repos.agents.enqueue({
      requestId: 'publish',
      agentId: 'assessment',
      classId: klass.id,
      lessonId: lesson.id,
      prompt: 'جهز وانشر تجربة',
      method: 'retrieval',
    });
    const registry = {
      async complete({ tools }) {
        if (!tools) {
          repos.agents.saveProfile({ ...p, publishClassIds: [] });
          return { text: '{"approved":true,"reason":"valid"}' };
        }
        const e = tools.saveExperience.execute({ key: 'main', material: material() });
        await assert.rejects(
          () => tools.publishExperience.execute({ id: e.id, version: e.version }),
          /تفويض/,
        );
        return { text: 'بقيت مسودة.' };
      },
    };
    await executeAgentRun({
      run,
      repos,
      registry,
      modelId: 'ollama:test',
      signal: new AbortController().signal,
      assertLive() {},
    });
    assert.equal(repos.learning.list(klass.id)[0].published, false);
  }));
test('cancellation aborts late tool writes', () =>
  fixture(async ({ repos, klass, lesson }) => {
    const run = repos.agents.enqueue({
      requestId: 'cancel',
      agentId: 'assessment',
      classId: klass.id,
      lessonId: lesson.id,
      prompt: 'جهز تجربة قصيرة',
      method: 'retrieval',
    });
    const controller = new AbortController();
    const registry = {
      async complete({ tools }) {
        controller.abort();
        assert.throws(() => tools.saveExperience.execute({ key: 'main', material: material() }));
        return { text: 'done' };
      },
    };
    await assert.rejects(() =>
      executeAgentRun({
        run,
        repos,
        registry,
        modelId: 'ollama:test',
        signal: controller.signal,
        assertLive() {},
      }),
    );
    assert.equal(repos.learning.list(klass.id).length, 0);
  }));

test('automatic method choice repairs and publishes an existing draft without duplication', () =>
  fixture(async ({ repos, klass, lesson, save }) => {
    const existing = save();
    const p = repos.agents.profiles().find((p) => p.id === 'coordinator');
    repos.agents.saveProfile({ ...p, publishClassIds: [klass.id] });
    const run = repos.agents.enqueue({ requestId: 'auto-repair', agentId: 'coordinator', classId: klass.id, lessonId: lesson.id, prompt: 'عالج المسودة وانشرها', method: 'auto', delivery: 'publish' });
    let reviews = 0;
    await executeAgentRun({ run, repos, modelId: 'ollama:test', signal: new AbortController().signal, assertLive() {}, registry: {
      async complete({ tools }) {
        if (!tools) return { text: JSON.stringify({ approved: ++reviews > 1, reason: 'أضف تفسيراً واضحاً' }) };
        await assert.rejects(() => tools.publishExperience.execute({ id: existing.id, version: existing.version }), /أضف تفسيراً/);
        const input = { key: 'quality-repair', id: existing.id, version: existing.version, material: material({ method: 'exit' }) };
        const updated = tools.reviseExperience.execute(input);
        assert.equal(tools.reviseExperience.execute(input).version, updated.version);
        await tools.publishExperience.execute({ id: updated.id, version: updated.version });
        assert.throws(() => tools.reviseExperience.execute({ ...input, key: 'again', version: updated.version + 1 }), /منشورة/);
        return { text: 'تم الإصلاح والنشر.' };
      },
    } });
    assert.equal(repos.learning.list(klass.id).length, 1);
    assert.equal(repos.learning.get(existing.id).published, true);
    assert.equal(repos.learning.get(existing.id).material.method, 'exit');
    assert.ok(repos.agents.get(run.id).events.some((e) => e.tool === 'quality'));
  }));

test('draft delivery forbids publication even with class permission; explicit method and versions stay enforced', () =>
  fixture(async ({ repos, klass, lesson, save }) => {
    const existing = save();
    const p = repos.agents.profiles().find((p) => p.id === 'coordinator');
    repos.agents.saveProfile({ ...p, publishClassIds: [klass.id] });
    const run = repos.agents.enqueue({ requestId: 'draft-only', agentId: 'coordinator', classId: klass.id, lessonId: lesson.id, prompt: 'جهّز مسودة فقط', method: 'retrieval', delivery: 'draft' });
    await executeAgentRun({ run, repos, modelId: 'ollama:test', signal: new AbortController().signal, assertLive() {}, registry: {
      async complete({ tools }) {
        await assert.rejects(() => tools.publishExperience.execute({ id: existing.id, version: existing.version }), /مسودة/);
        assert.throws(() => tools.saveExperience.execute({ key: 'wrong-method', material: material({ method: 'exit' }) }), /أسلوب/);
        assert.throws(() => tools.reviseExperience.execute({ key: 'stale', id: existing.id, version: existing.version + 1, material: material() }), /تغيّرت/);
        return { text: 'المسودة محفوظة.' };
      },
    } });
    assert.equal(repos.learning.get(existing.id).published, false);
    assert.equal(repos.learning.get(existing.id).version, existing.version);
  }));

test('agent analysis distinguishes partial grades, ungraded attempts and unique learners', () =>
  fixture(async ({ repos, klass, lesson, student, start, submit }) => {
    const session = start(material({ items: [item('q1', { kind: 'explain', options: [], answer: ['يتحول البخار عند البرودة إلى ماء'], rubric: ['صحة الفكرة'] })] }));
    submit(session, 'q1', ['تفسير جزئي']);
    repos.learning.grade(`${session.id}:q1`, 0.5, 'أكمل السبب');
    const again = repos.learning.start(session.experience.id, student.id, klass.id);
    submit(again, 'q1', ['محاولة جديدة تنتظر التصحيح']);
    const progress = repos.learning.progress(session.experience.id)[0];
    assert.equal(progress.scoreTotal, 0.5);
    assert.equal(progress.graded, 1);
    const run = repos.agents.enqueue({ requestId: 'score-summary', agentId: 'analysis', classId: klass.id, lessonId: lesson.id, prompt: 'حلل النتائج', method: 'auto' });
    await executeAgentRun({ run, repos, modelId: 'ollama:test', signal: new AbortController().signal, assertLive() {}, registry: {
      async complete({ tools }) {
        const summary = tools.analyzeProgress.execute({ id: session.experience.id })[0];
        assert.equal(summary.meanScore, 0.5);
        assert.equal(summary.correct, 0);
        assert.equal(summary.learners, 1);
        assert.equal(summary.pending, 1);
        assert.equal(summary.attempts, 2);
        return { text: 'درجة جزئية.' };
      },
    } });
  }));
