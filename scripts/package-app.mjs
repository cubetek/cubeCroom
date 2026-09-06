import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, Platform, Arch } from 'electron-builder';
import { parse } from 'yaml';
import { createBuilderConfig } from '../apps/desktop/electron-builder.config.mjs';
import { currentReleaseTarget, packagedRuntimePaths, RELEASE_CONFIG, releasePaths } from './release/config.mjs';
import { verifyNative } from './rebuild-native.mjs';
import { assertNoUnusedImageLibraries, assertNotices } from './release/notices.mjs';
import { assertLegalAssets } from './release/legal-assets.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const paths = releasePaths(root);
const step = process.argv[2] ?? 'package';
if (!['make', 'package'].includes(step)) throw new Error('Expected package or make');
const target = currentReleaseTarget();
const outDirectory = process.env.CUBECROOM_OUT_DIR === undefined
  ? paths.outDirectory : resolve(paths.appDirectory, process.env.CUBECROOM_OUT_DIR);
// Builder clears its output children. Keep that operation inside a dedicated workspace output.
const inside = relative(root, outDirectory);
const forbidden = [root, paths.appDirectory, paths.stageDirectory, paths.stagedApp, paths.stagedResources];
if (!inside || inside.startsWith('..') || isAbsolute(inside) || forbidden.includes(outDirectory)
  || !relative(paths.stageDirectory, outDirectory).startsWith('..')) {
  throw new Error('CUBECROOM_OUT_DIR must be a dedicated directory inside this workspace, outside staging');
}
const stage = JSON.parse(await readFile(join(paths.stageDirectory, 'stage.json'), 'utf8'));
const product = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const desktop = JSON.parse(await readFile(join(paths.appDirectory, 'package.json'), 'utf8'));
if (stage.platform !== target.platform || stage.arch !== target.arch || stage.version !== product.version
  || desktop.version !== product.version || stage.electronVersion !== desktop.devDependencies.electron
  || stage.sqliteVersion !== desktop.dependencies['better-sqlite3']) {
  throw new Error('Staging does not match this host or the pinned versions; run bundle-desktop.mjs --stage');
}

const packed = [];
const config = await createBuilderConfig({
  root, outDirectory,
  afterPack: async (context) => {
    const { resources, executable } = packagedRuntimePaths(context.appOutDir, context.electronPlatformName);
    const checkedFiles = await assertResources(resources);
    packed.push({ resources, executable, checkedFiles });
  },
});

console.log(`Building ${product.version} for ${target.id} (${step}); publishing is disabled.`);
const artifacts = await build({
  projectDir: root,
  config,
  targets: Platform.current().createTarget(step === 'make' ? target.targets : ['dir'], Arch[target.arch]),
  // Never rely on builder's token/tag-sensitive defaults. Publication is a separate verified job.
  publish: 'never',
});
if (packed.length === 0) throw new Error('Builder returned no validated packaged application');
for (const output of packed) {
  if (step === 'make') {
    const feed = parse(await readFile(join(output.resources, 'app-update.yml'), 'utf8'));
    if (feed.provider !== 'github' || feed.owner !== RELEASE_CONFIG.repository.owner
      || feed.repo !== RELEASE_CONFIG.repository.repo || typeof feed.updaterCacheDirName !== 'string') {
      throw new Error('Packaged updater configuration does not match the official repository');
    }
    output.checkedFiles.push('app-update.yml');
  }
  // Run after builder signs the app, which matters on Apple Silicon. It also checks unsigned local builds.
  const native = verifyNative({
    runtime: 'electron', executable: output.executable,
    modulePath: join(output.resources, 'app.asar.unpacked', 'node_modules', 'better-sqlite3'),
  });
  const portalNative = verifyNative({
    runtime: 'electron', executable: output.executable,
    modulePath: join(output.resources, 'standalone', 'node_modules', 'better-sqlite3'),
  });
  if (native.electron !== stage.electronVersion || portalNative.electron !== stage.electronVersion) {
    throw new Error('Packaged executable has an unexpected Electron version');
  }
  await mkdir(outDirectory, { recursive: true });
  await writeFile(join(outDirectory, `packaging-checks-${target.platform}-${target.arch}.json`), `${JSON.stringify({
    schemaVersion: 1, version: product.version, electronVersion: stage.electronVersion,
    platform: target.platform, arch: target.arch, resourcesValidated: true,
    nativeSqliteVerified: true, checkedFiles: output.checkedFiles, native, portalNative,
  }, null, 2)}\n`);
}
console.log(`Packaged resources and both SQLite runtimes verified. Output: ${outDirectory}`);
for (const artifact of artifacts) console.log(artifact);

