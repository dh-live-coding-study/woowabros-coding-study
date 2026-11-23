import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchSubmission, confirmSubmission } from '../extension/delivery.mjs';
const settings = { enabled: true, repository: 'team/study', member: 'learner', token: 'fixture-token' };
const submission = { platform: 'baekjoon', problemId: '1000', captureId: 'boj-1', account: 'boj-user', outcome: 'fail', code: '\ufeffclass Main {\r\n}\r\n' };
const file = text => ({ type: 'file', encoding: 'base64', size: Buffer.byteLength(text), content: Buffer.from(text).toString('base64') });
const sha = 'a'.repeat(40);
const metadata = { platform: 'baekjoon', problemId: '1000', account: 'boj-user', member: 'learner', captureId: 'boj-1', outcome: 'fail', path: 'learner/0001-fail/Main.java', attempt: 1 };

test('failure submissions dispatch without filtering and credentials stay in the GitHub authorization header', async () => {
  await dispatchSubmission(settings, submission, async (url, options) => {
    assert.match(url, /^https:\/\/api.github.com\/repos\/team\/study\//);
    assert.equal(options.credentials, 'omit'); assert.equal(options.headers.Authorization, 'Bearer fixture-token');
    const body = JSON.parse(options.body); assert.equal(JSON.parse(body.inputs.submission).outcome, 'fail');
    assert.doesNotMatch(options.body, /fixture-token/); return new Response(null, { status: 204 });
  });
});

test('confirmation pins the problem branch commit and compares UTF-8 bytes including BOM without PR access', async () => {
  const fetchImpl = code => async url => {
    const path = new URL(url).pathname;
    assert.doesNotMatch(path, /\/pulls/);
    if (path.endsWith('/git/ref/heads/baekjoon/1000')) return Response.json({ object: { sha } });
    assert.equal(new URL(url).searchParams.get('ref'), sha);
    return Response.json(file(path.endsWith('Main.java') ? code : JSON.stringify(metadata)));
  };
  assert.deepEqual(await confirmSubmission(settings, submission, fetchImpl(submission.code)), {
    attempt: 1, url: `https://github.com/team/study/blob/${sha}/learner/0001-fail/Main.java`,
  });
  await assert.rejects(confirmSubmission(settings, submission, fetchImpl(submission.code.slice(1))), /소스가 수집한 원문과 다릅니다/);
});

test('missing problem branches or capture pointers leave originals queued', async () => {
  for (const exists of [false, true]) {
    const result = await confirmSubmission(settings, submission, async url => {
      if (exists && new URL(url).pathname.endsWith('/git/ref/heads/baekjoon/1000')) return Response.json({ object: { sha } });
      return new Response(null, { status: 404 });
    });
    assert.equal(result, null);
  }
});

test('mismatched metadata and GitHub errors never confirm a submission', async () => {
  for (const changed of [{ platform: 'programmers' }, { problemId: '9999' }, { account: 'other' }, { member: 'other' },
    { captureId: 'another' }, { outcome: 'pass' }, { attempt: 2 }, { attempt: 0 }, { path: '../Main.java' }]) {
    await assert.rejects(confirmSubmission(settings, submission, async url => {
      if (new URL(url).pathname.includes('/git/ref/')) return Response.json({ object: { sha } });
      return Response.json(file(JSON.stringify({ ...metadata, ...changed })));
    }), /제출 정보가 다릅니다/);
  }
  await assert.rejects(confirmSubmission(settings, submission, async () => new Response(null, { status: 403 })), /HTTP 403/);
  await assert.rejects(confirmSubmission(settings, submission, async () => Response.json({ object: { sha: 'bad' } })), /저장 위치/);
});
