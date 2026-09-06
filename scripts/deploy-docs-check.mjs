import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--url')) {
  throw new Error('Usage: node scripts/deploy-docs-check.mjs [--url https://your-site.example]');
}

const searchIndex = (text) => {
  const index = JSON.parse(text);
  assert.equal(index.type, 'advanced', 'Expected the static Fumadocs search index');
};

if (args[0] === '--url') {
  const base = new URL(args[1]);
  assert(['https:', 'http:'].includes(base.protocol), 'Use an HTTP(S) site URL');
  const routes = ['/', '/docs/', '/docs/start/getting-started/', '/download/', '/changelog/', '/api/search', '/brand/mark.png', '/favicon.ico'];
  await Promise.all(routes.map(async (route) => {
    const response = await fetch(new URL(route, base), { signal: AbortSignal.timeout(30_000) });
    assert.equal(response.status, 200, `${route}: HTTP ${response.status}`);
    if (route === '/api/search') searchIndex(await response.text());
    else if (route.endsWith('/')) assert.match(response.headers.get('content-type') ?? '', /text\/html/, route);
    if (!response.bodyUsed) await response.body?.cancel();
  }));
  const missing = await fetch(new URL('/__cubecroom_nonexistent_page__/', base), { signal: AbortSignal.timeout(30_000) });
  assert.equal(missing.status, 404, 'Missing pages must return HTTP 404, not a successful SPA fallback');
  await missing.body?.cancel();
  console.log(`Checked ${routes.length} public routes and HTTP 404 at ${base.origin}.`);
} else {
  const output = join(root, 'apps/docs/out');
  const isFile = (file) => existsSync(file) && statSync(file).isFile();
  const files = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  });
  for (const file of ['index.html', 'docs/index.html', 'download/index.html', 'changelog/index.html', '404.html', 'api/search', 'brand/mark.png', 'brand/logo.png', 'favicon.ico']) {
    assert(isFile(join(output, file)), `Missing static output: ${file}`);
  }
  searchIndex(readFileSync(join(output, 'api/search'), 'utf8'));
  const htmlFiles = files(output).filter((file) => file.endsWith('.html'));
  const references = new Set();
  for (const file of htmlFiles) {
    const name = relative(output, file).replaceAll('\\', '/');
    assert(name === '404.html' || name.endsWith('index.html'), `Expected directory index for clean route: ${name}`);
    const html = readFileSync(file, 'utf8');
    for (const [, value] of html.matchAll(/(?:href|src)="(\/[^"\s]*)"/g)) {
      if (value.startsWith('//')) continue;
      const pathname = decodeURIComponent(new URL(value.replaceAll('&amp;', '&'), 'https://docs.invalid').pathname);
      references.add(pathname);
    }
  }
  for (const pathname of references) {
    const file = join(output, pathname);
    assert(isFile(file) || isFile(join(file, 'index.html')), `Unresolved local page or asset: ${pathname}`);
  }
  console.log(`Checked ${htmlFiles.length} exported HTML pages, ${references.size} local links/assets, static search, brand assets, and 404.html.`);
}
