import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const script = await readFile(new URL('../extension/bridge.js', import.meta.url), 'utf8');
const defaultCode = 'class Main {}';
function row(id, category, user = 'rudevico', length = Buffer.byteLength(defaultCode)) {
  const link = { textContent: '1000', getAttribute: key => key === 'href' ? '/problem/1000' : key === 'data-original-title' ? 'A+B' : null };
  const result = { textContent: category, getAttribute: () => category };
  return { id: `solution-${id}`, querySelectorAll: () => [{ textContent: id }, { textContent: user }, { textContent: 'Java 17' }, { textContent: `${length} B` }], querySelector: selector => selector === '[data-color]' ? result : link };
}
async function browser(rows = [], read = () => defaultCode, { pathname = '/status', owner = 'rudevico', source = defaultCode, sourceId = '1' } = {}) {
  const collected = [], scans = [], errors = [];
  let listener, now = Date.now();
  const window = { addEventListener() {}, postMessage() {} };
  const chrome = { runtime: {
    id: 'collector', onMessage: { addListener(fn) { listener = fn; } },
    sendMessage(message, callback) {
      if (message.type === 'settings') callback({ enabled: true, baekjoon: 'rudevico' });
      else if (message.type === 'read-source') Promise.resolve().then(() => read(message.id)).then(code => callback({ code }), error => callback({ error: error.message }));
      else { if (message.type === 'capture') collected.push(message.submission); if (message.type === 'error') errors.push(message.message); callback({}); }
    },
  }, storage: { onChanged: { addListener() {} } } };
  const table = { querySelectorAll: selector => selector === 'thead th' ? ['제출 번호', '아이디', '언어', '코드 길이'].map(textContent => ({ textContent })) : rows };
  const metadata = { querySelectorAll: () => [
    { querySelectorAll: () => ['제출 번호', '아이디'].map(textContent => ({ textContent })) },
    { querySelectorAll: () => [sourceId, owner].map(textContent => ({ textContent })) },
  ] };
  const document = { querySelector: selector => selector === 'a.username' ? { textContent: 'rudevico' } : selector === 'table' ? metadata : selector === 'textarea[name="source"]' ? (source === null ? null : { value: source }) : table };
  vm.runInNewContext(script, { chrome, window, document, location: { hostname: 'acmicpc.net', pathname, origin: 'https://acmicpc.net' }, URL, Date: { now: () => now }, TextEncoder,
    setInterval: callback => scans.push(callback), console: { warn() {} } });
  await new Promise(resolve => setImmediate(resolve));
  return { collected, errors, scan: () => scans[0](), advance: ms => { now += ms; },
    readPage: (message = { type: 'read-source-page', id: '1', account: 'rudevico' }, sender = { id: 'collector' }) => new Promise(resolve => listener(message, sender, resolve)) };
}

test('BOJ collects own completed passes and failures without altering the returned source', async () => {
  const code = '\n\ufeffclass Main {\r\n // < > & &lt; 공백  \r\n}\r\n';
  const length = Buffer.byteLength(code);
  const b = await browser([row('6', 'awa', 'rudevico', length), row('5', 'judging'), row('4', 'ce', 'rudevico', length), row('3', 'ac-eng', 'rudevico', length), row('2', 'wa', 'rudevico', length), row('1', 'ac', 'other')], () => code);
  await b.scan(); await b.scan();
  assert.deepEqual(b.collected.map(item => item.captureId), ['boj-2', 'boj-3', 'boj-4', 'boj-6']);
  assert.deepEqual(b.collected.map(item => item.outcome), ['fail', 'pass', 'fail', 'fail']);
  assert.equal(b.collected[0].code, code); assert.equal(b.collected[0].title, 'A+B');
});

test('an inaccessible older submission does not block later submissions or retry immediately', async () => {
  const requested = [];
  const b = await browser([row('2', 'wa'), row('1', 'ac')], id => { requested.push(id); if (id === '1') throw new Error('원문 없음'); return defaultCode; });
  await b.scan(); await b.scan(); assert.deepEqual(requested, ['1', '2']);
  assert.deepEqual(b.collected.map(item => item.captureId), ['boj-2']);
  b.advance(31000); await b.scan(); assert.deepEqual(requested, ['1', '2', '1']);
});

test('a byte count mismatch prevents capture', async () => {
  const b = await browser([row('1', 'ac', 'rudevico', 999)]);
  await b.scan(); assert.equal(b.collected.length, 0); assert.match(b.errors[0], /코드 길이가 다릅니다/);
});

test('a source tab returns the textarea only for its requested submission and owner', async () => {
  const b = await browser([], undefined, { pathname: '/source/1' });
  const response = await b.readPage(); assert.equal(response.code, defaultCode);
  const otherId = await b.readPage({ type: 'read-source-page', id: '2', account: 'rudevico' }); assert.match(otherId.error, /허용하지/);
  const foreignSender = await b.readPage(undefined, { id: 'foreign' }); assert.match(foreignSender.error, /허용하지/);
  const otherOwner = await browser([], undefined, { pathname: '/source/1', owner: 'other' }); assert.match((await otherOwner.readPage()).error, /계정/);
  const staleSource = await browser([], undefined, { pathname: '/source/1', sourceId: '2' }); assert.match((await staleSource.readPage()).error, /제출 번호/);
  const absent = await browser([], undefined, { pathname: '/source/1', source: null }); assert.match((await absent.readPage()).error, /원문을 찾지/);
});
