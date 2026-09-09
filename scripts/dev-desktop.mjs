import { context } from 'esbuild';
import { spawn } from 'node:child_process';
import { cp } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { once } from 'node:events';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const desktop = join(root, 'apps/desktop');
const require = createRequire(join(desktop, 'package.json'));
const electron = require('electron');
let child;
let stopping = false;
let timer;
let restarting = Promise.resolve();
const completed = new Set();
const failures = new Set();
const alias = Object.fromEntries(
  ['contracts', 'core', 'db', 'ai'].map((name) => [
    `@cubecroom/${name}`,
    join(root, `packages/${name}/src/index.ts`),
  ]),
);

async function stopChild() {
  if (!child || child.exitCode !== null) return;
  const current = child;
  const exited = once(current, 'exit');
  // IPC allows Electron to close its database and student process on all platforms.
  if (current.connected) current.send('cubecroom:dev-restart');
  else current.kill();
  await exited;
}
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    restarting = restarting
      .then(async () => {
        if (stopping || failures.size || completed.size !== 2) return;
        await stopChild();
        if (stopping) return;
        await cp(join(root, 'packages/db/migrations'), join(desktop, 'dist-app/migrations'), {
          recursive: true,
        });
        child = spawn(electron, ['.'], {
          cwd: desktop,
          stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
          // Electron is the teacher's visible application, not a background helper.
          windowsHide: false,
          env: { ...process.env, CUBECROOM_DEV_HOT_RELOAD: '1' },
        });
        child.on('error', (error) => console.error(error.message));
        console.log('Desktop updated. Teacher and student interfaces support hot reload.');
      })
      .catch((error) => console.error(error));
  }, 250);
}
const options = (name) => ({
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  alias,
  external: ['electron', 'better-sqlite3'],
  sourcemap: true,
  logLevel: 'warning',
  entryPoints: [join(desktop, 'src', name === 'main' ? 'main.ts' : 'preload.cts')],
  outfile: join(desktop, 'dist-app', `${name}.cjs`),
  ...(name === 'main'
    ? {
        define: { 'import.meta.url': '__cubecroomMetaUrl' },
        banner: {
          js: "const __cubecroomMetaUrl = require('node:url').pathToFileURL(__filename).href;",
        },
      }
    : {}),
  plugins: [
    {
      name: 'restart-desktop',
      setup(build) {
        build.onEnd((result) => {
          completed.add(name);
          if (result.errors.length) failures.add(name);
          else failures.delete(name);
          schedule();
        });
      },
    },
  ],
});
const contexts = await Promise.all(['main', 'preload'].map((name) => context(options(name))));
for (const ctx of contexts) await ctx.watch();
async function shutdown() {
  if (stopping) return;
  stopping = true;
  clearTimeout(timer);
  await stopChild();
  await Promise.all(contexts.map((ctx) => ctx.dispose()));
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
