import test from 'node:test';
import assert from 'node:assert/strict';
import { createSourceReader } from '../extension/source-reader.mjs';
const request = (id = '1') => ({ origin: 'https://acmicpc.net', id, account: 'rudevico' });
const tick = () => new Promise(resolve => setImmediate(resolve));
function tabs(response = () => ({ code: 'class Main {}' })) {
  const listeners = new Set(), created = [], removed = [], messages = [];
  let next = 100, active = 0, maxActive = 0;
  const api = {
    autoComplete: true, created, removed, messages, listeners,
    get maxActive() { return maxActive; },
    onUpdated: { addListener(fn) { listeners.add(fn); }, removeListener(fn) { listeners.delete(fn); } },
    complete(id) { for (const fn of listeners) fn(id, { status: 'complete' }); },
    async create(options) {
      const tab = { ...options, id: ++next, status: 'loading' }; created.push(tab);
      active++; maxActive = Math.max(maxActive, active);
      if (api.autoComplete) api.complete(tab.id);
      return tab;
    },
    async sendMessage(id, message, options) { messages.push({ id, message, options }); return response(message); },
    async remove(id) { removed.push(id); active--; },
  };
  return api;
}

test('source tabs are read in order and only the created tabs are closed', async () => {
  const code = '\n\ufeffclass Main {\r\n // 한글 & < >\r\n}\r\n';
  const api = tabs(() => ({ code })), read = createSourceReader(api);
  assert.deepEqual(await Promise.all([read(request('1')), read(request('2'))]), [code, code]);
  assert.deepEqual(api.created.map(tab => tab.url), ['https://acmicpc.net/source/1', 'https://acmicpc.net/source/2']);
  assert.ok(api.created.every(tab => tab.active === false));
  assert.deepEqual(api.removed, api.created.map(tab => tab.id));
  assert.equal(api.maxActive, 1); assert.equal(api.listeners.size, 0);
  assert.deepEqual(api.messages[0], { id: 101, message: { type: 'read-source-page', id: '1', account: 'rudevico' }, options: { frameId: 0 } });
});

test('another tab completing does not release the source read', async () => {
  const api = tabs(); api.autoComplete = false;
  const result = createSourceReader(api)(request());
  await tick(); api.complete(999); await tick(); assert.equal(api.messages.length, 0);
  api.complete(api.created[0].id); assert.equal(await result, 'class Main {}');
  assert.deepEqual(api.removed, [101]);
});

test('invalid source requests never open a tab', async () => {
  const api = tabs(), read = createSourceReader(api);
  await assert.rejects(read({ ...request(), origin: 'https://example.com' }), /허용하지/);
  await assert.rejects(read(request('../settings')), /허용하지/);
  assert.equal(api.created.length, 0);
});

test('page errors and messaging failures close the source tab', async () => {
  for (const response of [() => ({ error: '계정 불일치' }), () => { throw new Error('tab closed'); }, () => ({ code: '' })]) {
    const api = tabs(response);
    await assert.rejects(createSourceReader(api)(request()));
    assert.deepEqual(api.removed, [101]); assert.equal(api.listeners.size, 0);
  }
});

test('a timed out read closes its tab and does not block the next request', async () => {
  const api = tabs(); api.autoComplete = false;
  const read = createSourceReader(api, { timeoutMs: 20 });
  await assert.rejects(read(request()), /시간이 초과/);
  assert.deepEqual(api.removed, [101]); assert.equal(api.listeners.size, 0);
  api.autoComplete = true;
  assert.equal(await read(request('2')), 'class Main {}'); assert.deepEqual(api.removed, [101, 102]);
});

test('a tab created after timeout is still closed without reading it', async () => {
  const api = tabs(); let release;
  api.create = () => new Promise(resolve => { release = resolve; });
  await assert.rejects(createSourceReader(api, { timeoutMs: 20 })(request()), /시간이 초과/);
  release({ id: 888, status: 'loading' }); await tick();
  assert.deepEqual(api.removed, [888]); assert.equal(api.messages.length, 0); assert.equal(api.listeners.size, 0);
});
