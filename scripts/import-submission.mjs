import { readFile } from 'node:fs/promises';
import { githubClient } from '../lib/github.mjs';
import { importSubmission } from '../lib/import-submission.mjs';

try {
  if (process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('main의 수집기만 실행할 수 있습니다.');
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const result = await importSubmission({
    github: githubClient({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN }),
    config: JSON.parse(await readFile('study.config.json', 'utf8')), repository: process.env.GITHUB_REPOSITORY,
    actor: process.env.GITHUB_ACTOR, memberId: event.inputs?.member, input: JSON.parse(event.inputs?.submission || '{}'),
  });
  console.log(result.number ? `PR #${result.number}, ${result.attempt}회 제출` : '이미 병합된 제출입니다.');
} catch (error) {
  console.error(error instanceof SyntaxError ? '설정 또는 제출 JSON 형식을 확인하세요.' : error.message);
  process.exitCode = 1;
}
