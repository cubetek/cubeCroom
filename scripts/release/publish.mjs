import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { RELEASE_CONFIG } from './config.mjs';
import { distributionDocuments } from './manifest.mjs';
import { draftRelease, github, readJson, releaseIdentity, repository, requireValue, root, sha512 } from './common.mjs';

const identity = releaseIdentity(process.env.RELEASE_TAG, process.env.RELEASE_COMMIT);
if (process.env.GITHUB_REPOSITORY !== repository || process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('Publishing is restricted to the official main workflow.');
if (process.env.RELEASE_PUBLIC_PUBLISH_ENABLED !== 'true') throw new Error('Public publishing is disabled.');
if ((await readFile(resolve(root, 'LICENSE'), 'utf8')).trim().length === 0) throw new Error('The distribution LICENSE must not be empty.');
if ((await github('')).private) throw new Error('Public no-account downloads require a public repository; this workflow never changes visibility.');
const directory = resolve(root, process.env.RELEASE_ASSEMBLED_DIR ?? 'dist/release-assembled');
const envelope = await readJson(resolve(directory, 'cubecroom-release.json'));
const { verifyReleaseManifest, verifyReleaseFile } = await import('@cubecroom/core');
const payload = verifyReleaseManifest(envelope, await readJson(resolve(root, 'scripts/release/trust.json')), { repository: RELEASE_CONFIG.repository, version: identity.version, channel: identity.channel });
if (payload.commit !== identity.commit) throw new Error('Signed manifest commit mismatch.');
for (const file of payload.files) await verifyReleaseFile(resolve(directory, file.name), file);
for (const [name, expectedText] of Object.entries(distributionDocuments(payload))) {
  if (await readFile(resolve(directory, name), 'utf8') !== expectedText) throw new Error(`Download documentation does not match the signed manifest: ${name}`);
}
const expected = [...payload.files.map((file) => file.name), 'cubecroom-release.json', 'downloads.json', 'SHA512SUMS'].sort();
const actual = (await readdir(directory)).sort();
if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('Assembled assets contain unexpected/missing files.');
const draft = await draftRelease(identity.tag);
if (draft.target_commitish !== identity.commit) throw new Error('Draft target changed after build.');
const token = requireValue(process.env.GH_TOKEN, 'GH_TOKEN');
async function remoteHash(asset) {
  const response = await fetch(`https://api.github.com/repos/${repository}/releases/assets/${asset.id}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/octet-stream', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!response.ok || !response.body) throw new Error(`Cannot verify uploaded asset ${asset.name}: ${response.status}`);
  const hash = createHash('sha512');
  for await (const chunk of response.body) hash.update(chunk);
  return hash.digest('base64');
}
for (const name of expected) {
  const file = resolve(directory, name);
  const stat = await lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Only regular release files may be uploaded.');
  const checksum = await sha512(file);
  let existing = draft.assets.find((asset) => asset.name === name);
  if (existing && existing.size === stat.size && await remoteHash(existing) === checksum) continue;
  if (existing) {
    // Never delete assets: GitHub has no atomic "delete only while draft" operation.
    // Retrying the publish job reuses the same build artifacts and normally matches above.
    throw new Error(`Conflicting draft asset: ${name}. Retry the original publish job with its original artifacts, or prepare a new release; no asset was overwritten.`);
  }
  const response = await fetch(`https://uploads.github.com/repos/${repository}/releases/${draft.id}/assets?name=${encodeURIComponent(name)}`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream', 'Content-Length': String(stat.size), 'X-GitHub-Api-Version': '2022-11-28' },
    body: createReadStream(file), duplex: 'half',
  });
  if (!response.ok) throw new Error(`Asset upload failed for ${name}: ${response.status}`);
  existing = await response.json();
  if (await remoteHash(existing) !== checksum) throw new Error(`Uploaded bytes differ: ${name}`);
}
const complete = await github(`/releases/${draft.id}`);
if (!complete.draft || complete.target_commitish !== identity.commit || JSON.stringify(complete.assets.map((asset) => asset.name).sort()) !== JSON.stringify(expected)) throw new Error('Draft changed or contains extra assets; publication stopped.');
await github(`/releases/${draft.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft: false, prerelease: identity.channel === 'beta', make_latest: identity.channel === 'stable' ? 'true' : 'false' }) });
// A public release is irreversible here: failed public checks report a failure, never hide/replace it.
for (const name of expected) {
  let ok = false;
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(`https://github.com/${repository}/releases/download/${identity.tag}/${name}`, { method: 'HEAD' });
    if (response.ok) { ok = true; break; }
    await new Promise((done) => setTimeout(done, 2000 * (attempt + 1)));
  }
  if (!ok) throw new Error(`Release published, but anonymous availability verification failed for ${name}. Investigate without overwriting the release.`);
}
console.log(`Published ${identity.tag}; every asset is accessible without authentication.`);
