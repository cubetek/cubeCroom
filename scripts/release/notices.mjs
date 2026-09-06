import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const slash = (value) => value.replaceAll('\\', '/');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const legalName = /^(?:(?:unlicense|licen[cs]e|notice|copying|copyright)(?:s)?(?:$|[._-])|(?:third[-_ ]?party).*(?:notice|licen[cs]e))|(?:^|[._-])licen[cs]e(?:$|\.)|\.LEGAL\.txt$/i;
const sourceName = /\.(?:[cm]?js|[cm]?ts|tsx|jsx|c|h|cc|cpp|py|rs)$/i;
const readmeName = /^readme(?:\.|$)/i;
const isLegalFile = (name) => legalName.test(name) && !/\.(?:[cm]?js|[cm]?ts|map|node|exe|dll)$/i.test(name);

function pnpm(root, args) {
  const runner = process.env.npm_execpath;
  const result = runner
    ? spawnSync(process.execPath, [runner, ...args], { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
    // These arguments are fixed in this module; the Windows shell only resolves the installed pnpm shim.
    : spawnSync('pnpm', args, { cwd: root, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`pnpm ${args.join(' ')} failed: ${result.error ?? result.stderr}`);
  return result.stdout.replace(/^\uFEFF/, '');
}

/** pnpm's hoisted layout can report virtual paths; inspect actual nested node_modules too. No dependency graph is inferred. */
async function installedPackages(root, listedPaths) {
  const directories = new Set();
  const visited = new Set();
  async function visitModules(directory) {
    if (!existsSync(directory)) return;
    const actual = await realpath(directory);
    if (visited.has(actual)) return;
    visited.add(actual);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const location = join(directory, entry.name);
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (entry.name.startsWith('@')) {
        for (const name of await readdir(location)) await visitPackage(join(location, name));
      } else await visitPackage(location);
    }
  }
  async function visitPackage(directory) {
    if (!existsSync(join(directory, 'package.json'))) return;
    const actual = await realpath(directory);
    const metadata = JSON.parse(await readFile(join(actual, 'package.json'), 'utf8'));
    if (!metadata.name?.startsWith('@cubecroom/')) directories.add(actual);
    await visitModules(join(actual, 'node_modules'));
  }
  await visitModules(join(root, 'node_modules'));
  for (const location of listedPaths) {
    if (!existsSync(join(location, 'package.json'))) continue;
    if (slash(location).includes('/node_modules/')) await visitPackage(location);
    else await visitModules(join(location, 'node_modules'));
  }
  return [...directories].sort();
}

/** Preserve upstream legal files verbatim, including vendored Next.js notices and inline copyright blocks. */
export async function collectPackageNotices(directory, metadata) {
  const files = [];
  const inline = new Map();
  const rootEntries = await readdir(directory);
  const rootLegal = rootEntries.some(isLegalFile);
  async function walk(location, legalDirectory = false) {
    for (const entry of await readdir(location, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.isSymbolicLink()) continue;
      const path = join(location, entry.name);
      const local = slash(relative(directory, path));
      // The runtime already ships separately, byte for byte, including Chromium's large notice bundle.
      if (metadata.name === 'electron' && local === 'dist') continue;
      if (entry.isDirectory()) { await walk(path, legalDirectory || isLegalFile(entry.name)); continue; }
      if (legalDirectory || isLegalFile(entry.name) || (!rootLegal && location === directory && readmeName.test(entry.name))) {
        files.push({ path: local, bytes: await readFile(path) });
      } else if (sourceName.test(entry.name) && (!rootLegal || local.startsWith('dist/compiled/') || metadata.name === 'better-sqlite3')) {
        const source = await readFile(path, 'utf8');
        for (const match of source.matchAll(/\/\*[\s\S]*?\*\/|(?:^|\n)(?:[ \t]*\/\/[^\n]*(?:\n|$))+/g)) {
          if (!/copyright|@license|@preserve|SPDX-License-Identifier/i.test(match[0])) continue;
          const text = match[0];
          const key = digest(text);
          const notice = inline.get(key) ?? { text, paths: [] };
          notice.paths.push(local);
          inline.set(key, notice);
        }
      }
    }
  }
  await walk(directory);
  if (!rootLegal) files.push({ path: 'package.json', bytes: await readFile(join(directory, 'package.json')) });
  for (const notice of inline.values()) {
    files.push({ path: `Inline notices from ${[...new Set(notice.paths)].sort().join(', ')}`, bytes: Buffer.from(notice.text) });
  }
  return { rootLegal, files: files.sort((a, b) => a.path.localeCompare(b.path)) };
}

export async function assertNoUnusedImageLibraries(resources) {
  const paths = await readdir(join(resources, 'standalone'), { recursive: true });
  if (paths.some((path) => /(?:^|\/)node_modules\/(?:sharp(?:\/|$)|@img\/sharp-[^/]+(?:\/|$))/.test(slash(path)))) {
    throw new Error('Unused Sharp native libraries were included in the standalone server');
  }
}

export async function generateNotices({ root, destination, resources }) {
  const rawInventory = JSON.parse(pnpm(root, ['licenses', 'list', '--json', '--long']));
  const listed = pnpm(root, ['list', '-r', '--parseable', '--depth', 'Infinity']).trim().split(/\r?\n/);
  const declared = new Map();
  for (const [license, entries] of Object.entries(rawInventory)) {
    for (const item of entries) for (const version of item.versions) declared.set(`${item.name}@${version}`, license);
  }
  const paths = await installedPackages(root, listed);
  const standardDirectory = join(root, 'docs', 'legal', 'spdx-license-texts');
  const standards = JSON.parse(await readFile(join(standardDirectory, 'sources.json'), 'utf8'));
  const standardIds = new Set(standards.files.map((file) => file.id));
  const components = new Map();
  const retained = new Map();
  const chunks = [
    'CubeCroom third-party notices\n',
    'Scope: a conservative inventory of all dependencies installed for this build, including development and optional dependencies. Inclusion is not a claim that a package ships in the application.\n',
    'Original LICENSE, NOTICE, copyright files, bundled notices and available inline notices follow. For packages without a root legal file, original README and package metadata are retained too.\n',
    'Full standard SPDX texts are appended separately. Their template copyright placeholders are not component copyright claims. They supplement, and never replace, original component notices. License declarations and unknown values are retained as supplied; this inventory makes no license compatibility or rights determination.\n',
    'Electron/Chromium notices are in ../electron/. Font originals are in ../third-party-licenses/. Sharp and @img/sharp-* are build dependencies only: excluded from the shipped standalone server.\n',
  ];
  for (const directory of paths) {
    const metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    const id = `${metadata.name}@${metadata.version}`;
    const license = declared.get(id) ?? (typeof metadata.license === 'string' ? metadata.license : metadata.license?.type) ?? 'Unknown';
    const component = components.get(id) ?? {
      name: metadata.name, version: metadata.version, declaredLicense: license,
      repository: metadata.repository ?? null, author: metadata.author ?? null,
      scope: metadata.name === 'sharp' || metadata.name.startsWith('@img/sharp-') ? 'build dependency; excluded from shipped application' : 'installed dependency; may include bundled code or build tooling',
      locations: [], notices: [],
    };
    const location = slash(relative(root, directory));
    if (isAbsolute(location) || location.startsWith('..')) throw new Error(`Installed package lies outside the workspace: ${metadata.name}`);
    component.locations.push(location);
    const notices = await collectPackageNotices(directory, metadata);
    if (!notices.rootLegal) component.originalRootLegalFile = false;
    if (!components.has(id)) chunks.push(`\n${'='.repeat(80)}\n${id}\nDeclared license: ${license}\nScope: ${component.scope}\nRepository: ${JSON.stringify(component.repository)}\nAuthor: ${JSON.stringify(component.author)}\n`);
    for (const notice of notices.files) {
      if (notice.bytes.length === 0) continue;
      const hash = digest(notice.bytes);
      const key = `${id}:${hash}`;
      component.notices.push({ source: `${location}/${notice.path}`, sha256: hash });
      if (retained.has(key)) continue;
      retained.set(key, true);
      chunks.push(`\n--- ${id}: ${notice.path} ---\n${notice.bytes.toString('utf8')}\n`);
    }
    const ids = license.match(/[A-Za-z0-9][A-Za-z0-9.+-]*/g) ?? [];
    const missingTexts = ids.filter((value) => !['AND', 'OR', 'WITH', 'Unknown'].includes(value) && !standardIds.has(value));
    if (missingTexts.length) throw new Error(`Add full standard license texts for ${id}: ${missingTexts.join(', ')}`);
    component.standardLicenseTexts = ids.filter((value) => standardIds.has(value));
    components.set(id, component);
  }
  for (const file of standards.files) {
    const bytes = await readFile(join(standardDirectory, file.file));
    if (digest(bytes) !== file.sha256) throw new Error(`SPDX source text changed: ${file.id}`);
    chunks.push(`\n${'='.repeat(80)}\nStandard license text: ${file.id}\nSource: ${file.source}\n\n${bytes.toString('utf8')}\n`);
  }
  if (resources) await assertNoUnusedImageLibraries(resources);
  const text = chunks.join('');
  const inventory = {
    schemaVersion: 1, generator: 'pnpm licenses list --json --long; pnpm list -r --parseable --depth Infinity; installed file notices',
    scope: 'All installed workspace dependencies, including development and optional dependencies; not a shipped-only dependency graph or a legal conclusion.',
    platform: process.platform, arch: process.arch,
    lockfileSha256: digest(await readFile(join(root, 'pnpm-lock.yaml'))),
    noticeFile: 'THIRD-PARTY-NOTICES.txt', noticeSha256: digest(text),
    standardLicenseSources: standards,
    components: [...components.values()].sort((a, b) => `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`)),
  };
  await mkdir(destination, { recursive: true });
  await writeFile(join(destination, inventory.noticeFile), text);
  await writeFile(join(destination, 'inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`);
  console.log(`Third-party notices: ${inventory.components.length} components, ${retained.size} original texts, ${standards.files.length} standard license texts (${Buffer.byteLength(text)} bytes).`);
  return inventory;
}

export async function assertNotices(directory) {
  const inventory = JSON.parse(await readFile(join(directory, 'inventory.json'), 'utf8'));
  if (inventory.schemaVersion !== 1 || inventory.noticeFile !== 'THIRD-PARTY-NOTICES.txt' || !inventory.components?.length
    || inventory.components.some((component) => !component.name || !component.version || !component.notices?.length)) {
    throw new Error('Third-party notice inventory is missing component notices');
  }
  const notice = await readFile(join(directory, inventory.noticeFile));
  if ((await stat(join(directory, inventory.noticeFile))).size === 0 || digest(notice) !== inventory.noticeSha256) {
    throw new Error('Third-party notice bundle is missing or changed');
  }
  return inventory;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const destination = join(root, 'apps', 'desktop', 'out-notices');
  await generateNotices({ root, destination });
  await assertNotices(destination);
}
