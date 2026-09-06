import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { currentReleaseTarget, packagedRuntimePaths, RELEASE_CONFIG, releaseArtifactNames, releasePaths } from './config.mjs';
import { isInside, safeSmokePath } from './smoke-paths.mjs';

const execute = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const exists = async path => { try { await access(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } };
const digest = async file => createHash('sha256').update(await readFile(file)).digest('hex');

export function assertPreviewRunner(env = process.env) {
  if (env.GITHUB_ACTIONS !== 'true' || env.CI !== 'true' || env.CUBECROOM_PREVIEW_BUILD !== '1') {
    throw new Error('Installer integration tests require the disposable GitHub Actions preview runner');
  }
  if (env.CUBECROOM_REQUIRE_SIGNING === '1') throw new Error('Preview testing cannot claim production signing');
  if (!/^[a-f0-9]{40}$/.test(env.RELEASE_COMMIT ?? '')) throw new Error('Installer evidence requires the exact source commit');
}

export async function assertPreserved(files) {
  for (const { file, sha256 } of files) assert.equal(await digest(file), sha256, `Installer changed teacher data: ${file}`);
}

export async function assertPreviewUpdatesDisabled(resources) {
  const config = JSON.parse(await readFile(join(resources, 'release-config.json'), 'utf8'));
  const trust = JSON.parse(await readFile(join(resources, 'release-trust.json'), 'utf8'));
  assert.equal(config.updateMode, 'disabled', 'Preview artifacts must explicitly disable OTA');
  assert.equal(trust.schemaVersion, 1);
  assert.ok(Array.isArray(trust.keys), 'Packaged verification keys must remain available in the expected format');
}

async function run(file, args, options = {}) {
  const env = { ...process.env, ...options.env };
  if (file === 'pwsh.exe') for (const name of Object.keys(env)) if (name.toLowerCase() === 'psmodulepath') delete env[name];
  return execute(file, args, { cwd: root, timeout: 300_000, windowsHide: true, maxBuffer: 12 * 1024 * 1024, ...options, env });
}

async function until(predicate) {
  const end = Date.now() + 30_000;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise(done => setTimeout(done, 250));
  }
  throw new Error('Installer did not finish within the expected time');
}

