import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { verifyNative } from './rebuild-native.mjs';
import { currentReleaseTarget, packagedReleaseConfig, RELEASE_CONFIG, releasePaths } from './release/config.mjs';
import { generateNotices } from './release/notices.mjs';
import { PUBLIC_LEGAL_DIRECTORIES, writeLegalAssets } from './release/legal-assets.mjs';
import { checkBrandAssets } from './brand.mjs';

await checkBrandAssets();

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const paths = releasePaths(root);
const stage = process.argv.includes('--stage');
const target = currentReleaseTarget();
const runtimeReleaseConfig = packagedReleaseConfig();
const app = paths.appDirectory;
const dist = join(app, 'dist-app');
const rootPackage = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const appPackage = JSON.parse(await readFile(join(app, 'package.json'), 'utf8'));
if (rootPackage.version !== appPackage.version) throw new Error('Root and desktop versions must match');

/** Only generated children of the desktop directory may be removed. */
async function removeGenerated(directory) {
  const inside = relative(app, resolve(directory));
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) {
    throw new Error(`Refusing to remove a path outside desktop build output: ${directory}`);
  }
  await rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
}

/** Copy only JavaScript, licensing and this target's shipped N-API binary. */
async function copyNative(destination) {
  const source = join(root, 'node_modules', 'better-sqlite3');
  const metadata = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'));
  if (metadata.version !== appPackage.dependencies['better-sqlite3']) {
    throw new Error('Installed SQLite version does not match the pinned desktop dependency');
  }
  await removeGenerated(destination);
  await mkdir(join(destination, 'prebuilds'), { recursive: true });
  await cp(join(source, 'lib'), join(destination, 'lib'), { recursive: true });
  const nativeName = `${target.platform}-${target.arch}.node`;
  await cp(join(source, 'prebuilds', nativeName), join(destination, 'prebuilds', nativeName));
  await cp(join(source, 'LICENSE'), join(destination, 'LICENSE'));
  // node-addon-api is a build dependency; the shipped prebuild has no JS dependency on it.
  const runtimeMetadata = { ...metadata };
  delete runtimeMetadata.dependencies;
  delete runtimeMetadata.devDependencies;
  delete runtimeMetadata.scripts;
  await writeFile(join(destination, 'package.json'), `${JSON.stringify(runtimeMetadata, null, 2)}\n`);
}

await removeGenerated(dist);
const common = {
  bundle: true, platform: 'node', format: 'cjs', target: 'node22',
  external: ['electron', 'better-sqlite3'], sourcemap: true, logLevel: 'warning',
};
// CommonJS crosses Electron's ASAR boundary; the sandboxed preload must have no __filename shim.
await build({
  ...common,
  entryPoints: [join(app, 'src', 'main.ts')],
  outfile: join(dist, 'main.cjs'),
  define: { 'import.meta.url': '__cubecroomMetaUrl' },
  banner: { js: "const __cubecroomMetaUrl = require('node:url').pathToFileURL(__filename).href;" },
});
await build({ ...common, entryPoints: [join(app, 'src', 'preload.cts')], outfile: join(dist, 'preload.cjs') });
await cp(join(root, 'packages', 'db', 'migrations'), join(dist, 'migrations'), { recursive: true });
if (!stage) await copyNative(join(app, 'node_modules', 'better-sqlite3'));
const electron = verifyNative({ runtime: 'electron', modulePath: join(root, 'node_modules', 'better-sqlite3') });

if (stage) {
  // Staging is isolated: packaging never rewrites the development standalone or root native binary.
  await removeGenerated(paths.stageDirectory);
  await mkdir(paths.stagedApp, { recursive: true });
  await mkdir(paths.stagedResources, { recursive: true });
  await cp(join(app, 'build', 'icon.png'), join(paths.stagedResources, 'icon.png'));
  if (target.platform === 'win32') {
    await cp(join(app, 'build', 'icon.ico'), join(paths.stagedResources, 'icon.ico'));
  }
  await cp(dist, join(paths.stagedApp, 'dist-app'), { recursive: true });
  await copyNative(join(paths.stagedApp, 'node_modules', 'better-sqlite3'));
  await writeFile(join(paths.stagedApp, 'package.json'), `${JSON.stringify({
    name: 'cubecroom', version: rootPackage.version, private: true,
    description: appPackage.description, author: rootPackage.author,
    main: 'dist-app/main.cjs', productName: RELEASE_CONFIG.productName,
    license: rootPackage.license,
    dependencies: { 'better-sqlite3': appPackage.dependencies['better-sqlite3'] },
  }, null, 2)}\n`);
  const resources = [
    ['apps/teacher-ui/out-next', 'out-next'],
    ['apps/student-web/.next/standalone', 'standalone'],
    ['packages/db/migrations', 'migrations'],
    ['docs/legal/third-party-licenses', 'legal/third-party-licenses'],
  ];
  for (const [source, destination] of resources) {
    const input = join(root, source);
    if ((await readdir(input)).length === 0) throw new Error(`Required build resource is empty: ${source}`);
    await cp(input, join(paths.stagedResources, destination), { recursive: true, dereference: true });
  }
  await copyNative(join(paths.stagedResources, 'standalone', 'node_modules', 'better-sqlite3'));
  for (const file of ['LICENSE', 'COMMERCIAL-LICENSE.md', 'TRADEMARKS.md', 'THIRD_PARTY_NOTICES.md']) {
    await cp(join(root, file), join(paths.stagedResources, 'legal', file));
  }
  await mkdir(join(paths.stagedResources, 'legal', 'electron'), { recursive: true });
  for (const file of ['LICENSE', 'LICENSES.chromium.html']) {
    await cp(join(root, 'node_modules', 'electron', 'dist', file), join(paths.stagedResources, 'legal', 'electron', file));
  }
  await generateNotices({ root, destination: join(paths.stagedResources, 'legal', 'dependencies'), resources: paths.stagedResources });
  const noticesFile = join(paths.stagedResources, 'legal', 'dependencies', 'THIRD-PARTY-NOTICES.txt');
  for (const directory of PUBLIC_LEGAL_DIRECTORIES) {
    await writeLegalAssets(join(paths.stagedResources, directory), { noticesFile });
  }
  await cp(join(root, 'LICENSE'), join(paths.stagedApp, 'LICENSE'));
  await cp(join(root, 'scripts', 'release', 'trust.json'), join(paths.stagedResources, 'release-trust.json'));
  await writeFile(join(paths.stagedResources, 'release-config.json'), `${JSON.stringify(runtimeReleaseConfig, null, 2)}\n`);
  await writeFile(join(paths.stageDirectory, 'stage.json'), `${JSON.stringify({
    version: rootPackage.version, platform: target.platform, arch: target.arch,
    updateMode: runtimeReleaseConfig.updateMode,
    electronVersion: electron.electron, sqliteVersion: appPackage.dependencies['better-sqlite3'],
  }, null, 2)}\n`);
  console.log(`Staged ${RELEASE_CONFIG.productName} ${rootPackage.version}: ${paths.stageDirectory}`);
}
console.log(`Electron ${electron.electron}: SQLite ${electron.sqlite}, transactions and backup verified.`);
