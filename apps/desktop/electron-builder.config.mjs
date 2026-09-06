import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { join } from 'node:path';
import { currentReleaseTarget, RELEASE_CONFIG, releasePaths } from '../../scripts/release/config.mjs';

/** A programmatic config avoids duplicating release identity in YAML and runtime. */
export async function createBuilderConfig({ root, outDirectory, afterPack }) {
  const paths = releasePaths(root);
  const buildResources = join(paths.appDirectory, 'build');
  const desktop = JSON.parse(await readFile(join(paths.appDirectory, 'package.json'), 'utf8'));
  const requireSigning = process.env.CUBECROOM_REQUIRE_SIGNING === '1';
  const preview = process.env.CUBECROOM_PREVIEW_BUILD === '1';
  if (preview && requireSigning) throw new Error('Preview installers cannot use the production signing mode');
  const publisherName = process.env.CUBECROOM_WINDOWS_PUBLISHER_NAME;
  if (requireSigning && process.platform === 'win32' && (!process.env.CSC_LINK || !publisherName)) {
    throw new Error('Official Windows builds require CSC_LINK and CUBECROOM_WINDOWS_PUBLISHER_NAME');
  }
  if (requireSigning && process.platform === 'darwin') {
    const notarization = (process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER)
      || (process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID)
      || (process.env.APPLE_KEYCHAIN && process.env.APPLE_KEYCHAIN_PROFILE);
    if (!process.env.CSC_LINK || !notarization) {
      throw new Error('Official macOS builds require CSC_LINK and notarization credentials');
    }
  }
  return {
    appId: RELEASE_CONFIG.appId,
    productName: RELEASE_CONFIG.productName,
    executableName: RELEASE_CONFIG.productName,
    electronVersion: desktop.devDependencies.electron,
    directories: { app: paths.stagedApp, output: outDirectory, buildResources },
    files: ['dist-app/**', 'package.json', 'LICENSE', 'node_modules/better-sqlite3/**'],
    asar: true,
    asarUnpack: ['node_modules/better-sqlite3/**'],
    extraResources: [{ from: paths.stagedResources, to: '.', filter: ['**/*'] }],
    // N-API is verified explicitly; builder must never rebuild the development tree.
    npmRebuild: false,
    nodeGypRebuild: false,
    forceCodeSigning: requireSigning && process.platform !== 'linux',
    artifactName: RELEASE_CONFIG.artifactName,
    publish: [{ provider: 'github', ...RELEASE_CONFIG.repository, private: false, releaseType: 'draft' }],
    win: {
      target: ['nsis'],
      icon: join(buildResources, 'icon.ico'),
      requestedExecutionLevel: 'asInvoker',
      verifyUpdateCodeSignature: true,
      ...(publisherName ? { signtoolOptions: { publisherName, signingHashAlgorithms: ['sha256'] } } : {}),
    },
    nsis: {
      installerIcon: join(buildResources, 'icon.ico'),
      uninstallerIcon: join(buildResources, 'icon.ico'),
      oneClick: true,
      perMachine: false,
      deleteAppDataOnUninstall: false,
      differentialPackage: true,
      // All app restarts go through the teacher's explicit update action.
      runAfterFinish: false,
    },
    mac: {
      target: ['dmg', 'zip'],
      icon: join(buildResources, 'icon.icns'),
      category: 'public.app-category.education',
      hardenedRuntime: true,
      notarize: requireSigning,
      // A local signature permits native loading; it does not claim Developer ID trust.
      ...(preview ? { identity: '-' } : {}),
    },
    linux: {
      target: ['AppImage'], category: 'Education', executableName: RELEASE_CONFIG.productName,
      icon: join(buildResources, 'icon.png'),
    },
    // The pinned pnpm patch also removes AppRun's automatic sandbox-disable fallback.
    appImage: {
      executableArgs: [],
      // Builder calls AppImage x64 "x86_64"; keep the public matrix's arch in its filename.
      artifactName: RELEASE_CONFIG.artifactName.replace('${arch}', currentReleaseTarget().arch),
    },
    afterPack,
  };
}
