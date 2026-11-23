import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const script = (await readFile(new URL('../extension/background.mjs', import.meta.url), 'utf8')).replace(/^import[^\n]+\n/gm, '');
async function background(dispatch, readSource = async () => 'class Main {}', confirm = async () => null) {
  const saved = { settings: { enabled: true, repository: 'team/study', member: 'learner', baekjoon: 'rudevico', programmers: 'rudevico', token: 'fixture-token' } };
  const calls = []; let listener, alarm;
  const chrome = {
    storage: { local: { async setAccessLevel() {}, async get(keys) { return Object.fromEntries(keys.filter(key => saved[key] !== undefined).map(key => [key, structuredClone(saved[key])])); }, async set(values) { Object.assign(saved, structuredClone(values)); } } },
    alarms: { async get() { return {}; }, async create() {}, onAlarm: { addListener(fn) { alarm = fn; } } },
    action: { onClicked: { addListener() {} } },
    runtime: { getURL: name => `chrome-extension://collector/${name}`, onMessage: { addListener(fn) { listener = fn; } } },
  };
  vm.runInNewContext(script, { chrome, URL, Date, TextEncoder, structuredClone,
    createSourceReader: () => readSource, dispatchSubmission: async (settings, item) => { calls.push(structuredClone(item)); if (dispatch) await dispatch(item); }, confirmSubmission: confirm });
  await new Promise(resolve => setImmediate(resolve));
  const send = (message, sender = { url: 'https://school.programmers.co.kr/learn/courses/30/lessons/42576', frameId: 0, tab: { id: 1 } }) => new Promise(resolve => listener(message, sender, resolve));
  return { saved, calls, send, alarm, options: { url: 'chrome-extension://collector/options.html' } };
}
const item = (id, outcome = 'fail') => ({ platform: 'programmers', problemId: '42576', captureId: id, code: 'class Solution {}', outcome, account: '', extension: 'java', verdict: '오답', title: 'Example', capturedAt: 1700000000000 });

test('more than 30 attempts stay queued and history does not discard unconfirmed originals', async () => {
  const b = await background();
  for (let index = 1; index <= 35; index++) await b.send({ type: 'capture', submission: item(`pg-${index}`) });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(b.saved.queue.length, 35); assert.equal(b.calls.length, 35);
  assert.equal(b.saved.queue[0].submission.code, 'class Solution {}');
  await b.send({ type: 'capture', submission: item('pg-1') }); assert.equal(b.calls.length, 35);
  const exported = await b.send({ type: 'export' }, b.options);
  assert.equal(exported.length, 35); assert.doesNotMatch(JSON.stringify(exported), /fixture-token/);
});

test('pending source persists before judgment, fail resolves it once, page messages never receive the token', async () => {
  const b = await background();
  await b.send({ type: 'pending', submission: item('pg-1', 'pending') });
  assert.equal(b.saved.queue[0].state, 'waiting'); assert.equal(b.calls.length, 0);
  await b.send({ type: 'capture', submission: item('pg-1', 'fail') });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(b.saved.queue.length, 1); assert.equal(b.calls.length, 1); assert.equal(b.calls[0].outcome, 'fail');
  const settings = await b.send({ type: 'settings' }); assert.doesNotMatch(JSON.stringify(settings), /fixture-token/);
  const foreign = await b.send({ type: 'capture', submission: item('pg-2') }, { url: 'https://example.org', tab: { id: 1 }, frameId: 0 });
  assert.match(foreign.error, /허용하지/); assert.equal(b.calls.length, 1);
});

test('confirmed problem-branch storage moves a queued original to history without redispatch', async () => {
  let stored = false;
  const receipt = { attempt: 3, url: `https://github.com/team/study/blob/${'a'.repeat(40)}/learner/0003-fail/Solution.java` };
  const b = await background(undefined, undefined, async () => stored ? receipt : null);
  await b.send({ type: 'capture', submission: item('pg-confirm') });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(b.saved.queue.length, 1); assert.equal(b.saved.history?.length || 0, 0);
  stored = true;
  await b.send({ type: 'retry', key: b.saved.queue[0].key }, b.options);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(b.calls.length, 1); assert.equal(b.saved.queue.length, 0);
  assert.equal(b.saved.history[0].attempt, receipt.attempt); assert.equal(b.saved.history[0].url, receipt.url);
});

test('slow GitHub dispatch does not delay durable storage of the next submitted source', async () => {
  let release;
  const delay = new Promise(resolve => release = resolve);
  const b = await background(async () => delay);
  await b.send({ type: 'capture', submission: item('pg-1') });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(b.calls.length, 1);
  await b.send({ type: 'pending', submission: item('pg-2', 'pending') });
  assert.equal(b.saved.queue.length, 2);
  assert.equal(b.saved.queue[1].submission.captureId, 'pg-2');
  assert.equal(b.saved.queue[1].state, 'waiting');
  release(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(b.saved.queue.length, 2);
});


test('source tab loading does not delay storage of a new submission', { timeout: 2000 }, async () => {
  let release;
  const b = await background(undefined, () => new Promise(resolve => { release = resolve; }));
  const reading = b.send({ type: 'read-source', id: '1', account: 'rudevico' }, { url: 'https://acmicpc.net/status', frameId: 0, tab: { id: 2 } });
  await new Promise(resolve => setImmediate(resolve));
  try {
    await b.send({ type: 'pending', submission: item('pg-while-reading', 'pending') });
    assert.equal(b.saved.queue[0].submission.captureId, 'pg-while-reading');
  } finally { release('class Main {}'); }
  assert.equal((await reading).code, 'class Main {}');
});

test('source reads reject other pages and accounts before opening tabs', async () => {
  let reads = 0;
  const b = await background(undefined, async () => { reads++; return 'class Main {}'; });
  const message = { type: 'read-source', id: '1', account: 'rudevico' };
  assert.match((await b.send(message)).error, /허용하지/);
  assert.match((await b.send(message, { url: 'https://acmicpc.net/source/1', frameId: 0, tab: { id: 2 } })).error, /허용하지/);
  assert.match((await b.send({ ...message, account: 'other' }, { url: 'https://acmicpc.net/status', frameId: 0, tab: { id: 2 } })).error, /설정과 계정/);
  assert.equal(reads, 0);
});
