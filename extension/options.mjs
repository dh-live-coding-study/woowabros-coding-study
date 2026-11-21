import { validateSettings } from './delivery.mjs';
const form = document.querySelector('#settings'), message = document.querySelector('#message');
const send = body => chrome.runtime.sendMessage(body).then(result => { if (result?.error) throw new Error(result.error); return result; });
const saved = (await chrome.storage.local.get('settings')).settings;
if (saved) for (const [name, value] of Object.entries(saved)) {
  const input = form.elements.namedItem(name);
  if (input) input.type === 'checkbox' ? input.checked = value : input.value = value;
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  const settings = Object.fromEntries(new FormData(form)); settings.enabled = form.elements.enabled.checked;
  try {
    validateSettings({ ...settings, enabled: true });
    await chrome.storage.local.set({ settings }); message.textContent = '저장했습니다. 열어 둔 문제 탭은 새로 고쳐 주세요.';
  } catch (error) { message.textContent = error.message; }
});
function item(text, link) {
  const li = document.createElement('li');
  const node = document.createElement(link ? 'a' : 'span'); node.textContent = text;
  if (link) { node.href = link; node.target = '_blank'; node.rel = 'noreferrer'; }
  li.append(node); return li;
}
async function refresh() {
  try {
    const data = await send({ type: 'queue' });
    const queue = document.querySelector('#queue'), history = document.querySelector('#history'); queue.replaceChildren(); history.replaceChildren();
    for (const record of data.queue) {
      const li = item(`${record.platform}/${record.problemId}, ${record.outcome}: ${record.message}`);
      const button = document.createElement('button'); button.textContent = '다시 확인하고 전송'; button.disabled = record.state === 'waiting';
      button.onclick = async () => { try { await send({ type: 'retry', key: record.key }); await refresh(); } catch (error) { message.textContent = error.message; } };
      li.append(' ', button); queue.append(li);
    }
    for (const record of [...data.history].reverse()) history.append(item(`${record.platform}/${record.problemId}, ${record.attempt}회 ${record.outcome}`, record.url));
    if (!data.queue.length) queue.append(item('대기 중인 제출이 없습니다.'));
    if (!data.history.length) history.append(item('아직 등록한 제출이 없습니다.'));
    if (data.lastError) message.textContent = data.lastError;
  } catch (error) { message.textContent = error.message; }
}
document.querySelector('#refresh').onclick = refresh;
document.querySelector('#export').onclick = async () => {
  const data = await send({ type: 'export' });
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'pending-submissions.json'; link.click(); URL.revokeObjectURL(url);
};
await refresh();
