/** Browser-only projection of the central build configuration; never imports Node APIs. */
export type DownloadTarget = {
  id: string;
  platform: string;
  arch: string;
  label: string;
  architecture: string;
  filePattern: string;
};

export type DownloadSource = {
  repositoryUrl: string;
  apiUrl: string;
  targets: DownloadTarget[];
};

export type PublishedDownloads = {
  version: string;
  tag: string;
  releaseUrl: string;
  publishedAt: string;
  files: Array<DownloadTarget & { name: string; url: string; size: number }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Only link to complete, published stable releases with the configured artifact identities. */
export function parsePublishedDownloads(raw: unknown, source: DownloadSource): PublishedDownloads {
  if (!isRecord(raw) || raw.draft !== false || raw.prerelease !== false || typeof raw.tag_name !== 'string' ||
    !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(raw.tag_name) || raw.tag_name.trim() !== raw.tag_name ||
    typeof raw.published_at !== 'string' || !Number.isFinite(Date.parse(raw.published_at)) || !Array.isArray(raw.assets)) {
    throw new Error('The release is not a valid published stable release.');
  }
  const tag = raw.tag_name;
  const version = tag.slice(1);
  const releaseUrl = `${source.repositoryUrl}/releases/tag/${tag}`;
  if (raw.html_url !== releaseUrl) throw new Error('Unexpected release page URL.');
  const assets = new Map<string, Record<string, unknown>>();
  for (const asset of raw.assets) {
    if (!isRecord(asset) || typeof asset.name !== 'string' || assets.has(asset.name)) throw new Error('Invalid or duplicate release asset.');
    assets.set(asset.name, asset);
  }
  const files = source.targets.map((target) => {
    const name = target.filePattern.replace('${version}', version);
    const asset = assets.get(name);
    const url = `${source.repositoryUrl}/releases/download/${tag}/${name}`;
    if (!asset || asset.state !== 'uploaded' || asset.browser_download_url !== url ||
      !Number.isSafeInteger(asset.size) || Number(asset.size) <= 0 || Number(asset.size) >= 2 * 1024 ** 3) {
      throw new Error(`Required release artifact is missing or invalid: ${target.id}`);
    }
    return { ...target, name, url, size: Number(asset.size) };
  });
  return { tag, version, releaseUrl, publishedAt: raw.published_at, files };
}
