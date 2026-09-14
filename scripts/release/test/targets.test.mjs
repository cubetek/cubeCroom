import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { basename } from 'node:path';
import test from 'node:test';
import { packagedApplicationPaths, RELEASE_CONFIG, releaseArtifactNames, releaseTargetArchitecture } from '../config.mjs';

const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve('app-builder-lib/package.json'));

test('unpacked folders follow electron-builder for every configured architecture', () => {
  // app-builder-lib computeAppOutDir: `${key}${getArchSuffix(arch, defaultArch)}` plus `-unpacked` except macOS.
  // The builder config sets no defaultArch, so the installed getArchSuffix receives undefined, exactly as here.
  const { Arch, getArchSuffix } = builderRequire('builder-util');
  for (const target of RELEASE_CONFIG.targets) {
    const key = { win32: 'win', darwin: 'mac', linux: 'linux' }[target.platform];
    const expected = `${key}${getArchSuffix(Arch[target.arch], undefined)}${target.platform === 'darwin' ? '' : '-unpacked'}`;
    assert.equal(basename(packagedApplicationPaths('out', target).appOutDirectory), expected, target.id);
  }
});

test('the installed updater picks the running architecture from the shared Windows feed', () => {
  // Both Windows builds write latest.yml. electron-updater's own findFile, not a copy of it, must still
  // choose each machine's installer: it prefers the file whose name contains process.arch.
  const { findFile } = require('electron-updater/out/providers/Provider.js');
  const version = '0.2.0';
  const names = RELEASE_CONFIG.targets.filter((target) => target.platform === 'win32')
    .flatMap((target) => releaseArtifactNames(target, version));
  assert.deepEqual(names.sort(), [`CubeCroom-${version}-win-arm64.exe`, `CubeCroom-${version}-win-x64.exe`]);
  const files = names.map((name) => ({
    url: new URL(`https://github.com/${RELEASE_CONFIG.repository.owner}/${RELEASE_CONFIG.repository.repo}/releases/download/v${version}/${name}`),
    info: { url: name },
  }));
  // Every CI runner is x64 or arm64, so each matrix job exercises one of the two Windows choices.
  if (process.arch === 'x64' || process.arch === 'arm64') {
    assert.equal(findFile(files, 'exe').info.url, `CubeCroom-${version}-win-${process.arch}.exe`);
  }
});

test('every configured target has a reader-facing architecture label', () => {
  for (const target of RELEASE_CONFIG.targets) assert.ok(releaseTargetArchitecture(target).trim().length > 0, target.id);
  assert.throws(() => releaseTargetArchitecture({ id: 'linux-ia32', platform: 'linux', arch: 'ia32' }));
});
