import { execFileSync } from 'node:child_process';

// Packaged smoke runs Electron under a virtual display. GitHub's Ubuntu 24.04 ARM64 partner image does not
// list xvfb, although the first ARM64 run found it installed, as on x64. Install only what is missing, so an
// image that already provides the packages is left untouched and no other host setting changes.
if (process.platform !== 'linux' || process.env.GITHUB_ACTIONS !== 'true') {
  throw new Error('Linux runtime preparation is restricted to the GitHub Actions Linux runner.');
}

// xvfb-run needs xauth to create the display cookie; install both rather than rely on recommends.
const required = ['xvfb', 'xauth'];

function installed(name) {
  try {
    return execFileSync('dpkg-query', ['-W', '--showformat=${db:Status-Status}', name], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000,
    }).trim() === 'installed';
  } catch {
    return false;
  }
}

const missing = required.filter((name) => !installed(name));
if (missing.length === 0) {
  console.log(`Linux virtual display packages already present: ${required.join(', ')}.`);
} else {
  execFileSync('sudo', ['-n', 'apt-get', 'update'], { stdio: 'inherit', timeout: 300_000 });
  execFileSync('sudo', ['-n', 'env', 'DEBIAN_FRONTEND=noninteractive', 'apt-get', 'install', '-y', '--no-install-recommends', ...missing],
    { stdio: 'inherit', timeout: 600_000 });
  const absent = required.filter((name) => !installed(name));
  if (absent.length) throw new Error(`Linux virtual display packages are still missing: ${absent.join(', ')}`);
  console.log(`Installed the missing Linux virtual display packages: ${missing.join(', ')}.`);
}
