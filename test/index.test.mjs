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

test('index publishes participant links and a conversation column without requesting PRs', async () => {
  const { github, run } = fixture(); await run(input('boj-1'));
  const before = await github.readText('README.md', 'main');
  const previous = github.refs.get('main');
  const first = await publishIndex({ github, repository: 'team/study', config });
  const content = await github.readText('README.md', 'main');
  assert.equal(github.refs.get('main'), first.sha);
  assert.deepEqual(github.objects.get(first.sha).parents, [previous]);
  assert.doesNotMatch(content, /대기 중인 PR|pull\//);
  assert.match(content, /\[learner\]\(https:\/\/github.com\/team\/study\/tree\/baekjoon%2F1000\/learner\)/);
  assert.match(content, /\[백준<br>1000<br>A\+B\]\(https:\/\/www.acmicpc.net\/problem\/1000\)/);
  assert.doesNotMatch(content, /(?:pass|fail) \d/);
  assert.match(content, /토론방/);
  for (const row of content.split('\n').filter(line => line.startsWith('|'))) assert.equal(row.split('|').length, 7);
  assert.equal(github.requests.some(({ path }) => path.startsWith('/pulls')), false);
  assert.equal(content.split('<!-- STUDY:START -->')[0], before.split('<!-- STUDY:START -->')[0]);
  assert.equal(content.split('<!-- STUDY:END -->')[1], before.split('<!-- STUDY:END -->')[1]);
  const again = await publishIndex({ github, repository: 'team/study', config });
  assert.equal(again.sha, null);
  assert.equal(github.refs.get('main'), first.sha);
});

test('new attempts by the same participant keep one name without changing the README', async () => {
  const { github, run } = fixture();
  await run(input('boj-1'));
  await publishIndex({ github, repository: 'team/study', config });
  await run({ ...input('boj-2'), outcome: 'pass' });
  assert.equal((await publishIndex({ github, repository: 'team/study', config })).sha, null);
  const table = await github.readText('README.md', 'main');
  assert.equal((table.match(/\[learner\]/g) || []).length, 1);
  assert.doesNotMatch(table, /(?:pass|fail) \d/);
  assert.match(table, /tree\/baekjoon%2F1000\/learner/);
  assert.equal(github.requests.some(({ path }) => path.startsWith('/pulls')), false);
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
  await run(sqlInput('sql-1'));
  await run(input('boj-1'));
  const groupedConfig = { ...config, problems: {
    'programmers/1001': { categories: ['GROUP BY', 'RANK'] },
    'baekjoon/1000': { categories: ['Graph', 'BFS', 'Graph'] },
  } };
  const index = await buildIndex(github, 'team/study', groupedConfig);
  const sqlRows = sectionRows(index, 'SQL'), programmingRows = sectionRows(index, '프로그래밍');
  assert.match(sqlRows, /SQL example.*GROUP BY, RANK/); assert.match(sqlRows, /프로그래머스<br>1001<br>SQL example.*\[learner\]/);
  assert.doesNotMatch(sqlRows, /A\+B/);
  assert.match(programmingRows, /A\+B.*Graph, BFS/); assert.match(programmingRows, /\[learner\]/);
  assert.doesNotMatch(programmingRows, /SQL example|Graph, BFS, Graph/);
});

test('uncategorized problems remain visible and main settings can override their section without moving source', async () => {
  const { github, run } = fixture(); await run(input('boj-1'));
  const initial = await buildIndex(github, 'team/study', config);
  assert.match(sectionRows(initial, '프로그래밍'), /A\+B.*미분류/);
  const index = await buildIndex(github, 'team/study', { ...config, problems: { 'baekjoon/1000': { type: 'sql', categories: ['OUTER JOIN'] } } });
  assert.match(sectionRows(index, 'SQL'), /A\+B.*OUTER JOIN/);
  assert.doesNotMatch(sectionRows(index, '프로그래밍'), /A\+B/);
  assert.equal(await github.readText('learner/0001-fail/Main.java', 'baekjoon/1000'), input('x').code);
});

test('legacy problems without a type use their stored SQL files to select the SQL section', async () => {
  const { github, run } = fixture(); await run(sqlInput('sql-1'));
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
  const { github, run } = fixture(); await run(sqlInput('sql-1'));
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
  assert.match(sectionRows(readme, 'SQL'), /SQL example.*\[learner\]/);
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
  assert.equal(github.requests.some(({ path }) => path.startsWith('/pulls')), false);
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

test('the first SQL submission immediately links its participant in the SQL section', async () => {
  const { github, run } = fixture(); await run(sqlInput('sql-first'));
  const index = await buildIndex(github, 'team/study', config);
  assert.match(sectionRows(index, 'SQL'), /SQL example.*\[learner\]/);
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

test('a difficulty lookup failure keeps the previous grade and participant link after a new attempt', async () => {
  const { github, run } = fixture();
  await run(input('boj-grade-1'));
  await publishIndex({ github, repository: 'team/study', config, infoFor: async () => ({ difficulty: 'Bronze V', categories: ['Mathematics'] }) });
  await run({ ...input('boj-grade-2'), outcome: 'pass', verdict: '정답' });
  await publishIndex({ github, repository: 'team/study', config, infoFor: async () => null });
  const readme = await github.readText('README.md', 'main');
  assert.match(sectionRows(readme, '프로그래밍'), /A\+B.*Mathematics.*Bronze V.*\[learner\]/);
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

test('provider failures keep SQL categories and participant links without borrowing a row outside the index', async () => {
  const { github, run } = fixture();
  await run(sqlInput('sql-preserve'));
  await publishIndex({ github, repository: 'team/study', config, infoFor: async () => ({ categories: ['GROUP BY'] }) });
  const previousReadme = '| [outside](https://school.programmers.co.kr/learn/courses/30/lessons/1001) | Wrong | 9 |\n' + await github.readText('README.md', 'main');
  const index = await buildIndex(github, 'team/study', config, { infoFor: async () => null, previousReadme });
  assert.match(sectionRows(index, 'SQL'), /SQL example.*GROUP BY.*\[learner\]/);
  assert.doesNotMatch(index, /Wrong/);
});
