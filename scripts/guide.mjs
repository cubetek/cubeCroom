import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COPY, SECTIONS, GETTING_STARTED, GUIDE_INDEX, ARTICLES } from './guide-copy.mjs';
import { renderGuide } from './guide/render.mjs';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'apps/docs');
const content = join(site, 'content/docs');
const catalogFile = join(root, 'scripts/guide/screens.json');
const catalog = JSON.parse(readFileSync(catalogFile, 'utf8'));
const args = process.argv.slice(2);
if (args.some(arg => !['--check', '--refresh-screens'].includes(arg)) || args.length > 1) {
  throw new Error('Use pnpm guide, pnpm guide --check, or pnpm guide --refresh-screens.');
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function verifyImage(bytes, view, name) {
  const { info } = await sharp(bytes, { failOn: 'warning' }).raw().toBuffer({ resolveWithObject: true });
  if (info.width !== view.width || info.height !== view.height) {
    throw new Error(`Screenshot dimensions do not match capture metadata: ${name}`);
  }
}
const readText = file => readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
const writeChanged = (file, value) => {
  if (existsSync(file) && readText(file) === value) return;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, value);
};

// New screenshots must come from a real visual run. Partial runs update only their recorded screens.
if (args.includes('--refresh-screens')) {
  const shots = join(root, 'apps/desktop/screenshots');
  const notes = join(shots, 'notes.json');
  if (!existsSync(notes)) throw new Error('Run pnpm e2e to capture screenshots before using --refresh-screens.');
  const updates = await Promise.all(JSON.parse(readFileSync(notes, 'utf8')).map(async step => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(step.name)) throw new Error('Invalid screenshot name.');
    const input = resolve(shots, step.file);
    const inside = relative(shots, input);
    if (inside.startsWith('..') || isAbsolute(inside)) throw new Error('Screenshot path is outside the visual run.');
    const bytes = readFileSync(input);
    await verifyImage(bytes, step.view, step.name);
    return { input, screen: {
      slug: step.name, title: step.title, device: step.device, src: `/screens/${step.name}.png`,
      view: step.view, marks: step.notes, sha256: digest(bytes),
    } };
  }));
  for (const { input, screen } of updates) {
    const index = catalog.screens.findIndex(existing => existing.slug === screen.slug);
    if (index === -1) catalog.screens.push(screen); else catalog.screens[index] = screen;
    copyFileSync(input, join(site, 'public', screen.src));
  }
  writeChanged(catalogFile, JSON.stringify(catalog, null, 2) + '\n');
}

// A clean clone can regenerate the guide from its checked-in pictures without local QA artifacts.
for (const screen of catalog.screens) {
  if (screen.src !== `/screens/${screen.slug}.png` || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(screen.slug)) throw new Error('Invalid guide screenshot path.');
  const bytes = readFileSync(join(site, 'public', screen.src));
  await verifyImage(bytes, screen.view, screen.slug);
  if (digest(bytes) !== screen.sha256) throw new Error(`Screenshot changed without its capture metadata: ${screen.slug}`);
}
const files = renderGuide({
  screens: catalog.screens, copy: COPY, articles: ARTICLES, sections: SECTIONS,
  introductions: {
    index: GUIDE_INDEX,
    pages: [{ slug: 'getting-started', section: 'start', title: 'قبل أول حصة — ماذا تحتاج؟', body: GETTING_STARTED }],
  },
});
function generatedFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return generatedFiles(file);
    return entry.isFile() && (entry.name.endsWith('.mdx') || entry.name === 'meta.json') ? [file] : [];
  });
}
const stale = generatedFiles(content).filter(file => !files.has(relative(content, file).replaceAll('\\', '/')));
if (args.includes('--check')) {
  const changed = [...files].filter(([file, body]) => !existsSync(join(content, file)) || readText(join(content, file)) !== body);
  if (changed.length || stale.length) throw new Error('Guide output is stale. Run pnpm guide and include the generated pages.');
} else {
  for (const [file, body] of files) writeChanged(join(content, file), body);
  // Only generated Markdown/metadata inside this exact output directory can be removed.
  for (const file of stale) {
    const inside = relative(content, resolve(file));
    if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error('Refusing to remove a file outside generated docs.');
    rmSync(file);
  }
}
console.log(`${args.includes('--check') ? 'Checked' : 'Generated'} ${[...files.keys()].filter(file => file.endsWith('.mdx')).length} guide pages; ${catalog.screens.length} retained screenshots.`);
