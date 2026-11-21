import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeGithub } from './fake-github.mjs';
import { importSubmission } from '../lib/import-submission.mjs';
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
  assert.equal(second.number, first.number); assert.equal(second.attempt, 2);
  assert.equal((await run(input('boj-1'))).attempt, 1);
  const branch = 'submissions/baekjoon/1000/learner';
  assert.equal(await github.readText('learner/0001-fail/Main.java', branch), input('boj-1').code);
  assert.equal(await github.readText('learner/0002-pass/Main.java', branch), input('boj-1').code);
  assert.equal(github.pulls[0].base.ref, 'baekjoon/1000');
  assert.equal(await github.readText('learner/0001-fail/Main.java', 'main'), null);
  await assert.rejects(run(input('boj-1', { code: 'different' })), /같은 수집 ID/);
});

test('simultaneous new attempts are all retained with unique sequence numbers', async () => {
  const { github, run } = fixture();
  const results = await Promise.all(Array.from({ length: 6 }, (_, index) => run(input(`boj-${index + 1}`))));
  assert.deepEqual(results.map(item => item.attempt).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
  assert.equal(github.pulls.length, 1);
  for (let number = 1; number <= 6; number++) assert.equal(await github.readText(`learner/${String(number).padStart(4, '0')}-fail/Main.java`, 'submissions/baekjoon/1000/learner'), input('x').code);
});

test('concurrent duplicate deliveries share one attempt and one PR', async () => {
  const { github, run } = fixture();
  const results = await Promise.all([run(input('boj-1')), run(input('boj-1'))]);
  assert.deepEqual(results.map(item => item.attempt), [1, 1]); assert.equal(github.pulls.length, 1);
});

test('merging preserves per-person history and subsequent submissions open a new PR', async () => {
  const { github, run } = fixture();
  const first = await run(input('boj-1')); github.merge(first.number);
  assert.equal((await run(input('boj-1'))).alreadyImported, true);
  const second = await run(input('boj-2', { outcome: 'pass' })); assert.notEqual(first.number, second.number); assert.equal(second.attempt, 2);
  const other = await run(input('friend-1', { account: 'boj-friend' }), { actor: 'friend', memberId: 'other' });
  github.merge(other.number); github.merge(second.number);
  assert.equal(await github.readText('learner/0002-pass/Main.java', 'baekjoon/1000'), input('x').code);
  assert.equal(await github.readText('other/0001-fail/Main.java', 'baekjoon/1000'), input('x').code);
});

test('Programmers lesson ID separates problems and Java source uses Solution.java', async () => {
  const { github, run } = fixture();
  const item = input('pg-1', { platform: 'programmers', problemId: '42576', account: 'pg-user', outcome: 'pass' });
  const result = await run(item); assert.equal(result.attempt, 1);
  assert.equal(await github.readText('learner/0001-pass/Solution.java', 'submissions/programmers/42576/learner'), item.code);
});

test('foreign actors, wrong accounts, pending verdicts and unsafe IDs fail before repository changes', async () => {
  for (const [item, options] of [[input('x'), { actor: 'stranger' }], [input('x', { account: 'other' }), {}], [input('x', { outcome: 'pending' }), {}], [input('../x'), {}]]) {
    const { github, run } = fixture(); await assert.rejects(run(item, options)); assert.equal(github.refs.size, 1);
  }
});

