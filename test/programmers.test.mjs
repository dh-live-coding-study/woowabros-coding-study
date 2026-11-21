import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../extension/programmers.js', import.meta.url), 'utf8');
function browser() {
  const emitted = [], handlers = new Map(); let id = 0;
  class Socket {
    constructor(url = 'wss://ws.programmers.co.kr/cable') { this.url = url; this.listeners = []; this.sent = []; }
    send(value) { this.sent.push(value); }
    addEventListener(type, callback) { if (type === 'message') this.listeners.push(callback); }
    receive(value) { this.listeners.forEach(callback => callback({ data: JSON.stringify(value) })); }
  }
  const window = { addEventListener: (type, handler) => handlers.set(type, handler), postMessage: value => emitted.push(value) };
  const location = { origin: 'https://school.programmers.co.kr', pathname: '/learn/courses/30/lessons/42576' };
  vm.runInNewContext(source, { window, location, WebSocket: Socket, crypto: { randomUUID: () => `capture-${++id}` }, Date,
    document: { querySelector: selector => selector.includes('challenge-title') ? { textContent: '완주하지 못한 선수' } : { getAttribute: () => '1' } } });
  handlers.get('message')({ source: window, origin: location.origin, data: { channel: 'woowabros-submission-v1', type: 'configure', enabled: true } });
  const identifier = JSON.stringify({ channel: 'Challenge::AlgorithmChannel', lesson_id: 42576, language: 'java' });
  const socket = new Socket();
  const submit = (code, action = 'submit', spec = identifier) => socket.send(JSON.stringify({ command: 'message', identifier: spec, data: JSON.stringify({ action, codes: { 42: code } }) }));
  const result = (data, spec = identifier) => socket.receive({ identifier: spec, message: { action: 'submit', ...data } });
  return { emitted, socket, submit, result, identifier, location };
}

test('only submit snapshots source, final pass/fail preserves the submitted bytes across repeat attempts', () => {
  const b = browser(), code = '\ufeffclass Solution {\r\n  // 공백  \r\n}\r\n';
  b.submit('sample', 'run'); assert.equal(b.emitted.filter(item => item.type === 'pending').length, 0);
  b.submit(code); b.result({ type: 'testcase', passed: false });
  assert.equal(b.emitted.filter(item => item.type === 'capture').length, 0);
  b.result({ type: 'result_lesson_challenge', passed: false });
  b.submit(code); b.result({ type: 'result', passed: true });
  const captures = b.emitted.filter(item => item.type === 'capture').map(item => item.submission);
  assert.deepEqual(captures.map(item => item.outcome), ['fail', 'pass']);
  assert.notEqual(captures[0].captureId, captures[1].captureId);
  assert.equal(captures[0].code, code); assert.equal(captures[1].code, code);
  b.result({ type: 'finish' }); assert.equal(b.emitted.filter(item => item.type === 'capture').length, 2);
});

test('runtime/compile failure is fail, missing verdict stays pending, foreign channels and exams are ignored', () => {
  const b = browser();
  b.submit('class Solution {}'); b.result({ type: 'finish' });
  assert.equal(b.emitted.filter(item => item.type === 'capture').length, 0);
  b.result({ type: 'notice', exitCode: -1, stderr: 'compile message' });
  assert.equal(b.emitted.find(item => item.type === 'capture').submission.outcome, 'fail');
  const exam = JSON.stringify({ channel: 'Challenge::AlgorithmChannel', lesson_id: 42576, test_id: 7, language: 'java' });
  b.submit('private', 'submit', exam);
  b.submit('private', 'submit', JSON.stringify({ channel: 'OtherChannel', lesson_id: 42576 }));
  assert.equal(b.emitted.filter(item => item.type === 'pending').length, 1);
  assert.equal(b.socket.sent.length, 3);
});
