import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { draftRelease, github, repository, requireValue, root, sha512 } from './common.mjs';

/** Shared publication boundary for native-signed releases and explicitly unsigned previews. */
export async function requirePublicPublisher(env = process.env) {
  if (env.GITHUB_REPOSITORY !== repository || env.GITHUB_REF !== 'refs/heads/main') throw new Error('Publishing is restricted to the official main workflow.');
  if (env.RELEASE_PUBLIC_PUBLISH_ENABLED !== 'true') throw new Error('Public publishing is disabled.');
  if ((await readFile(resolve(root, 'LICENSE'), 'utf8')).trim().length === 0) throw new Error('The distribution LICENSE must not be empty.');
  if ((await github('')).private) throw new Error('Public no-account downloads require a public repository; this workflow never changes visibility.');
}

function assertDraft(draft, identity, expected) {
  if (!draft?.draft || draft.tag_name !== identity.tag || draft.target_commitish !== identity.commit) {
    throw new Error('Draft tag, target or publication state changed; publication stopped.');
  }
  if (!Array.isArray(draft.assets) || new Set(draft.assets.map((asset) => asset.name)).size !== draft.assets.length
    || draft.assets.some((asset) => !expected.includes(asset.name))) throw new Error('Draft contains extra or duplicate assets; publication stopped.');
}

async function assertTag(identity, api) {
  const refs = await api(`/git/matching-refs/tags/${encodeURIComponent(identity.tag)}`);
  const matching = refs.find((ref) => ref.ref === `refs/tags/${identity.tag}`);
  if (!matching) return; // Release Please drafts need not materialize a tag yet.
  let object = matching.object;
  for (let depth = 0; object.type === 'tag' && depth < 5; depth++) object = (await api(`/git/tags/${object.sha}`)).object;
  if (object.type !== 'commit' || object.sha !== identity.commit) throw new Error('Release tag points to another commit.');
}

/** Never delete or overwrite remote assets; retries may reuse only the same bytes. */
export async function publishAssets({ directory, expected, identity, releaseFields, api = github, getDraft = draftRelease,
  request = fetch, token = process.env.GH_TOKEN, wait = (milliseconds) => new Promise((done) => setTimeout(done, milliseconds)) }) {
  token = requireValue(token, 'GH_TOKEN');
  expected = [...expected].sort();
  if (!expected.length || new Set(expected).size !== expected.length
    || expected.some((name) => typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || basename(name) !== name)
    || JSON.stringify((await readdir(directory)).sort()) !== JSON.stringify(expected)) throw new Error('Assembled assets contain unexpected/missing files.');
  if (typeof releaseFields?.prerelease !== 'boolean' || !['true', 'false'].includes(releaseFields.make_latest)
    || Object.keys(releaseFields).some((key) => !['prerelease', 'make_latest', 'body'].includes(key))) throw new Error('Invalid release publication fields.');
  const localFiles = [];
  for (const name of expected) {
    const file = resolve(directory, name);
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) throw new Error('Only nonempty regular release files may be uploaded.');
    localFiles.push({ name, file, size: stat.size, checksum: await sha512(file) });
  }
  const draft = await getDraft(identity.tag);
  assertDraft(draft, identity, expected);
  await assertTag(identity, api);
  async function remoteHash(asset) {
    const response = await request(`https://api.github.com/repos/${repository}/releases/assets/${asset.id}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/octet-stream', 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!response.ok || !response.body) throw new Error(`Cannot verify uploaded asset ${asset.name}: ${response.status}`);
    const hash = createHash('sha512');
    for await (const chunk of response.body) hash.update(chunk);
    return hash.digest('base64');
  }
  // Reject an already conflicting draft before uploading any new files.
  for (const file of localFiles) {
    const existing = draft.assets.find((asset) => asset.name === file.name);
    if (existing && (existing.size !== file.size || await remoteHash(existing) !== file.checksum)) {
      throw new Error(`Conflicting draft asset: ${file.name}. Retry the original publish job with its original artifacts, or prepare a new release; no asset was overwritten.`);
    }
  }
  for (const file of localFiles) {
    if (draft.assets.some((asset) => asset.name === file.name)) continue;
    // GitHub offers no conditional upload transaction. Recheck its state before each mutation.
    const current = await api(`/releases/${draft.id}`);
    assertDraft(current, identity, expected);
    const concurrent = current.assets.find((asset) => asset.name === file.name);
    if (concurrent) {
      if (concurrent.size === file.size && await remoteHash(concurrent) === file.checksum) continue;
      throw new Error(`Conflicting draft asset: ${file.name}; no asset was overwritten.`);
    }
    const response = await request(`https://uploads.github.com/repos/${repository}/releases/${draft.id}/assets?name=${encodeURIComponent(file.name)}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream', 'Content-Length': String(file.size), 'X-GitHub-Api-Version': '2022-11-28' },
      body: createReadStream(file.file), duplex: 'half',
    });
    if (!response.ok) throw new Error(`Asset upload failed for ${file.name}: ${response.status}`);
    if (await remoteHash(await response.json()) !== file.checksum) throw new Error(`Uploaded bytes differ: ${file.name}`);
  }
  const complete = await api(`/releases/${draft.id}`);
  assertDraft(complete, identity, expected);
  if (JSON.stringify(complete.assets.map((asset) => asset.name).sort()) !== JSON.stringify(expected)) throw new Error('Draft is missing release assets; publication stopped.');
  await assertTag(identity, api);
  const fields = { ...releaseFields, draft: false };
  // Resolve the latest notes at publication, preserving Release Please's generated changelog.
  if (typeof fields.body === 'function') fields.body = fields.body(complete.body ?? '');
  await api(`/releases/${draft.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) });
  // A published release is not hidden or overwritten if its anonymous checks fail.
  for (const name of expected) {
    let ok = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await request(`https://github.com/${repository}/releases/download/${identity.tag}/${name}`, { method: 'HEAD' });
      if (response.ok) { ok = true; break; }
      await wait(2000 * (attempt + 1));
    }
    if (!ok) throw new Error(`Release published, but anonymous availability verification failed for ${name}. Investigate without overwriting the release.`);
  }
  console.log(`Published ${identity.tag}; every asset is accessible without authentication.`);
}
