import { createHash } from 'node:crypto';

export const hash = text => createHash('sha256').update(text, 'utf8').digest('hex');
export const problemBranch = item => `${item.platform}/${item.problemId}`;
export const problemUrl = item => item.platform === 'baekjoon'
  ? `https://www.acmicpc.net/problem/${item.problemId}`
  : `https://school.programmers.co.kr/learn/courses/30/lessons/${item.problemId}`;
export const markdown = text => String(text).replace(/[\\`*_[\]<>|\r\n]/g, ' ').trim();

const extensions = new Set(['java', 'py', 'cpp', 'c', 'js', 'ts', 'kt', 'swift', 'cs', 'go', 'rs', 'rb', 'sql', 'txt']);
export function validateSubmission(input) {
  if (!input || !['baekjoon', 'programmers'].includes(input.platform) || !/^[1-9][0-9]{0,11}$/.test(input.problemId || '')) throw new Error('문제 사이트와 번호를 확인하세요.');
  if (typeof input.captureId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.captureId)) throw new Error('수집 ID를 확인하세요.');
  if (!['pass', 'fail'].includes(input.outcome) || typeof input.verdict !== 'string' || !input.verdict.trim() || input.verdict.length > 200) throw new Error('완료된 채점 결과를 확인하세요.');
  if (typeof input.code !== 'string' || !input.code.trim() || Buffer.byteLength(input.code, 'utf8') > 40000) throw new Error('제출 코드는 비어 있지 않은 40KB 이하의 원문이어야 합니다.');
  if (typeof input.account !== 'string' || !input.account.trim() || input.account.length > 100) throw new Error('로그인 계정을 확인하세요.');
  if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 300 || !extensions.has(input.extension)) throw new Error('문제 제목과 소스 확장자를 확인하세요.');
  if (!Number.isSafeInteger(input.capturedAt) || input.capturedAt < 1) throw new Error('제출 시각을 확인하세요.');
  const difficulty = typeof input.difficulty === 'string' && input.difficulty.length <= 40 ? input.difficulty : '';
  return { platform: input.platform, problemId: String(input.problemId), captureId: input.captureId, account: input.account,
    title: input.title, extension: input.extension, code: input.code, outcome: input.outcome, verdict: input.verdict,
    capturedAt: input.capturedAt, difficulty };
}
export function sourceFilename(item) {
  return item.extension === 'java' ? (item.platform === 'baekjoon' ? 'Main.java' : 'Solution.java') : `solution.${item.extension}`;
}
export function submissionFolder(member, attempt, outcome) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,49}$/.test(member) || !Number.isSafeInteger(attempt) || attempt < 1 || !['pass', 'fail'].includes(outcome)) throw new Error('제출 경로를 확인하세요.');
  return `${member}/${String(attempt).padStart(4, '0')}-${outcome}`;
}
