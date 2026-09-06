import { RELEASE_CONFIG } from '../../../../scripts/release/config.mjs';
import type { ReleaseSource } from './data';

// This server/build module is the only projection of the central release configuration.
const platforms: Record<string, { name: string; os: string; extension: string }> = {
  win32: { name: 'Windows', os: 'win', extension: 'exe' },
  darwin: { name: 'macOS', os: 'mac', extension: 'dmg' },
  linux: { name: 'Linux', os: 'linux', extension: 'AppImage' },
};
const { owner, repo } = RELEASE_CONFIG.repository;
export const RELEASE_SOURCE: ReleaseSource = {
  repositoryUrl: `https://github.com/${owner}/${repo}`,
  apiUrl: `https://api.github.com/repos/${owner}/${repo}/releases`,
  targets: RELEASE_CONFIG.targets.map(target => ({
    id: target.id, platform: target.platform, arch: target.arch,
    label: platforms[target.platform].name,
    architecture: target.platform === 'darwin' ? (target.arch === 'arm64' ? 'Apple Silicon — شرائح M' : 'Intel — معمارية x64') : 'معمارية x64',
    filePattern: RELEASE_CONFIG.artifactName.replace('${os}', platforms[target.platform].os).replace('${arch}', target.arch).replace('${ext}', platforms[target.platform].extension),
  })),
};
