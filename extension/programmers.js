(() => {
  const channel = 'woowabros-submission-v1';
  const originalSend = WebSocket.prototype.send;
  const watching = new WeakSet(), attempts = new WeakMap();
  let enabled = false;
  const emit = (type, submission) => window.postMessage({ channel, type, submission }, location.origin);
  window.addEventListener('message', event => {
    if (event.source === window && event.origin === location.origin && event.data?.channel === channel && event.data.type === 'configure') enabled = event.data.enabled === true;
  });
  function parse(text) { try { return JSON.parse(text); } catch { return null; } }
  function languageExtension(language) {
    const value = String(language).toLowerCase();
    if (/javascript|node/.test(value)) return 'js';
    if (/java/.test(value)) return 'java';
    if (/python|pypy/.test(value)) return 'py';
    if (/cpp|c\+\+/.test(value)) return 'cpp';
    if (/^c$/.test(value)) return 'c';
    if (/kotlin/.test(value)) return 'kt';
    if (/swift/.test(value)) return 'swift';
    if (/csharp/.test(value)) return 'cs';
    if (/go/.test(value)) return 'go';
    if (/mysql|oracle|sql/.test(value)) return 'sql';
    return 'txt';
  }
  function snapshot(identifier, data) {
    const problemId = location.pathname.match(/^\/learn\/courses\/30\/lessons\/([1-9][0-9]*)\/?$/)?.[1];
    const spec = parse(identifier);
    // 연습문제의 submit만 수집한다. run, 저장, 채용 시험 채널은 대상이 아니다.
    if (!enabled || !problemId || !spec || !['Challenge::AlgorithmChannel', 'Challenge::SqlChannel'].includes(spec.channel) || String(spec.lesson_id) !== problemId || spec.test_id || spec.skill_check_id || data?.action !== 'submit') return null;
    const codes = Object.values(data.codes || {});
    // 일반 알고리즘 문제의 단일 소스만 보관한다. 빈칸 배열을 완성 코드로 오인하지 않는다.
    if (codes.length !== 1 || typeof codes[0] !== 'string') return null;
    return { platform: 'programmers', problemId, captureId: crypto.randomUUID(), account: '', code: codes[0],
      extension: languageExtension(spec.language), title: document.querySelector('.algorithm-title .challenge-title')?.textContent.trim() || problemId,
      difficulty: document.querySelector('[data-challenge-level]')?.getAttribute('data-challenge-level') || '',
      capturedAt: Date.now(), outcome: 'pending', verdict: '채점 대기' };
  }
  function received(socket, event) {
    const frame = parse(event.data), current = attempts.get(socket)?.get(frame?.identifier);
    const result = frame?.message;
    if (!current || !result || result.action !== 'submit') return;
    let outcome, verdict;
    if (result.exitCode === -1) { outcome = 'fail'; verdict = '컴파일 또는 실행 오류'; }
    else if (['result', 'result_without_score', 'result_lesson_challenge'].includes(result.type) && typeof result.passed === 'boolean') {
      outcome = result.passed ? 'pass' : 'fail'; verdict = result.passed ? '정답' : '오답';
    } else return;
    attempts.get(socket).delete(frame.identifier);
    emit('capture', { ...current, outcome, verdict });
  }
  WebSocket.prototype.send = function(raw) {
    const relevant = /^wss:\/\/ws\.programmers\.co\.kr(?::443)?\/cable(?:\?|$)/.test(this.url);
    if (relevant && !watching.has(this)) {
      watching.add(this); attempts.set(this, new Map());
      this.addEventListener('message', event => { try { received(this, event); } catch { /* 사이트 채점 처리는 계속한다. */ } });
    }
    let item, identifier;
    try {
      const frame = relevant && typeof raw === 'string' && parse(raw);
      if (frame?.command === 'message') { identifier = frame.identifier; item = snapshot(identifier, parse(frame.data)); }
    } catch { /* 수집 실패로 제출을 방해하지 않는다. */ }
    const result = originalSend.call(this, raw);
    if (item) { attempts.get(this).set(identifier, item); emit('pending', item); }
    return result;
  };
  window.postMessage({ channel, type: 'loaded' }, location.origin);
})();
