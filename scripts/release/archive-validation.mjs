import { execFileSync } from 'node:child_process';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentReleaseTarget, packagedApplicationPaths, RELEASE_CONFIG, releasePaths } from './config.mjs';
import { readJson, releaseIdentity, requireValue, root, sha512 } from './common.mjs';

// Git Bash's GNU tar interprets a Windows drive-letter archive as a remote host.
// Use the OS-provided bsdtar on Windows, regardless of the caller's PATH order.
export const archiveTarCommand = process.platform === 'win32'
  ? join(requireValue(process.env.SystemRoot, 'SystemRoot'), 'System32', 'tar.exe') : 'tar';

/** Archive the complete unpacked app; tar preserves macOS symlinks and Unix executable bits. */
export async function createValidationArchive({ applicationDirectory, outputDirectory, target, version, commit }) {
  releaseIdentity(`v${version}`, commit);
  const input = resolve(applicationDirectory);
  const output = resolve(outputDirectory);
  const inside = relative(input, output);
  if (!inside || (!inside.startsWith('..') && !isAbsolute(inside))) throw new Error('Validation archive output must be outside the application directory.');
  if (!(await stat(input)).isDirectory()) throw new Error('Expected an unpacked application directory.');
  await mkdir(output, { recursive: true });
  if ((await readdir(output)).length) throw new Error('Validation archive output must be empty.');
  const name = `${RELEASE_CONFIG.productName}-${version}-${target.id}-validation.tar.gz`;
  const archive = join(output, name);
  execFileSync(archiveTarCommand, ['-czf', archive, '-C', dirname(input), basename(input)], { stdio: 'inherit', timeout: 300_000 });
  const checksum = await sha512(archive);
  const manifest = {
    schemaVersion: 1, purpose: 'validation-only', productionSigningVerified: false,
    version, commit, platform: target.platform, arch: target.arch,
    archive: name, size: (await stat(archive)).size, sha512: checksum,
  };
  await writeFile(join(output, 'validation.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(output, 'SHA512SUMS'), `${Buffer.from(checksum, 'base64').toString('hex')}  ${name}\n`);
  return manifest;
}

async function main() {
  const target = currentReleaseTarget();
  const paths = releasePaths(root);
  const output = process.env.CUBECROOM_OUT_DIR === undefined
    ? paths.outDirectory : resolve(paths.appDirectory, process.env.CUBECROOM_OUT_DIR);
  const pkg = await readJson(join(root, 'package.json'));
  const report = await readJson(join(output, `packaging-checks-${target.platform}-${target.arch}.json`));
  if (report.schemaVersion !== 1 || report.version !== pkg.version || report.platform !== target.platform
    || report.arch !== target.arch || report.resourcesValidated !== true || report.nativeSqliteVerified !== true) {
    throw new Error('Validation archives require matching successful packaging evidence.');
  }
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const manifest = await createValidationArchive({
    applicationDirectory: packagedApplicationPaths(output, target).appOutDirectory,
    outputDirectory: join(root, 'dist/validation'), target, version: pkg.version, commit,
  });
  console.log(`Created ${manifest.archive}: validation only; no production signature or public release is implied.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
