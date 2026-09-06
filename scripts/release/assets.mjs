import { copyFile, lstat, mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { readFile } from 'node:fs/promises';
import { parse, stringify } from 'yaml';
import { RELEASE_CONFIG, releaseArtifactNames } from './config.mjs';
import { readJson, repository, sha512 } from './common.mjs';

export function metadataName(platform, channel) {
  const prefix = channel === 'stable' ? 'latest' : 'beta';
  return `${prefix}${platform === 'darwin' ? '-mac' : platform === 'linux' ? '-linux' : ''}.yml`;
}
const safeName = (value) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) && basename(value) === value;
export function validateMetadata(metadata, identity, files) {
  if (metadata?.version !== identity.version || !Array.isArray(metadata.files) || metadata.files.length === 0) throw new Error('Missing or mismatched updater metadata.');
  const seen = new Set();
  for (const file of metadata.files) {
    if (!safeName(file.url) || seen.has(file.url)) throw new Error('Unsafe or duplicate metadata filename.');
    seen.add(file.url);
    const actual = files.find((entry) => entry.name === file.url);
    if (!actual || file.sha512 !== actual.sha512 || file.size !== actual.size) throw new Error(`Metadata checksum/size mismatch: ${file.url}`);
  }
  if (metadata.path != null) {
    const legacy = files.find((entry) => entry.name === metadata.path);
    if (!legacy || metadata.sha512 !== legacy.sha512) throw new Error('Legacy metadata path/checksum mismatch.');
  }
  return metadata;
}

export async function inspectTarget(directory, target, identity, { requireReport = true } = {}) {
  const expectedNames = releaseArtifactNames(target, identity.version);
  const metadataFile = metadataName(target.platform, identity.channel);
  const files = [];
  for (const name of await readdir(directory)) {
    // Builder's debug/config/unpacked output is not a distributable asset.
    if (!expectedNames.includes(name) && !expectedNames.some((expected) => name === `${expected}.blockmap`)) {
      if (/^CubeCroom-.*\.(?:exe|zip|dmg|AppImage)(?:\.blockmap)?$/.test(name)) throw new Error(`Unexpected/stale release artifact: ${name}`);
      continue;
    }
    const path = resolve(directory, name);
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size >= 2 * 1024 ** 3) throw new Error(`Invalid release artifact: ${name}`);
    files.push({ name, size: stat.size, sha512: await sha512(path), platform: target.platform, arch: target.arch,
      kind: name.endsWith('.blockmap') ? 'blockmap' : name.endsWith('.zip') ? 'updater' : 'installer',
      url: `https://github.com/${repository}/releases/download/${identity.tag}/${name}` });
  }
  for (const name of expectedNames) if (!files.some((file) => file.name === name)) throw new Error(`Missing required artifact: ${name}`);
  const metadataPath = resolve(directory, metadataFile);
  const metadataStat = await lstat(metadataPath);
  if (!metadataStat.isFile() || metadataStat.isSymbolicLink() || metadataStat.size > 1024 * 1024) throw new Error('Invalid metadata file.');
  const metadata = validateMetadata(parse(await readFile(metadataPath, 'utf8')), identity, files);
  const updaterSuffix = target.platform === 'darwin' ? '.zip' : target.platform === 'win32' ? '.exe' : '.AppImage';
  if (!metadata.files.some((file) => file.url.endsWith(updaterSuffix))) throw new Error('Required updater asset missing from metadata.');
  if (requireReport) {
    const report = await readJson(resolve(directory, `packaging-checks-${target.platform}-${target.arch}.json`));
    if (report.schemaVersion !== 1 || report.version !== identity.version || report.platform !== target.platform || report.arch !== target.arch || report.resourcesValidated !== true || report.nativeSqliteVerified !== true) throw new Error(`Packaging evidence is incomplete for ${target.id}.`);
  }
  return { files, metadata, metadataFile };
}

export async function assembleAssets(input, output, identity) {
  await mkdir(output, { recursive: true });
  if ((await readdir(output)).length !== 0) throw new Error('Assembly output must be empty to exclude stale release files.');
  const files = [];
  const metadataGroups = new Map();
  for (const target of RELEASE_CONFIG.targets) {
    const directory = resolve(input, target.id);
    const checked = await inspectTarget(directory, target, identity);
    for (const file of checked.files) {
      if (files.some((entry) => entry.name === file.name)) throw new Error(`Duplicate artifact across architectures: ${file.name}`);
      await copyFile(resolve(directory, file.name), resolve(output, file.name));
      files.push(file);
    }
    const group = metadataGroups.get(checked.metadataFile) ?? [];
    group.push({ ...checked, target });
    metadataGroups.set(checked.metadataFile, group);
  }
  for (const [name, group] of metadataGroups) {
    // Keep x64 legacy fields stable; modern updater selects the matching architecture from files.
    group.sort((a, b) => a.target.arch === 'x64' ? -1 : b.target.arch === 'x64' ? 1 : 0);
    const metadata = { ...group[0].metadata, files: group.flatMap((entry) => entry.metadata.files) };
    validateMetadata(metadata, identity, files);
    await writeFile(resolve(output, name), stringify(metadata));
    const stat = await lstat(resolve(output, name));
    files.push({ name, size: stat.size, sha512: await sha512(resolve(output, name)), platform: group[0].target.platform,
      arch: group.length > 1 ? 'universal' : group[0].target.arch, kind: 'metadata',
      url: `https://github.com/${repository}/releases/download/${identity.tag}/${name}` });
  }
  return files.sort((a, b) => a.name.localeCompare(b.name, 'en'));
}
