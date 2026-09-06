import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { RELEASE_CONFIG } from '../config.mjs';
import { releaseIdentity, repository, sha512 } from '../common.mjs';
import { publishAssets } from '../publish-assets.mjs';
import { previewReleaseNotes, validatePreviewPublication } from '../publish-preview.mjs';

const identity = releaseIdentity('v0.1.1', 'a'.repeat(40));
const runId = '12345';

async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'cubecroom-publisher-'));
  t.after(async () => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

async function previewFixture(t) {
  const directory = await temporaryDirectory(t);
  const artifacts = [];
  for (const target of RELEASE_CONFIG.targets) for (const extension of target.extensions) {
    const os = { win32: 'win', darwin: 'mac', linux: 'linux' }[target.platform];
    const name = `CubeCroom-${identity.version}-${os}-${target.arch}${extension}`;
    const bytes = Buffer.from(`fixture ${name}`);
    await writeFile(join(directory, name), bytes);
    artifacts.push({ name, platform: target.platform, arch: target.arch, size: bytes.length,
      sha512: createHash('sha512').update(bytes).digest('base64'), url: `https://github.com/${repository}/releases/download/${identity.tag}/${name}` });
  }
  artifacts.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const metadata = { schemaVersion: 1, version: identity.version, tag: identity.tag, commit: identity.commit,
    createdAt: '2026-09-06T00:00:00Z', channel: 'preview', prerelease: true, ota: false,
    productionSigningVerified: false, osSigning: 'unverified', repository: RELEASE_CONFIG.repository, artifacts };
  await writeFile(join(directory, 'release-metadata.json'), JSON.stringify(metadata));
  const checksums = [...artifacts.map((file) => `${Buffer.from(file.sha512, 'base64').toString('hex')}  ${file.name}`),
    `${Buffer.from(await sha512(join(directory, 'release-metadata.json')), 'base64').toString('hex')}  release-metadata.json`];
  await writeFile(join(directory, 'SHA512SUMS'), `${checksums.join('\n')}\n`);
  const subjects = [];
  for (const name of [...artifacts.map((file) => file.name), 'release-metadata.json', 'SHA512SUMS']) {
    subjects.push({ name, digest: { sha256: createHash('sha256').update(await readFile(join(directory, name))).digest('hex') } });
  }
  // Synthetic signatures exercise file validation only, never cryptographic CLI verification.
  const statement = { _type: 'https://in-toto.io/Statement/v1', predicateType: 'https://slsa.dev/provenance/v1', subject: subjects,
    predicate: { runDetails: { metadata: { invocationId: `https://github.com/${repository}/actions/runs/${runId}/attempts/1` } } } };
  const bundle = { dsseEnvelope: { payloadType: 'application/vnd.in-toto+json', signatures: [{ sig: 'fixture-only' }], payload: Buffer.from(JSON.stringify(statement)).toString('base64') } };
  await writeFile(join(directory, 'attestation.json'), JSON.stringify(bundle));
  return { directory, metadata, bundle, statement };
}

test('preview publication validates all binaries, exact identity, checksums and attestation subjects', async (t) => {
  const { directory } = await previewFixture(t);
  const result = await validatePreviewPublication(directory, identity, { runId });
  assert.equal(result.expected.length, 9);
  assert.equal(result.metadata.artifacts.length, 6);
  assert.equal(result.metadata.ota, false);
  await assert.rejects(validatePreviewPublication(directory, { ...identity, commit: 'b'.repeat(40) }), /exact release identity/);
  await assert.rejects(validatePreviewPublication(directory, identity, { runId: '999' }), /another workflow run/);
});

test('preview rejects changed policy, wrong platform identity, external URLs and missing architectures', async (t) => {
  const { directory, metadata } = await previewFixture(t);
  for (const change of [
    { ota: true }, { osSigning: 'verified' }, { productionSigningVerified: true }, { channel: 'stable' },
    { artifacts: metadata.artifacts.slice(1) }, { artifacts: [...metadata.artifacts, metadata.artifacts[0]] },
    { artifacts: metadata.artifacts.map((file, index) => index === 0 ? { ...file, url: 'https://example.invalid/download' } : file) },
    { artifacts: metadata.artifacts.map((file, index) => index === 0 ? { ...file, arch: 'arm64' } : file) },
  ]) {
    await writeFile(join(directory, 'release-metadata.json'), JSON.stringify({ ...metadata, ...change }));
    await assert.rejects(validatePreviewPublication(directory, identity));
  }
});

test('preview rejects tampered bytes, updater feeds, changed checksum lists and stale provenance', async (t) => {
  const { directory, metadata, bundle, statement } = await previewFixture(t);
  const binary = join(directory, metadata.artifacts[0].name);
  const bytes = await readFile(binary);
  await writeFile(binary, Buffer.alloc(bytes.length, 0));
  await assert.rejects(validatePreviewPublication(directory, identity), /checksum mismatch/);
  await writeFile(binary, bytes);
  await writeFile(join(directory, 'latest.yml'), 'unexpected feed');
  await assert.rejects(validatePreviewPublication(directory, identity), /unexpected public files/);
  await rm(join(directory, 'latest.yml'));
  const sums = await readFile(join(directory, 'SHA512SUMS'), 'utf8');
  await writeFile(join(directory, 'SHA512SUMS'), `${sums}extra`);
  await assert.rejects(validatePreviewPublication(directory, identity), /SHA512SUMS/);
  await writeFile(join(directory, 'SHA512SUMS'), sums);
  statement.subject[0].digest.sha256 = '0'.repeat(64);
  bundle.dsseEnvelope.payload = Buffer.from(JSON.stringify(statement)).toString('base64');
  await writeFile(join(directory, 'attestation.json'), JSON.stringify(bundle));
  await assert.rejects(validatePreviewPublication(directory, identity), /attestation digest mismatch/);
  statement.subject.pop();
  bundle.dsseEnvelope.payload = Buffer.from(JSON.stringify(statement)).toString('base64');
  await writeFile(join(directory, 'attestation.json'), JSON.stringify(bundle));
  await assert.rejects(validatePreviewPublication(directory, identity), /complete published file set/);
});

test('preview notes preserve generated changes and add the signing/OTA notice once', () => {
  const changelog = '## 0.1.1\n\n### Bug Fixes\n\n* Preserve saved lessons.\n';
  const notes = previewReleaseNotes(changelog);
  assert.ok(notes.startsWith(changelog.trimEnd()));
  assert.match(notes, /OTA is disabled/);
  assert.match(notes, /Windows installers are unsigned/);
  assert.equal(previewReleaseNotes(notes), notes);
});

async function publisherFixture(t) {
  const directory = await temporaryDirectory(t);
  await writeFile(join(directory, 'installer.exe'), 'verified bytes');
  const state = { draft: { id: 1, draft: true, tag_name: identity.tag, target_commitish: identity.commit, assets: [], body: 'Generated changelog' },
    bytes: new Map(), mutations: [], tag: identity.commit, anonymous: true, corrupt: false, tagReads: 0 };
  const api = async (path, options = {}) => {
    if (path.startsWith('/git/matching-refs/')) {
      state.tagReads++;
      return [{ ref: `refs/tags/${identity.tag}`, object: { type: 'commit', sha: state.tag } }];
    }
    assert.equal(path, '/releases/1');
    if (options.method === 'PATCH') {
      const fields = JSON.parse(options.body);
      state.mutations.push({ method: 'PATCH', fields });
      Object.assign(state.draft, fields);
    } else state.onRead?.();
    return structuredClone(state.draft);
  };
  const request = async (url, options = {}) => {
    if (options.method === 'HEAD') {
      assert.equal(options.headers, undefined, 'public verification must carry no token');
      return new Response(null, { status: state.anonymous ? 200 : 404 });
    }
    if (options.method === 'POST') {
      const name = new URL(url).searchParams.get('name');
      const chunks = [];
      for await (const chunk of options.body) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      const asset = { id: 10 + state.draft.assets.length, name, size: bytes.length };
      state.mutations.push({ method: 'POST', name });
      state.draft.assets.push(asset);
      state.bytes.set(asset.id, state.corrupt ? Buffer.alloc(bytes.length, 0) : bytes);
      return Response.json(asset);
    }
    const id = Number(url.split('/').at(-1));
    return new Response(state.bytes.get(id));
  };
  const publish = () => publishAssets({ directory, identity, expected: ['installer.exe'],
    releaseFields: { prerelease: true, make_latest: 'false', body: previewReleaseNotes }, token: 'test-token',
    api, request, getDraft: async () => structuredClone(state.draft), wait: async () => {} });
  return { state, publish };
}

test('immutable publisher uploads verified bytes once, preserves notes and verifies anonymous access', async (t) => {
  const { state, publish } = await publisherFixture(t);
  await publish();
  assert.deepEqual(state.mutations.map((entry) => entry.method), ['POST', 'PATCH']);
  assert.equal(state.draft.draft, false);
  assert.equal(state.draft.prerelease, true);
  assert.equal(state.draft.make_latest, 'false');
  assert.ok(state.draft.body.startsWith('Generated changelog'));
  assert.equal(state.tagReads, 2);
  await assert.rejects(publish(), /publication state changed/);
  assert.equal(state.mutations.length, 2);
});

test('immutable publisher reuses only identical draft bytes and rejects unknown assets before mutation', async (t) => {
  const { state, publish } = await publisherFixture(t);
  state.draft.assets.push({ id: 10, name: 'installer.exe', size: 14 });
  state.bytes.set(10, Buffer.from('different data'));
  await assert.rejects(publish(), /Conflicting draft asset/);
  assert.equal(state.mutations.length, 0);
  state.bytes.set(10, Buffer.from('verified bytes'));
  state.draft.assets.push({ id: 11, name: 'extra.exe', size: 1 });
  await assert.rejects(publish(), /extra or duplicate assets/);
  assert.equal(state.mutations.length, 0);
  state.draft.assets.pop();
  await publish();
  assert.deepEqual(state.mutations.map((entry) => entry.method), ['PATCH']);
});

test('immutable publisher stops on changed draft tags, target commits or materialized tags', async (t) => {
  const { state, publish } = await publisherFixture(t);
  state.draft.tag_name = 'v9.9.9';
  await assert.rejects(publish(), /Draft tag/);
  state.draft.tag_name = identity.tag;
  state.draft.target_commitish = 'b'.repeat(40);
  await assert.rejects(publish(), /Draft tag/);
  state.draft.target_commitish = identity.commit;
  state.tag = 'b'.repeat(40);
  await assert.rejects(publish(), /tag points to another commit/);
  assert.equal(state.mutations.length, 0);
});

test('immutable publisher checks changing draft state and uploaded bytes before publication', async (t) => {
  const { state, publish } = await publisherFixture(t);
  state.onRead = () => { state.draft.draft = false; };
  await assert.rejects(publish(), /publication state changed/);
  assert.equal(state.mutations.length, 0);
  state.onRead = undefined;
  state.draft.draft = true;
  state.corrupt = true;
  await assert.rejects(publish(), /Uploaded bytes differ/);
  assert.deepEqual(state.mutations.map((entry) => entry.method), ['POST']);
  assert.equal(state.draft.draft, true);
});

test('failed anonymous verification leaves the already public release intact', async (t) => {
  const { state, publish } = await publisherFixture(t);
  state.anonymous = false;
  await assert.rejects(publish(), /Release published, but anonymous availability verification failed/);
  assert.equal(state.draft.draft, false);
  assert.deepEqual(state.mutations.map((entry) => entry.method), ['POST', 'PATCH']);
});
