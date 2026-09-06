import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { draftRelease, github, releaseIdentity, repository } from './common.mjs';

export function releasePullRequest(pr) {
  if (!Number.isSafeInteger(pr?.number) || pr.number < 1 || pr.state !== 'open' || pr.draft
    || pr.base?.ref !== 'main' || pr.base.repo?.full_name !== repository
    || pr.head?.repo?.full_name !== repository || pr.head.ref !== 'release-please--branches--main'
    || !/^[a-f0-9]{40}$/.test(pr.head.sha ?? '')
    || !pr.labels?.some((label) => label.name === 'autorelease: pending')) {
    throw new Error('Expected the open, same-repository Release Please PR targeting main.');
  }
  return { number: pr.number, branch: pr.head.ref, commit: pr.head.sha };
}

export async function dispatchPullRequest(raw, api = github) {
  const data = JSON.parse(raw);
  if (!Number.isSafeInteger(data?.number) || data.number < 1) throw new Error('Missing Release Please PR number.');
  const pr = releasePullRequest(await api(`/pulls/${data.number}`));
  const runs = await api(`/actions/workflows/ci.yml/runs?head_sha=${pr.commit}&event=workflow_dispatch&per_page=100`);
  if (runs.workflow_runs.some((run) => run.head_sha === pr.commit && run.head_branch === pr.branch
    && run.head_repository?.full_name === repository && (run.status !== 'completed' || run.conclusion === 'success'))) {
    console.log(`CI already exists for release PR #${pr.number} at ${pr.commit}.`);
    return false;
  }
  // Dispatch the branch so GitHub attaches checks to its HEAD. A newer branch revision
  // gets its own checks; it cannot reuse a successful check for an older SHA.
  await api('/actions/workflows/ci.yml/dispatches', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref: pr.branch, inputs: { build_installers: false } }),
  });
  console.log(`Dispatched read-only CI for release PR #${pr.number} (observed head ${pr.commit}).`);
  return true;
}

async function main() {
  if (process.env.GITHUB_REPOSITORY !== repository || process.env.GITHUB_REF !== 'refs/heads/main') {
    throw new Error('Release automation only runs from official main.');
  }
  if (process.argv[2] === 'pr') await dispatchPullRequest(process.env.RELEASE_PR);
  else if (process.argv[2] === 'release') {
    const identity = releaseIdentity(process.env.RELEASE_TAG, process.env.RELEASE_COMMIT);
    const draft = await draftRelease(identity.tag);
    if (draft.target_commitish !== identity.commit) throw new Error('Draft target must match the exact merged release commit.');
    await github('/actions/workflows/release.yml/dispatches', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: 'main', inputs: { tag: identity.tag, commit: identity.commit } }),
    });
    console.log(`Dispatched release build for ${identity.tag} at ${identity.commit}.`);
  } else throw new Error('Expected pr or release.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