export async function main() {
  assertPreviewRunner(); // Must precede any directory, profile, registry, or installer mutation.
  const target = currentReleaseTarget();
  const paths = releasePaths(root);
  const output = process.env.CUBECROOM_OUT_DIR === undefined ? paths.outDirectory : resolve(paths.appDirectory, process.env.CUBECROOM_OUT_DIR);
  await safeSmokePath(output, { root, kind: 'executable' });
  assert.ok(isInside(root, output), 'Installer artifacts must be in the workspace');
  const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;
  const artifactNames = releaseArtifactNames(target, version);
  const asset = extension => join(output, artifactNames[target.extensions.indexOf(extension)]);
  for (const extension of target.extensions) assert.ok((await lstat(asset(extension))).isFile());
  const qa = await mkdtemp(join(tmpdir(), 'cubecroom-preview-'));
  const profile = join(qa, 'profile');
  const data = join(qa, 'data');
  const report = {
    schemaVersion: 1, version, platform: target.platform, arch: target.arch,
    sourceCommit: process.env.RELEASE_COMMIT, installerVerified: false,
    productionSigningVerified: false, checks: [], limitations: [],
  };
  let mounted = false;
  let windowsInstalled = false;
  let userFixture;
  const mount = join(qa, 'mount');
  const installation = join(qa, 'installed');

  async function smoke(executable, { reuse = false } = {}) {
    const result = await run(process.execPath, [join(root, 'scripts/test-packaged.mjs')], {
      env: {
        CUBECROOM_SMOKE_EXECUTABLE: executable,
        CUBECROOM_SMOKE_PROFILE: profile, CUBECROOM_SMOKE_DATA: data,
        CUBECROOM_SMOKE_REUSE: reuse ? '1' : '0',
      },
    });
    console.log(result.stdout.trim());
    report.checks.push(reuse ? 'installed app reopens existing onboarding and teacher class' : 'distributed app passes protocol, onboarding, SQLite, portal, legal and update checks');
  }

  async function verifyNoOta(resources) {
    await assertPreviewUpdatesDisabled(resources);
    report.checks.push('explicit disabled update mode keeps preview OTA unavailable with packaged verification keys');
  }

  async function uninstall() {
    const names = (await readdir(installation)).filter(name => /^Uninstall.*\.exe$/i.test(name));
    assert.equal(names.length, 1, 'One installed NSIS uninstaller is required');
    await run(join(installation, names[0]), ['/S']);
    await until(async () => !await exists(join(installation, `${RELEASE_CONFIG.productName}.exe`)));
    windowsInstalled = false;
  }

  try {
    if (target.platform === 'win32') {
      const require = createRequire(import.meta.url);
      const builderRequire = createRequire(require.resolve('app-builder-lib/package.json'));
      const { UUID } = builderRequire('builder-util-runtime');
      const guid = UUID.v5(RELEASE_CONFIG.appId, UUID.parse('50e065bc-3134-11e6-9bab-38c9862bdaf3'));
      const preflight = await run('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', `
$ErrorActionPreference = 'Stop'
$guid = $env:CUBECROOM_TEST_INSTALL_GUID
foreach ($key in @("HKCU:\\Software\\$guid", "HKLM:\\Software\\$guid", "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\$guid", "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\$guid", "HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\$guid")) {
  if (Test-Path -LiteralPath $key) { throw 'Refusing an existing CubeCroom installation' }
}
if (Get-Process -Name $env:CUBECROOM_TEST_PRODUCT -ErrorAction SilentlyContinue) { throw 'Refusing to interrupt a running application' }
$data = Join-Path ([Environment]::GetFolderPath('ApplicationData')) $env:CUBECROOM_TEST_PRODUCT
if (Test-Path -LiteralPath $data) { throw 'Refusing existing teacher profile data' }
foreach ($folder in @([Environment]::GetFolderPath('Desktop'), [Environment]::GetFolderPath('Programs'))) {
  if (Test-Path -LiteralPath (Join-Path $folder ($env:CUBECROOM_TEST_PRODUCT + '.lnk'))) { throw 'Refusing an existing application shortcut' }
}
@{ data = $data } | ConvertTo-Json -Compress
`], { env: { CUBECROOM_TEST_INSTALL_GUID: guid, CUBECROOM_TEST_PRODUCT: RELEASE_CONFIG.productName } });
      const defaultData = JSON.parse(preflight.stdout.trim()).data;
      await mkdir(defaultData); // Preflight guarantees this is new disposable-runner data.
      userFixture = join(defaultData, 'preview-preserve-fixture.txt');
      await writeFile(userFixture, 'Synthetic teacher data: NSIS must preserve this file.\n');
      const install = async () => {
        // NSIS documents /D as the final, unquoted command-line value (including spaces).
        await run(asset('.exe'), ['/S', `/D=${installation}`], { windowsVerbatimArguments: true });
        windowsInstalled = true;
        await until(() => exists(join(installation, `${RELEASE_CONFIG.productName}.exe`)));
      };
      await install();
      const executable = join(installation, `${RELEASE_CONFIG.productName}.exe`);
      await verifyNoOta(join(installation, 'resources'));
      await smoke(executable);
      const { DATABASE_FILE_NAME } = await import('@cubecroom/core');
      let preserved = await Promise.all([userFixture, join(data, DATABASE_FILE_NAME)].map(async file => ({ file, sha256: await digest(file) })));
      await install(); // Exercise NSIS's real existing-version uninstall/replacement path.
      await assertPreserved(preserved);
      report.checks.push('same-version NSIS replacement preserves default AppData fixture and teacher SQLite bytes');
      await smoke(executable, { reuse: true });
      preserved = await Promise.all(preserved.map(async entry => ({ file: entry.file, sha256: await digest(entry.file) })));
      await uninstall();
      await assertPreserved(preserved);
      report.checks.push('NSIS uninstall preserves default AppData fixture and teacher SQLite bytes');
      report.limitations.push('Unsigned Windows installer: Authenticode and SmartScreen trust are not provided.');
    } else if (target.platform === 'darwin') {
      await mkdir(mount);
      await run('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, asset('.dmg')]);
      mounted = true;
      const appName = `${RELEASE_CONFIG.productName}.app`;
      const copied = join(qa, appName);
      await run('ditto', [join(mount, appName), copied]);
      await run('hdiutil', ['detach', mount]);
      mounted = false;
      async function verifyAdHoc(application) {
        await run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', application]);
        const details = await run('codesign', ['-d', '--verbose=4', application]);
        const text = details.stdout + details.stderr;
        assert.ok(text.includes('Signature=adhoc'), 'Preview macOS app must carry its explicit ad-hoc signature');
        const hash = /CDHash=([a-f0-9]+)/.exec(text)?.[1];
        assert.ok(hash, 'Signed macOS code directory hash is required');
        return hash;
      }
      const dmgHash = await verifyAdHoc(copied);
      const zipRoot = join(qa, 'zip');
      await mkdir(zipRoot);
      await run('ditto', ['-x', '-k', asset('.zip'), zipRoot]);
      assert.equal(await verifyAdHoc(join(zipRoot, appName)), dmgHash, 'DMG and ZIP must carry the same signed application');
      const runtime = packagedRuntimePaths(qa, 'darwin');
      await verifyNoOta(runtime.resources);
      await smoke(runtime.executable);
      report.checks.push('read-only DMG mount, copied application launch, and matching valid ad-hoc DMG/ZIP signatures');
      report.limitations.push('No Developer ID or Apple notarization. This does not validate Gatekeeper acceptance after browser download.');
    } else {
      await run(asset('.AppImage'), ['--appimage-extract'], { cwd: qa });
      const appRoot = join(qa, 'linux-unpacked');
      await rename(join(qa, 'squashfs-root'), appRoot);
      const launcher = join(appRoot, 'AppRun');
      assert.equal(await realpath(launcher), launcher, 'AppRun must remain inside the extracted image');
      assert.ok(!(await readFile(launcher, 'utf8')).includes('--no-sandbox'), 'AppRun must not disable the Chromium sandbox');
      const desktopEntries = (await readdir(appRoot)).filter(name => name.endsWith('.desktop'));
      assert.ok(desktopEntries.length > 0);
      for (const file of desktopEntries) assert.ok(!(await readFile(join(appRoot, file), 'utf8')).includes('--no-sandbox'));
      // Reuse the existing bounded CI-only helper; no sysctl, AppArmor, or host-wide changes.
      await run(process.execPath, [join(root, 'scripts/release/prepare-linux-sandbox.mjs')], { env: { CUBECROOM_OUT_DIR: qa } });
      await verifyNoOta(join(appRoot, 'resources'));
      await smoke(launcher);
      report.checks.push('real AppImage extraction, sandbox-preserving AppRun/desktop entry, and installed SUID sandbox helper');
      report.limitations.push('Extracted AppRun was tested; FUSE-mounted execution still depends on host FUSE2 and user namespace support.');
    }
    report.installerVerified = true;
  } catch (error) {
    report.error = String(error.stack ?? error);
    throw error;
  } finally {
    try {
      if (windowsInstalled) await uninstall();
      if (mounted) await run('hdiutil', ['detach', mount]);
      if (userFixture) { await rm(userFixture); await rmdir(dirname(userFixture)); }
      // Only delete the exact mkdtemp tree created by this test.
      await safeSmokePath(qa, { root });
      assert.ok(isInside(resolve(tmpdir()), qa));
      await rm(qa, { recursive: true, force: true });
    } catch (error) {
      report.installerVerified = false;
      report.cleanupError = String(error);
      process.exitCode = 1;
    }
    await writeFile(join(output, `preview-install-checks-${target.platform}-${target.arch}.json`), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
