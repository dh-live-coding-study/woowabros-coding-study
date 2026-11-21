import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const banned = /https?:\/\/(?:[a-z0-9-]+\.)*notion\.(?:com|so|site)(?=[/:?#\s]|$)|(?:gh[pousr]_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{30,}|sk-(?:proj-)?[a-zA-Z0-9_-]{30,})/i;
for (const path of files) {
  if (/^\.local\/|(?:^|\/)\.env(?:\.|$)/.test(path)) throw new Error(`공개하면 안 되는 파일: ${path}`);
  if (banned.test(await readFile(path, 'utf8'))) throw new Error(`개인 문서 링크 또는 비밀값 확인 필요: ${path}`);
}
console.log('공개 대상 파일 확인 완료');
