import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeGithub } from './fake-github.mjs';
import { problemIssues } from '../lib/problem-issues.mjs';
import { importSubmission } from '../lib/import-submission.mjs';
import { publishIndex } from '../lib/study-index.mjs';
import { createCommit } from '../lib/git.mjs';

const repository = 'team/study';
const problem = { platform: 'baekjoon', problemId: '1000', title: 'A+B' };
const marker = '<!-- study-problem: baekjoon/1000 -->';
const config = { members: [{ id: 'learner', github: 'candidate', baekjoon: 'boj-user' }] };
const input = captureId => ({ ...problem, captureId, account: 'boj-user', extension: 'java', code: 'class Main {}',
  outcome: 'fail', verdict: '틀렸습니다', capturedAt: 1700000000000 });

function fixture(existing = []) {
  const github = fakeGithub(), issues = structuredClone(existing), calls = { lists: 0, creates: 0 };
  const original = github.request;
  github.list = async path => {
    assert.equal(path, '/issues?state=all&filter=all&sort=created&direction=asc');
    calls.lists++; return structuredClone(issues);
  };
  github.request = async (path, options) => {
    if (path !== '/issues' || options?.method !== 'POST') return original(path, options);
    calls.creates++;
    const issue = { number: issues.length + 1, state: 'open', ...options.body };
    issues.push(issue); return structuredClone(issue);
  };
  return { github, issues, calls,
    run: submission => importSubmission({ github, repository, config, actor: 'candidate', memberId: 'learner', input: submission }) };
}

test('concurrent calls share one issue per platform and problem and list issues once', async () => {
  const { github, issues, calls } = fixture();
  const issueFor = problemIssues({ github, repository });
  const [first, repeat, programmers] = await Promise.all([
    issueFor(problem), issueFor(problem), issueFor({ ...problem, platform: 'programmers' }),
  ]);
  assert.equal(first, repeat); assert.notEqual(first, programmers);
  assert.deepEqual(calls, { lists: 1, creates: 2 });
  assert.equal(issues[0].title, '[baekjoon/1000] A+B');
  assert.match(issues[0].body, /https:\/\/www.acmicpc.net\/problem\/1000/);
  assert.match(issues[0].body, /https:\/\/github.com\/team\/study\/tree\/baekjoon%2F1000/);
  assert.doesNotMatch(issues[0].body, /class Main|@candidate/);
});

test('an existing closed issue is reused without changing human content or mistaking PRs for issues', async () => {
  const body = `${marker}\n\n사람이 추가한 해설`;
  const { github, issues, calls } = fixture([
    { number: 12, body: marker, pull_request: {} },
    { number: 13, state: 'closed', title: '직접 수정한 제목', body },
  ]);
  const original = structuredClone(issues);
  const url = await problemIssues({ github, repository })(problem);
  assert.equal(url, 'https://github.com/team/study/issues/13');
  assert.equal(calls.creates, 0); assert.deepEqual(issues, original);
});

test('a retry after a lost issue creation response finds the created issue', async () => {
  const { github, issues, calls } = fixture();
  const original = github.request;
  github.request = async (path, options) => {
    const result = await original(path, options);
    if (path === '/issues') throw new Error('response lost');
    return result;
  };
  await assert.rejects(problemIssues({ github, repository })(problem), /response lost/);
  assert.equal(issues.length, 1);
  assert.equal(await problemIssues({ github, repository })(problem), 'https://github.com/team/study/issues/1');
  assert.equal(calls.creates, 1);
});

test('catalog updates backfill issues and keep the same link across pass, fail and repeated index runs', async () => {
  const { github, issues, calls, run } = fixture();
  await run(input('first'));
  const publish = () => publishIndex({ github, repository, config, issueFor: problemIssues({ github, repository }) });
  await publish();
  assert.match(await github.readText('README.md', 'main'), /pass 0, fail 1.*\[대화하기\]\(https:\/\/github.com\/team\/study\/issues\/1\)/);
  const issueBody = issues[0].body;
  await run({ ...input('second'), outcome: 'pass', verdict: '정답' });
  await publish();
  const readme = await github.readText('README.md', 'main');
  assert.match(readme, /pass 1, fail 1.*\/issues\/1/);
  assert.equal((await publish()).sha, null);
  assert.equal(calls.creates, 1); assert.equal(issues[0].body, issueBody);
  assert.equal(await github.readText('learner/0001-fail/Main.java', 'baekjoon/1000'), input('first').code);
});

test('a concurrent main update preserves outside content without creating another issue', async () => {
  const { github, calls, run } = fixture();
  await run(input('first'));
  const original = github.request;
  let concurrent;
  github.request = async (path, options) => {
    if (path === '/git/refs/heads/main' && options?.method === 'PATCH' && !concurrent) {
      const parent = github.refs.get('main'), readme = await github.readText('README.md', parent);
      concurrent = await createCommit(github, { parent, message: 'maintainer edit',
        files: [{ path: 'README.md', content: readme.replace('Keep this text.', 'Keep this new explanation.') }] });
      github.refs.set('main', concurrent.sha);
    }
    return original(path, options);
  };
  await publishIndex({ github, repository, config, issueFor: problemIssues({ github, repository }) });
  assert.equal(calls.creates, 1);
  assert.match(await github.readText('README.md', 'main'), /Keep this new explanation/);
  assert.match(await github.readText('README.md', 'main'), /\/issues\/1/);
});

test('an issue failure leaves the collected source intact and does not publish broken links', async () => {
  const { github, run } = fixture();
  await run(input('first'));
  const main = github.refs.get('main'), original = github.request;
  github.request = async (path, options) => {
    if (path === '/issues') throw new Error('issues permission denied');
    return original(path, options);
  };
  await assert.rejects(publishIndex({ github, repository, config, issueFor: problemIssues({ github, repository }) }), /issues permission denied/);
  assert.equal(github.refs.get('main'), main);
  assert.equal(await github.readText('learner/0001-fail/Main.java', 'baekjoon/1000'), input('first').code);
});
