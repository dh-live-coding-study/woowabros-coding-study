export function createSourceReader(tabs, { timeoutMs = 15000 } = {}) {
  let serial = Promise.resolve();
  return request => {
    const result = serial.catch(() => {}).then(() => readSource(tabs, request, timeoutMs));
    serial = result;
    return result;
  };
}

async function readSource(tabs, { origin, id, account }, timeoutMs) {
  if (!['https://acmicpc.net', 'https://www.acmicpc.net'].includes(origin) || !/^[1-9][0-9]{0,11}$/.test(id || '') || typeof account !== 'string' || !account) throw new Error('허용하지 않는 백준 소스 요청입니다.');
  let tabId, timer, finished = false, resolveLoaded;
  const completed = new Set();
  const loaded = new Promise(resolve => { resolveLoaded = resolve; });
  const onUpdated = (id, change) => {
    if (change.status !== 'complete') return;
    completed.add(id);
    if (id === tabId) resolveLoaded();
  };
  tabs.onUpdated.addListener(onUpdated);
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`백준 ${id}번 소스 조회 시간이 초과됐습니다.`)), timeoutMs);
  });
  try {
    const operation = (async () => {
      const tab = await tabs.create({ url: `${origin}/source/${id}`, active: false });
      if (!Number.isSafeInteger(tab.id)) throw new Error('백준 소스 조회용 탭을 만들지 못했습니다.');
      tabId = tab.id;
      if (finished) {
        await tabs.remove(tabId).catch(() => {});
        throw new Error('백준 소스 조회가 이미 종료됐습니다.');
      }
      if (tab.status !== 'complete' && !completed.has(tabId)) await loaded;
      const response = await tabs.sendMessage(tabId, { type: 'read-source-page', id, account }, { frameId: 0 });
      if (response?.error) throw new Error(response.error);
      if (typeof response?.code !== 'string' || !response.code.trim() || new TextEncoder().encode(response.code).length > 40000) throw new Error(`백준 ${id}번 소스 조회 화면에서 원문을 읽지 못했습니다.`);
      return response.code;
    })();
    return await Promise.race([operation, timeout]);
  } finally {
    finished = true;
    clearTimeout(timer);
    tabs.onUpdated.removeListener(onUpdated);
    if (tabId !== undefined) await tabs.remove(tabId).catch(() => {});
  }
}
