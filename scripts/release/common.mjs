import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, appendFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RELEASE_CONFIG } from './config.mjs';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const repository = `${RELEASE_CONFIG.repository.owner}/${RELEASE_CONFIG.repository.repo}`;
export const requireValue = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`);
  return value;
};
export const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
export function releaseIdentity(tag, commit) {
  if (typeof tag !== 'string' || tag.trim() !== tag || !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.(0|[1-9]\d*))?$/.test(tag)) throw new Error('Expected vMAJOR.MINOR.PATCH or vMAJOR.MINOR.PATCH-beta.N.');
  if (!/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error('A full lowercase commit SHA is required.');
  return { tag, version: tag.slice(1), commit, channel: tag.includes('-beta.') ? 'beta' : 'stable' };
}
export async function sha512(path) {
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('base64');
}
export async function output(name, value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (/[\r\n]/.test(text)) throw new Error('Workflow outputs must be single-line.');
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${name}=${text}\n`);
  else console.log(`${name}=${text}`);
}
export async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${requireValue(process.env.GH_TOKEN, 'GH_TOKEN')}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error(`GitHub ${options.method ?? 'GET'} ${path}: ${response.status}`);
  return response.status === 204 ? null : response.json();
}
export async function draftRelease(tag) {
  // Listing includes drafts for the authenticated publisher; a draft may have no tag ref yet.
  for (let page = 1; page <= 10; page++) {
    const releases = await github(`/releases?per_page=100&page=${page}`);
    const found = releases.find((release) => release.tag_name === tag);
    if (found) {
      if (!found.draft) throw new Error(`${tag} is already published; create a new version instead.`);
      return found;
    }
    if (releases.length < 100) break;
  }
  throw new Error(`No draft release for ${tag}. Resume requires an existing draft.`);
}
