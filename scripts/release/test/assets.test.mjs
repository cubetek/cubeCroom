import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import { RELEASE_CONFIG } from '../config.mjs';
import { assembleAssets, inspectTarget, metadataName, validateMetadata } from '../assets.mjs';
import { releaseIdentity } from '../common.mjs';
import { distributionDocuments, signReleaseManifest } from '../manifest.mjs';
import { verifyReleaseManifest, verifyReleaseFile } from '@cubecroom/core';

const identity = releaseIdentity('v0.2.0', 'a'.repeat(40));
const osNames = { win32: 'win', darwin: 'mac', linux: 'linux' };
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'cubecroom-release-test-'));
  t.after(async () => {
    // Only remove the exact directory returned by mkdtemp beneath the system temp directory.
    assert.equal(resolve(directory).startsWith(`${resolve(tmpdir())}${process.platform === 'win32' ? '\\' : '/'}`), true);
    await rm(directory, { recursive: true, force: true });
  });
  for (const target of RELEASE_CONFIG.targets) {
    const path = join(directory, 'input', target.id);
    await mkdir(path, { recursive: true });
    const files = [];
    for (const ext of target.extensions) {
      const name = `CubeCroom-${identity.version}-${osNames[target.platform]}-${target.arch}${ext}`;
      const bytes = Buffer.from(`synthetic fixture ${name}`);
      await writeFile(join(path, name), bytes);
      files.push({ url: name, sha512: createHash('sha512').update(bytes).digest('base64'), size: bytes.length });
    }
    await writeFile(join(path, metadataName(target.platform, identity.channel)), stringify({ version: identity.version, files, path: files[0].url, sha512: files[0].sha512 }));
    await writeFile(join(path, `packaging-checks-${target.platform}-${target.arch}.json`), JSON.stringify({ schemaVersion: 1, version: identity.version, platform: target.platform, arch: target.arch, resourcesValidated: true, nativeSqliteVerified: true }));
  }
  return directory;
}

test('release identity rejects shell/path inputs and partial commits', () => {
  assert.deepEqual(releaseIdentity('v1.2.3-beta.4', '1'.repeat(40)), { version: '1.2.3-beta.4', tag: 'v1.2.3-beta.4', commit: '1'.repeat(40), channel: 'beta' });
  for (const tag of ['../v1.0.0', 'v1.0.0;echo', 'v1.0.0\n', 'v1.0.0-rc.1']) assert.throws(() => releaseIdentity(tag, '1'.repeat(40)));
  assert.throws(() => releaseIdentity('v1.0.0', '1234567'));
});

test('assembly requires every platform and merges mac architectures without collisions', async (t) => {
  const directory = await fixture(t);
  const files = await assembleAssets(join(directory, 'input'), join(directory, 'output'), identity);
  assert.equal(new Set(files.map((file) => file.name)).size, files.length);
  for (const target of RELEASE_CONFIG.targets) assert.ok(files.some((file) => file.platform === target.platform && file.arch === target.arch));
  const mac = files.find((file) => file.name === 'latest-mac.yml');
  assert.equal(mac.arch, 'universal');
  const metadata = parse(await readFile(join(directory, 'output', mac.name), 'utf8'));
  assert.ok(metadata.files.some((file) => file.url.endsWith('-arm64.zip')));
  assert.ok(metadata.files.some((file) => file.url.endsWith('-x64.zip')));
  assert.ok(metadata.path.includes('-x64.'));
});

test('assembly refuses a missing updater ZIP despite the DMG being present', async (t) => {
  const directory = await fixture(t);
  await rm(join(directory, 'input', 'mac-arm64', `CubeCroom-${identity.version}-mac-arm64.zip`));
  await assert.rejects(assembleAssets(join(directory, 'input'), join(directory, 'output'), identity), /Missing required artifact/);
});

