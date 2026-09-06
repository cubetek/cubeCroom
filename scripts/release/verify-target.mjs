import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdtemp, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { RELEASE_CONFIG, packagedApplicationPaths } from './config.mjs';
import { inspectTarget } from './assets.mjs';
import { releaseIdentity, requireValue, root } from './common.mjs';

const identity = releaseIdentity(process.env.RELEASE_TAG, process.env.RELEASE_COMMIT);
const target = RELEASE_CONFIG.targets.find((entry) => entry.id === process.env.RELEASE_TARGET);
if (!target || target.platform !== process.platform || target.arch !== process.arch) throw new Error('Target and runner do not match.');
const directory = resolve(requireValue(process.env.CUBECROOM_OUT_DIR, 'CUBECROOM_OUT_DIR'));
const { files } = await inspectTarget(directory, target, identity);
if (target.platform === 'win32') {
  for (const file of files.filter((entry) => entry.name.endsWith('.exe'))) {
    // No interpolated path/script: PowerShell gets the path and expected CN through environment.
    // Use the runner's PowerShell 7 and let it construct its own module path. Inheriting
    // a different PowerShell edition's PSModulePath can prevent the security module loading.
    const signingEnvironment = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toLowerCase() !== 'psmodulepath'));
    execFileSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; $signature=Get-AuthenticodeSignature -LiteralPath $env:CUBECROOM_SIGNED_ASSET; if ($signature.Status -ne 'Valid') { throw ('Installer Authenticode signature is not valid: ' + $signature.Status) }; $name=$signature.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false); if ($name -cne $env:CUBECROOM_WINDOWS_PUBLISHER_NAME) { throw 'Installer publisher does not match expected identity' }; if ($null -eq $signature.TimeStamperCertificate) { throw 'Installer signature has no trusted timestamp' }"], {
      cwd: root, stdio: 'inherit', env: { ...signingEnvironment, CUBECROOM_SIGNED_ASSET: resolve(directory, file.name) },
    });
  }
} else if (target.platform === 'darwin') {
  for (const file of files.filter((entry) => entry.name.endsWith('.dmg'))) {
    const path = resolve(directory, file.name);
    const mount = await mkdtemp(join(tmpdir(), 'cubecroom-dmg-'));
    let mounted = false;
    try {
      execFileSync('hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, path], { stdio: 'inherit' });
      mounted = true;
      const app = join(mount, 'CubeCroom.app');
      execFileSync('xcrun', ['stapler', 'validate', app], { stdio: 'inherit' });
      execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' });
      execFileSync('spctl', ['--assess', '--type', 'execute', '--verbose', app], { stdio: 'inherit' });
    } finally {
      if (mounted) execFileSync('hdiutil', ['detach', mount], { stdio: 'inherit' });
      await rmdir(mount);
    }
  }
  const app = join(packagedApplicationPaths(directory, target).appOutDirectory, `${RELEASE_CONFIG.productName}.app`);
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' });
  execFileSync('spctl', ['--assess', '--type', 'execute', '--verbose', app], { stdio: 'inherit' });
}
console.log(`Artifact integrity and available platform signature checks passed for ${target.id}; A-to-B acceptance is not implied.`);
