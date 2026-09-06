import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { parse, stringify } from 'yaml';
import { RELEASE_CONFIG } from '../config.mjs';
import { metadataName } from '../assets.mjs';
import { assemblePreview, collectPreviewTarget, previewIdentity } from '../preview.mjs';
import { sha512 } from '../common.mjs';

const identity = previewIdentity('v0.1.0', 'a'.repeat(40), '0.1.0');
const createdAt = '2026-09-06T12:00:00Z';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'cubecroom-preview-'));
  t.after(async () => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  });
  for (const target of RELEASE_CONFIG.targets) {
    const output = join(directory, 'builder', target.id);
    await mkdir(output, { recursive: true });
    const files = [];
    const os = { win32: 'win', darwin: 'mac', linux: 'linux' }[target.platform];
    for (const extension of target.extensions) {
      const name = `CubeCroom-${identity.version}-${os}-${target.arch}${extension}`;
      const bytes = Buffer.from(`installer fixture ${name}`);
      await writeFile(join(output, name), bytes);
      files.push({ url: name, size: bytes.length, sha512: createHash('sha512').update(bytes).digest('base64') });
      await writeFile(join(output, `${name}.blockmap`), 'private builder metadata');
    }
    await writeFile(join(output, metadataName(target.platform, identity.channel)), stringify({ version: identity.version, files, path: files[0].url, sha512: files[0].sha512 }));
    await writeFile(join(output, `packaging-checks-${target.platform}-${target.arch}.json`), JSON.stringify({
      schemaVersion: 1, version: identity.version, platform: target.platform, arch: target.arch,
      resourcesValidated: true, nativeSqliteVerified: true,
    }));
    await writeFile(join(output, `preview-install-checks-${target.platform}-${target.arch}.json`), JSON.stringify({
      schemaVersion: 1, version: identity.version, sourceCommit: identity.commit, platform: target.platform, arch: target.arch,
      installerVerified: true, productionSigningVerified: false, checks: ['synthetic test evidence'],
    }));
    await collectPreviewTarget(output, join(directory, 'input', `preview-target-${target.id}`), target, identity);
  }
  return directory;
}

test('preview keeps the package version and exact source identity without enabling stable publishing', () => {
  assert.equal(identity.tag, 'v0.1.0');
  assert.throws(() => previewIdentity('v0.2.0', identity.commit, '0.1.0'));
  assert.throws(() => previewIdentity('v0.1.0', 'HEAD', '0.1.0'));
  assert.throws(() => previewIdentity('v0.1.0', identity.commit, '0.1.0', '0.2.0'));
});

test('preview publishes only six verified binaries, explicit signing state and SHA512', async (t) => {
  const directory = await fixture(t);
  const destination = join(directory, 'public');
  const metadata = await assemblePreview(join(directory, 'input'), destination, identity, createdAt);
  assert.equal(metadata.artifacts.length, 6);
  assert.equal(metadata.channel, 'preview');
  assert.equal(metadata.prerelease, true);
  assert.equal(metadata.productionSigningVerified, false);
  assert.equal(metadata.osSigning, 'unverified');
  assert.equal(metadata.ota, false);
  assert.equal(metadata.commit, identity.commit);
  assert.deepEqual((await readdir(destination)).sort(), [...metadata.artifacts.map((file) => file.name), 'release-metadata.json', 'SHA512SUMS'].sort());
  const checksums = await readFile(join(destination, 'SHA512SUMS'), 'utf8');
  for (const name of [...metadata.artifacts.map((file) => file.name), 'release-metadata.json']) {
    assert.ok(checksums.includes(`${Buffer.from(await sha512(join(destination, name)), 'base64').toString('hex')}  ${name}\n`));
  }
  assert.equal(metadata.artifacts.some((file) => /\.(yml|blockmap)$/.test(file.name)), false);
  await assert.rejects(assemblePreview(join(directory, 'input'), destination, identity, createdAt), /must be empty/);
});

test('preview refuses missing architectures, changed installer bytes and mismatched source evidence', async (t) => {
  const directory = await fixture(t);
  const input = join(directory, 'input');
  const destination = join(directory, 'public');
  const targetDirectory = join(input, 'preview-target-mac-arm64');
  const evidenceFile = join(targetDirectory, 'preview-target.json');
  const evidence = JSON.parse(await readFile(evidenceFile, 'utf8'));
  await writeFile(evidenceFile, JSON.stringify({ ...evidence, commit: 'b'.repeat(40) }));
  await assert.rejects(assemblePreview(input, destination, identity, createdAt), /identity mismatch/);
  await writeFile(evidenceFile, JSON.stringify(evidence));
  await writeFile(join(targetDirectory, 'CubeCroom-0.1.0-mac-arm64.zip'), 'changed');
  await assert.rejects(assemblePreview(input, destination, identity, createdAt), /checksum\/size mismatch/);
  assert.equal(dirname(resolve(targetDirectory)), resolve(input));
  await rm(targetDirectory, { recursive: true, force: true });
  await assert.rejects(assemblePreview(input, destination, identity, createdAt), /exactly the configured/);
});

test('preview requires actual installer smoke evidence in addition to unpacked resource checks', async (t) => {
  const directory = await fixture(t);
  const input = join(directory, 'input');
  await writeFile(join(input, 'preview-target-win-x64', 'preview-install-checks-win32-x64.json'), '{}');
  await assert.rejects(assemblePreview(input, join(directory, 'public'), identity, createdAt), /installer evidence is incomplete/);
});

test('installer mode is restricted to official main dispatch and retains isolated provenance signing', async () => {
  const ci = parse(await readFile(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8'));
  assert.deepEqual(ci.on.workflow_dispatch.inputs.build_installers, {
    description: 'Build preview installers for the current product version (official main only)', type: 'boolean', default: false,
  });
  const guard = "github.event_name == 'workflow_dispatch' && github.repository == 'cubetek/cubeCroom' && github.ref == 'refs/heads/main' && inputs.build_installers";
  assert.equal(ci.jobs.configure.outputs['build-installers'], '${{ ' + guard + ' }}');
  assert.equal(ci.jobs.configure.steps.find((step) => step.id === 'preview').if, guard);
  // An empty RELEASE_COMMIT is an invalid SHA, not the ordinary build's absent setting.
  assert.equal(ci.jobs.verify.env.RELEASE_COMMIT, undefined);
  const sourceIdentity = ci.jobs.verify.steps.find((step) => step.run?.includes('process.env.GITHUB_ENV'));
  assert.equal(sourceIdentity.if, "needs.configure.outputs.build-installers == 'true'");
  assert.equal(sourceIdentity.env.RELEASE_COMMIT, '${{ needs.configure.outputs.commit }}');
  assert.deepEqual(ci.jobs.preview.needs, ['configure', 'verify']);
  assert.equal(ci.jobs.preview.if, "needs.configure.outputs.build-installers == 'true'");
  assert.equal(ci.jobs.preview.permissions, undefined);
  assert.equal(JSON.stringify(ci).includes('secrets.'), false);
  const installerSmoke = ci.jobs.verify.steps.find((step) => step.run?.includes('node scripts/release/preview-install-smoke.mjs'));
  assert.equal(installerSmoke.if, "needs.configure.outputs.build-installers == 'true'");
  const signature = ci.jobs.attest.steps.find((step) => step.id === 'preview');
  assert.equal(signature.if, "needs.configure.outputs.build-installers == 'true'");
  assert.equal(signature.with['subject-path'], 'dist/preview-release/*');
  assert.equal(ci.jobs.attest.steps.some((step) => step.uses?.startsWith('actions/checkout@')), false);
});
