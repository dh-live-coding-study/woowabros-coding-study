const algorithmCategories = {
  '해시': ['Hash'], '스택/큐': ['Stack', 'Queue'], '힙(Heap)': ['Heap'], '정렬': ['Sorting'],
  '완전탐색': ['Brute Force'], '탐욕법(Greedy)': ['Greedy'], '동적계획법(Dynamic Programming)': ['DP'],
  '깊이/너비 우선 탐색(DFS/BFS)': ['DFS', 'BFS'], '이분탐색': ['Binary Search'], '그래프': ['Graph'],
};

export function officialCategories(html) {
  const breadcrumb = html.match(/<ol\b[^>]*\bclass=["'][^"']*\bbreadcrumb\b[^"']*["'][^>]*>([\s\S]*?)<\/ol>/i)?.[1];
  if (!breadcrumb) return null;
  const categories = [];
  for (const match of breadcrumb.matchAll(/<a\b[^>]*\bhref=["']\/learn\/courses\/30\/parts\/[1-9][0-9]*(?:\?[^"']*)?["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const label = match[1].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
    if (label) categories.push(...(algorithmCategories[label] || [label]));
  }
  return [...new Set(categories)];
}

export function programmersProblemInfo({ fetchImpl = fetch, warn = console.warn } = {}) {
  const cache = new Map();
  let stopped = false, warned = false;
  async function lookup(problemId) {
    try {
      if (stopped) return null;
      const response = await fetchImpl(`https://school.programmers.co.kr/learn/courses/30/lessons/${problemId}`, {
        headers: { Accept: 'text/html' }, redirect: 'error', signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) { stopped = true; throw new Error(); }
      const categories = officialCategories(await response.text());
      if (categories === null) throw new Error();
      return { categories };
    } catch {
      stopped = true;
      if (!warned) { warned = true; warn('프로그래머스의 공식 분류를 조회하지 못했습니다. 이전 분류를 유지하며 제출 집계는 계속합니다.'); }
      return null;
    }
  }
  return async problemId => {
    if (typeof problemId !== 'string' || !/^[1-9][0-9]{0,11}$/.test(problemId)) return null;
    if (!cache.has(problemId)) cache.set(problemId, lookup(problemId));
    return cache.get(problemId);
  };
}
