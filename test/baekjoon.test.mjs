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
function page(code = defaultCode) {
  const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return new Response(`<html><textarea class="codemirror-textarea" name="source">${escaped}</textarea></html>`, { headers: { 'content-type': 'text/html; charset=UTF-8' } });
}
// 테스트에서는 DOMParser의 textarea RCDATA 처리만 재현한다. 실제 파서는 Chrome에서 확인한다.
class DOMParser {
  parseFromString(html) {
    const raw = html.match(/^<textarea>([\s\S]*)<\/textarea>$/)[1].replace(/\r\n?/g, '\n').replace(/^\n/, '');
    const textContent = raw.replace(/&(?:#(\d+)|amp|lt|gt);/g, (entity, number) => number ? String.fromCodePoint(Number(number)) : ({ '&amp;': '&', '&lt;': '<', '&gt;': '>' })[entity]);
    return { querySelector: () => ({ textContent }) };
  }
}
async function browser(rows, response = () => page()) {
  const collected = [], timers = [], errors = [];
  const window = { addEventListener() {}, postMessage() {} };
  const chrome = { runtime: { sendMessage(message, callback) { if (message.type === 'settings') callback({ enabled: true, baekjoon: 'rudevico' }); else { if (message.type === 'capture') collected.push(message.submission); if (message.type === 'error') errors.push(message.message); callback({}); } } }, storage: { onChanged: { addListener() {} } } };
  const table = { querySelectorAll: selector => selector === 'thead th' ? ['제출 번호', '아이디', '언어', '코드 길이'].map(textContent => ({ textContent })) : rows };
  const document = { querySelector: selector => selector === 'a.username' ? { textContent: 'rudevico' } : table };
  vm.runInNewContext(script, { chrome, window, document, location: { hostname: 'www.acmicpc.net', pathname: '/status', origin: 'https://www.acmicpc.net' }, URL, Date, TextDecoder, TextEncoder, DOMParser,
    AbortSignal, setInterval: callback => timers.push(callback), fetch: async url => response(url), console: { warn() {} } });
  await new Promise(resolve => setImmediate(resolve));
  return { collected, errors, scan: () => timers[0]() };
}

test('BOJ reads own completed passes and failures from source pages and ignores judging rows', async () => {
  const code = '\r\n\ufeffclass Main {\r\n  // < > & &lt; 공백  \r\n}\r\n';
  const length = Buffer.byteLength(code);
  const b = await browser([row('6', 'awa', 'rudevico', length), row('5', 'judging'), row('4', 'ce', 'rudevico', length), row('3', 'ac-eng', 'rudevico', length), row('2', 'wa', 'rudevico', length), row('1', 'ac', 'other')], () => page(code));
  await b.scan(); await b.scan();
  assert.deepEqual(b.collected.map(item => item.captureId), ['boj-2', 'boj-3', 'boj-4', 'boj-6']);
  assert.deepEqual(b.collected.map(item => item.outcome), ['fail', 'pass', 'fail', 'fail']);
  assert.equal(b.collected[0].code, code); assert.equal(b.collected[0].title, 'A+B');
});

test('BOJ login HTML and the empty HTTP 200 response are not saved as source', async () => {
  for (const html of ['<html>로그인</html>', '']) {
    const b = await browser([row('1', 'ac')], () => new Response(html, { headers: { 'content-type': 'text/html' } }));
    await b.scan(); assert.equal(b.collected.length, 0); assert.match(b.errors[0], /원문을 찾지 못했습니다/);
  }
});

test('an inaccessible older submission does not block later submissions on the same status page', async () => {
  const requested = [];
  const b = await browser([row('2', 'wa'), row('1', 'ac')], url => {
    requested.push(url);
    return url.endsWith('/1') ? new Response(null, { status: 404 }) : page();
  });
  await b.scan(); await b.scan();
  assert.deepEqual(b.collected.map(item => item.captureId), ['boj-2']);
  assert.deepEqual(requested, ['/source/1', '/source/2']);
});

test('source that differs from the status page byte count is not sent', async () => {
  const b = await browser([row('1', 'ac', 'rudevico', 999)]);
  await b.scan(); assert.equal(b.collected.length, 0); assert.match(b.errors[0], /코드 길이가 다릅니다/);
});
