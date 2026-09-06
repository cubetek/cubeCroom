import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { RELEASE_CONFIG } from './release/config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const parent = join(root, '.cubeflow', 'reports');
await mkdir(parent, { recursive: true });
const scratch = await mkdtemp(join(parent, 'update-service-test-'));
const bundle = join(scratch, 'service.mjs');
const virtual = {
  electron: 'export const {app,BrowserWindow,net} = globalThis.__cubeUpdateTest;',
  'electron-updater': 'export const autoUpdater = globalThis.__cubeUpdateTest.updater;',
  '../store.js': 'export const {storeState,openStore,closeStore} = globalThis.__cubeUpdateTest;',
  '../portal.js': 'export const {portalStatus,stopPortal} = globalThis.__cubeUpdateTest;',
  '../backup.js': 'export const {takeBackup} = globalThis.__cubeUpdateTest;',
  './log.js': 'export const logUpdate = () => {};',
};
await build({
  entryPoints: [join(root, 'apps/desktop/src/updates/service.ts')], outfile: bundle,
  bundle: true, format: 'esm', platform: 'node', packages: 'external',
  define: { 'process.resourcesPath': 'globalThis.__cubeUpdateTest.resources', 'process.platform': 'globalThis.__cubeUpdateTest.platform', setInterval: 'globalThis.__cubeUpdateTest.schedule' },
  plugins: [{ name: 'update-boundaries', setup(builder) {
    builder.onResolve({ filter: /^@cubecroom\/(contracts|core)$/ }, (args) => ({ path: pathToFileURL(join(root, 'packages', args.path.split('/')[1], 'dist/index.js')).href, external: true }));
    builder.onResolve({ filter: /.*/ }, (args) => virtual[args.path] ? { path: args.path, namespace: 'test-boundary' } : undefined);
    builder.onLoad({ filter: /.*/, namespace: 'test-boundary' }, (args) => ({ contents: virtual[args.path], loader: 'js' }));
  } }],
});
const keys = generateKeyPairSync('ed25519');
const trust = { schemaVersion: 1, keys: [{ id: 'memory-only-test', publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }) }] };
const installer = Buffer.from('CubeCroom update test payload');
const extension = process.platform === 'win32' ? 'exe' : process.platform === 'darwin' ? 'zip' : 'AppImage';
const name = `CubeCroom-0.1.1-${process.platform}-${process.arch}.${extension}`;
const entry = { name, size: installer.length, sha512: createHash('sha512').update(installer).digest('base64'), platform: process.platform, arch: process.arch, kind: 'updater', url: `https://github.com/${RELEASE_CONFIG.repository.owner}/${RELEASE_CONFIG.repository.repo}/releases/download/v0.1.1/${name}` };
const payload = { schemaVersion: 1, version: '0.1.1', channel: 'stable', tag: 'v0.1.1', commit: 'b'.repeat(40), createdAt: new Date().toISOString(), files: [entry] };
const bytes = Buffer.from(JSON.stringify(payload));
const envelope = { schemaVersion: 1, keyId: 'memory-only-test', algorithm: 'Ed25519', payload: bytes.toString('base64'), signature: sign(null, bytes, keys.privateKey).toString('base64') };
let serial = 0;
const appImageBefore = process.env.APPIMAGE;
if (process.platform === 'linux') process.env.APPIMAGE = join(scratch, 'installed.AppImage');

