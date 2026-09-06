import { execFileSync } from 'node:child_process';
import { lstat, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { packagedApplicationPaths, releasePaths } from './config.mjs';
import { root } from './common.mjs';

// An unpacked Chromium helper needs installation permissions on Ubuntu runners.
// Configure that helper instead of disabling Chromium's process sandbox.
if (process.platform !== 'linux' || process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('Linux sandbox preparation is restricted to the GitHub Actions Linux runner.');
}
const paths = releasePaths(root);
const output = process.env.CUBECROOM_OUT_DIR === undefined
  ? paths.outDirectory : resolve(paths.appDirectory, process.env.CUBECROOM_OUT_DIR);
const helper = join(packagedApplicationPaths(output).appOutDirectory, 'chrome-sandbox');
if (!(await lstat(helper)).isFile() || await realpath(helper) !== helper) {
  throw new Error('Expected the regular chrome-sandbox file inside the unpacked application.');
}
for (const args of [
  ['-n', 'chown', '--no-dereference', 'root:root', helper],
  ['-n', 'chmod', '4755', helper],
]) execFileSync('sudo', args, { stdio: 'inherit', timeout: 10_000 });
const installed = await lstat(helper);
if (installed.uid !== 0 || (installed.mode & 0o7777) !== 0o4755) {
  throw new Error('The packaged Linux sandbox helper does not have the required owner and mode.');
}
console.log('Configured the packaged Linux SUID sandbox helper for the isolated runner smoke test.');
