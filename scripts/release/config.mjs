import { join, resolve } from 'node:path';

/** Release identity and supported build matrix. Runtime receives a generated JSON copy. */
export const RELEASE_CONFIG = Object.freeze({
  appId: 'com.cubecroom.app',
  productName: 'CubeCroom',
  repository: Object.freeze({ owner: 'cubetek', repo: 'cubeCroom' }),
  channels: Object.freeze(['stable', 'beta']),
  artifactName: 'CubeCroom-${version}-${os}-${arch}.${ext}',
  targets: Object.freeze([
    { id: 'win-x64', platform: 'win32', arch: 'x64', runner: 'windows-2022', targets: ['nsis'], extensions: ['.exe'] },
    { id: 'mac-x64', platform: 'darwin', arch: 'x64', runner: 'macos-15-intel', targets: ['dmg', 'zip'], extensions: ['.dmg', '.zip'] },
    { id: 'mac-arm64', platform: 'darwin', arch: 'arm64', runner: 'macos-15', targets: ['dmg', 'zip'], extensions: ['.dmg', '.zip'] },
    { id: 'linux-x64', platform: 'linux', arch: 'x64', runner: 'ubuntu-24.04', targets: ['AppImage'], extensions: ['.AppImage'] },
  ]),
});

export function currentReleaseTarget(platform = process.platform, arch = process.arch) {
  const target = RELEASE_CONFIG.targets.find((entry) => entry.platform === platform && entry.arch === arch);
  if (!target) throw new Error(`No release target is configured for ${platform}/${arch}`);
  return target;
}

export function releasePaths(root) {
  const appDirectory = join(resolve(root), 'apps', 'desktop');
  const stageDirectory = join(appDirectory, 'out-stage');
  return {
    appDirectory,
    outDirectory: join(appDirectory, 'out'),
    stageDirectory,
    stagedApp: join(stageDirectory, 'app'),
    stagedResources: join(stageDirectory, 'resources'),
  };
}

export function packagedRuntimePaths(appOutDirectory, platform = process.platform) {
  if (platform === 'darwin') {
    const contents = join(appOutDirectory, `${RELEASE_CONFIG.productName}.app`, 'Contents');
    return { resources: join(contents, 'Resources'), executable: join(contents, 'MacOS', RELEASE_CONFIG.productName) };
  }
  return {
    resources: join(appOutDirectory, 'resources'),
    executable: join(appOutDirectory, `${RELEASE_CONFIG.productName}${platform === 'win32' ? '.exe' : ''}`),
  };
}

export function packagedApplicationPaths(outDirectory, target = currentReleaseTarget()) {
  const folder = target.platform === 'darwin' ? (target.arch === 'arm64' ? 'mac-arm64' : 'mac')
    : target.platform === 'win32' ? 'win-unpacked' : 'linux-unpacked';
  const appOutDirectory = join(outDirectory, folder);
  return { appOutDirectory, ...packagedRuntimePaths(appOutDirectory, target.platform) };
}
