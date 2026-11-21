export async function entriesAt(github, sha) {
  const commit = await github.request(`/git/commits/${sha}`);
  const tree = await github.request(`/git/trees/${commit.tree.sha}?recursive=1`);
  if (tree.truncated) throw new Error('브랜치 파일 목록이 너무 큽니다.');
  return tree.tree;
}

export async function createCommit(github, { parent, parents, files, message, empty = false }) {
  const tree = [];
  for (const file of files) {
    const blob = await github.request('/git/blobs', { method: 'POST', body: {
      content: Buffer.from(file.content, 'utf8').toString('base64'), encoding: 'base64',
    } });
    tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const base = !empty && await github.request(`/git/commits/${parent}`);
  const created = await github.request('/git/trees', { method: 'POST', body: { ...(!empty ? { base_tree: base.tree.sha } : {}), tree } });
  return github.request('/git/commits', { method: 'POST', body: { message, tree: created.sha, parents: parents || [parent] } });
}

export async function ensureRef(github, name, sha) {
  const current = await github.request(`/git/ref/heads/${name}`, { optional: true });
  if (current) return current;
  try { await github.request('/git/refs', { method: 'POST', body: { ref: `refs/heads/${name}`, sha } }); }
  catch (error) {
    const raced = await github.request(`/git/ref/heads/${name}`, { optional: true });
    if (!raced) throw error;
    return raced;
  }
  return github.request(`/git/ref/heads/${name}`);
}