test('assembled multi-platform release signs and verifies using the actual runtime validator', async (t) => {
  const directory = await fixture(t);
  const files = await assembleAssets(join(directory, 'input'), join(directory, 'output'), identity);
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const trust = { schemaVersion: 1, keys: [{ id: 'test-only', publicKey: publicKey.export({ type: 'spki', format: 'pem' }) }] };
  const payload = { schemaVersion: 1, ...identity, createdAt: '2026-09-06T00:00:00Z', files };
  const envelope = signReleaseManifest(payload, 'test-only', privatePem, trust);
  const decoded = verifyReleaseManifest(envelope, trust, { repository: RELEASE_CONFIG.repository, version: identity.version, channel: identity.channel });
  assert.deepEqual(decoded, payload);
  for (const file of decoded.files) await verifyReleaseFile(join(directory, 'output', file.name), file);
  const documents = distributionDocuments(decoded);
  assert.equal(JSON.parse(documents['downloads.json']).downloads.length, 4);
  assert.equal(documents.SHA512SUMS.trim().split('\n').length, files.length);
  assert.throws(() => signReleaseManifest(payload, 'test-only', privatePem, { schemaVersion: 1, keys: [] }), /Unknown release signing key/);
  assert.throws(() => verifyReleaseManifest({ ...envelope, payload: Buffer.from(JSON.stringify({ ...payload, commit: 'b'.repeat(40) })).toString('base64') }, trust, { repository: RELEASE_CONFIG.repository }), /Invalid release signature/);
});

test('changed installer bytes fail metadata verification', async (t) => {
  const directory = await fixture(t);
  await writeFile(join(directory, 'input', 'win-x64', `CubeCroom-${identity.version}-win-x64.exe`), 'tampered');
  await assert.rejects(inspectTarget(join(directory, 'input', 'win-x64'), RELEASE_CONFIG.targets[0], identity), /checksum\/size mismatch/);
});

test('metadata rejects traversal, unexpected files, and duplicate updater entries', () => {
  const file = { name: 'app.exe', size: 10, sha512: 'checksum' };
  for (const url of ['../app.exe', 'https://attacker.invalid/app.exe', 'other.exe']) {
    assert.throws(() => validateMetadata({ version: identity.version, files: [{ url, size: 10, sha512: 'checksum' }] }, identity, [file]));
  }
  assert.throws(() => validateMetadata({ version: identity.version, files: Array(2).fill({ url: 'app.exe', size: 10, sha512: 'checksum' }) }, identity, [file]), /duplicate/);
});

test('stale artifacts, missing packaging evidence, and nonempty output fail closed', async (t) => {
  const directory = await fixture(t);
  const target = RELEASE_CONFIG.targets[0];
  const path = join(directory, 'input', target.id);
  await writeFile(join(path, 'CubeCroom-0.1.0-win-x64.exe'), 'stale');
  await assert.rejects(inspectTarget(path, target, identity), /stale/);
  await rm(join(path, 'CubeCroom-0.1.0-win-x64.exe'));
  await writeFile(join(path, 'packaging-checks-win32-x64.json'), '{}');
  await assert.rejects(inspectTarget(path, target, identity), /evidence is incomplete/);
  const output = join(directory, 'output');
  await mkdir(output);
  await writeFile(join(output, 'stale'), 'stale');
  await assert.rejects(assembleAssets(join(directory, 'input'), output, identity), /must be empty/);
});

