import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/save-queue.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { createSaveQueue } = await import(
  'data:text/javascript;base64,' + Buffer.from(outputText).toString('base64')
);

test('slow saves stay serialized and flush waits for the latest edit', async () => {
  const writes = [];
  let release;
  const queue = createSaveQueue(async (value) => {
    writes.push(value);
    if (value === 'first')
      await new Promise((resolve) => {
        release = resolve;
      });
  });
  queue.set('first');
  const first = queue.flush();
  queue.set('second');
  queue.set('latest');
  assert.equal(queue.flush(), first);
  assert.deepEqual(writes, ['first']);
  release();
  await first;
  assert.deepEqual(writes, ['first', 'latest']);
  assert.equal(queue.dirty, false);
});

test('failed saves remain dirty and publication cannot continue before retry succeeds', async () => {
  let fails = true;
  let published = false;
  const queue = createSaveQueue(async () => {
    if (fails) throw new Error('disk full');
  });
  queue.set('unsaved lesson');
  await assert.rejects(async () => {
    await queue.flush();
    published = true;
  }, /disk full/);
  assert.equal(published, false);
  assert.equal(queue.dirty, true);
  fails = false;
  await queue.flush();
  assert.equal(queue.dirty, false);
});
