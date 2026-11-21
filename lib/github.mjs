export function githubClient({ repository, token, fetchImpl = fetch }) {
  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repository) || !token) throw new Error('GitHub 저장소와 실행 토큰을 확인하세요.');
  const prefix = `https://api.github.com/repos/${repository}`;
  async function request(path, { method = 'GET', body, optional = false } = {}) {
    let response;
    try {
      response = await fetchImpl(prefix + path, { method,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(30000) });
    } catch { throw new Error('GitHub API 연결에 실패했습니다.'); }
    if (optional && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub API 요청 실패: ${method} ${path.split('?')[0]} (HTTP ${response.status})`);
    if (response.status === 204) return null;
    return response.json();
  }
  async function list(path) {
    const results = [];
    for (let page = 1; page <= 10; page++) {
      const batch = await request(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      if (!Array.isArray(batch)) throw new Error('GitHub 목록 응답 형식이 다릅니다.');
      results.push(...batch);
      if (batch.length < 100) return results;
    }
    throw new Error('GitHub 조회 범위를 초과했습니다.');
  }
  return {
    request, list,
    async readText(path, ref) {
      const data = await request(`/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`, { optional: true });
      if (!data) return null;
      if (data.type !== 'file' || data.encoding !== 'base64' || data.size > 100000 || typeof data.content !== 'string') throw new Error('학습 파일 형식을 확인하세요.');
      return Buffer.from(data.content, 'base64').toString('utf8');
    },
  };
}