test('workflow files pin Actions and keep signing isolated from pull requests', async () => {
  const workflowRoot = new URL('../../../.github/workflows/', import.meta.url);
  const release = parse(await readFile(new URL('release.yml', workflowRoot), 'utf8'));
  const ci = parse(await readFile(new URL('ci.yml', workflowRoot), 'utf8'));
  assert.equal(release.on.pull_request, undefined);
  assert.equal(release.on.pull_request_target, undefined);
  assert.equal(release.permissions.contents, 'read');
  assert.equal(release.concurrency['cancel-in-progress'], false);
  assert.deepEqual(release.jobs.publish.needs, ['prepare', 'build']);
  assert.equal(release.jobs.publish.environment, 'release-publish');
  const publisher = release.jobs.publish.steps.find((step) => step.run === 'node scripts/release/publish.mjs');
  assert.equal(publisher.env.RELEASE_PUBLIC_PUBLISH_ENABLED, '${{ vars.RELEASE_PUBLIC_PUBLISH_ENABLED }}');
  assert.deepEqual(Object.keys(publisher.env).sort(), ['GH_TOKEN', 'RELEASE_PUBLIC_PUBLISH_ENABLED']);
  assert.equal(release.jobs.build.steps.filter((step) => step.run === 'pnpm verify').length, 1);
  assert.equal(release.jobs.build.steps.some((step) => step.run?.startsWith('node --test ')), false);
  assert.equal(ci.jobs.verify.needs, 'configure');
  assert.equal(ci.jobs.verify['runs-on'], '${{ matrix.runner }}');
  assert.equal(ci.jobs.verify.strategy.matrix, '${{ fromJSON(needs.configure.outputs.matrix) }}');
  assert.ok(ci.jobs.configure.steps.some((step) => step.run?.includes('RELEASE_CONFIG.targets')));
  const ciPackage = ci.jobs.verify.steps.find((step) => step.run?.includes('node scripts/package-app.mjs package'));
  assert.equal(ciPackage.env.ELECTRON_SKIP_BINARY_DOWNLOAD, '');
  assert.equal(ciPackage.env.CUBECROOM_REQUIRE_SIGNING, '0');
  assert.ok(ci.jobs.verify.steps.some((step) => step.run?.includes('xvfb-run -a node scripts/test-packaged.mjs')));
  const releasePackage = release.jobs.build.steps.find((step) => step.run?.includes('node scripts/package-app.mjs make'));
  assert.equal(releasePackage.env.CUBECROOM_REQUIRE_SIGNING, '1');
  assert.ok(releasePackage.run.indexOf('node scripts/test-packaged.mjs') < releasePackage.run.indexOf('node scripts/release/verify-target.mjs'));
  assert.equal(JSON.stringify(ci).includes('secrets.'), false);
  assert.ok(ci.jobs.verify.steps.some((step) => step.run === 'node scripts/release/archive-validation.mjs'));
  const validationUpload = ci.jobs.verify.steps.find((step) => step.with?.name?.startsWith('validation-'));
  assert.equal(validationUpload.with.path, 'dist/validation/*');
  assert.equal(validationUpload.with['retention-days'], 7);
  assert.deepEqual(ci.permissions, { contents: 'read' });
  for (const job of [ci.jobs.configure, ci.jobs.verify]) assert.equal(job.permissions, undefined);
  const attestation = ci.jobs.attest;
  assert.equal(attestation.needs, 'verify');
  assert.equal(attestation.if, "github.repository == 'cubetek/cubeCroom' && github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')");
  assert.deepEqual(attestation.permissions, { contents: 'read', 'id-token': 'write', attestations: 'write' });
  assert.equal(attestation.steps.some((step) => step.uses?.startsWith('actions/checkout@')), false);
  const attestationDownload = attestation.steps.find((step) => step.uses?.startsWith('actions/download-artifact@'));
  assert.deepEqual(attestationDownload.with, { pattern: 'validation-*-${{ github.sha }}', path: 'dist/validation-attest' });
  const attestationSigner = attestation.steps.find((step) => step.uses?.startsWith('actions/attest-build-provenance@'));
  assert.deepEqual(attestationSigner.with, { 'subject-path': 'dist/validation-attest/*/*.tar.gz', 'create-storage-record': false });
  for (const job of [ci.jobs.verify, release.jobs.build]) {
    const diagnostics = job.steps.find((step) => step.with?.name === 'packaged-smoke-${{ matrix.id }}');
    assert.equal(diagnostics.if, 'failure()');
    assert.deepEqual(diagnostics.with.path.trim().split('\n'), [
      '.cubeflow/reports/packaged-smoke/*/runtime.log',
      '.cubeflow/reports/packaged-smoke/*/settings-updates.png',
      '.cubeflow/reports/packaged-smoke/*/result.json',
    ]);
  }
  assert.ok(release.jobs.build.steps.find((step) => step.uses?.startsWith('actions/checkout@')).with.ref.includes('needs.prepare.outputs.commit'));
  for (const workflow of [release, ci]) for (const job of Object.values(workflow.jobs)) for (const step of job.steps ?? []) {
    if (step.uses) assert.match(step.uses, /^[\w.-]+\/[\w.-]+@[a-f0-9]{40}$/);
    if (step.uses?.startsWith('pnpm/action-setup@')) assert.equal(step.with?.version, undefined);
  }
});
