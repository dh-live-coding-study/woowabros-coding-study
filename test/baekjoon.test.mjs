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
  return { querySelector: selector => selector === 'textarea[name="source"]' ? { value: code } : null };
}
async function browser(rows, load = () => page()) {
  const collected = [], scans = [], errors = [], frames = [], timeouts = new Map();
  let active = 0, maxActive = 0, timerId = 0, now = Date.now();
  const window = { addEventListener() {}, postMessage() {} };
  const chrome = { runtime: { sendMessage(message, callback) { if (message.type === 'settings') callback({ enabled: true, baekjoon: 'rudevico' }); else { if (message.type === 'capture') collected.push(message.submission); if (message.type === 'error') errors.push(message.message); callback({}); } } }, storage: { onChanged: { addListener() {} } } };
  const table = { querySelectorAll: selector => selector === 'thead th' ? ['제출 번호', '아이디', '언어', '코드 길이'].map(textContent => ({ textContent })) : rows };
  const document = {
    querySelector: selector => selector === 'a.username' ? { textContent: 'rudevico' } : table,
    createElement(tag) {
      assert.equal(tag, 'iframe');
      const events = {}, attributes = {};
      const frame = {
        events, attributes, removed: false,
        addEventListener(type, handler) { events[type] = handler; },
        setAttribute(name, value) { attributes[name] = value; },
        remove() { if (!this.removed) { this.removed = true; active--; } },
      };
      return frame;
    },
    body: { append(frame) {
      frames.push(frame); active++; maxActive = Math.max(maxActive, active);
      Promise.resolve().then(async () => {
        try {
          const result = await load(frame.src);
          if (result === undefined) return;
          frame.contentDocument = result;
          frame.events.load();
        } catch { frame.events.error(); }
      });
    } },
  };
  vm.runInNewContext(script, { chrome, window, document, location: { hostname: 'www.acmicpc.net', pathname: '/status', origin: 'https://www.acmicpc.net' }, URL, Date: { now: () => now }, TextEncoder,
    setInterval: callback => scans.push(callback), setTimeout: callback => { timeouts.set(++timerId, callback); return timerId; }, clearTimeout: id => timeouts.delete(id), console: { warn() {} } });
  await new Promise(resolve => setImmediate(resolve));
  return { collected, errors, frames, timeouts, get maxActive() { return maxActive; }, scan: () => scans[0](), expire: () => [...timeouts.values()][0](), advance: ms => { now += ms; } };
}

test('BOJ reads own completed passes and failures one page at a time without altering the textarea value', async () => {
  const code = '\n\ufeffclass Main {\r\n  // < > & &lt; 공백  \r\n}\r\n';
  const length = Buffer.byteLength(code);
  const b = await browser([row('6', 'awa', 'rudevico', length), row('5', 'judging'), row('4', 'ce', 'rudevico', length), row('3', 'ac-eng', 'rudevico', length), row('2', 'wa', 'rudevico', length), row('1', 'ac', 'other')], () => page(code));
  await b.scan(); await b.scan();
  assert.deepEqual(b.collected.map(item => item.captureId), ['boj-2', 'boj-3', 'boj-4', 'boj-6']);
  assert.deepEqual(b.collected.map(item => item.outcome), ['fail', 'pass', 'fail', 'fail']);
  assert.equal(b.collected[0].code, code); assert.equal(b.collected[0].title, 'A+B');
  assert.equal(b.maxActive, 1); assert.equal(b.frames.length, 4); assert.equal(b.timeouts.size, 0);
  for (const frame of b.frames) {
    assert.equal(frame.hidden, true); assert.equal(frame.attributes.sandbox, 'allow-same-origin'); assert.equal(frame.removed, true);
  }
});

test('a missing or inaccessible source document is not collected and its frame is removed', async () => {
  for (const source of [null, { querySelector: () => null }]) {
    const b = await browser([row('1', 'ac')], () => source);
    await b.scan(); assert.equal(b.collected.length, 0); assert.match(b.errors[0], /원문을 찾지 못했습니다/);
    assert.equal(b.frames[0].removed, true); assert.equal(b.timeouts.size, 0);
  }
});

test('an inaccessible older submission does not block later submissions on the same status page', async () => {
  const requested = [];
  const b = await browser([row('2', 'wa'), row('1', 'ac')], url => {
    requested.push(url);
    return url.endsWith('/1') ? null : page();
  });
  await b.scan(); await b.scan();
  assert.deepEqual(b.collected.map(item => item.captureId), ['boj-2']);
  assert.deepEqual(requested, ['/source/1', '/source/2']);
});

test('a load error removes the frame and allows the next submission to be read', async () => {
  const b = await browser([row('2', 'ac'), row('1', 'ac')], url => {
    if (url.endsWith('/1')) throw new Error('network');
    return page();
  });
  await b.scan(); assert.deepEqual(b.collected.map(item => item.captureId), ['boj-2']);
  assert.match(b.errors[0], /화면/); assert.ok(b.frames.every(frame => frame.removed)); assert.equal(b.timeouts.size, 0);
});

test('a timed out source page is removed and does not leave the scanner busy', async () => {
  let loads = 0;
  const b = await browser([row('1', 'ac')], () => ++loads === 1 ? undefined : page());
  const scanning = b.scan();
  await new Promise(resolve => setImmediate(resolve));
  b.expire(); await scanning;
  assert.equal(b.collected.length, 0); assert.match(b.errors[0], /시간이 초과/);
  assert.equal(b.frames[0].removed, true); assert.equal(b.timeouts.size, 0);
  await b.scan(); assert.equal(b.frames.length, 1);
  b.advance(31000); await b.scan();
  assert.equal(b.frames.length, 2); assert.equal(b.collected[0]?.captureId, 'boj-1');
});

test('source that differs from the status page byte count is not sent', async () => {
  const b = await browser([row('1', 'ac', 'rudevico', 999)]);
  await b.scan(); assert.equal(b.collected.length, 0); assert.match(b.errors[0], /코드 길이가 다릅니다/);
  assert.equal(b.frames[0].removed, true);
});
