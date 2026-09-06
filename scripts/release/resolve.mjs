import { execFileSync } from 'node:child_process';
import { RELEASE_CONFIG } from './config.mjs';
import { draftRelease, github, output, releaseIdentity, repository, root } from './common.mjs';

const identity = releaseIdentity(process.env.RELEASE_TAG, process.env.RELEASE_COMMIT);
if (process.env.GITHUB_REPOSITORY !== repository || process.env.GITHUB_REF !== 'refs/heads/main') {
  throw new Error('Official releases run only from the official repository main workflow.');
}
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
git('merge-base', '--is-ancestor', identity.commit, 'origin/main');
for (const path of ['package.json', 'apps/desktop/package.json']) {
  const pkg = JSON.parse(git('show', `${identity.commit}:${path}`));
  if (pkg.version !== identity.version) throw new Error(`${path} does not match ${identity.tag}.`);
}
const release = await draftRelease(identity.tag);
if (release.target_commitish !== identity.commit) throw new Error('Draft target must be the exact release commit SHA.');
// Existing tags must agree, including tags materialized after a failed publish attempt.
const refs = await github(`/git/matching-refs/tags/${encodeURIComponent(identity.tag)}`);
const matching = refs.find((ref) => ref.ref === `refs/tags/${identity.tag}`);
if (matching) {
  let object = matching.object;
  for (let depth = 0; object.type === 'tag' && depth < 5; depth++) {
    object = (await github(`/git/tags/${object.sha}`)).object;
  }
  if (object.type !== 'commit' || object.sha !== identity.commit) throw new Error('Release tag points to another commit.');
}
for (const [key, value] of Object.entries(identity)) await output(key, value);
await output('created_at', release.created_at);
await output('matrix', { include: RELEASE_CONFIG.targets });
