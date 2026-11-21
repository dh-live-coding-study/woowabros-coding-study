import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeGithub } from './fake-github.mjs';
import { importSubmission } from '../lib/import-submission.mjs';
import { buildIndex, publishIndex } from '../lib/study-index.mjs';
import { createCommit } from '../lib/git.mjs';
const config = { members: [{ id: 'learner', github: 'candidate', baekjoon: 'boj-user', programmers: 'pg-user' }] };
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

const sqlInput = captureId => ({ ...input(captureId), platform: 'programmers', problemId: '1001', account: 'pg-user', extension: 'sql', code: 'SELECT team, COUNT(*) FROM people GROUP BY team;', outcome: 'pass', title: 'SQL example' });
const sectionRows = (index, title) => index.split(`## ${title}\n\n`)[1].split('\n\n## ')[0];

test('SQL submissions and programming submissions appear in separate sections with multiple problem categories', async () => {
  const { github, run } = fixture();
  const sql = await run(sqlInput('sql-1')); github.merge(sql.number);
  const programming = await run(input('boj-1')); github.merge(programming.number);
  const groupedConfig = { ...config, problems: {
    'programmers/1001': { categories: ['GROUP BY', 'RANK'] },
    'baekjoon/1000': { categories: ['Graph', 'BFS', 'Graph'] },
  } };
  const index = await buildIndex(github, 'team/study', groupedConfig);
  const sqlRows = sectionRows(index, 'SQL'), programmingRows = sectionRows(index, '프로그래밍');
  assert.match(sqlRows, /SQL example.*GROUP BY, RANK/); assert.match(sqlRows, /pass 1, fail 0/);
  assert.doesNotMatch(sqlRows, /A\+B/);
  assert.match(programmingRows, /A\+B.*Graph, BFS/); assert.match(programmingRows, /pass 0, fail 1/);
  assert.doesNotMatch(programmingRows, /SQL example|Graph, BFS, Graph/);
});

test('uncategorized problems remain visible and main settings can override their section without moving source', async () => {
  const { github, run } = fixture(); const pr = await run(input('boj-1')); github.merge(pr.number);
  const initial = await buildIndex(github, 'team/study', config);
  assert.match(sectionRows(initial, '프로그래밍'), /A\+B.*미분류/);
  const index = await buildIndex(github, 'team/study', { ...config, problems: { 'baekjoon/1000': { type: 'sql', categories: ['OUTER JOIN'] } } });
  assert.match(sectionRows(index, 'SQL'), /A\+B.*OUTER JOIN/);
  assert.doesNotMatch(sectionRows(index, '프로그래밍'), /A\+B/);
  assert.equal(await github.readText('learner/0001-fail/Main.java', 'baekjoon/1000'), input('x').code);
});

test('legacy problems without a type use their merged SQL files to select the SQL section', async () => {
  const { github, run } = fixture(); const pr = await run(sqlInput('sql-1')); github.merge(pr.number);
  const parent = github.refs.get('programmers/1001');
  const problem = JSON.parse(await github.readText('.study/problem.json', parent)); delete problem.type;
  const legacy = await createCommit(github, { parent, files: [{ path: '.study/problem.json', content: JSON.stringify(problem) }], message: 'legacy fixture' });
  github.refs.set('programmers/1001', legacy.sha);
  const index = await buildIndex(github, 'team/study', config);
  assert.match(sectionRows(index, 'SQL'), /SQL example.*미분류/);
  assert.doesNotMatch(sectionRows(index, '프로그래밍'), /SQL example/);
});

test('invalid category settings fail without publishing an incorrect README', async () => {
  const { github, run } = fixture(); await run(input('boj-1'));
  for (const settings of [{ type: 'other' }, { categories: 'BFS' }, { categories: [''] }]) {
    await assert.rejects(publishIndex({ github, repository: 'team/study', config: { ...config, problems: { 'baekjoon/1000': settings } } }), /type과 categories/);
    assert.equal(github.refs.has('docs/study-index'), false);
  }
});

test('publishing unchanged grouped sections creates no extra index PR after merging', async () => {
  const { github } = fixture();
  const result = await publishIndex({ github, repository: 'team/study', config }); github.merge(result.number);
  assert.equal((await publishIndex({ github, repository: 'team/study', config })).number, 0);
});

test('the first SQL submission is grouped as SQL before its PR is merged', async () => {
  const { github, run } = fixture(); const pr = await run(sqlInput('sql-first'));
  const index = await buildIndex(github, 'team/study', config);
  assert.match(sectionRows(index, 'SQL'), new RegExp(`SQL example.*pull/${pr.number}`));
  assert.doesNotMatch(sectionRows(index, '프로그래밍'), /SQL example/);
});
