import { problemBranch, problemUrl, markdown } from './model.mjs';
import { entriesAt, createCommit } from './git.mjs';

const start = '<!-- STUDY:START -->', end = '<!-- STUDY:END -->';

function classification(problem, files, config, automatic = []) {
  const branch = problemBranch(problem);
  const settings = config.problems?.[branch] ?? {};
  const type = settings.type ?? problem.type ?? (files.some(file => file.type === 'blob' && /\/solution\.sql$/.test(file.path)) ? 'sql' : 'programming');
  const categories = settings.categories ?? automatic;
  if (!['sql', 'programming'].includes(type) || !Array.isArray(categories) || categories.some(value => typeof value !== 'string' || !value.trim())) {
    throw new Error(`${branch}의 type과 categories 설정을 확인하세요.`);
  }
  return { type, categories: [...new Set(categories.map(markdown))].join(', ') || '미분류' };
}

export async function buildIndex(github, repository, config, { infoFor = async () => null, issueFor = async () => null, previousReadme = '' } = {}) {
  const refs = await github.request('/git/matching-refs/heads/');
  if (!Array.isArray(refs)) throw new Error('브랜치 목록 응답을 확인하지 못했습니다.');
  const problems = refs.filter(ref => /^refs\/heads\/(baekjoon|programmers)\/[1-9][0-9]*$/.test(ref.ref));
  const rows = { sql: [], programming: [] };
  const previousRows = previousReadme.split(start)[1]?.split(end)[0]?.split('\n') ?? [];
  for (const ref of problems.sort((a, b) => a.ref.localeCompare(b.ref, 'en', { numeric: true }))) {
    const problem = JSON.parse(await github.readText('.study/problem.json', ref.object.sha));
    const branch = problemBranch(problem);
    if (ref.ref !== `refs/heads/${branch}`) throw new Error('문제 정보와 브랜치가 다릅니다.');
    const files = await entriesAt(github, ref.object.sha);
    const previousRow = previousRows.find(line => line.startsWith('| [') && line.includes(`](${problemUrl(problem)}) |`));
    const previous = previousRow?.split('|').map(cell => cell.trim());
    const info = problem.platform === 'baekjoon' || config.problems?.[branch]?.categories == null ? await infoFor(problem) : null;
    const automatic = info?.categories ?? (previous?.[2] && previous[2] !== '미분류' ? [previous[2]] : []);
    const { type, categories } = classification(problem, files, config, automatic);
    const people = [];
    for (const member of config.members) {
      const submitted = files.some(file => file.type === 'blob' && file.path.startsWith(`${member.id}/`) && /^\d+-(pass|fail)\/submission\.json$/.test(file.path.slice(member.id.length + 1)));
      if (submitted) people.push(`[${markdown(member.id)}](https://github.com/${repository}/tree/${encodeURIComponent(branch)}/${member.id})`);
    }
    const label = `${problem.platform === 'baekjoon' ? '백준' : '프로그래머스'}<br>${problem.problemId}<br>${markdown(problem.title)}`;
    let difficulty = problem.difficulty || '—';
    if (problem.platform === 'baekjoon') {
      difficulty = info?.difficulty || previous?.[3] || difficulty;
    }
    const issue = await issueFor(problem);
    rows[type].push(`| [${label}](${problemUrl(problem)}) | ${categories} | ${markdown(difficulty)} | ${people.join(', ') || '—'} | ${issue ? `[토론](${issue})` : '—'} |`);
  }
  const section = (title, items) => `## ${title}\n\n| 문제 | 카테고리 | 난이도 | 제출 기록 | 토론방 |\n| --- | --- | --- | --- | --- |` + (items.length ? '\n' + items.join('\n') : '');
  return section('SQL', rows.sql) + '\n\n' + section('프로그래밍', rows.programming);
}

export async function publishIndex({ github, repository, config, infoFor, issueFor }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const base = await github.request('/git/ref/heads/main');
    const readme = await github.readText('README.md', base.object.sha);
    if (typeof readme !== 'string') throw new Error('README 목록 구간을 확인하세요.');
    const first = readme.indexOf(start), last = readme.indexOf(end);
    if (first < 0 || last <= first || readme.indexOf(start, first + 1) >= 0 || readme.indexOf(end, last + 1) >= 0) throw new Error('README 목록 구간을 확인하세요.');
    const table = await buildIndex(github, repository, config, { infoFor, issueFor, previousReadme: readme });
    const content = readme.slice(0, first + start.length) + '\n\n' + table + '\n\n' + readme.slice(last);
    if (content === readme) return { sha: null };
    const commit = await createCommit(github, { parent: base.object.sha,
      files: [{ path: 'README.md', content }], message: '문제별 제출 목록 갱신' });
    try {
      await github.request('/git/refs/heads/main', { method: 'PATCH', body: { sha: commit.sha, force: false } });
      return { sha: commit.sha };
    } catch (error) {
      const latest = await github.request('/git/ref/heads/main');
      if (latest.object.sha === base.object.sha || attempt === 2) throw error;
    }
  }
}
