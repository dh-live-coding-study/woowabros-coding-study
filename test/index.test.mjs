import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeGithub } from './fake-github.mjs';
import { importSubmission } from '../lib/import-submission.mjs';
import { buildIndex, publishIndex } from '../lib/study-index.mjs';
const config = { members: [{ id: 'learner', github: 'candidate', baekjoon: 'boj-user' }] };
const input = captureId => ({ platform: 'baekjoon', problemId: '1000', captureId, account: 'boj-user', title: 'A+B', extension: 'java', code: 'class Main {}', outcome: 'fail', verdict: '틀렸습니다', capturedAt: 1700000000000 });
function fixture() {
  const github = fakeGithub();
  const run = item => importSubmission({ github, config, repository: 'team/study', actor: 'candidate', memberId: 'learner', input: item });
  return { github, run };
}

test('index changes only its marked section and links pending PRs before merging', async () => {
  const { github, run } = fixture(); await run(input('boj-1'));
  const first = await publishIndex({ github, repository: 'team/study', config });
  const content = await github.readText('README.md', 'docs/study-index');
  assert.match(content, /대기 중인 PR/); assert.match(content, /pull\/1/); assert.match(content, /Keep this text/);
  const again = await publishIndex({ github, repository: 'team/study', config }); assert.equal(first.number, again.number);
});

test('merged pass/fail counts link each participant folder on the problem branch', async () => {
  const { github, run } = fixture();
  const first = await run(input('boj-1')); await run({ ...input('boj-2'), outcome: 'pass' }); github.merge(first.number);
  const table = await buildIndex(github, 'team/study', config);
  assert.match(table, /pass 1, fail 1/); assert.match(table, /tree\/baekjoon%2F1000\/learner/);
  assert.doesNotMatch(table, /pull\/1/);
});

test('branch listing is fetched once even when the repository has over 100 refs', async () => {
  const { github, run } = fixture(); await run(input('boj-1'));
  const main = github.refs.get('main');
  for (let i = 1; i <= 120; i++) github.refs.set(`study/task-${i}`, main);
  let requests = 0;
  const original = github.request;
  github.request = async (path, options) => { if (path === '/git/matching-refs/heads/') requests++; return original(path, options); };
  assert.match(await buildIndex(github, 'team/study', config), /A\+B/);
  assert.equal(requests, 1);
});
