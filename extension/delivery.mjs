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
  if (new TextEncoder().encode(body).length > 60000) throw new Error('제출 원문이 GitHub 입력 한도를 넘습니다. 대기 원문 저장으로 보관한 뒤 관리자에게 알려 주세요.');
  await request(settings, '/actions/workflows/import-submission.yml/dispatches', { method: 'POST', body }, fetchImpl);
}
export async function confirmSubmission(settings, submission, fetchImpl = fetch) {
  validateSettings(settings);
  const branch = `${submission.platform}/${submission.problemId}`;
  const pointer = `.study/captures/${settings.member}/${submission.captureId}.json`;
  function bytes(file) {
    if (file?.type !== 'file' || file.encoding !== 'base64' || file.size > 100000 || typeof file.content !== 'string') throw new Error('저장된 파일 형식을 확인하지 못했습니다.');
    return Uint8Array.from(atob(file.content), char => char.charCodeAt(0));
  }
  const ref = await request(settings, `/git/ref/heads/${branch}`, { optional: true }, fetchImpl);
  if (!ref) return null;
  const sha = ref.object?.sha;
  if (!/^[a-f0-9]{40}$/i.test(sha || '')) throw new Error('문제 브랜치의 저장 위치를 확인하지 못했습니다.');
  // 확인 도중 새 제출이 추가되더라도 메타데이터와 원문은 같은 커밋에서 읽는다.
  const metadataFile = await request(settings, `/contents/${pointer}?ref=${sha}`, { optional: true }, fetchImpl);
  if (!metadataFile) return null;
  const metadata = JSON.parse(new TextDecoder().decode(bytes(metadataFile)));
  if (metadata.platform !== submission.platform || metadata.problemId !== submission.problemId || metadata.account !== submission.account ||
      metadata.member !== settings.member || metadata.captureId !== submission.captureId || metadata.outcome !== submission.outcome ||
      !Number.isSafeInteger(metadata.attempt) || metadata.attempt < 1 ||
      !new RegExp(`^${settings.member}/${String(metadata.attempt).padStart(4, '0')}-${submission.outcome}/(Main|Solution|solution)\\.[a-z]+$`).test(metadata.path)) throw new Error('저장된 제출 정보가 다릅니다.');
  const file = await request(settings, `/contents/${metadata.path}?ref=${sha}`, {}, fetchImpl);
  const actual = bytes(file), expected = new TextEncoder().encode(submission.code);
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) throw new Error('저장된 소스가 수집한 원문과 다릅니다. 원문을 유지합니다.');
  return { url: `https://github.com/${settings.repository}/blob/${sha}/${metadata.path}`, attempt: metadata.attempt };
}
