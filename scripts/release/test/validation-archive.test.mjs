import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { archiveTarCommand, createValidationArchive } from '../archive-validation.mjs';
import { currentReleaseTarget } from '../config.mjs';
import { sha512 } from '../common.mjs';

test('validation archives preserve packaged bytes, Unix modes and symlinks without claiming production signing', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'cubecroom-validation-archive-'));
  t.after(async () => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  });
  const applicationDirectory = join(directory, 'CubeCroom fixture.app');
  const outputDirectory = join(directory, 'archives');
  await mkdir(applicationDirectory);
  const executable = join(applicationDirectory, 'CubeCroom');
  await writeFile(executable, 'packaged fixture bytes\n');
  if (process.platform !== 'win32') {
    await chmod(executable, 0o755);
    await symlink('CubeCroom', join(applicationDirectory, 'Current'));
  }
  const options = { applicationDirectory, outputDirectory, target: currentReleaseTarget(), version: '0.1.0', commit: 'a'.repeat(40) };
  const manifest = await createValidationArchive(options);
  assert.equal(manifest.purpose, 'validation-only');
  assert.equal(manifest.productionSigningVerified, false);
  const archive = join(outputDirectory, manifest.archive);
  assert.equal(await sha512(archive), manifest.sha512);
  assert.equal(await readFile(join(outputDirectory, 'SHA512SUMS'), 'utf8'), `${Buffer.from(manifest.sha512, 'base64').toString('hex')}  ${manifest.archive}\n`);
  const extracted = join(directory, 'extracted');
  await mkdir(extracted);
  execFileSync(archiveTarCommand, ['-xzf', archive, '-C', extracted], { stdio: 'inherit', timeout: 30_000 });
  const copied = join(extracted, 'CubeCroom fixture.app');
  assert.deepEqual(await readFile(join(copied, 'CubeCroom')), await readFile(executable));
  if (process.platform !== 'win32') {
    assert.equal((await lstat(join(copied, 'CubeCroom'))).mode & 0o777, 0o755);
    assert.ok((await lstat(join(copied, 'Current'))).isSymbolicLink());
  }
  await assert.rejects(createValidationArchive(options), /must be empty/);
  await assert.rejects(createValidationArchive({ ...options, outputDirectory: join(applicationDirectory, 'nested') }), /outside/);
});
