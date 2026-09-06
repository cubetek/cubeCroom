import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RELEASE_CONFIG, releaseArtifactNames } from './config.mjs';
import { readJson, releaseIdentity, repository, root, sha512 } from './common.mjs';
import { publishAssets, requirePublicPublisher } from './publish-assets.mjs';
import { publicationMode } from './version.mjs';

const previewNotice = '> **Preview release:** Windows installers are unsigned and macOS builds are ad-hoc signed, without Developer ID notarization. Operating-system security warnings may appear. OTA is disabled; install newer previews manually. SHA512SUMS and GitHub build provenance verify the published files and do not replace native publisher signing.';

export function previewReleaseNotes(notes) {
  return notes.includes(previewNotice) ? notes : `${notes.trimEnd()}\n\n---\n\n${previewNotice}\n`;
}

async function regularFile(directory, name, maximumSize = 2 * 1024 ** 3) {
  const path = resolve(directory, name);
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size >= maximumSize) throw new Error(`Invalid preview file: ${name}`);
  return stat;
}

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

/** Validate bytes and their attestation subjects; the CLI below verifies the Sigstore signature. */
export async function validatePreviewPublication(directory, identity, { runId } = {}) {
  if (identity.channel !== 'stable') throw new Error('Preview publication requires a plain product version tag.');
  await regularFile(directory, 'release-metadata.json', 1024 * 1024);
  const metadata = await readJson(resolve(directory, 'release-metadata.json'));
  if (metadata.schemaVersion !== 1 || metadata.version !== identity.version || metadata.tag !== identity.tag || metadata.commit !== identity.commit
    || metadata.channel !== 'preview' || metadata.prerelease !== true || metadata.ota !== false
    || metadata.productionSigningVerified !== false || metadata.osSigning !== 'unverified'
    || metadata.repository?.owner !== RELEASE_CONFIG.repository.owner || metadata.repository?.repo !== RELEASE_CONFIG.repository.repo
    || typeof metadata.createdAt !== 'string' || !Number.isFinite(Date.parse(metadata.createdAt)) || !Array.isArray(metadata.artifacts)) {
    throw new Error('Preview metadata does not match the exact release identity or unsigned/OTA-disabled policy.');
  }
  const binaries = RELEASE_CONFIG.targets.flatMap((target) => releaseArtifactNames(target, identity.version).map((name) => ({
    name,
    platform: target.platform, arch: target.arch,
  }))).sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const artifactNames = metadata.artifacts.map((file) => file.name);
  if (new Set(artifactNames).size !== artifactNames.length || JSON.stringify([...artifactNames].sort()) !== JSON.stringify(binaries.map((file) => file.name).sort())) {
    throw new Error('Preview requires the complete configured binary set with no duplicates or updater feeds.');
  }
  const expected = [...binaries.map((file) => file.name), 'release-metadata.json', 'SHA512SUMS', 'attestation.json'].sort();
  if (JSON.stringify((await readdir(directory)).sort()) !== JSON.stringify(expected)) throw new Error('Preview contains missing or unexpected public files.');
  const checksums = [];
  for (const binary of binaries) {
    const file = metadata.artifacts.find((artifact) => artifact.name === binary.name);
    const stat = await regularFile(directory, binary.name);
    const digest = await sha512(resolve(directory, binary.name));
    if (file.platform !== binary.platform || file.arch !== binary.arch || file.size !== stat.size || file.sha512 !== digest
      || file.url !== `https://github.com/${repository}/releases/download/${identity.tag}/${binary.name}`) throw new Error(`Preview binary metadata or checksum mismatch: ${binary.name}`);
    checksums.push(`${Buffer.from(digest, 'base64').toString('hex')}  ${binary.name}`);
  }
  checksums.push(`${Buffer.from(await sha512(resolve(directory, 'release-metadata.json')), 'base64').toString('hex')}  release-metadata.json`);
  await regularFile(directory, 'SHA512SUMS', 1024 * 1024);
  if (await readFile(resolve(directory, 'SHA512SUMS'), 'utf8') !== `${checksums.join('\n')}\n`) throw new Error('Preview SHA512SUMS does not match the complete public binary and metadata set.');

  await regularFile(directory, 'attestation.json', 16 * 1024 * 1024);
  const bundle = await readJson(resolve(directory, 'attestation.json'));
  if (bundle.dsseEnvelope?.payloadType !== 'application/vnd.in-toto+json' || typeof bundle.dsseEnvelope.payload !== 'string'
    || !bundle.dsseEnvelope.signatures?.length) throw new Error('Expected a Sigstore provenance bundle.');
  const statement = JSON.parse(Buffer.from(bundle.dsseEnvelope.payload, 'base64').toString('utf8'));
  const subjects = statement.subject;
  const attestedNames = expected.filter((name) => name !== 'attestation.json');
  if (statement._type !== 'https://in-toto.io/Statement/v1' || statement.predicateType !== 'https://slsa.dev/provenance/v1'
    || !Array.isArray(subjects) || new Set(subjects.map((subject) => subject.name)).size !== subjects.length
    || JSON.stringify(subjects.map((subject) => subject.name).sort()) !== JSON.stringify(attestedNames)) throw new Error('Preview provenance does not cover the complete published file set.');
  if (runId !== undefined) {
    if (!/^\d+$/.test(runId) || !new RegExp(`^https://github\\.com/${repository}/actions/runs/${runId}/attempts/[1-9]\\d*$`).test(statement.predicate?.runDetails?.metadata?.invocationId ?? '')) {
      throw new Error('Preview provenance belongs to another workflow run.');
    }
  }
  for (const subject of subjects) {
    if (subject.digest?.sha256 !== await sha256(resolve(directory, subject.name))) throw new Error(`Preview attestation digest mismatch: ${subject.name}`);
  }
  return { expected, metadata };
}

async function main() {
  const identity = releaseIdentity(process.env.RELEASE_TAG, process.env.RELEASE_COMMIT);
  await requirePublicPublisher();
  if (publicationMode(await readJson(resolve(root, '.github/release-policy.json'))) !== 'preview') throw new Error('The committed release policy does not authorize preview publication.');
  if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() !== identity.commit) throw new Error('Preview publisher must check out the exact release commit.');
  for (const path of ['package.json', 'apps/desktop/package.json']) {
    if ((await readJson(resolve(root, path))).version !== identity.version) throw new Error(`${path} does not match the preview release version.`);
  }
  if (!/^\d+$/.test(process.env.GITHUB_RUN_ID ?? '')) throw new Error('Preview provenance requires the current workflow run ID.');
  const directory = resolve(root, process.env.RELEASE_ASSEMBLED_DIR ?? 'dist/preview-release');
  const { expected } = await validatePreviewPublication(directory, identity, { runId: process.env.GITHUB_RUN_ID });
  // The original SHA512SUMS is attested, so attestation.json remains ancillary to that list.
  // Workflow-definition identity can differ from the built commit on an exact-commit retry.
  execFileSync('gh', ['attestation', 'verify', resolve(directory, 'SHA512SUMS'), '--bundle', resolve(directory, 'attestation.json'),
    '--repo', repository, '--signer-workflow', `${repository}/.github/workflows/ci.yml`, '--source-ref', 'refs/heads/main', '--deny-self-hosted-runners'],
  { cwd: root, stdio: 'inherit' });
  await publishAssets({ directory, expected, identity, releaseFields: { prerelease: true, make_latest: 'false', body: previewReleaseNotes } });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
