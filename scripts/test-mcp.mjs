import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { openDatabase, createRepositories } from '@cubecroom/db';
import { gradeLearningItem, nextLearningReview } from '@cubecroom/core';
import { learningMaterialSchema } from '../packages/contracts/dist/index.js';
import { createMcpServer, MCP_TOOL_NAMES, serveMcpSocket } from '../apps/desktop/dist/mcp/server.js';
import { listenLocalMcp, tokensMatch } from '../apps/desktop/dist/mcp/socket.js';

// D36: the local MCP server is read-only, hides answer keys, and returns class totals only.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Each value must never leave CubeCroom through MCP, and is unique so a leak is unambiguous. */
const SECRET = {
  student: 'طالبة-سرية-الاسم',
  expected: 'إجابة-متوقعة-سرية',
  written: 'نص-كتبه-الطالب-سرا',
  explanation: 'شرح-إجابة-التجربة-السري',
  rubric: 'معيار-تصحيح-سري',
  comment: 'تعليق-المعلم-السري',
};
const FORBIDDEN_KEYS = new Set([
  'isCorrect', 'expectedAnswer', 'answer', 'explanation', 'rubric', 'studentId', 'studentName',
  'comment', 'correctCount', 'topWrong', 'next', 'alternate',
]);

async function fixture(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'cubecroom-mcp-'));
  const handle = openDatabase({ file: join(dir, 'data.sqlite') });
  try {
    const repos = createRepositories(handle);
    const klass = repos.classes.create({ name: 'الصف الخامس', subject: 'علوم' });
    const student = repos.students.add({ classId: klass.id, name: SECRET.student });
    const lesson = repos.lessons.create({
      classId: klass.id,
      title: 'الماء',
      blocks: [{ type: 'paragraph', text: 'يتكاثف بخار الماء عندما يبرد.' }],
    });
    const activity = repos.activities.create({ classId: klass.id, title: 'اختبار التكاثف', lessonId: lesson.id });
    repos.activities.replaceQuestions(activity.id, [
      {
        id: 'q-choice', type: 'choice', prompt: 'متى يتكاثف البخار؟', points: 1, expectedAnswer: null,
        options: [
          { id: 'o-cool', text: 'عندما يبرد', isCorrect: true },
          { id: 'o-heat', text: 'عندما يسخن', isCorrect: false },
        ],
      },
      { id: 'q-text', type: 'text', prompt: 'اشرح التكاثف.', points: 2, expectedAnswer: SECRET.expected, options: [] },
    ]);
    const submitted = repos.submissions.submit({
      activityId: activity.id,
      studentId: student.id,
      answers: [
        { type: 'choice', questionId: 'q-choice', optionId: 'o-heat' },
        { type: 'text', questionId: 'q-text', text: SECRET.written },
      ],
    });
    repos.submissions.review(submitted.submission.id, { score: 4, comment: SECRET.comment });

    const material = learningMaterialSchema.parse({
      title: 'التكاثف',
      method: 'retrieval',
      items: [
        {
          id: 'i-choice', kind: 'choice', objective: 'تحول الماء', prompt: 'متى يتكاثف البخار؟',
          options: [{ id: 'cool', text: 'عندما يبرد' }, { id: 'heat', text: 'عندما يسخن' }],
          answer: ['cool'], explanation: SECRET.explanation, rubric: [SECRET.rubric],
        },
        {
          // Authored in answer order; alphabetical order differs, so a leak of the order shows.
          id: 'i-order', kind: 'order', objective: 'ترتيب المراحل', prompt: 'رتّب المراحل.',
          options: [{ id: 's1', text: 'ج' }, { id: 's2', text: 'ب' }, { id: 's3', text: 'أ' }],
          answer: ['s1', 's2', 's3'], explanation: SECRET.explanation,
        },
      ],
    });
    const saved = repos.learning.save({ classId: klass.id, lessonId: lesson.id, expectedVersion: 0, material });
    repos.learning.publish(saved.id, true, saved.version);
    const session = repos.learning.start(saved.id, student.id, klass.id);
    repos.learning.submit(
      {
        requestId: `${session.id}:i-choice`, sessionId: session.id, itemId: 'i-choice', answer: ['heat'],
        confidence: 'sure', usedHint: false, initialAnswer: null,
      },
      student.id, klass.id, gradeLearningItem, nextLearningReview,
    );
    await fn({ repos, klass, student, lesson, activity, experience: saved, dir });
  } finally {
    handle.close();
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

function assertPrivate(value, student) {
  const text = JSON.stringify(value);
  for (const secret of [...Object.values(SECRET), student.id]) assert.ok(!text.includes(secret), `leaked ${secret}`);
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (node === null || typeof node !== 'object') return;
    for (const [key, child] of Object.entries(node)) {
      assert.ok(!FORBIDDEN_KEYS.has(key), `leaked key ${key}`);
      visit(child);
    }
  };
  visit(value);
}

