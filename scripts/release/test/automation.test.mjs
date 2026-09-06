import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parse } from 'yaml';
import { dispatchPullRequest, releasePullRequest } from '../dispatch.mjs';
import { publicationMode, validateProductVersion } from '../version.mjs';

const repo = { full_name: 'cubetek/cubeCroom' };
const pull = () => ({
  number: 5, state: 'open', draft: false, base: { ref: 'main', repo },
  head: { ref: 'release-please--branches--main', sha: 'a'.repeat(40), repo },
  labels: [{ name: 'autorelease: pending' }],
});

test('release PR dispatch refuses forks, other branches, closed PRs and unlabelled input', () => {
  const cases = [
    (pr) => { pr.head.repo = { full_name: 'someone/cubeCroom' }; },
    (pr) => { pr.base.ref = 'develop'; },
    (pr) => { pr.head.ref = 'arbitrary-code'; },
    (pr) => { pr.head.sha = 'main'; },
    (pr) => { pr.state = 'closed'; },
    (pr) => { pr.draft = true; },
    (pr) => { pr.labels = []; },
  ];
  for (const modify of cases) { const pr = pull(); modify(pr); assert.throws(() => releasePullRequest(pr)); }
  assert.equal(releasePullRequest(pull()).commit, 'a'.repeat(40));
});

test('release PR CI is dispatched read-only and only repeated after failed validation', async () => {
  for (const conclusion of [null, 'success', 'failure']) {
    const calls = [];
    const api = async (path, options) => {
      calls.push({ path, options });
      if (path.startsWith('/pulls/')) return pull();
      if (path.includes('/runs?')) return { workflow_runs: [{
        head_sha: 'a'.repeat(40), head_branch: pull().head.ref, head_repository: repo,
        status: conclusion === null ? 'in_progress' : 'completed', conclusion,
      }] };
      return null;
    };
    assert.equal(await dispatchPullRequest('{"number":5}', api), conclusion === 'failure');
    const dispatched = calls.filter((call) => call.options?.method === 'POST');
    assert.equal(dispatched.length, conclusion === 'failure' ? 1 : 0);
    if (dispatched.length) assert.deepEqual(JSON.parse(dispatched[0].options.body), {
      ref: pull().head.ref, inputs: { build_installers: false },
    });
  }
});

test('invalid PR identifiers never call GitHub and stale checks cannot suppress a new head', async () => {
  await assert.rejects(dispatchPullRequest('{"number":"5; echo token"}', () => assert.fail('must not call GitHub')));
  let dispatched = false;
  await dispatchPullRequest('{"number":5}', async (path, options) => {
    if (path.startsWith('/pulls/')) return pull();
    if (path.includes('/runs?')) return { workflow_runs: [{
      head_sha: 'b'.repeat(40), head_branch: pull().head.ref, head_repository: repo, status: 'completed', conclusion: 'success',
    }] };
    dispatched = options.method === 'POST';
  });
  assert.equal(dispatched, true);
});

test('release versions stay synchronized and missing policy never silently selects unsigned publication', () => {
  const product = { version: '0.1.1' };
  assert.equal(validateProductVersion(product, product, { '.': '0.1.1' }), '0.1.1');
  assert.throws(() => validateProductVersion(product, { version: '0.1.0' }, { '.': '0.1.1' }));
  assert.throws(() => validateProductVersion(product, product, { '.': '0.1.0' }));
  assert.throws(() => validateProductVersion({ version: 'latest' }, product, {}));
  assert.equal(publicationMode({ mode: 'preview' }), 'preview');
  assert.equal(publicationMode({ mode: 'signed' }), 'signed');
  for (const value of [undefined, {}, { mode: 'disabled' }]) assert.throws(() => publicationMode(value));
});

test('automated PR validation and preview publication have no native or OTA signing credentials', async () => {
  const dir = new URL('../../../.github/workflows/', import.meta.url);
  const please = parse(await readFile(new URL('release-please.yml', dir), 'utf8'));
  const release = parse(await readFile(new URL('release.yml', dir), 'utf8'));
  const ci = parse(await readFile(new URL('ci.yml', dir), 'utf8'));
  assert.equal(please.on.pull_request, undefined);
  assert.equal(please.on.pull_request_target, undefined);
  assert.equal(JSON.stringify(please).includes('secrets.'), false);
  assert.ok(please.jobs.prepare.if.includes("github.ref == 'refs/heads/main'"));
  assert.equal(please.jobs.prepare.permissions.actions, 'write');
  assert.equal(release.jobs.preview.uses, './.github/workflows/ci.yml');
  assert.equal(release.jobs.preview.secrets, undefined);
  assert.equal(JSON.stringify(release.jobs['publish-preview']).includes('secrets.'), false);
  assert.deepEqual(release.jobs['publish-preview'].needs, ['prepare', 'preview']);
  assert.equal(ci.jobs.verify.steps[0].with.ref, '${{ needs.configure.outputs.commit }}');
  assert.equal(ci.jobs.configure.outputs.commit, '${{ steps.source.outputs.commit }}');
  assert.ok(release.jobs.build.if.includes("mode == 'signed'"));
  assert.ok(release.jobs.preview.if.includes("mode == 'preview'"));
  for (const job of Object.values(please.jobs)) for (const step of job.steps) {
    if (step.uses) assert.match(step.uses, /^[\w.-]+\/[\w.-]+@[a-f0-9]{40}$/);
  }
});
