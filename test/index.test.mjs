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

test('index updates main directly and links pending submissions without creating an index PR', async () => {
  const { github, run } = fixture(); await run(input('boj-1'));
  const before = await github.readText('README.md', 'main');
  const previous = github.refs.get('main');
  const first = await publishIndex({ github, repository: 'team/study', config });
  const content = await github.readText('README.md', 'main');
  assert.equal(github.refs.get('main'), first.sha);
  assert.deepEqual(github.objects.get(first.sha).parents, [previous]);
  assert.match(content, /대기 중인 PR/); assert.match(content, /pull\/1/);
  assert.equal(content.split('<!-- STUDY:START -->')[0], before.split('<!-- STUDY:START -->')[0]);
  assert.equal(content.split('<!-- STUDY:END -->')[1], before.split('<!-- STUDY:END -->')[1]);
  assert.equal(github.pulls.length, 1);
  assert.equal(github.refs.has('docs/study-index'), false);
  const again = await publishIndex({ github, repository: 'team/study', config });
  assert.equal(again.sha, null);
  assert.equal(github.refs.get('main'), first.sha);
});

test('publishing after a submission merge replaces its pending link with participant pass/fail counts on main', async () => {
  const { github, run } = fixture();
  const first = await run(input('boj-1')); await run({ ...input('boj-2'), outcome: 'pass' });
  await publishIndex({ github, repository: 'team/study', config });
  github.merge(first.number);
  await publishIndex({ github, repository: 'team/study', config });
  const table = await github.readText('README.md', 'main');
  assert.match(table, /pass 1, fail 1/); assert.match(table, /tree\/baekjoon%2F1000\/learner/);
  assert.doesNotMatch(table, /pull\/1/);
  assert.equal(github.pulls.length, 1);
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
  const before = github.refs.get('main');
  for (const settings of [{ type: 'other' }, { categories: 'BFS' }, { categories: [''] }]) {
    await assert.rejects(publishIndex({ github, repository: 'team/study', config: { ...config, problems: { 'baekjoon/1000': settings } } }), /type과 categories/);
    assert.equal(github.refs.get('main'), before);
  }
});

test('a concurrent main edit is preserved when the index commit is retried', async () => {
  const { github, run } = fixture(); const pr = await run(sqlInput('sql-1')); github.merge(pr.number);
  const original = github.request;
  let concurrent;
  github.request = async (path, options) => {
    if (path === '/git/refs/heads/main' && options?.method === 'PATCH' && !concurrent) {
      const parent = github.refs.get('main');
      const readme = await github.readText('README.md', parent);
      concurrent = await createCommit(github, { parent, files: [
        { path: 'README.md', content: readme.replace('Keep this text.', 'Updated by a maintainer.') },
        { path: 'docs/new-guide.md', content: 'Keep this new guide.' },
      ], message: 'concurrent main edit' });
      github.refs.set('main', concurrent.sha);
    }
    return original(path, options);
  };
  const result = await publishIndex({ github, repository: 'team/study', config });
  assert.deepEqual(github.objects.get(result.sha).parents, [concurrent.sha]);
  const readme = await github.readText('README.md', 'main');
  assert.match(readme, /Updated by a maintainer/);
  assert.match(sectionRows(readme, 'SQL'), /SQL example.*pass 1, fail 0/);
  assert.equal(await github.readText('docs/new-guide.md', 'main'), 'Keep this new guide.');
});

test('a refused main update is reported without changing main or opening an index PR', async () => {
  const { github } = fixture();
  const before = github.refs.get('main'), original = github.request;
  let attempts = 0;
  github.request = async (path, options) => {
    if (path === '/git/refs/heads/main' && options?.method === 'PATCH') { attempts++; throw new Error('main update denied'); }
    return original(path, options);
  };
  await assert.rejects(publishIndex({ github, repository: 'team/study', config }), /main update denied/);
  assert.equal(attempts, 1);
  assert.equal(github.refs.get('main'), before);
  assert.equal(github.pulls.length, 0);
});

test('repeated main changes stop retries without overwriting another commit', async () => {
  const { github } = fixture();
  const original = github.request;
  let attempts = 0, lastMain;
  github.request = async (path, options) => {
    if (path === '/git/refs/heads/main' && options?.method === 'PATCH') {
      attempts++;
      lastMain = await createCommit(github, { parent: github.refs.get('main'), files: [
        { path: 'docs/concurrent.md', content: String(attempts) },
      ], message: 'another main update' });
      github.refs.set('main', lastMain.sha);
    }
    return original(path, options);
  };
  await assert.rejects(publishIndex({ github, repository: 'team/study', config }), /non-fast-forward/);
  assert.equal(attempts, 3);
  assert.equal(github.refs.get('main'), lastMain.sha);
  assert.equal(await github.readText('docs/concurrent.md', 'main'), '3');
});

