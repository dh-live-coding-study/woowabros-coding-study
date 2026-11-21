import { hash, validateSubmission, problemBranch, collectorBranch, problemUrl, markdown, sourceFilename, submissionFolder } from './model.mjs';
import { createCommit, ensureRef, entriesAt } from './git.mjs';

async function ensureProblem(github, item) {
  const branch = problemBranch(item);
  const existing = await github.request(`/git/ref/heads/${branch}`, { optional: true });
  if (existing) return existing;
  const problem = { platform: item.platform, problemId: item.problemId, title: item.title, url: problemUrl(item), difficulty: item.difficulty,
    type: item.extension === 'sql' ? 'sql' : 'programming' };
  const commit = await createCommit(github, { parents: [], empty: true,
    message: `문제 브랜치 생성: ${branch}`, files: [
      { path: 'README.md', content: `# ${markdown(item.title)}\n\n[문제 보기](${problem.url})\n\n참여자 폴더에 제출 순번과 pass/fail 결과별로 원문을 보관합니다.\n` },
      { path: '.study/problem.json', content: JSON.stringify(problem, null, 2) + '\n' },
    ] });
  return ensureRef(github, branch, commit.sha);
}

export async function importSubmission({ github, config, repository, actor, memberId, input }) {
  const member = config.members?.find(item => item.id === memberId);
  if (!member || member.github?.toLowerCase() !== actor?.toLowerCase()) throw new Error('등록된 참여자 본인의 GitHub 계정으로 실행하세요.');
  const item = validateSubmission(input);
  if (!member[item.platform] || member[item.platform] !== item.account) throw new Error('설정 파일의 사이트 계정과 로그인 계정이 다릅니다.');
  const base = problemBranch(item), branch = collectorBranch(member.id, item);
  const problemRef = await ensureProblem(github, item);
  await ensureRef(github, branch, problemRef.object.sha);
  const pointer = `.study/captures/${member.id}/${item.captureId}.json`;
  let metadata;
  for (let retry = 0; retry < 8; retry++) {
    const current = await github.request(`/git/ref/heads/${branch}`);
    const stored = await github.readText(pointer, current.object.sha);
    if (stored) {
      metadata = JSON.parse(stored);
      const original = await github.readText(metadata.path, current.object.sha);
      if (metadata.sourceSha256 !== hash(item.code) || original !== item.code || metadata.outcome !== item.outcome || metadata.account !== item.account) throw new Error('같은 수집 ID의 제출 내용이 다릅니다.');
      break;
    }
    const entries = await entriesAt(github, current.object.sha);
    const prefix = `${member.id}/`;
    const attempts = entries.filter(entry => entry.type === 'blob' && entry.path.startsWith(prefix) && /^\d+-(pass|fail)\/submission\.json$/.test(entry.path.slice(prefix.length)))
      .map(entry => Number(entry.path.slice(prefix.length).split('-')[0]));
    const attempt = Math.max(0, ...attempts) + 1;
    const folder = submissionFolder(member.id, attempt, item.outcome);
    metadata = { version: 1, platform: item.platform, problemId: item.problemId, member: member.id, github: member.github,
      account: item.account, captureId: item.captureId, attempt, outcome: item.outcome, verdict: item.verdict,
      capturedAt: item.capturedAt, sourceSha256: hash(item.code), path: `${folder}/${sourceFilename(item)}`, url: problemUrl(item) };
    const serialized = JSON.stringify(metadata, null, 2) + '\n';
    const commit = await createCommit(github, { parent: current.object.sha, message: `${member.id}: ${attempt}회 ${item.outcome} (${base})`, files: [
      { path: metadata.path, content: item.code }, { path: `${folder}/submission.json`, content: serialized }, { path: pointer, content: serialized },
    ] });
    try {
      // 같은 부모에서 겹친 제출은 먼저 저장된 기록을 읽고 새 순번으로 다시 시도한다.
      await github.request(`/git/refs/heads/${branch}`, { method: 'PATCH', body: { sha: commit.sha, force: false } });
      break;
    } catch (error) {
      const latest = await github.request(`/git/ref/heads/${branch}`);
      if (latest.object.sha === current.object.sha || retry === 7) throw error;
      metadata = undefined;
    }
  }
  if (!metadata) throw new Error('다른 제출과 겹쳤습니다. 원문을 보관하고 다시 전송하세요.');
  const pulls = await github.list(`/pulls?state=all&head=${encodeURIComponent(repository.split('/')[0] + ':' + branch)}&base=${encodeURIComponent(base)}`);
  let pr = pulls.find(pr => pr.state === 'open');
  if (!pr) {
    const merged = await github.readText(pointer, (await github.request(`/git/ref/heads/${base}`)).object.sha);
    if (merged) return { number: 0, alreadyImported: true };
    try {
      pr = await github.request('/pulls', { method: 'POST', body: {
        title: `[${base}] ${member.id}의 제출`, head: branch, base,
        body: `@${member.github} 님의 제출 기록입니다. 각 폴더 이름의 순번과 pass/fail로 결과를 확인할 수 있습니다.\n\n[문제 보기](${problemUrl(item)})\n\n같은 문제를 다시 제출하면 이 PR에 기록을 추가합니다. 병합 후 다시 제출하면 새 PR이 만들어집니다.`,
      } });
    } catch (error) {
      pr = (await github.list(`/pulls?state=open&head=${encodeURIComponent(repository.split('/')[0] + ':' + branch)}&base=${encodeURIComponent(base)}`))[0];
      if (!pr) throw error;
    }
  }
  return { number: pr.number, url: pr.html_url, attempt: metadata.attempt };
}