async function connected(repositories) {
  const server = createMcpServer({ version: '0.0.0', repositories });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'cubecroom-mcp-test', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

async function call(client, name, args) {
  const result = await client.callTool({ name, arguments: args });
  assert.notEqual(result.isError, true, `${name}: ${JSON.stringify(result.content)}`);
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent, name);
  return result.structuredContent;
}

const socketPath = (dir) => (process.platform === 'win32'
  ? `\\\\.\\pipe\\cubecroom-mcp-test-${randomBytes(12).toString('hex')}`
  : join(dir, 'relay.sock'));

/** Writes a payload to the local socket and collects what comes back until `done` or close. */
function exchange(path, payload, done = () => false) {
  return new Promise((resolveExchange) => {
    const socket = connect(path);
    let text = '';
    const finish = () => {
      clearTimeout(timer);
      socket.destroy();
      resolveExchange(text);
    };
    const timer = setTimeout(finish, 10_000);
    socket.setEncoding('utf8');
    socket.on('data', (chunk) => {
      text += chunk;
      if (done(text)) finish();
    });
    socket.on('error', () => {});
    socket.once('close', finish);
    socket.once('connect', () => socket.write(payload));
  });
}

test('the server lists exactly the reviewed tools, all read-only', () =>
  fixture(async ({ repos }) => {
    const client = await connected(() => repos);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [...MCP_TOOL_NAMES].sort());
    for (const tool of tools) {
      assert.equal(tool.annotations?.readOnlyHint, true, tool.name);
      assert.equal(tool.annotations?.destructiveHint, false, tool.name);
    }
    await client.close();
  }));

test('tools return content and class totals without answer keys, names or answers', () =>
  fixture(async ({ repos, klass, student, lesson, activity, experience }) => {
    const client = await connected(() => repos);
    const outputs = {
      classes: await call(client, 'list_classes', {}),
      lessons: await call(client, 'list_lessons', { classId: klass.id }),
      lesson: await call(client, 'read_lesson', { lessonId: lesson.id }),
      activities: await call(client, 'list_activities', { classId: klass.id }),
      activity: await call(client, 'read_activity', { activityId: activity.id }),
      results: await call(client, 'activity_results', { activityId: activity.id }),
      experiences: await call(client, 'list_learning_experiences', { classId: klass.id }),
      experience: await call(client, 'read_learning_experience', { experienceId: experience.id }),
      progress: await call(client, 'learning_progress', { experienceId: experience.id }),
    };
    assertPrivate(outputs, student);

    assert.equal(outputs.classes.classes[0].students, 1);
    assert.equal(outputs.lessons.lessons[0].id, lesson.id);
    assert.ok(outputs.lesson.text.includes('يتكاثف بخار الماء عندما يبرد.'));
    assert.equal(outputs.activities.activities[0].submissions, 1);
    assert.deepEqual(outputs.activity.questions[0].options, [
      { id: 'o-cool', text: 'عندما يبرد' },
      { id: 'o-heat', text: 'عندما يسخن' },
    ]);
    assert.equal(outputs.results.submitted, 1);
    assert.equal(outputs.results.reviewed, 1);
    assert.equal(outputs.results.meanScore, 4);
    assert.deepEqual(outputs.results.scoreDistribution.find((entry) => entry.score === 4), { score: 4, count: 1 });
    assert.deepEqual(outputs.results.questions[0].options.map((entry) => [entry.id, entry.picked]), [['o-cool', 0], ['o-heat', 1]]);
    assert.equal(outputs.results.questions[1].answered, 1);
    const order = outputs.experience.items.find((item) => item.id === 'i-order');
    assert.deepEqual(order.options.map((entry) => entry.id), ['s3', 's2', 's1']);
    const objective = outputs.progress.objectives.find((entry) => entry.objective === 'تحول الماء');
    assert.equal(objective.attempts, 1);
    assert.equal(objective.learners, 1);
    await client.close();
  }));

