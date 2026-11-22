(() => {
  const channel = 'woowabros-submission-v1';
  let settings = {}, busy = false;
  const seen = new Set(), retryAfter = new Map();
  const send = message => new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, result => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else if (result?.error) reject(new Error(result.error));
      else resolve(result);
    });
  });
  const report = error => {
    console.warn('[study collector]', error.message);
    send({ type: 'error', message: error.message }).catch(() => {});
  };
  async function configure() {
    settings = await send({ type: 'settings' });
    window.postMessage({ channel, type: 'configure', enabled: settings.enabled }, location.origin);
  }
  window.addEventListener('message', event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.channel !== channel) return;
    if (event.data.type === 'loaded') configure().catch(report);
    if (event.data.type === 'capture' || event.data.type === 'pending') send({ type: event.data.type, submission: event.data.submission }).catch(report);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) configure().catch(report);
  });
  configure().catch(report);

  function extension(language) {
    if (/java(?!script)/i.test(language)) return 'java';
    if (/python|pypy/i.test(language)) return 'py';
    if (/c\+\+/i.test(language)) return 'cpp';
    if (/^c(?:\d|\s|$)/i.test(language)) return 'c';
    if (/javascript|node/i.test(language)) return 'js';
    if (/typescript/i.test(language)) return 'ts';
    if (/kotlin/i.test(language)) return 'kt';
    if (/swift/i.test(language)) return 'swift';
    if (/c#/i.test(language)) return 'cs';
    if (/^go/i.test(language)) return 'go';
    if (/rust/i.test(language)) return 'rs';
    if (/ruby/i.test(language)) return 'rb';
    return 'txt';
  }
  function sourceFromHtml(html) {
    const source = html.match(/<textarea\b[^>]*\sname\s*=\s*(?:"source"|'source'|source(?=\s|>))[^>]*>([\s\S]*?)<\/textarea\s*>/i)?.[1];
    if (source === undefined) throw new Error('백준 소스 조회 화면에서 원문을 찾지 못했습니다. 로그인 상태를 확인하세요.');
    // HTML 파싱 과정에서 원문의 CRLF와 첫 줄바꿈이 바뀌지 않도록 문자 참조로 보호한다.
    const encoded = source.replace(/\r/g, '&#13;').replace(/\n/g, '&#10;');
    return new DOMParser().parseFromString(`<textarea>${encoded}</textarea>`, 'text/html').querySelector('textarea').textContent;
  }
  async function scanBaekjoon() {
    if (busy || !settings.enabled || !['acmicpc.net', 'www.acmicpc.net'].includes(location.hostname) || location.pathname !== '/status') return;
    const account = document.querySelector('a.username')?.textContent.trim();
    if (!account || account !== settings.baekjoon) return;
    const table = document.querySelector('#status-table');
    if (!table) return;
    busy = true;
    try {
      const headers = [...table.querySelectorAll('thead th')].map(cell => cell.textContent.trim());
      const userIndex = headers.findIndex(text => /아이디|user/i.test(text));
      const languageIndex = headers.findIndex(text => /언어|language/i.test(text));
      const lengthIndex = headers.findIndex(text => /코드\s*길이|code\s*length/i.test(text));
      if (userIndex < 0 || languageIndex < 0 || lengthIndex < 0) return;
      const rows = [...table.querySelectorAll('tbody tr[id^="solution-"]')].reverse();
      for (const row of rows) {
        const cells = row.querySelectorAll('td');
        if (cells[userIndex]?.textContent.trim() !== account) continue;
        const id = row.id.match(/^solution-([1-9][0-9]*)$/)?.[1];
        if (!id || seen.has(id) || (retryAfter.get(id) || 0) > Date.now()) continue;
        const result = row.querySelector('[data-color]');
        const category = result?.getAttribute('data-color')?.replace(/-eng$/, '');
        // 대기, 채점 중, 알 수 없는 판정은 완료로 처리하지 않는다.
        if (!['ac', 'wa', 'rte', 'ce', 'pe', 'tle', 'mle', 'ole', 'pac', 'awa'].includes(category)) continue;
        const link = row.querySelector('a.problem_title');
        const problemId = link?.getAttribute('href')?.match(/^\/problem\/([1-9][0-9]*)$/)?.[1];
        if (!problemId) continue;
        try {
          const response = await fetch(`/source/${id}`, { credentials: 'same-origin', redirect: 'error', signal: AbortSignal.timeout(15000) });
          if (!response.ok) throw new Error(`백준 ${id}번 소스 요청 실패: HTTP ${response.status}`);
          const code = sourceFromHtml(new TextDecoder('utf-8', { fatal: true }).decode(await response.arrayBuffer()));
          const length = Number(cells[lengthIndex]?.textContent.replace(/,/g, '').match(/^\s*([1-9][0-9]*)\s*B\s*$/i)?.[1]);
          if (!code.trim() || !Number.isSafeInteger(length) || new TextEncoder().encode(code).length !== length) throw new Error(`백준 ${id}번 원문과 채점 현황의 코드 길이가 다릅니다. 원문을 전송하지 않았습니다.`);
          const submission = { platform: 'baekjoon', problemId, captureId: `boj-${id}`, account,
            title: link.getAttribute('title') || link.getAttribute('data-original-title') || link.textContent.trim() || problemId,
            extension: extension(cells[languageIndex]?.textContent || ''), code, outcome: category === 'ac' ? 'pass' : 'fail',
            verdict: result.textContent.trim(), capturedAt: Date.now(), difficulty: '' };
          await send({ type: 'capture', submission }); seen.add(id);
        } catch (error) {
          retryAfter.set(id, Date.now() + 30000); report(error);
        }
      }
    } finally { busy = false; }
  }
  setInterval(() => scanBaekjoon().catch(report), 2000);
})();
