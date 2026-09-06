/** Serializable release data shared by the static pages and their browser clients. */
export type ReleaseTarget = {
  id: string; platform: string; arch: string; label: string; architecture: string; filePattern: string;
};
export type ReleaseSource = { repositoryUrl: string; apiUrl: string; targets: ReleaseTarget[] };
export type ReleaseAsset = { name: string; url: string; size: number };
export type PublishedRelease = {
  version: string; tag: string; name: string; releaseUrl: string; publishedAt: string; preview: boolean;
  body: string;
  files: Array<ReleaseTarget & ReleaseAsset>; missingTargets: ReleaseTarget[];
  verification: ReleaseAsset[];
};
export type ReleaseCatalog = { current: PublishedRelease | null; history: PublishedRelease[]; limitReached: boolean };

/** Published evidence links; displaying a file does not verify its signature in the browser. */
export const RELEASE_VERIFICATION_LABELS: Readonly<Record<string, string>> = {
  SHA512SUMS: 'بصمات SHA-512',
  'release-metadata.json': 'بيان الإصدار',
  'cubecroom-release.json': 'بيان تحديث OTA',
  'downloads.json': 'قائمة ملفات التنزيل',
  'attestation.json': 'إثبات مصدر البناء',
};

const semverTag = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function safeReleaseNoteUrl(value: string, base: string): string | undefined {
  try {
    const url = new URL(value, base);
    return ['https:', 'http:', 'mailto:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

export function validateReleaseSource(source: ReleaseSource): void {
  if (!/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(source.repositoryUrl) ||
      source.apiUrl !== source.repositoryUrl.replace('https://github.com/', 'https://api.github.com/repos/') + '/releases') {
    throw new Error('Expected the configured official GitHub repository and release API.');
  }
}

function officialUrl(raw: unknown, expected: string): string {
  if (typeof raw !== 'string') throw new Error('Missing official release URL.');
  const url = new URL(raw);
  const target = new URL(expected);
  if (url.origin !== target.origin || url.username || url.password || url.search || url.hash ||
      decodeURIComponent(url.pathname) !== decodeURIComponent(target.pathname)) throw new Error('Unexpected release URL.');
  return expected;
}

export function parsePublishedRelease(raw: unknown, source: ReleaseSource): PublishedRelease {
  validateReleaseSource(source);
  if (!record(raw) || raw.draft !== false || typeof raw.prerelease !== 'boolean' ||
      typeof raw.tag_name !== 'string' || !semverTag.test(raw.tag_name) || raw.tag_name.trim() !== raw.tag_name ||
      typeof raw.published_at !== 'string' || !Number.isFinite(Date.parse(raw.published_at)) || !Array.isArray(raw.assets)) {
    throw new Error('Expected a published, versioned GitHub release.');
  }
  const tag = raw.tag_name;
  const version = tag.slice(1);
  const releaseUrl = officialUrl(raw.html_url, `${source.repositoryUrl}/releases/tag/${encodeURIComponent(tag)}`);
  const assets = new Map<string, Record<string, unknown>>();
  for (const asset of raw.assets) {
    if (!record(asset) || typeof asset.name !== 'string' || assets.has(asset.name)) throw new Error('Invalid or duplicate release asset.');
    assets.set(asset.name, asset);
  }
  const readAsset = (name: string): ReleaseAsset | null => {
    const asset = assets.get(name);
    if (!asset) return null;
    if (asset.state !== 'uploaded' || !Number.isSafeInteger(asset.size) || Number(asset.size) <= 0 || Number(asset.size) >= 2 * 1024 ** 3) {
      throw new Error('Release artifact is not ready.');
    }
    return { name, size: Number(asset.size), url: officialUrl(asset.browser_download_url,
      `${source.repositoryUrl}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`) };
  };
  const files: PublishedRelease['files'] = [];
  const missingTargets: ReleaseTarget[] = [];
  for (const target of source.targets) {
    const asset = readAsset(target.filePattern.replace('${version}', version));
    if (asset) files.push({ ...target, ...asset });
    else missingTargets.push(target);
  }
  const verification = Object.keys(RELEASE_VERIFICATION_LABELS).flatMap(name => {
    const asset = readAsset(name);
    return asset ? [asset] : [];
  });
  return {
    tag, version, releaseUrl, publishedAt: raw.published_at, preview: raw.prerelease,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 200) : tag,
    body: typeof raw.body === 'string' ? raw.body.slice(0, 100_000).trim() : '', files, missingTargets, verification,
  };
}

/** /latest supplies the stable choice even when the first history page contains only previews. */
export function parseReleaseCatalog(raw: unknown, stableRaw: unknown | null, source: ReleaseSource): ReleaseCatalog {
  if (!Array.isArray(raw) || raw.length > 100) throw new Error('Invalid release history response.');
  const entries = raw.filter(item => !record(item) || item.draft !== true).map(item => parsePublishedRelease(item, source));
  const stable = stableRaw === null ? null : parsePublishedRelease(stableRaw, source);
  if (stable?.preview) throw new Error('The latest stable endpoint returned a preview.');
  const unique = new Map(entries.map(entry => [entry.tag, entry]));
  if (stable) unique.set(stable.tag, stable);
  const history = [...unique.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return { current: stable ?? history.find(entry => !entry.preview) ?? history[0] ?? null, history, limitReached: raw.length === 100 };
}
