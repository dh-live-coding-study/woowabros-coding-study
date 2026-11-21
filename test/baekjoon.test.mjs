import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const script = await readFile(new URL('../extension/bridge.js', import.meta.url), 'utf8');
function row(id, category, user = 'rudevico') {
  const link = { textContent: '1000', getAttribute: key => key === 'href' ? '/problem/1000' : key === 'data-original-title' ? 'A+B' : null };
  const result = { textContent: category, getAttribute: () => category };
  return { id: `solution-${id}`, querySelectorAll: () => [{ textContent: id }, { textContent: user }, { textContent: 'Java 17' }], querySelector: selector => selector === '[data-color]' ? result : link };
}
async function browser(rows, response) {
  const collected = [], timers = [];
  const window = { addEventListener() {}, postMessage() {} };
  const chrome = { runtime: { sendMessage(message, callback) { if (message.type === 'settings') callback({ enabled: true, baekjoon: 'rudevico' }); else { if (message.type === 'capture') collected.push(message.submission); callback({}); } } }, storage: { onChanged: { addListener() {} } } };
  const table = { querySelectorAll: selector => selector === 'thead th' ? ['제출 번호', '아이디', '언어'].map(textContent => ({ textContent })) : rows };
  const document = { querySelector: selector => selector === 'a.username' ? { textContent: 'rudevico' } : table };
  vm.runInNewContext(script, { chrome, window, document, location: { hostname: 'www.acmicpc.net', pathname: '/status', origin: 'https://www.acmicpc.net' }, URL, Date, TextDecoder,
    AbortSignal, setInterval: callback => timers.push(callback), fetch: async url => response(url), console: { warn() {} } });
  await new Promise(resolve => setImmediate(resolve));
  return { collected, scan: () => timers[0]() };
}

test('BOJ collects own completed passes and failures, preserves BOM and ignores judging rows', async () => {
  const code = '\ufeffclass Main {\r\n  // 공백  \r\n}\r\n';
  const b = await browser([row('6', 'awa'), row('5', 'judging'), row('4', 'ce'), row('3', 'ac-eng'), row('2', 'wa'), row('1', 'ac', 'other')], () => new Response(Buffer.from(code), { headers: { 'content-type': 'application/octet-stream' } }));
  await b.scan(); await b.scan();
  assert.deepEqual(b.collected.map(item => item.captureId), ['boj-2', 'boj-3', 'boj-4', 'boj-6']);
  assert.deepEqual(b.collected.map(item => item.outcome), ['fail', 'pass', 'fail', 'fail']);
  assert.equal(b.collected[0].code, code); assert.equal(b.collected[0].title, 'A+B');
});

test('BOJ login/error HTML is not saved as submitted source', async () => {
  const b = await browser([row('1', 'ac')], () => new Response('<html>로그인</html>', { headers: { 'content-type': 'text/html' } }));
  await b.scan(); assert.equal(b.collected.length, 0);
});

test('an inaccessible older submission does not block later submissions on the same status page', async () => {
  const requested = [];
  const b = await browser([row('2', 'wa'), row('1', 'ac')], url => {
    requested.push(url);
    return url.endsWith('/1') ? new Response(null, { status: 404 }) : new Response('class Main {}');
  });
  await b.scan(); await b.scan();
  assert.deepEqual(b.collected.map(item => item.captureId), ['boj-2']);
  assert.deepEqual(requested, ['/source/download/1', '/source/download/2']);
});

test('source attachments remain source files even when the server labels their MIME type as HTML', async () => {
  const code = '\ufeffimport java.io.*;\r\npublic class Main {}\r\n';
  const b = await browser([row('1', 'ac')], () => new Response(Buffer.from(code), { headers: {
    'content-type': 'text/html; charset=UTF-8', 'content-disposition': 'attachment; filename="1.java"',
  } }));
  await b.scan(); assert.equal(b.collected.length, 1); assert.equal(b.collected[0].code, code);
});
