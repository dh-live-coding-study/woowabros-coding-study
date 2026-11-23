import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeGithub } from './fake-github.mjs';
import { importSubmission } from '../lib/import-submission.mjs';
import { createCommit } from '../lib/git.mjs';
const config = { members: [{ id: 'learner', github: 'candidate', baekjoon: 'boj-user', programmers: 'pg-user' }, { id: 'other', github: 'friend', baekjoon: 'boj-friend' }] };
const input = (captureId, extra = {}) => ({ platform: 'baekjoon', problemId: '1000', captureId, account: 'boj-user',
  title: 'A+B', extension: 'java', code: '\ufeffclass Main {\r\n  // 원문 공백  \r\n}\r\n', outcome: 'fail', verdict: '틀렸습니다', capturedAt: 1700000000000, ...extra });
function fixture() {
  const github = fakeGithub();
  return { github, run: (item, extra = {}) => importSubmission({ github, config, repository: 'team/study', actor: 'candidate', memberId: 'learner', input: item, ...extra }) };
}

test('pass and fail are separate attempts on a problem branch, retry is idempotent, source bytes stay intact', async () => {
  const { github, run } = fixture();
  const first = await run(input('boj-1'));
  assert.equal(first.attempt, 1);
  const second = await run(input('boj-2', { outcome: 'pass', verdict: '맞았습니다' }));
  assert.equal(second.attempt, 2);
  assert.equal((await run(input('boj-1'))).attempt, 1);
  const branch = 'baekjoon/1000';
  assert.equal(await github.readText('learner/0001-fail/Main.java', branch), input('boj-1').code);
  assert.equal(await github.readText('learner/0002-pass/Main.java', branch), input('boj-1').code);
  assert.equal(first.branch, branch);
  assert.equal(first.url, `https://github.com/team/study/blob/${first.sha}/learner/0001-fail/Main.java`);
  assert.equal(github.requests.some(({ path }) => path.startsWith('/pulls')), false);
  assert.equal([...github.refs.keys()].some(ref => ref.startsWith('submissions/')), false);
  assert.equal(await github.readText('learner/0001-fail/Main.java', 'main'), null);
  await assert.rejects(run(input('boj-1', { code: 'different' })), /같은 수집 ID/);
});

test('simultaneous new attempts are all retained with unique sequence numbers', async () => {
  const { github, run } = fixture();
  const results = await Promise.all(Array.from({ length: 6 }, (_, index) => run(input(`boj-${index + 1}`))));
  assert.deepEqual(results.map(item => item.attempt).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
  for (let number = 1; number <= 6; number++) assert.equal(await github.readText(`learner/${String(number).padStart(4, '0')}-fail/Main.java`, 'baekjoon/1000'), input('x').code);
});

test('concurrent duplicate deliveries share one stored attempt', async () => {
  const { github, run } = fixture();
  const results = await Promise.all([run(input('boj-1')), run(input('boj-1'))]);
  assert.deepEqual(results.map(item => item.attempt), [1, 1]);
  assert.equal(results.filter(item => item.alreadyImported).length, 1);
});

test('concurrent participants preserve both histories on the same problem branch', async () => {
  const { github, run } = fixture();
  await run(input('boj-1'));
  const [second, other] = await Promise.all([
    run(input('boj-2', { outcome: 'pass' })),
    run(input('friend-1', { account: 'boj-friend' }), { actor: 'friend', memberId: 'other' }),
  ]);
  assert.equal(second.attempt, 2); assert.equal(other.attempt, 1);
  assert.equal(await github.readText('learner/0002-pass/Main.java', 'baekjoon/1000'), input('x').code);
  assert.equal(await github.readText('other/0001-fail/Main.java', 'baekjoon/1000'), input('x').code);
});

test('Programmers lesson ID separates problems and Java source uses Solution.java', async () => {
  const { github, run } = fixture();
  const item = input('pg-1', { platform: 'programmers', problemId: '42576', account: 'pg-user', outcome: 'pass' });
  const result = await run(item); assert.equal(result.attempt, 1);
  assert.equal(await github.readText('learner/0001-pass/Solution.java', 'programmers/42576'), item.code);
});

test('previously merged captures remain idempotent and old collector refs are not updated', async () => {
  const { github, run } = fixture();
  const first = await run(input('boj-old'));
  github.refs.set('submissions/baekjoon/1000/learner', first.sha);
  assert.equal((await run(input('boj-old'))).alreadyImported, true);
  assert.equal((await run(input('boj-new'))).attempt, 2);
  assert.equal(github.refs.get('submissions/baekjoon/1000/learner'), first.sha);
});

test('a denied problem branch update leaves the existing submission untouched', async () => {
  const { github, run } = fixture();
  await run(input('boj-1'));
  const before = github.refs.get('baekjoon/1000'), original = github.request;
  github.request = async (path, options) => {
    if (path === '/git/refs/heads/baekjoon/1000' && options?.method === 'PATCH') throw new Error('update denied');
    return original(path, options);
  };
  await assert.rejects(run(input('boj-2')), /update denied/);
  assert.equal(github.refs.get('baekjoon/1000'), before);
  assert.equal(await github.readText('learner/0002-fail/submission.json', before), null);
});

test('exhausted ref races do not overwrite a concurrently updated problem branch', async () => {
  const { github, run } = fixture();
  await run(input('boj-1'));
  const original = github.request;
  let last, updates = 0;
  github.request = async (path, options) => {
    if (path === '/git/refs/heads/baekjoon/1000' && options?.method === 'PATCH') {
      updates++;
      last = await createCommit(github, { parent: github.refs.get('baekjoon/1000'),
        files: [{ path: 'README.md', content: String(updates) }], message: 'concurrent edit' });
      github.refs.set('baekjoon/1000', last.sha);
    }
    return original(path, options);
  };
  await assert.rejects(run(input('boj-2')), /non-fast-forward/);
  assert.equal(updates, 8); assert.equal(github.refs.get('baekjoon/1000'), last.sha);
  assert.equal(await github.readText('learner/0001-fail/Main.java', last.sha), input('x').code);
  assert.equal(await github.readText('.study/captures/learner/boj-2.json', last.sha), null);
});

test('foreign actors, wrong accounts, pending verdicts and unsafe IDs fail before repository changes', async () => {
  for (const [item, options] of [[input('x'), { actor: 'stranger' }], [input('x', { account: 'other' }), {}], [input('x', { outcome: 'pending' }), {}], [input('../x'), {}]]) {
    const { github, run } = fixture(); await assert.rejects(run(item, options)); assert.equal(github.refs.size, 1);
  }
});

