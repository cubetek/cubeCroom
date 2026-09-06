import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: [fileURLToPath(new URL('../apps/teacher-ui/src/lib/update-flush.ts', import.meta.url))],
  platform: 'node', format: 'esm', target: 'node22', bundle: true, write: false,
});
const { createUpdateFlushRegistry } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const document = (flush, documentKey = 'lesson:1', label = 'درس الكسور') => ({ documentKey, label: () => label, flush });

test('a failed unmount save blocks OTA after its Promise settles and is never retried implicitly', async () => {
  const registry = createUpdateFlushRegistry();
  let writes = 0;
  const editor = registry.register(document(async () => { writes++; throw new Error('disk full'); }));
  const pending = editor.flush();
  editor.unregister();
  await assert.rejects(pending, /disk full/);
  const [issue] = registry.issues();
  assert.equal(issue.label, 'درس الكسور');
  assert.equal(issue.canRetry, true);
  assert.equal(issue.canDiscard, true);
  await assert.rejects(registry.flush(), /لم تُحفظ/);
  await assert.rejects(registry.flush(), /لم تُحفظ/);
  assert.equal(writes, 1);
});

test('explicit retry preserves the retained draft and releases the blocker only after success', async () => {
  const registry = createUpdateFlushRegistry();
  let diskAvailable = false;
  let stored = 'old';
  const retainedDraft = { text: 'آخر تعديل' };
  const editor = registry.register(document(async () => {
    if (!diskAvailable) throw new Error('disk full');
    stored = retainedDraft.text;
  }));
  await assert.rejects(editor.flush(), /disk full/);
  editor.unregister();
  const [issue] = registry.issues();
  diskAvailable = true;
  await registry.retry(issue.id);
  assert.equal(stored, 'آخر تعديل');
  assert.deepEqual(registry.issues(), []);
  await registry.flush();
});

test('reopening the same document prevents stale retries even after the newer editor saves', async () => {
  const registry = createUpdateFlushRegistry();
  let oldWrites = 0;
  let stored = 'original';
  const oldEditor = registry.register(document(async () => { oldWrites++; throw new Error('offline'); }));
  await assert.rejects(oldEditor.flush(), /offline/);
  oldEditor.unregister();
  const [oldIssue] = registry.issues();
  const newEditor = registry.register(document(async () => { stored = 'newer document revision'; }));
  await newEditor.flush();
  newEditor.unregister();
  assert.equal(registry.issues()[0].canRetry, false);
  await assert.rejects(registry.retry(oldIssue.id), /مسودة قديمة/);
  await assert.rejects(registry.flush(), /لم تُحفظ/);
  assert.equal(oldWrites, 1);
  assert.equal(stored, 'newer document revision');
  registry.discard(oldIssue.id);
  await registry.flush();
  assert.equal(stored, 'newer document revision');
});

test('OTA waits for an in-flight save belonging to an unmounted editor', async () => {
  const registry = createUpdateFlushRegistry();
  const disk = deferred();
  const editor = registry.register(document(() => disk.promise));
  const saving = editor.flush();
  editor.unregister();
  let completed = false;
  const preparing = registry.flush().then(() => { completed = true; });
  await Promise.resolve();
  assert.equal(completed, false);
  disk.resolve();
  await Promise.all([saving, preparing]);
  assert.equal(completed, true);
  assert.deepEqual(registry.issues(), []);
});

test('failure in a save that finishes during OTA preparation remains a blocker', async () => {
  const registry = createUpdateFlushRegistry();
  const disk = deferred();
  const editor = registry.register(document(() => disk.promise));
  const saving = editor.flush();
  editor.unregister();
  const savingRejected = assert.rejects(saving, /disk removed/);
  const preparationRejected = assert.rejects(registry.flush(), /لم تُحفظ/);
  disk.reject(new Error('disk removed'));
  await Promise.all([savingRejected, preparationRejected]);
  assert.equal(registry.issues().length, 1);
});

test('concurrent flush requests share the current save and avoid duplicate writes', async () => {
  const registry = createUpdateFlushRegistry();
  const disk = deferred();
  let writes = 0;
  const editor = registry.register(document(() => { writes++; return disk.promise; }));
  const first = editor.flush();
  assert.equal(editor.flush(), first);
  const preparation = registry.flush();
  assert.equal(writes, 1);
  disk.resolve();
  await Promise.all([first, preparation]);
});

test('an active editor retries its latest callback and clears its own previous failure', async () => {
  const registry = createUpdateFlushRegistry();
  let latest = 'invalid';
  let stored;
  const editor = registry.register(document(async () => {
    if (latest === 'invalid') throw new Error('validation');
    stored = latest;
  }));
  await assert.rejects(editor.flush(), /validation/);
  assert.equal(registry.issues()[0].canDiscard, false);
  latest = 'corrected content';
  await registry.flush();
  assert.equal(stored, latest);
  assert.deepEqual(registry.issues(), []);
});

test('explicit discard drops only an inactive failed reference and never writes stored data', async () => {
  const registry = createUpdateFlushRegistry();
  let writes = 0;
  const editor = registry.register(document(() => { writes++; throw new Error('validation'); }));
  await assert.rejects(editor.flush(), /validation/);
  const [issue] = registry.issues();
  assert.throws(() => registry.discard(issue.id), /غادر المحرر/);
  editor.unregister();
  registry.discard(issue.id);
  await registry.flush();
  assert.equal(writes, 1);
  assert.deepEqual(registry.issues(), []);
});

test('a pending retry cannot be discarded while it can still write', async () => {
  const registry = createUpdateFlushRegistry();
  const disk = deferred();
  let attempt = 0;
  const editor = registry.register(document(() => { if (attempt++ === 0) throw new Error('disk full'); return disk.promise; }));
  await assert.rejects(editor.flush(), /disk full/);
  editor.unregister();
  const [issue] = registry.issues();
  const retry = registry.retry(issue.id);
  assert.equal(registry.issues()[0].canRetry, false);
  assert.equal(registry.issues()[0].canDiscard, false);
  assert.throws(() => registry.discard(issue.id), /انتظر اكتمال/);
  disk.resolve();
  await retry;
  assert.deepEqual(registry.issues(), []);
});

test('subscribers see late failures and receive no updates after unsubscribe', async () => {
  const registry = createUpdateFlushRegistry();
  const snapshots = [];
  const unsubscribe = registry.subscribe(() => snapshots.push(registry.issues()));
  const editor = registry.register(document(async () => { throw new Error('save failed'); }, 'activity:2', 'نشاط الجمع'));
  await assert.rejects(editor.flush(), /save failed/);
  editor.unregister();
  assert.equal(snapshots.at(-1)[0].label, 'نشاط الجمع');
  unsubscribe();
  const calls = snapshots.length;
  registry.discard(registry.issues()[0].id);
  assert.equal(snapshots.length, calls);
});
