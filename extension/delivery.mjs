export function validateSettings(settings) {
  if (!settings?.enabled || !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(settings.repository || '') || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,49}$/.test(settings.member || '') || !settings.token) throw new Error('저장소, 참여자 ID, GitHub 토큰을 설정하고 수집을 켜세요.');
  return settings;
}
async function request(settings, path, options = {}, fetchImpl = fetch) {
  const { optional, ...rest } = options;
  let response;
  try {
    response = await fetchImpl(`https://api.github.com/repos/${settings.repository}${path}`, {
      ...rest, credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000), headers: {
        Authorization: `Bearer ${settings.token}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json',
      },
    });
  } catch { throw new Error('GitHub 응답이 없습니다. 원문을 보관하고 있으니 실행 기록을 확인한 뒤 재시도하세요.'); }
  if (optional && response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub 요청 실패: HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
export async function dispatchSubmission(settings, submission, fetchImpl = fetch) {
  validateSettings(settings);
  const body = JSON.stringify({ ref: 'main', inputs: { member: settings.member, submission: JSON.stringify(submission) } });
  if (new TextEncoder().encode(body).length > 60000) throw new Error('제출 원문이 GitHub 입력 한도를 넘습니다. 파일을 직접 PR로 올려 주세요.');
  await request(settings, '/actions/workflows/import-submission.yml/dispatches', { method: 'POST', body }, fetchImpl);
}
export async function confirmSubmission(settings, submission, fetchImpl = fetch) {
  validateSettings(settings);
  const base = `${submission.platform}/${submission.problemId}`;
  const branch = `submissions/${base}/${settings.member}`;
  const pointer = `.study/captures/${settings.member}/${submission.captureId}.json`;
  function bytes(file) {
    if (file?.type !== 'file' || file.encoding !== 'base64' || file.size > 100000 || typeof file.content !== 'string') throw new Error('저장된 파일 형식을 확인하지 못했습니다.');
    return Uint8Array.from(atob(file.content), char => char.charCodeAt(0));
  }
  const pulls = await request(settings, `/pulls?state=all&head=${encodeURIComponent(settings.repository.split('/')[0] + ':' + branch)}&base=${encodeURIComponent(base)}&per_page=100`, {}, fetchImpl);
  if (!Array.isArray(pulls)) throw new Error('PR 목록 응답을 확인하지 못했습니다.');
  for (const pr of pulls) {
    if (pr.base?.ref !== base || pr.head?.ref !== branch || pr.head?.repo?.full_name?.toLowerCase() !== settings.repository.toLowerCase() || !/^[a-f0-9]{40}$/i.test(pr.head.sha || '')) continue;
    // 이전에 병합한 PR의 head에는 새 제출이 없을 수 있으므로 PR별 커밋으로 원문을 확인한다.
    const metadataFile = await request(settings, `/contents/${pointer}?ref=${pr.head.sha}`, { optional: true }, fetchImpl);
    if (!metadataFile) continue;
    const metadata = JSON.parse(new TextDecoder().decode(bytes(metadataFile)));
    if (metadata.member !== settings.member || metadata.captureId !== submission.captureId || metadata.outcome !== submission.outcome || !new RegExp(`^${settings.member}/[0-9]+-(pass|fail)/(Main|Solution|solution)\\.[a-z]+$`).test(metadata.path)) throw new Error('저장된 제출 정보가 다릅니다.');
    const file = await request(settings, `/contents/${metadata.path}?ref=${pr.head.sha}`, {}, fetchImpl);
    const actual = bytes(file), expected = new TextEncoder().encode(submission.code);
    if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) throw new Error('저장된 소스가 수집한 원문과 다릅니다. 원문을 유지합니다.');
    return { url: `https://github.com/${settings.repository}/pull/${pr.number}`, attempt: metadata.attempt };
  }
  return null;
}
