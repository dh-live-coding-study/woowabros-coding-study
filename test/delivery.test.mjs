import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchSubmission, confirmSubmission } from '../extension/delivery.mjs';
const settings = { enabled: true, repository: 'team/study', member: 'learner', token: 'fixture-token' };
const submission = { platform: 'baekjoon', problemId: '1000', captureId: 'boj-1', outcome: 'fail', code: '\ufeffclass Main {\r\n}\r\n' };
const file = text => ({ type: 'file', encoding: 'base64', size: Buffer.byteLength(text), content: Buffer.from(text).toString('base64') });
const sha = 'a'.repeat(40);
const pr = { number: 1, state: 'open', base: { ref: 'baekjoon/1000' }, head: { ref: 'submissions/baekjoon/1000/learner', sha, repo: { full_name: 'team/study' } } };
const metadata = { member: 'learner', captureId: 'boj-1', outcome: 'fail', path: 'learner/0001-fail/Main.java', attempt: 1 };

test('failure submissions dispatch without filtering and credentials stay in the GitHub authorization header', async () => {
  await dispatchSubmission(settings, submission, async (url, options) => {
    assert.match(url, /^https:\/\/api.github.com\/repos\/team\/study\//);
    assert.equal(options.credentials, 'omit'); assert.equal(options.headers.Authorization, 'Bearer fixture-token');
    const body = JSON.parse(options.body); assert.equal(JSON.parse(body.inputs.submission).outcome, 'fail');
    assert.doesNotMatch(options.body, /fixture-token/); return new Response(null, { status: 204 });
  });
});

test('confirmation uses the exact PR commit and compares UTF-8 bytes including BOM', async () => {
  const fetchImpl = code => async url => {
    const path = new URL(url).pathname;
    if (path.endsWith('/pulls')) return Response.json([pr]);
    assert.equal(new URL(url).searchParams.get('ref'), sha);
    return Response.json(file(path.endsWith('Main.java') ? code : JSON.stringify(metadata)));
  };
  assert.equal((await confirmSubmission(settings, submission, fetchImpl(submission.code))).attempt, 1);
  await assert.rejects(confirmSubmission(settings, submission, fetchImpl(submission.code.slice(1))), /소스가 수집한 원문과 다릅니다/);
});

test('a previous merged PR without this capture is not mistaken for the new submission PR', async () => {
  const result = await confirmSubmission(settings, submission, async url => {
    if (new URL(url).pathname.endsWith('/pulls')) return Response.json([{ ...pr, state: 'closed', merged_at: 'date' }]);
    return new Response(null, { status: 404 });
  });
  assert.equal(result, null);
});
