import { readFile } from 'node:fs/promises';
import { githubClient } from '../lib/github.mjs';
import { publishIndex } from '../lib/study-index.mjs';
try {
  const result = await publishIndex({
    github: githubClient({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN }),
    repository: process.env.GITHUB_REPOSITORY, config: JSON.parse(await readFile('study.config.json', 'utf8')),
  });
  console.log(result.number ? `목록 PR #${result.number}` : '목록이 같습니다.');
} catch (error) {
  console.error(error instanceof SyntaxError ? '문제 정보 또는 설정 형식을 확인하세요.' : error.message);
  process.exitCode = 1;
}
