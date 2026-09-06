import { github, output } from './common.mjs';

let pending = false;
for (let page = 1; page <= 10; page++) {
  const releases = await github(`/releases?per_page=100&page=${page}`);
  const draft = releases.find((release) => release.draft && /^v\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(release.tag_name));
  if (draft) {
    pending = true;
    console.log('An existing product draft must be resumed before preparing another release. Use workflow_dispatch with its tag and exact target commit.');
    break;
  }
  if (releases.length < 100) break;
}
await output('pending', String(pending));
