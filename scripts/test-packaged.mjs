import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { packagedApplicationPaths, releasePaths } from './release/config.mjs';

// Exercise the shipped protocol/preload/native portal with a fresh, isolated profile.
// The existing Windows/macOS/Linux packaging configuration owns every binary path.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const paths = releasePaths(root);
const output = process.env.CUBECROOM_OUT_DIR === undefined ? paths.outDirectory : resolve(paths.appDirectory, process.env.CUBECROOM_OUT_DIR);
const report = resolve(root, '.cubeflow/reports/packaged-smoke', String(Date.now()));
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
const profile = join(report, 'profile');
const data = join(report, 'data');
await mkdir(profile, { recursive: true });
await mkdir(data, { recursive: true });
const { executable } = packagedApplicationPaths(output);
const env = { ...process.env, CUBECROOM_USER_DATA_DIR: profile, CUBECROOM_DATA_DIR: data };
delete env.ELECTRON_RUN_AS_NODE;
for (const name of Object.keys(env)) {
  if (/^(CSC_|WIN_CSC_|WINDOWS_CSC_|MAC_CSC_|APPLE_|RELEASE_SIGNING_|RELEASE_APP_PRIVATE_KEY$|GH_TOKEN$|GITHUB_TOKEN$)/i.test(name)) delete env[name];
}
const child = spawn(executable, ['--remote-debugging-port=0'], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let runtimeLog = '';
let launchError;
let childClosed = false;
child.once('error', error => { launchError = error; });
child.once('close', () => { childClosed = true; });
child.stdout.on('data', b => { runtimeLog += b; });
child.stderr.on('data', b => { runtimeLog += b; });
let socket;
let nextId = 0;
const pending = new Map();
const exceptions = [];
const results = { report, executable, checks: [] };
const request = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
async function waitForChildClose(timeout) {
  if (childClosed) return true;
  return new Promise(resolveClosed => {
    const closed = () => { clearTimeout(timer); resolveClosed(true); };
    const timer = setTimeout(() => { child.removeListener('close', closed); resolveClosed(false); }, timeout);
    child.once('close', closed);
  });
}
function send(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolveResult, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Timeout: ' + method)); }, 45000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolveResult(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function until(fn, timeout = 45000) {
  const deadline = Date.now() + timeout;
  let error;
  while (Date.now() < deadline) {
    if (launchError) throw launchError;
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Packaged app exited before completing the smoke test: ${child.signalCode ?? child.exitCode}`);
    }
    try { const value = await fn(); if (value) return value; } catch (e) { error = e; }
    await new Promise(r => setTimeout(r, 250));
  }
  throw error ?? new Error('Condition timed out');
}
try {
  const port = await until(async () => Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]));
  const target = await until(async () => (await (await request(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.url.startsWith('app://')));
  socket = new WebSocket(target.webSocketDebuggerUrl);
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
    const action = pending.get(message.id);
    if (!action) return;
    pending.delete(message.id);
    if (message.error) action.reject(new Error(JSON.stringify(message.error))); else action.resolve(message.result);
  });
  socket.addEventListener('close', () => {
    for (const action of pending.values()) action.reject(new Error('Packaged application connection closed'));
    pending.clear();
  });
  await new Promise((connected, reject) => {
    const finish = (error) => {
      clearTimeout(timer);
      socket.removeEventListener('open', opened);
      socket.removeEventListener('error', failed);
      socket.removeEventListener('close', failed);
      if (error) reject(error); else connected();
    };
    const opened = () => finish();
    const failed = () => finish(new Error('Packaged application connection failed before opening'));
    const timer = setTimeout(() => finish(new Error('Packaged application connection timed out')), 15000);
    socket.addEventListener('open', opened, { once: true });
    socket.addEventListener('error', failed, { once: true });
    socket.addEventListener('close', failed, { once: true });
  });
  await send('Runtime.enable');
  await until(() => evaluate('Boolean(window.cubecroom && document.body.innerText.length > 20)'));
  let boot = await evaluate('window.cubecroom.bootState()');
  assert.equal(boot.status, 'onboarding');
  boot = await evaluate(`window.cubecroom.completeOnboarding(${JSON.stringify({ name: 'معلم اختبار الحزمة', dataDirectory: data })})`);
  assert.equal(boot.status, 'ready');
  assert.equal(boot.dataDirectory, data);
  await evaluate('window.cubecroom.writeSetting({key:"checkUpdatesAutomatically",value:"false"})');
  results.checks.push('isolated onboarding and database');
  await send('Page.reload');
  await until(() => evaluate("Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('الإعدادات'))"));
  await evaluate("Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('الإعدادات')).click()");
  await until(() => evaluate('Boolean(document.querySelector("[data-update-settings]"))'));
  const state = await evaluate('window.cubecroom.updateState()');
  assert.ok(['unavailable', 'idle'].includes(state.phase), JSON.stringify(state));
  assert.equal(state.currentVersion, version);
  // A local package without production trust must not contact the update feed.
  if (state.phase === 'unavailable') assert.equal(await evaluate('window.cubecroom.updateCheck().then(s => s.phase)'), 'unavailable');
  assert.equal(await evaluate('window.cubecroom.updateChannel("beta").then(s => s.channel)'), 'beta');
  assert.equal(await evaluate('window.cubecroom.updateState().then(s => s.channel)'), 'beta');
  await send('Page.reload');
  await until(() => evaluate('window.cubecroom?.bootState().then(s => s.status === "ready")'));
  assert.equal(await evaluate('window.cubecroom.updateState().then(s => s.channel)'), 'beta');
  await evaluate('window.cubecroom.updateChannel("stable")');
  await until(() => evaluate("Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('الإعدادات'))"));
  await evaluate("Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('الإعدادات')).click()");
  await until(() => evaluate('Boolean(document.querySelector("[data-update-settings]"))'));
  await evaluate('document.querySelector("[data-update-settings]").scrollIntoView({block:"center"})');
  const screenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(report, 'settings-updates.png'), Buffer.from(screenshot.data, 'base64'));
  results.checks.push('packaged update IPC, persisted channel, rendered settings');
  await evaluate('document.querySelector("[data-legal-notice]").click()');
  await until(() => evaluate('document.querySelector("[role=dialog]")?.textContent.includes("AGPL-3.0-only")'));
  const legal = await evaluate('fetch("/legal/info.json").then(r => r.json())');
  assert.equal(legal.version, version);
  assert.equal(legal.license, 'AGPL-3.0-only');
  assert.ok(legal.licenseText.includes('GNU AFFERO GENERAL PUBLIC LICENSE'));
  assert.equal(legal.noticesAvailable, true);
  await evaluate('Array.from(document.querySelectorAll("[role=dialog] button")).find(b => b.textContent.includes("تراخيص المكتبات")).click()');
  await until(() => evaluate('Array.from(document.querySelectorAll("[role=dialog] pre")).some(p => p.textContent.length > 100000)'));
  const legalScreenshot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(join(report, 'legal-notice.png'), Buffer.from(legalScreenshot.data, 'base64'));
  await evaluate('document.querySelector("[role=dialog] button[aria-label=إغلاق]").click()');
  results.checks.push('packaged AGPL text, source link and third-party notices');
  const cls = await evaluate('window.cubecroom.classesCreate({name:"فصل اختبار الحزمة",subject:"علوم"})');
  await evaluate(`window.cubecroom.portalStart({classId:${JSON.stringify(cls.id)}})`);
  const portal = await until(async () => { const value = await evaluate('window.cubecroom.portalStatus()'); return value.state === 'starting' ? null : value; });
  assert.ok(['running', 'unreachable'].includes(portal.state), JSON.stringify(portal));
  const base = `http://127.0.0.1:${portal.port}`;
  assert.equal((await request(base)).status, 200);
  assert.equal((await request(base + '/_next/image?url=%2Ftest.png&w=64&q=75')).status, 404);
  const studentLegal = await (await request(base + '/legal/info.json')).json();
  assert.deepEqual(studentLegal, legal);
  const studentNotices = await request(base + '/legal/notices.txt');
  assert.equal(studentNotices.status, 200);
  assert.ok((await studentNotices.text()).length > 100000);
  results.checks.push('student portal serves the same license, source and dependency notices');
  if (portal.state === 'running') {
    const response = await request(base + '/api/join', { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify({ name: 'طالب اختبار الحزمة', joinCode: portal.joinCode }) });
    assert.equal(response.status, 200, await response.clone().text());
    const joined = await response.json();
    assert.ok(JSON.stringify(joined).includes('pending'));
    results.checks.push('packaged portal HTTP and SQLite student join');
  } else results.checks.push('packaged portal HTTP; join unavailable without LAN');
  assert.equal(await evaluate('window.cubecroom.portalStop().then(s => s.state)'), 'stopped');
  assert.equal(exceptions.length, 0, JSON.stringify(exceptions));
  results.checks.push('no renderer uncaught exceptions');
  results.passed = true;
} catch (error) {
  results.passed = false;
  results.error = String(error.stack ?? error);
  if (socket?.readyState === WebSocket.OPEN) {
    const capture = await send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
    if (capture) await writeFile(join(report, 'settings-updates.png'), Buffer.from(capture.data, 'base64'));
  }
  process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    await evaluate('window.cubecroom.portalStop()').catch(() => {});
    await send('Page.close').catch(() => {});
  }
  socket?.close();
  // Closing the last window keeps a macOS application alive. Reap only this test's child.
  if (!await waitForChildClose(1000)) {
    child.kill();
    if (!await waitForChildClose(5000)) {
      child.kill('SIGKILL');
      if (!await waitForChildClose(5000)) {
        results.passed = false;
        results.cleanupError = 'The packaged test process did not close after termination.';
        process.exitCode = 1;
        child.stdout.destroy(); child.stderr.destroy(); child.unref();
      }
    }
  }
  await writeFile(join(report, 'runtime.log'), runtimeLog);
  await writeFile(join(report, 'result.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
}
