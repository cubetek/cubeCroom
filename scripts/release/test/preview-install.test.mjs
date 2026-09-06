import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { assertPreserved, assertPreviewRunner } from '../preview-install-smoke.mjs';
import { isInside, safeSmokePath } from '../smoke-paths.mjs';
import { currentReleaseTarget, RELEASE_CONFIG } from '../config.mjs';
import { createBuilderConfig } from '../../../apps/desktop/electron-builder.config.mjs';

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const require = createRequire(import.meta.url);

test('installer mutations require an explicit disposable preview runner and exact source', () => {
  const valid = { CI: 'true', GITHUB_ACTIONS: 'true', CUBECROOM_PREVIEW_BUILD: '1', RELEASE_COMMIT: 'a'.repeat(40) };
  assert.doesNotThrow(() => assertPreviewRunner(valid));
  for (const patch of [{ CI: undefined }, { GITHUB_ACTIONS: undefined }, { CUBECROOM_PREVIEW_BUILD: '0' }, { CUBECROOM_REQUIRE_SIGNING: '1' }, { RELEASE_COMMIT: 'main' }]) {
    assert.throws(() => assertPreviewRunner({ ...valid, ...patch }));
  }
});

test('smoke path overrides reject traversal, broad roots and symlink escapes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'cubecroom-smoke-paths-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const workspace = join(directory, 'workspace');
  const temporaryRoot = join(directory, 'temp');
  const reports = join(workspace, '.cubeflow/reports');
  await mkdir(reports, { recursive: true });
  await mkdir(temporaryRoot);
  const options = { root: workspace, temporaryRoot };
  assert.equal(await safeSmokePath(join(reports, 'fresh/profile'), options), join(reports, 'fresh/profile'));
  for (const invalid of ['relative/profile', workspace, reports, temporaryRoot, join(workspace, 'source'), join(directory, 'teacher-data')]) {
    await assert.rejects(safeSmokePath(invalid, options));
  }
  const outside = join(directory, 'outside');
  await mkdir(outside);
  await symlink(outside, join(reports, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(safeSmokePath(join(reports, 'escape', 'profile'), options), /symlink/);
});

test('installer data preservation check rejects modified or deleted fixture bytes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'cubecroom-preservation-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'teacher-fixture');
  await writeFile(file, 'synthetic teacher data');
  const expected = [{ file, sha256: createHash('sha256').update(await readFile(file)).digest('hex') }];
  await assertPreserved(expected);
  await writeFile(file, 'replaced');
  await assert.rejects(assertPreserved(expected), /changed teacher data/);
  await rm(file);
  await assert.rejects(assertPreserved(expected), /ENOENT/);
});

