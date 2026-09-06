import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

/** Isolated Electron checks share one launcher, never the user's profile or lessons. */
export async function runDesktopSmoke(name) {
  if (!/^[a-z-]+$/.test(name)) throw new Error('Invalid smoke suite name');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const scratch = await mkdtemp(join(tmpdir(), `cubecroom-${name}-`));
  const report = join(root, '.cubeflow', 'reports', `${name}-qa`);
  await mkdir(report, { recursive: true });
  try {
    const response = await fetch('http://localhost:3000', { signal: AbortSignal.timeout(30_000) });
    if (!response.ok)
      throw new Error('Start the teacher dev server on port 3000 before this check.');
    const env = { ...process.env, CUBECROOM_QA_ROOT: scratch, CUBECROOM_QA_REPORT: report };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electron, [join(root, 'apps', 'desktop', 'e2e', `${name}.smoke.mjs`)], {
      cwd: scratch,
      env,
      stdio: 'inherit',
      windowsHide: true,
    });
    process.exitCode = await new Promise((resolveExit, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => resolveExit(code ?? 1));
    });
  } finally {
    if (dirname(resolve(scratch)) === resolve(tmpdir()))
      await rm(scratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    else {
      console.error('Unexpected test directory; cleanup skipped.');
      process.exitCode = 1;
    }
  }
}
