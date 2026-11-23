import { readFile } from 'node:fs/promises';
import { githubClient } from '../lib/github.mjs';
import { publishIndex } from '../lib/study-index.mjs';
import { baekjoonProblemInfo } from '../lib/solvedac.mjs';
import { programmersProblemInfo } from '../lib/programmers-info.mjs';
import { problemIssues } from '../lib/problem-issues.mjs';
try {
  const baekjoon = baekjoonProblemInfo({ clientId: process.env.SOLVEDAC_CLIENT_ID, clientSecret: process.env.SOLVEDAC_CLIENT_SECRET });
  const programmers = programmersProblemInfo();
  const repository = process.env.GITHUB_REPOSITORY;
  const github = githubClient({ repository, token: process.env.GITHUB_TOKEN });
  const result = await publishIndex({
    github, repository, config: JSON.parse(await readFile('study.config.json', 'utf8')),
    issueFor: problemIssues({ github, repository }),
    infoFor: problem => (problem.platform === 'baekjoon' ? baekjoon : programmers)(problem.problemId),
  });
  console.log(result.sha ? 'main README의 목록을 갱신했습니다.' : '목록이 같습니다.');
} catch (error) {
  console.error(error instanceof SyntaxError ? '문제 정보 또는 설정 형식을 확인하세요.' : error.message);
  process.exitCode = 1;
}
