import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RELEASE_CONFIG } from './config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const PUBLIC_LEGAL_DIRECTORIES = ['out-next/legal', 'standalone/apps/student-web/public/legal'];

function sourceLinks(commit) {
  if (commit !== null && (typeof commit !== 'string' || !/^[a-f0-9]{40}$/.test(commit))) throw new Error('Legal source commit must be a full Git SHA.');
  const repositoryUrl = `https://github.com/${RELEASE_CONFIG.repository.owner}/${RELEASE_CONFIG.repository.repo}`;
  return {
    commit,
    sourceUrl: commit ? `${repositoryUrl}/tree/${commit}` : repositoryUrl,
    sourceArchiveUrl: commit ? `${repositoryUrl}/archive/${commit}.zip` : null,
  };
}

const copyright = (pkg) => `Copyright (c) 2026 ${pkg.author.name} and contributors`;

/** The same local legal assets are served by Electron's static UI and the student portal. */
export async function writeLegalAssets(directory, { noticesFile } = {}) {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  let commit = null;
  try {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    if (!dirty && /^[a-f0-9]{40}$/.test(head)) commit = head;
  } catch { /* A local source checkout need not have Git metadata. */ }
  if (process.env.RELEASE_COMMIT && commit !== process.env.RELEASE_COMMIT) {
    throw new Error('Release source links require a clean checkout of RELEASE_COMMIT.');
  }
  const info = {
    version: pkg.version,
    license: pkg.license,
    copyright: copyright(pkg),
    ...sourceLinks(commit),
    licenseText: await readFile(join(root, 'LICENSE'), 'utf8'),
    noticesAvailable: Boolean(noticesFile),
  };
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'info.json'), `${JSON.stringify(info)}\n`);
  if (noticesFile) await cp(noticesFile, join(directory, 'notices.txt'));
}

/** Reused staging must still contain this release's original license, source links and notices. */
export async function assertLegalAssets(resources, { projectRoot = root, releaseCommit = process.env.RELEASE_COMMIT } = {}) {
  const pkg = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'));
  const license = await readFile(join(projectRoot, 'LICENSE'));
  if (!license.equals(await readFile(join(resources, 'legal', 'LICENSE')))) {
    throw new Error('Packaged LICENSE differs from the current source LICENSE.');
  }
  const notices = await readFile(join(resources, 'legal', 'dependencies', 'THIRD-PARTY-NOTICES.txt'));
  if (releaseCommit !== undefined) sourceLinks(releaseCommit);
  for (const directory of PUBLIC_LEGAL_DIRECTORIES) {
    const legal = JSON.parse(await readFile(join(resources, directory, 'info.json'), 'utf8'));
    const links = sourceLinks(releaseCommit ?? legal.commit);
    if (legal.version !== pkg.version || legal.license !== pkg.license || legal.licenseText !== license.toString('utf8')
      || legal.copyright !== copyright(pkg) || legal.noticesAvailable !== true
      || !notices.equals(await readFile(join(resources, directory, 'notices.txt')))) {
      throw new Error(`Packaged legal information differs from current source or notices: ${directory}`);
    }
    if (legal.commit !== links.commit || legal.sourceUrl !== links.sourceUrl || legal.sourceArchiveUrl !== links.sourceArchiveUrl) {
      throw new Error(`Packaged legal source links are stale or differ from RELEASE_COMMIT: ${directory}`);
    }
  }
}
