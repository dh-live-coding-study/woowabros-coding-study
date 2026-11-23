const tiers = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ruby'];
const ranks = ['V', 'IV', 'III', 'II', 'I'];

export function tierName(level) {
  if (!Number.isInteger(level) || level < 0 || level > 30) return null;
  return level === 0 ? 'Unrated' : `${tiers[Math.floor((level - 1) / 5)]} ${ranks[(level - 1) % 5]}`;
}

export function baekjoonDifficulty({ clientId, clientSecret, fetchImpl = fetch, warn = console.warn }) {
  if (!clientId || !clientSecret) return async () => null;
  let judge, stopped = false, warned = false, failureStatus;
  const cache = new Map();
  async function request(path) {
    if (stopped) throw new Error();
    try {
      const response = await fetchImpl(`https://solved.ac/api/v4${path}`, {
        headers: { Accept: 'application/json', 'x-client-id': clientId, 'x-client-secret': clientSecret },
        signal: AbortSignal.timeout(10000), redirect: 'error',
      });
      if (!response.ok) { failureStatus = response.status; throw new Error(); }
      return await response.json();
    } catch (error) { stopped = true; throw error; }
  }
  async function lookup(problemId) {
    try {
      judge ??= request('/judges').then(data => data.judges?.find(item => {
        try { return new URL(item.homepageUrl).hostname.replace(/^www\./, '') === 'acmicpc.net'; }
        catch { return false; }
      }));
      const boj = await judge;
      if (!boj || typeof boj.id !== 'string' || typeof boj.prefix !== 'string' || !/^[a-z]*$/i.test(boj.prefix) || !Number.isInteger(boj.idDigits) || boj.idDigits < 0 || boj.idDigits > 20) throw new Error();
      const query = new URLSearchParams({ q: `id:${boj.prefix}${problemId.padStart(boj.idDigits, '0')}`, page: '1' });
      const data = await request(`/problems?${query}`);
      if (!Array.isArray(data.problems) || data.diagnostics?.some(item => item.severity === 'error')) throw new Error();
      const matches = data.problems.filter(item => item.judgeIds?.some(id => id.ojId === boj.id && id.problemId === problemId));
      if (matches.length !== 1 || tierName(matches[0].level) === null) throw new Error();
      return tierName(matches[0].level);
    } catch {
      if (!warned) { warned = true; warn(`solved.ac 난이도를 조회하지 못했습니다${Number.isInteger(failureStatus) ? ` (HTTP ${failureStatus})` : ''}. 이전 난이도를 유지하며 제출 집계는 계속합니다.`); }
      return null;
    }
  }
  return async problemId => {
    if (typeof problemId !== 'string' || !/^[1-9][0-9]{0,11}$/.test(problemId)) return null;
    if (!cache.has(problemId)) cache.set(problemId, lookup(problemId));
    return cache.get(problemId);
  };
}
