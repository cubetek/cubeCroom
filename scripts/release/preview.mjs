import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentReleaseTarget, RELEASE_CONFIG, releasePaths } from './config.mjs';
import { output, readJson, releaseIdentity, root, sha512 } from './common.mjs';

export function previewIdentity(tag, commit, productVersion, desktopVersion = productVersion) {
  const identity = releaseIdentity(tag, commit);
  if (identity.version !== productVersion || identity.version !== desktopVersion || identity.channel !== 'stable') {
    throw new Error('Preview tag must be v<root and desktop package.version>, without changing the product version.');
  }
  return identity;
}

async function emptyOutput(directory) {
  await mkdir(directory, { recursive: true });
  if ((await readdir(directory)).length) throw new Error('Preview output must be empty to exclude stale files.');
}

async function installerEvidence(directory, target, identity) {
  const name = `preview-install-checks-${target.platform}-${target.arch}.json`;
  const evidence = await readJson(join(directory, name));
  if (evidence.schemaVersion !== 1 || evidence.version !== identity.version || evidence.sourceCommit !== identity.commit
    || evidence.platform !== target.platform || evidence.arch !== target.arch || evidence.installerVerified !== true
    || evidence.productionSigningVerified !== false || !Array.isArray(evidence.checks) || evidence.checks.length === 0) {
    throw new Error(`Preview installer evidence is incomplete for ${target.id}.`);
  }
  return name;
}

/** Keep builder metadata and package evidence inside the build artifact, never the public preview. */
export async function collectPreviewTarget(input, destination, target, identity) {
  const { inspectTarget } = await import('./assets.mjs');
  const checked = await inspectTarget(input, target, identity);
  const installerReport = await installerEvidence(input, target, identity);
  await emptyOutput(destination);
  for (const file of checked.files.filter((file) => file.kind !== 'blockmap')) {
    await copyFile(join(input, file.name), join(destination, file.name));
  }
  for (const name of [checked.metadataFile, `packaging-checks-${target.platform}-${target.arch}.json`, installerReport]) {
    await copyFile(join(input, name), join(destination, name));
  }
  await writeFile(join(destination, 'preview-target.json'), `${JSON.stringify({
    schemaVersion: 1, ...identity, target: target.id, productionSigningVerified: false,
  }, null, 2)}\n`);
}

/** Revalidate all four builds, then expose only six binaries, metadata and checksums. */
export async function assemblePreview(input, destination, identity, createdAt) {
  const { inspectTarget } = await import('./assets.mjs');
  if (typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt))) throw new Error('Expected an ISO preview creation time.');
  const directories = RELEASE_CONFIG.targets.map((target) => `preview-target-${target.id}`).sort();
  if (JSON.stringify((await readdir(input)).sort()) !== JSON.stringify(directories)) {
    throw new Error('Preview assembly requires exactly the configured platform builds.');
  }
  const artifacts = [];
  for (const target of RELEASE_CONFIG.targets) {
    const directory = join(input, `preview-target-${target.id}`);
    const evidence = await readJson(join(directory, 'preview-target.json'));
    if (evidence.schemaVersion !== 1 || evidence.target !== target.id || evidence.tag !== identity.tag
      || evidence.version !== identity.version || evidence.commit !== identity.commit || evidence.productionSigningVerified !== false) {
      throw new Error(`Preview build identity mismatch: ${target.id}`);
    }
    const checked = await inspectTarget(directory, target, identity);
    await installerEvidence(directory, target, identity);
    for (const { name, size, sha512: digest, platform, arch, url, kind } of checked.files) {
      if (kind !== 'blockmap') artifacts.push({ name, size, sha512: digest, platform, arch, url, directory });
    }
  }
  if (new Set(artifacts.map((file) => file.name)).size !== artifacts.length) throw new Error('Duplicate preview artifact.');
  artifacts.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  await emptyOutput(destination);
  for (const artifact of artifacts) await copyFile(join(artifact.directory, artifact.name), join(destination, artifact.name));
  const metadata = {
    schemaVersion: 1, channel: 'preview', prerelease: true,
    version: identity.version, tag: identity.tag, commit: identity.commit, createdAt,
    repository: RELEASE_CONFIG.repository,
    productionSigningVerified: false, osSigning: 'unverified', ota: false,
    artifacts: artifacts.map(({ name, size, sha512: digest, platform, arch, url }) => ({ name, size, sha512: digest, platform, arch, url })),
  };
  const metadataName = 'release-metadata.json';
  await writeFile(join(destination, metadataName), `${JSON.stringify(metadata, null, 2)}\n`);
  const checksums = [
    ...metadata.artifacts.map((file) => `${Buffer.from(file.sha512, 'base64').toString('hex')}  ${file.name}`),
    `${Buffer.from(await sha512(join(destination, metadataName)), 'base64').toString('hex')}  ${metadataName}`,
  ];
  await writeFile(join(destination, 'SHA512SUMS'), `${checksums.join('\n')}\n`);
  return metadata;
}

async function main() {
  const product = await readJson(join(root, 'package.json'));
  const desktop = await readJson(join(root, 'apps/desktop/package.json'));
  const identity = previewIdentity(process.env.RELEASE_TAG || `v${product.version}`, process.env.RELEASE_COMMIT, product.version, desktop.version);
  const actualCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (actualCommit !== identity.commit) throw new Error('Preview must use the exact workflow commit.');
  const command = process.argv[2];
  if (command === 'configure') {
    await output('matrix', { include: RELEASE_CONFIG.targets });
    await output('tag', identity.tag);
    await output('commit', identity.commit);
    await output('created-at', execFileSync('git', ['show', '-s', '--format=%cI', identity.commit], { cwd: root, encoding: 'utf8' }).trim());
  } else if (command === 'collect') {
    const target = currentReleaseTarget();
    const paths = releasePaths(root);
    const input = process.env.CUBECROOM_OUT_DIR === undefined ? paths.outDirectory : resolve(paths.appDirectory, process.env.CUBECROOM_OUT_DIR);
    await collectPreviewTarget(input, join(root, 'dist/preview-target'), target, identity);
  } else if (command === 'assemble') {
    const metadata = await assemblePreview(join(root, 'dist/preview-input'), join(root, 'dist/preview-release'), identity, process.env.PREVIEW_CREATED_AT);
    console.log(`Prepared ${metadata.artifacts.length} preview binaries for ${identity.tag}; OS signing is unverified and OTA is disabled.`);
  } else throw new Error('Expected configure, collect or assemble.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
