import { problemBranch, problemUrl, markdown } from './model.mjs';
import { entriesAt, createCommit, ensureRef } from './git.mjs';

const start = '<!-- STUDY:START -->', end = '<!-- STUDY:END -->';
const ownerHead = (repository, branch) => encodeURIComponent(repository.split('/')[0] + ':' + branch);
export async function buildIndex(github, repository, config) {
  const refs = await github.list('/git/matching-refs/heads/');
  const problems = refs.filter(ref => /^refs\/heads\/(baekjoon|programmers)\/[1-9][0-9]*$/.test(ref.ref));
  const rows = [];
  for (const ref of problems.sort((a, b) => a.ref.localeCompare(b.ref, 'en', { numeric: true }))) {
    const problem = JSON.parse(await github.readText('.study/problem.json', ref.object.sha));
    const branch = problemBranch(problem);
    if (ref.ref !== `refs/heads/${branch}`) throw new Error('문제 정보와 브랜치가 다릅니다.');
    const files = await entriesAt(github, ref.object.sha);
    const people = [];
    for (const member of config.members) {
      const submissions = files.filter(file => file.type === 'blob' && file.path.startsWith(`${member.id}/`) && /^\d+-(pass|fail)\/submission\.json$/.test(file.path.slice(member.id.length + 1)));
      if (!submissions.length) continue;
      const count = outcome => submissions.filter(file => file.path.includes(`-${outcome}/`)).length;
      people.push(`[${markdown(member.id)}](https://github.com/${repository}/tree/${encodeURIComponent(branch)}/${member.id}) (pass ${count('pass')}, fail ${count('fail')})`);
    }
    const open = await github.list(`/pulls?state=open&base=${encodeURIComponent(branch)}`);
    const pending = open.filter(pr => pr.head?.ref?.startsWith(`submissions/${branch}/`)).map(pr => `[#${pr.number}](${pr.html_url})`);
    const label = `${problem.platform === 'baekjoon' ? '백준' : '프로그래머스'} ${problem.problemId}. ${markdown(problem.title)}`;
    rows.push(`| [${label}](${problemUrl(problem)}) | ${markdown(problem.difficulty || '—')} | ${people.join(', ') || '—'} | ${pending.join(', ') || '—'} |`);
  }
  return '| 문제 | 난이도 | 제출 기록 | 대기 중인 PR |\n| --- | --- | --- | --- |\n' + rows.join('\n');
}

export async function publishIndex({ github, repository, config }) {
  const base = await github.request('/git/ref/heads/main');
  const readme = await github.readText('README.md', base.object.sha);
  const first = readme.indexOf(start), last = readme.indexOf(end);
  if (first < 0 || last <= first || readme.indexOf(start, first + 1) >= 0) throw new Error('README 목록 구간을 확인하세요.');
  const table = await buildIndex(github, repository, config);
  const content = readme.slice(0, first + start.length) + '\n\n' + table + '\n\n' + readme.slice(last);
  if (content === readme) return { number: 0 };
  const branch = 'docs/study-index';
  const previous = await github.request(`/git/ref/heads/${branch}`, { optional: true });
  const latest = await github.request('/git/ref/heads/main');
  if (latest.object.sha !== base.object.sha) throw new Error('main이 변경됐습니다. 목록 갱신을 다시 실행하세요.');
  const commit = await createCommit(github, { parent: base.object.sha, parents: [...new Set([base.object.sha, ...(previous ? [previous.object.sha] : [])])],
    files: [{ path: 'README.md', content }], message: '문제별 제출 목록 갱신' });
  if (previous) await github.request(`/git/refs/heads/${branch}`, { method: 'PATCH', body: { sha: commit.sha, force: false } });
  else await ensureRef(github, branch, commit.sha);
  const pulls = await github.list(`/pulls?state=open&head=${ownerHead(repository, branch)}&base=main`);
  const pr = pulls[0] || await github.request('/pulls', { method: 'POST', body: { title: '문제별 제출 목록 갱신', head: branch, base: 'main', body: '문제 브랜치의 참여자별 제출 기록과 대기 중인 PR 링크를 README에 반영했습니다.' } });
  return { number: pr.number };
}