async function assertResources(resources) {
  const iconFiles = target.platform === 'win32' ? ['icon.png', 'icon.ico'] : ['icon.png'];
  const brandResources = [
    ...iconFiles.map(file => [file, join(paths.appDirectory, 'build', file)]),
    ...['mark.png', 'logo.png'].flatMap(file => [
      [`out-next/brand/${file}`, join(root, 'apps/teacher-ui/public/brand', file)],
      [`standalone/apps/student-web/public/brand/${file}`, join(root, 'apps/student-web/public/brand', file)],
    ]),
  ];
  const checkedFiles = [
    'app.asar',
    ...brandResources.map(([file]) => file),
    'out-next/index.html',
    'standalone/apps/student-web/server.js',
    `app.asar.unpacked/node_modules/better-sqlite3/prebuilds/${target.platform}-${target.arch}.node`,
    `standalone/node_modules/better-sqlite3/prebuilds/${target.platform}-${target.arch}.node`,
    'release-config.json', 'release-trust.json', 'legal/LICENSE', 'legal/COMMERCIAL-LICENSE.md',
    'legal/TRADEMARKS.md', 'legal/THIRD_PARTY_NOTICES.md',
    'legal/electron/LICENSE', 'legal/electron/LICENSES.chromium.html',
    'legal/dependencies/THIRD-PARTY-NOTICES.txt', 'legal/dependencies/inventory.json',
    'out-next/legal/info.json', 'out-next/legal/notices.txt',
    'standalone/apps/student-web/public/legal/info.json', 'standalone/apps/student-web/public/legal/notices.txt',
  ];
  for (const file of checkedFiles) {
    const info = await stat(join(resources, file));
    if (!info.isFile() || info.size === 0) throw new Error(`Missing packaged resource: ${file}`);
  }
  for (const [file, original] of brandResources) {
    const [source, packaged] = await Promise.all([
      readFile(original), readFile(join(resources, file)),
    ]);
    if (!source.equals(packaged)) throw new Error(`Packaged brand asset differs from source: ${file}; rebuild the apps and staging`);
  }
  for (const directory of ['migrations', 'legal/third-party-licenses', 'out-next/_next', 'standalone/apps/student-web/.next']) {
    if ((await readdir(join(resources, directory))).length === 0) throw new Error(`Empty packaged resource: ${directory}`);
    checkedFiles.push(`${directory}/`);
  }
  const identity = JSON.parse(await readFile(join(resources, 'release-config.json'), 'utf8'));
  if (identity.appId !== RELEASE_CONFIG.appId || identity.repository.owner !== RELEASE_CONFIG.repository.owner
    || identity.repository.repo !== RELEASE_CONFIG.repository.repo) throw new Error('Packaged release identity differs from source');
  const trust = JSON.parse(await readFile(join(resources, 'release-trust.json'), 'utf8'));
  if (!Array.isArray(trust.keys)) throw new Error('Invalid packaged update trust configuration');
  await assertNotices(join(resources, 'legal', 'dependencies'));
  await assertLegalAssets(resources);
  await assertNoUnusedImageLibraries(resources);
  return checkedFiles;
}