test('preview ad-hoc signing does not alter production mode and AppImage arguments preserve sandbox', async () => {
  const saved = { CUBECROOM_PREVIEW_BUILD: process.env.CUBECROOM_PREVIEW_BUILD, CUBECROOM_REQUIRE_SIGNING: process.env.CUBECROOM_REQUIRE_SIGNING };
  try {
    process.env.CUBECROOM_PREVIEW_BUILD = '1';
    process.env.CUBECROOM_REQUIRE_SIGNING = '0';
    const preview = await createBuilderConfig({ root, outDirectory: join(root, 'apps/desktop/out-test') });
    assert.equal(preview.mac.identity, '-');
    assert.equal(preview.mac.hardenedRuntime, true);
    assert.equal(preview.mac.notarize, false);
    assert.equal(preview.nsis.deleteAppDataOnUninstall, false);
    assert.equal(preview.nsis.runAfterFinish, false);
    assert.deepEqual(preview.appImage.executableArgs, []);
    process.env.CUBECROOM_REQUIRE_SIGNING = '1';
    await assert.rejects(createBuilderConfig({ root }), /production signing mode/);
    process.env.CUBECROOM_REQUIRE_SIGNING = '0';
    process.env.CUBECROOM_PREVIEW_BUILD = '0';
    assert.equal((await createBuilderConfig({ root })).mac.identity, undefined);
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('real builder AppImage expansion retains the centrally configured public architecture', async () => {
  const { expandMacro } = require('app-builder-lib/out/util/macroExpander.js');
  const builderRequire = createRequire(require.resolve('app-builder-lib/package.json'));
  const { Arch, getArtifactArchName } = builderRequire('builder-util');
  assert.equal(getArtifactArchName(Arch.x64, 'AppImage'), 'x86_64', 'Exercise the upstream naming mismatch');
  const config = await createBuilderConfig({ root });
  const built = expandMacro(config.appImage.artifactName, getArtifactArchName(Arch.x64, 'AppImage'), { version: '0.1.0' }, { os: 'linux', ext: 'AppImage' });
  const expected = RELEASE_CONFIG.artifactName.replace('${version}', '0.1.0').replace('${os}', 'linux')
    .replace('${arch}', currentReleaseTarget().arch).replace('${ext}', 'AppImage');
  assert.equal(built, expected);
  assert.ok(!built.includes('x86_64'));
});

test('packaged smoke writes failure evidence when profile and data override the report directory', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'cubecroom-smoke-report-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let failure;
  try {
    await execute(process.execPath, [join(root, 'scripts/test-packaged.mjs')], {
      cwd: root, timeout: 20_000,
      env: {
        ...process.env, CUBECROOM_SMOKE_REUSE: '0',
        CUBECROOM_SMOKE_EXECUTABLE: join(directory, 'missing-application.exe'),
        CUBECROOM_SMOKE_PROFILE: join(directory, 'profile'), CUBECROOM_SMOKE_DATA: join(directory, 'data'),
      },
    });
  } catch (error) { failure = error; }
  assert.equal(failure?.code, 1, 'A missing application is a recorded test failure');
  const result = JSON.parse(failure.stdout.trim());
  assert.equal(result.passed, false);
  assert.match(result.error, /ENOENT/);
  assert.ok(isInside(join(root, '.cubeflow/reports/packaged-smoke'), result.report));
  t.after(() => rm(result.report, { recursive: true, force: true }));
  assert.ok((await stat(join(result.report, 'runtime.log'))).isFile());
  assert.deepEqual(JSON.parse(await readFile(join(result.report, 'result.json'), 'utf8')), result);
});

test('patched real AppRun preserves arguments and propagates sandbox launch failure without fallback', async t => {
  const { generateAppRunScript } = require('app-builder-lib/out/targets/appimage/appImageUtil.js');
  const script = generateAppRunScript({ ExecutableName: 'fixture', ProductName: 'Fixture', ProductFilename: 'fixture' });
  assert.ok(!script.includes('--no-sandbox'));
  assert.ok(!script.includes('unshare -Ur'));
  const directory = await mkdtemp(join(tmpdir(), 'cubecroom-apprun-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash';
  if (process.platform === 'win32') {
    try { await access(bash); } catch { t.skip('Git Bash unavailable on this Windows host'); return; }
  }
  await writeFile(join(directory, 'AppRun'), script, { mode: 0o755 });
  await writeFile(join(directory, 'fixture'), '#!/usr/bin/env bash\nprintf "%s\\n" "$@"\nexit "${FIXTURE_EXIT:-0}"\n', { mode: 0o755 });
  // A forbidden user-namespace host must not cause implicit sandbox-disable arguments.
  await writeFile(join(directory, 'unshare'), '#!/usr/bin/env bash\nexit 1\n', { mode: 0o755 });
  const env = { ...process.env, APPDIR: directory.replaceAll('\\', '/'), APPIMAGE_EXIT_AFTER_INSTALL: '', APPIMAGE_SILENT_INSTALL: '1' };
  const args = [join(directory, 'AppRun'), '--fixture', 'value with spaces'];
  const launched = await execute(bash, args, { env });
  assert.equal(launched.stdout.replaceAll('\r', ''), '--fixture\nvalue with spaces\n');
  await assert.rejects(execute(bash, args, { env: { ...env, FIXTURE_EXIT: '23' } }), error => error.code === 23 && !error.stdout.includes('--no-sandbox'));
});
