import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDirectory = 'packages/ui/assets/brand';
const manifestPath = join(root, sourceDirectory, 'generated.json');
const inputs = [`${sourceDirectory}/mark-source.png`, `${sourceDirectory}/logo-source.png`, 'scripts/brand.mjs'];
const applications = ['teacher-ui', 'student-web', 'docs'];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function inputHashes() {
  return Object.fromEntries(await Promise.all(inputs.map(async (path) => {
    const bytes = await readFile(join(root, path));
    // Git checkout line endings must not invalidate identical recipes on another OS.
    return [path, digest(path.endsWith('.mjs') ? bytes.toString('utf8').replaceAll('\r\n', '\n') : bytes)];
  })));
}

/** Builds consume committed assets; checking them never loads image tooling or needs the network. */
export async function checkBrandAssets() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const sources = await inputHashes();
  if (manifest.schemaVersion !== 1 || JSON.stringify(manifest.inputs) !== JSON.stringify(sources)) {
    throw new Error('Brand sources changed. Run pnpm brand and commit the generated assets.');
  }
  const required = applications.flatMap((app) => [
    `apps/${app}/public/brand/mark.png`, `apps/${app}/public/brand/logo.png`,
    `apps/${app}/app/icon.png`, `apps/${app}/app/apple-icon.png`, `apps/${app}/app/favicon.ico`,
  ]).concat(['apps/desktop/build/icon.png', 'apps/desktop/build/icon.ico', 'apps/desktop/build/icon.icns']);
  for (const path of required) {
    if (!manifest.outputs[path] || digest(await readFile(join(root, path))) !== manifest.outputs[path]) {
      throw new Error(`Missing or stale brand asset: ${path}. Run pnpm brand.`);
    }
  }
  return required.length;
}

/** Explicit authoring command; resizing/encoding preserves the approved source artwork. */
async function generateBrandAssets() {
  const { default: sharp } = await import('sharp');
  // Reuse the portable ICO/ICNS converter shipped with the pinned electron-builder dependency.
  const require = createRequire(import.meta.url);
  const builderRequire = createRequire(require.resolve('electron-builder'));
  const { runIconsTool } = builderRequire('app-builder-lib/out/toolsets/icons.js');
  const mark = await readFile(join(root, sourceDirectory, 'mark-source.png'));
  const logo = await readFile(join(root, sourceDirectory, 'logo-source.png'));
  const metadata = await sharp(mark).metadata();
  if (!metadata.hasAlpha || metadata.width !== metadata.height || metadata.width < 1024) {
    throw new Error('The source mark must be a square transparent PNG of at least 1024 pixels.');
  }
  const outputs = {};
  async function emit(path, bytes) {
    const target = join(root, path);
    await mkdir(dirname(target), { recursive: true });
    let previous;
    try { previous = await readFile(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!previous?.equals(bytes)) await writeFile(target, bytes);
    outputs[path] = digest(bytes);
  }
  const resizeMark = (size) => sharp(mark).resize(size, size, { fit: 'contain' }).png({ compressionLevel: 9 }).toBuffer();
  const markPng = await resizeMark(512);
  const logoPng = await sharp(logo).resize(640, 640, { fit: 'inside' }).png({ compressionLevel: 9 }).toBuffer();
  // A white backing keeps the small teal browser icon visible in light and dark browser chrome.
  const faviconPng = await sharp(mark).resize(64, 64).flatten({ background: '#ffffff' }).png().toBuffer();
  const applePng = await sharp(mark).resize(180, 180).flatten({ background: '#ffffff' }).png().toBuffer();
  await emit('apps/desktop/build/icon.png', await resizeMark(1024));
  const outDir = join(root, 'apps/desktop/build');
  for (const format of ['ico', 'icns']) {
    await runIconsTool({ inputFile: join(outDir, 'icon.png'), outputFormat: format, outDir });
    const path = `apps/desktop/build/icon.${format}`;
    outputs[path] = digest(await readFile(join(root, path)));
  }
  const ico = await readFile(join(outDir, 'icon.ico'));
  for (const app of applications) {
    await emit(`apps/${app}/public/brand/mark.png`, markPng);
    await emit(`apps/${app}/public/brand/logo.png`, logoPng);
    await emit(`apps/${app}/app/icon.png`, faviconPng);
    await emit(`apps/${app}/app/apple-icon.png`, applePng);
    await emit(`apps/${app}/app/favicon.ico`, ico);
  }
  await writeFile(manifestPath, `${JSON.stringify({ schemaVersion: 1, inputs: await inputHashes(), outputs }, null, 2)}\n`);
  console.log(`Generated ${await checkBrandAssets()} brand assets for the website, classroom apps and desktop packages.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).some((arg) => arg !== '--check')) throw new Error('Usage: pnpm brand [--check]');
  if (process.argv.includes('--check')) console.log(`Verified ${await checkBrandAssets()} brand assets.`);
  else await generateBrandAssets();
}
