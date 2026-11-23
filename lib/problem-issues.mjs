import { markdown, problemBranch, problemUrl } from './model.mjs';

export function problemIssues({ github, repository }) {
  let listing;
  const pending = new Map();
  return problem => {
    const branch = problemBranch(problem);
    if (!pending.has(branch)) pending.set(branch, (async () => {
      const marker = `<!-- study-problem: ${branch} -->`;
      const issues = await (listing ??= github.list('/issues?state=all&filter=all&sort=created&direction=asc'));
      let issue = issues.find(item => !item.pull_request && item.body?.split('\n').some(line => line.trim() === marker));
      if (!issue) issue = await github.request('/issues', { method: 'POST', body: {
        title: `[${branch}] ${markdown(problem.title)}`.slice(0, 256),
        body: `${marker}\n\n[문제 보기](${problemUrl(problem)})\n[제출 기록](https://github.com/${repository}/tree/${encodeURIComponent(branch)})\n\n이 문제의 해설과 질문을 댓글로 나눠 주세요. 다른 풀이 방법이나 막힌 부분도 함께 이야기할 수 있습니다.`,
      } });
      if (!Number.isSafeInteger(issue.number) || issue.number < 1) throw new Error(`${branch}의 Issue 번호를 확인하지 못했습니다.`);
      return `https://github.com/${repository}/issues/${issue.number}`;
    })());
    return pending.get(branch);
  };
}