test('closed data and unknown ids return tool errors instead of partial data', () =>
  fixture(async ({ repos }) => {
    const closed = await connected(() => null);
    const unavailable = await closed.callTool({ name: 'list_classes', arguments: {} });
    assert.equal(unavailable.isError, true);
    assert.match(unavailable.content[0].text, /not open/);
    await closed.close();

    const client = await connected(() => repos);
    for (const [name, args] of [
      ['list_lessons', { classId: 'missing' }],
      ['read_lesson', { lessonId: 'missing' }],
      ['activity_results', { activityId: 'missing' }],
      ['read_learning_experience', { experienceId: 'missing' }],
    ]) {
      const missing = await client.callTool({ name, arguments: args });
      assert.equal(missing.isError, true, name);
      assert.match(missing.content[0].text, /not found/, name);
    }
    await client.close();
  }));

test('the local socket closes wrong tokens and serves MCP after the right one', () =>
  fixture(async ({ repos, dir }) => {
    assert.equal(tokensMatch('abc', 'abc'), true);
    assert.equal(tokensMatch('abcd', 'abc'), false);
    assert.equal(tokensMatch('', ''), false);
    const token = randomBytes(32).toString('base64url');
    const path = socketPath(dir);
    const listener = await listenLocalMcp({
      path,
      token,
      onConnection: (socket) => serveMcpSocket(socket, { version: '0.0.0', repositories: () => repos }),
    });
    try {
      const initialize = JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'raw', version: '1' } },
      });
      assert.equal(await exchange(path, `wrong\n${initialize}\n`), '');
      assert.equal(await exchange(path, 'POST /mcp HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n'), '');
      // The first MCP message may share the token's chunk.
      const answered = await exchange(path, `${token}\n${initialize}\n`, (text) => text.includes('\n'));
      assert.equal(JSON.parse(answered.split('\n')[0]).result.serverInfo.name, 'cubecroom');
    } finally {
      await listener.close();
    }
  }));

test('the bundled relay serves an MCP client over stdio and explains when CubeCroom is closed', () =>
  fixture(async ({ repos, klass, dir }) => {
    const relay = join(dir, 'cubecroom-mcp.cjs');
    // The same esbuild options bundle-desktop.mjs uses for the shipped relay.
    await build({
      bundle: true, platform: 'node', format: 'cjs', target: 'node22', logLevel: 'warning',
      external: ['electron', 'better-sqlite3'],
      entryPoints: [join(root, 'apps', 'desktop', 'src', 'mcp', 'relay.ts')], outfile: relay,
    });
    const token = randomBytes(32).toString('base64url');
    const path = socketPath(dir);
    const listener = await listenLocalMcp({
      path,
      token,
      onConnection: (socket) => serveMcpSocket(socket, { version: '0.0.0', repositories: () => repos }),
    });
    const start = () => new StdioClientTransport({ command: process.execPath, args: [relay], stderr: 'pipe' });
    try {
      const closed = new Client({ name: 'closed', version: '1.0.0' });
      await assert.rejects(closed.connect(start()), /CubeCroom is not open/);

      await writeFile(join(dir, 'connection.json'), JSON.stringify({ path, token: `${token}x` }));
      const refused = new Client({ name: 'refused', version: '1.0.0' });
      await assert.rejects(refused.connect(start()));

      await writeFile(join(dir, 'connection.json'), JSON.stringify({ path, token }));
      const client = new Client({ name: 'relay', version: '1.0.0' });
      await client.connect(start());
      const listed = await client.callTool({ name: 'list_classes', arguments: {} });
      assert.equal(listed.structuredContent.classes[0].id, klass.id);
      // Closing the listener, as turning the switch off does, ends the relay and the session.
      const ended = new Promise((resolveEnded) => { client.onclose = resolveEnded; });
      await listener.close();
      await ended;
    } finally {
      await listener.close();
    }
  }));