test('missing or ambiguous README markers prevent any main update', async () => {
  for (const content of ['# Study', '<!-- STUDY:END --><!-- STUDY:START -->',
    '<!-- STUDY:START --><!-- STUDY:START --><!-- STUDY:END -->',
    '<!-- STUDY:START --><!-- STUDY:END --><!-- STUDY:END -->']) {
    const { github } = fixture();
    const invalid = await createCommit(github, { parent: github.refs.get('main'), files: [{ path: 'README.md', content }], message: 'invalid markers' });
    github.refs.set('main', invalid.sha);
    await assert.rejects(publishIndex({ github, repository: 'team/study', config }), /README 목록 구간/);
    assert.equal(github.refs.get('main'), invalid.sha);
  }
});

test('the first SQL submission is grouped as SQL before its PR is merged', async () => {
  const { github, run } = fixture(); const pr = await run(sqlInput('sql-first'));
  const index = await buildIndex(github, 'team/study', config);
  assert.match(sectionRows(index, 'SQL'), new RegExp(`SQL example.*pull/${pr.number}`));
  assert.doesNotMatch(sectionRows(index, '프로그래밍'), /SQL example/);
});

test('solved.ac difficulty refreshes existing Baekjoon rows without changing Programmers levels', async () => {
  const { github, run } = fixture();
  await run(input('boj-difficulty'));
  await run({ ...sqlInput('sql-difficulty'), difficulty: '1' });
  const requested = [];
  await publishIndex({ github, repository: 'team/study', config, infoFor: async item => {
    if (item.platform !== 'baekjoon') return null;
    requested.push(item.problemId); return { difficulty: 'Bronze V', categories: ['Mathematics'] };
  } });
  const readme = await github.readText('README.md', 'main');
  assert.match(sectionRows(readme, '프로그래밍'), /A\+B.*Bronze V/);
  assert.match(sectionRows(readme, 'SQL'), /SQL example.*미분류 \| 1 \|/);
  assert.deepEqual(requested, ['1000']);
});

test('a difficulty lookup failure keeps the previous grade while a new submission updates its counts', async () => {
  const { github, run } = fixture();
  const first = await run(input('boj-grade-1')); github.merge(first.number);
  await publishIndex({ github, repository: 'team/study', config, infoFor: async () => ({ difficulty: 'Bronze V', categories: ['Mathematics'] }) });
  const second = await run({ ...input('boj-grade-2'), outcome: 'pass', verdict: '정답' }); github.merge(second.number);
  await publishIndex({ github, repository: 'team/study', config, infoFor: async () => null });
  const readme = await github.readText('README.md', 'main');
  assert.match(sectionRows(readme, '프로그래밍'), /A\+B.*Mathematics.*Bronze V.*pass 1, fail 1/);
});

test('official categories fill both sections and explicit problem settings take priority', async () => {
  const { github, run } = fixture();
  await run(input('boj-categories')); await run(sqlInput('sql-categories'));
  const infoFor = async item => item.platform === 'baekjoon'
    ? { difficulty: 'Bronze V', categories: ['Mathematics', 'Implementation'] } : { categories: ['SELECT'] };
  const index = await buildIndex(github, 'team/study', config, { infoFor });
  assert.match(sectionRows(index, 'SQL'), /SQL example.*SELECT/);
  assert.match(sectionRows(index, '프로그래밍'), /A\+B.*Mathematics, Implementation.*Bronze V/);
  const manualConfig = { ...config, problems: {
    'programmers/1001': { categories: ['GROUP BY', 'RANK'] }, 'baekjoon/1000': { categories: [] },
  } };
  const manual = await buildIndex(github, 'team/study', manualConfig, { infoFor });
  assert.match(sectionRows(manual, 'SQL'), /SQL example.*GROUP BY, RANK/);
  assert.match(sectionRows(manual, '프로그래밍'), /A\+B.*미분류.*Bronze V/);
});

test('provider failures keep SQL categories and counts without borrowing a row outside the index', async () => {
  const { github, run } = fixture();
  const submission = await run(sqlInput('sql-preserve')); github.merge(submission.number);
  await publishIndex({ github, repository: 'team/study', config, infoFor: async () => ({ categories: ['GROUP BY'] }) });
  const previousReadme = '| [outside](https://school.programmers.co.kr/learn/courses/30/lessons/1001) | Wrong | 9 |\n' + await github.readText('README.md', 'main');
  const index = await buildIndex(github, 'team/study', config, { infoFor: async () => null, previousReadme });
  assert.match(sectionRows(index, 'SQL'), /SQL example.*GROUP BY.*pass 1, fail 0/);
  assert.doesNotMatch(index, /Wrong/);
});