async function fixture(options = {}) {
  const events = [];
  const calls = { check: 0, download: 0, install: 0, feed: 0, manifest: 0 };
  let scheduled = 0;
  const app = Object.assign(new EventEmitter(), { isPackaged: true, getVersion: () => '0.1.0' });
  const settings = { get: () => 'stable', getBoolean: () => false, set: () => {} };
  let store = { status: 'open', dataDirectory: scratch, repositories: { settings, sessions: { active: () => undefined } } };
  let downloadedPath;
  const updater = Object.assign(new EventEmitter(), {
    setFeedURL() { calls.feed += 1; },
    async checkForUpdates() { calls.check += 1; return { isUpdateAvailable: true, updateInfo: { version: '0.1.1', files: [{ url: entry.url, sha512: entry.sha512, size: entry.size }] } }; },
    async downloadUpdate() { calls.download += 1; const path = join(scratch, `${++serial}-download`); downloadedPath = path; await writeFile(path, options.corrupt ? Buffer.alloc(installer.length) : installer); return [path]; },
    quitAndInstall() { calls.install += 1; events.push('install'); if (options.installFails) updater.emit('error', new Error('installer failed')); },
  });
  await writeFile(join(scratch, 'release-config.json'), JSON.stringify({ repository: RELEASE_CONFIG.repository, updateMode: options.missingMode ? undefined : options.mode ?? 'signed' }));
  await writeFile(join(scratch, 'release-trust.json'), JSON.stringify(options.noTrust ? { schemaVersion: 1, keys: [] } : trust));
  if (options.noFeed) await rm(join(scratch, 'app-update.yml'), { force: true });
  else await writeFile(join(scratch, 'app-update.yml'), JSON.stringify({ publisherName: Object.hasOwn(options, 'publisherName') ? options.publisherName : 'Synthetic test publisher' }));
  let service;
  const context = {
    app, updater, resources: scratch, platform: options.platform ?? process.platform,
    schedule: (callback, delay) => { scheduled += 1; return setInterval(callback, delay); },
    net: { fetch: async () => { calls.manifest += 1; return new Response(JSON.stringify(options.badSignature ? { ...envelope, signature: Buffer.alloc(64).toString('base64') } : envelope)); } },
    BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, webContents: {
      id: 7, isDestroyed: () => false, send: (channel, value) => {
        if (channel === 'updates:prepare') queueMicrotask(() => { events.push('save'); service.acknowledgeUpdatePreparation(7, { token: value.token, saved: !options.saveFails }); });
      },
    } }] },
    storeState: () => store,
    closeStore: () => { events.push('close'); store = { status: 'closed' }; },
    openStore: () => { events.push('reopen'); store = { status: 'open', dataDirectory: scratch, repositories: { settings, sessions: { active: () => undefined } } }; return store; },
    portalStatus: () => ({ state: options.activeClass ? 'running' : 'stopped' }),
    stopPortal: async () => { events.push('stop'); },
    takeBackup: async () => { events.push('backup'); if (options.backupFails) throw new Error('backup failed'); if (options.tamperDuringBackup) await writeFile(downloadedPath, Buffer.alloc(installer.length)); },
  };
  globalThis.__cubeUpdateTest = context;
  service = await import(`${pathToFileURL(bundle).href}?fixture=${++serial}`);
  service.initializeUpdates();
  return { service, events, updater, calls, scheduled: () => scheduled, cleanup: () => app.emit('before-quit') };
}

for (const options of [{ mode: 'disabled' }, { missingMode: true }, { mode: 'unknown' }, { noTrust: true }]) {
  test(`update activation fails closed before network or install: ${JSON.stringify(options)}`, async () => {
    const f = await fixture(options);
    try {
      assert.equal(f.service.updateState().phase, 'unavailable');
      for (const method of ['checkForUpdates', 'downloadUpdate', 'installUpdate']) assert.equal((await f.service[method]()).phase, 'unavailable');
      assert.deepEqual(f.calls, { check: 0, download: 0, install: 0, feed: 0, manifest: 0 });
      assert.deepEqual(f.events, []);
      assert.equal(f.scheduled(), 0);
      assert.equal(f.updater.listenerCount('error'), 0);
    } finally { f.cleanup(); }
  });
}

for (const options of [{ noFeed: true }, { publisherName: undefined }, { publisherName: null }, { publisherName: '' }, { publisherName: '   ' }, { publisherName: [] }, { publisherName: ['Synthetic', ''] }, { publisherName: 42 }]) {
  test(`signed Windows mode refuses missing native publisher configuration: ${JSON.stringify(options)}`, async () => {
    const f = await fixture({ platform: 'win32', ...options });
    try {
      assert.equal((await f.service.checkForUpdates()).phase, 'unavailable');
      assert.deepEqual(f.calls, { check: 0, download: 0, install: 0, feed: 0, manifest: 0 });
      assert.equal(f.scheduled(), 0);
    } finally { f.cleanup(); }
  });
}

