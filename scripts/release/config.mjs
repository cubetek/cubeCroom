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
    { id: 'win-arm64', platform: 'win32', arch: 'arm64', runner: 'windows-11-arm', targets: ['nsis'], extensions: ['.exe'] },
    { id: 'mac-x64', platform: 'darwin', arch: 'x64', runner: 'macos-15-intel', targets: ['dmg', 'zip'], extensions: ['.dmg', '.zip'] },
    { id: 'mac-arm64', platform: 'darwin', arch: 'arm64', runner: 'macos-15', targets: ['dmg', 'zip'], extensions: ['.dmg', '.zip'] },
    { id: 'linux-x64', platform: 'linux', arch: 'x64', runner: 'ubuntu-24.04', targets: ['AppImage'], extensions: ['.AppImage'] },
    { id: 'linux-arm64', platform: 'linux', arch: 'arm64', runner: 'ubuntu-24.04-arm', targets: ['AppImage'], extensions: ['.AppImage'] },
  ]),
});

/** Match electron-builder's configured artifact template on every native platform. */
export function releaseArtifactNames(target, version) {
  const os = { win32: 'win', darwin: 'mac', linux: 'linux' }[target.platform];
  if (!os) throw new Error(`Unsupported release artifact platform: ${target.platform}`);
  return target.extensions.map((extension) => RELEASE_CONFIG.artifactName
    .replace('${version}', version).replace('${os}', os).replace('${arch}', target.arch).replace('${ext}', extension.slice(1)));
}

/** Reader-facing architecture label, shared by the download page and the installation guide. */
export function releaseTargetArchitecture(target) {
  if (target.platform === 'darwin') return target.arch === 'arm64' ? 'Apple Silicon — شرائح M' : 'Intel — معمارية x64';
  if (target.arch === 'x64') return 'x64 — معالجات Intel وAMD';
  if (target.arch === 'arm64') return target.platform === 'win32' ? 'ARM64 — مثل أجهزة Snapdragon' : 'ARM64 — معالجات ARM';
  throw new Error(`No architecture label is configured for ${target.id}`);
}

/** A public verification key alone never activates updates in an unsigned build. */
export function releaseUpdateMode(env = process.env) {
  if (env.CUBECROOM_REQUIRE_SIGNING === '1' && env.CUBECROOM_PREVIEW_BUILD === '1') {
    throw new Error('Preview installers cannot use the production signing mode');
  }
  return env.CUBECROOM_REQUIRE_SIGNING === '1' ? 'signed' : 'disabled';
}

export function packagedReleaseConfig(env = process.env) {
  return { ...RELEASE_CONFIG, updateMode: releaseUpdateMode(env) };
}

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

/**
 * electron-builder's own unpacked folder. Its computeAppOutDir appends `-<arch>` only for a
 * non-default architecture (x64), and `-unpacked` everywhere except macOS: ARM64 builds land in
 * `win-arm64-unpacked` and `linux-arm64-unpacked`, never in the x64 folder names.
 */
export function packagedApplicationPaths(outDirectory, target = currentReleaseTarget()) {
  const key = { win32: 'win', darwin: 'mac', linux: 'linux' }[target.platform];
  if (!key) throw new Error(`Unsupported packaged platform: ${target.platform}`);
  const folder = `${key}${target.arch === 'x64' ? '' : `-${target.arch}`}${target.platform === 'darwin' ? '' : '-unpacked'}`;
  const appOutDirectory = join(outDirectory, folder);
  return { appOutDirectory, ...packagedRuntimePaths(appOutDirectory, target.platform) };
}
