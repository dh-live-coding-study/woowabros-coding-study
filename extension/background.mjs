import { dispatchSubmission, confirmSubmission } from './delivery.mjs';
const alarm = 'confirm-submissions';
const origins = new Set(['https://acmicpc.net', 'https://www.acmicpc.net', 'https://school.programmers.co.kr']);
const ready = (async () => {
  await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  if (!await chrome.alarms.get(alarm)) await chrome.alarms.create(alarm, { periodInMinutes: 1 });
})();
let serial = Promise.resolve(), network = Promise.resolve();
const active = new Set();
const enqueue = task => serial = serial.catch(() => {}).then(task);
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
async function state() { await ready; return { queue: [], history: [], ...(await chrome.storage.local.get(['settings', 'queue', 'history', 'lastError'])) }; }
function validate(item, sender, pending = false) {
  if (!item || !['baekjoon', 'programmers'].includes(item.platform) || !/^[1-9][0-9]{0,11}$/.test(item.problemId || '') || !/^[a-zA-Z0-9_-]{1,100}$/.test(item.captureId || '') || !(pending ? item.outcome === 'pending' : ['pass', 'fail'].includes(item.outcome)) || typeof item.code !== 'string' || !item.code.trim() || new TextEncoder().encode(item.code).length > 40000) throw new Error('제출 정보 또는 코드 크기를 확인하세요.');
  const expected = item.platform === 'programmers' ? 'https://school.programmers.co.kr' : null;
  if (expected ? new URL(sender.url).origin !== expected : !['https://acmicpc.net', 'https://www.acmicpc.net'].includes(new URL(sender.url).origin)) throw new Error('다른 사이트의 제출입니다.');
}
function deliver(key, mode = 'send') {
  if (active.has(key)) return;
  active.add(key);
  network = network.catch(() => {}).then(async () => {
    try {
      const record = await enqueue(async () => {
        const data = await state(), record = data.queue.find(item => item.key === key);
        if (!record || record.state === 'waiting') return null;
        if (data.settings?.repository === record.settings.repository && data.settings?.member === record.settings.member) record.settings.token = data.settings.token;
        return record;
      });
      if (!record) return;
      // 네트워크를 기다리는 동안에도 새 원문은 별도 저장 대기열에 즉시 기록한다.
      const found = mode === 'send' ? null : await confirmSubmission(record.settings, record.submission);
      if (!found && mode !== 'confirm') await dispatchSubmission(record.settings, record.submission);
      await enqueue(async () => {
        const data = await state(), current = data.queue.find(item => item.key === key);
        if (!current) return;
        if (found) {
          data.queue = data.queue.filter(item => item.key !== key);
          data.history.push({ key, platform: current.submission.platform, problemId: current.submission.problemId, outcome: current.submission.outcome, ...found });
        } else {
          current.state = 'sent'; current.nextCheckAt = Date.now() + 60000;
          current.message = mode === 'confirm' ? 'PR을 기다리며 원문을 보관하고 있습니다.' : 'PR 생성을 요청했습니다.';
          data.queue = [...data.queue.filter(item => item.key !== key), current];
        }
        await chrome.storage.local.set({ queue: data.queue, history: data.history, lastError: '' });
      });
    } catch (error) {
      await enqueue(async () => {
        const data = await state(), record = data.queue.find(item => item.key === key);
        if (record) {
          if (mode !== 'confirm') record.state = 'failed';
          record.message = error.message; record.nextCheckAt = Date.now() + 300000;
          data.queue = [...data.queue.filter(item => item.key !== key), record];
          await chrome.storage.local.set({ queue: data.queue });
        }
      });
    } finally {
      active.delete(key);
      await enqueue(async () => {
        const data = await state();
        for (const record of data.queue.filter(item => item.state === 'saved')) deliver(record.key);
      });
    }
  });
}
async function handle(message, sender) {
  const options = sender.url === chrome.runtime.getURL('options.html');
  const site = sender.tab && sender.frameId === 0 && origins.has(new URL(sender.url).origin);
  if (!options && !site) throw new Error('허용하지 않는 요청입니다.');
  const data = await state();
  if (message.type === 'settings') return { enabled: data.settings?.enabled === true, baekjoon: data.settings?.baekjoon || '', programmers: data.settings?.programmers || '' };
  if (options && message.type === 'queue') return { queue: data.queue.map(({ submission, settings, ...rest }) => ({ ...rest, platform: submission.platform, problemId: submission.problemId, outcome: submission.outcome })), history: data.history, lastError: data.lastError };
  if (options && message.type === 'export') return data.queue.map(record => record.submission);
  if (site && message.type === 'error') {
    await chrome.storage.local.set({ lastError: String(message.message).slice(0, 200) }); return {};
  }
  if (options && message.type === 'retry') {
    const record = data.queue.find(item => item.key === message.key);
    if (!record) throw new Error('대기 중인 제출이 없습니다.');
    if (record.state === 'waiting') throw new Error('채점 결과가 아직 확인되지 않았습니다. 원문 저장으로 코드를 보관할 수 있습니다.');
    deliver(record.key, 'retry'); return {};
  }
  if (site && ['capture', 'pending'].includes(message.type)) {
    if (!data.settings?.enabled) return {};
    const submission = structuredClone(message.submission); validate(submission, sender, message.type === 'pending');
    const configured = data.settings[submission.platform];
    if (!configured) throw new Error('사이트 계정을 설정하세요.');
    if (submission.platform === 'baekjoon' && submission.account !== configured) throw new Error('로그인한 백준 계정이 설정과 다릅니다.');
    // 프로그래머스 연습 화면은 계정 ID를 제공하지 않아 참여자가 입력한 계정을 사용한다.
    if (submission.platform === 'programmers') submission.account = configured;
    const key = `${data.settings.repository}/${data.settings.member}/${submission.platform}/${submission.captureId}`;
    if (data.history.some(item => item.key === key)) return {};
    const waiting = data.queue.find(item => item.key === key);
    if (waiting) {
      if (message.type === 'pending' || waiting.state !== 'waiting') return {};
      if (waiting.submission.code !== submission.code) throw new Error('대기 중인 제출 원문이 다릅니다.');
      waiting.submission = submission; waiting.state = 'saved'; waiting.message = '원문을 보관했습니다.';
      await chrome.storage.local.set({ queue: data.queue }); deliver(key); return {};
    }
    const pending = message.type === 'pending';
    data.queue.push({ key, submission, settings: { ...data.settings }, state: pending ? 'waiting' : 'saved',
      message: pending ? '채점 결과를 기다립니다. 페이지를 닫으면 결과를 확인하지 못할 수 있습니다.' : '원문을 보관했습니다.' });
    await chrome.storage.local.set({ queue: data.queue });
    if (!pending) deliver(key);
    return {};
  }
  throw new Error('허용하지 않는 요청입니다.');
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  enqueue(() => handle(message, sender)).then(respond, async error => {
    await chrome.storage.local.set({ lastError: error.message });
    respond({ error: error.message });
  });
  return true;
});
chrome.alarms.onAlarm.addListener(event => {
  if (event.name !== alarm) return;
  return enqueue(async () => {
    const data = await state();
    const record = data.queue.find(item => !active.has(item.key) && (item.state === 'saved' || item.state === 'sent' && (item.nextCheckAt || 0) <= Date.now()));
    if (record) deliver(record.key, record.state === 'saved' ? 'send' : 'confirm');
  });
});