test('signed Windows mode accepts configured native publisher names without weakening updater behavior', async () => {
  const f = await fixture({ platform: 'win32', publisherName: ['Synthetic test publisher'] });
  try {
    assert.equal(f.service.updateState().phase, 'idle');
    assert.equal(f.scheduled(), 1);
    assert.equal(f.updater.autoDownload, false);
    assert.equal(f.updater.autoInstallOnAppQuit, false);
    assert.equal(f.updater.allowDowngrade, false);
  } finally { f.cleanup(); }
});

test('installation follows confirmed save, quiescence, backup, then close', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.service.checkForUpdates()).phase, 'available');
    assert.equal((await f.service.downloadUpdate()).phase, 'ready');
    assert.equal((await f.service.installUpdate()).phase, 'installing');
    assert.deepEqual(f.events, ['save', 'stop', 'backup', 'close', 'install']);
    assert.equal(f.updater.autoInstallOnAppQuit, false);
    assert.equal(f.updater.allowDowngrade, false);
    assert.equal(f.updater.channel, 'latest');
  } finally { f.cleanup(); }
});
for (const scenario of [
  { name: 'active class', options: { activeClass: true }, expected: [] },
  { name: 'unconfirmed editor save', options: { saveFails: true }, expected: ['save'] },
  { name: 'backup failure', options: { backupFails: true }, expected: ['save', 'stop', 'backup'] },
]) test(`${scenario.name} blocks installation and preserves the running store`, async () => {
  const f = await fixture(scenario.options);
  try {
    await f.service.checkForUpdates(); await f.service.downloadUpdate();
    assert.equal((await f.service.installUpdate()).phase, 'ready');
    assert.deepEqual(f.events, scenario.expected);
    assert.equal(f.service.updateFence.phase, 'open');
  } finally { f.cleanup(); }
});
test('installer error reopens the existing data and releases the update fence', async () => {
  const f = await fixture({ installFails: true });
  try {
    await f.service.checkForUpdates(); await f.service.downloadUpdate(); await f.service.installUpdate();
    assert.deepEqual(f.events, ['save', 'stop', 'backup', 'close', 'install', 'reopen']);
    assert.equal(f.service.updateState().phase, 'error');
    assert.equal(f.service.updateFence.phase, 'open');
  } finally { f.cleanup(); }
});
test('tampering with the cache during backup is rejected before installer handoff', async () => {
  const f = await fixture({ tamperDuringBackup: true });
  try {
    await f.service.checkForUpdates(); await f.service.downloadUpdate(); await f.service.installUpdate();
    assert.deepEqual(f.events, ['save', 'stop', 'backup', 'close', 'reopen']);
    assert.equal(f.service.updateState().phase, 'ready');
    assert.equal(f.service.updateFence.phase, 'open');
  } finally { f.cleanup(); }
});
for (const scenario of [{ noTrust: true }, { badSignature: true }, { corrupt: true }]) test(`untrusted update is never installed: ${JSON.stringify(scenario)}`, async () => {
  const f = await fixture(scenario);
  try {
    await f.service.checkForUpdates(); await f.service.downloadUpdate(); await f.service.installUpdate();
    assert.equal(f.events.includes('install'), false);
    assert.equal(f.events.includes('backup'), false);
  } finally { f.cleanup(); }
});
after(async () => {
  delete globalThis.__cubeUpdateTest;
  if (appImageBefore === undefined) delete process.env.APPIMAGE; else process.env.APPIMAGE = appImageBefore;
  if (!resolve(scratch).startsWith(`${resolve(parent)}${process.platform === 'win32' ? '\\' : '/'}`)) throw new Error('Unsafe test cleanup');
  await rm(scratch, { recursive: true, force: true });
});
