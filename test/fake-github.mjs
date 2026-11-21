export function fakeGithub() {
  let sequence = 0;
  const id = () => (++sequence).toString(16).padStart(40, '0');
  const objects = new Map(), refs = new Map(), pulls = [];
  function tree(files) { const sha = id(); objects.set(sha, { files: new Map(files) }); return sha; }
  function commit(files, parents = []) { const sha = id(), treeSha = tree(files); objects.set(sha, { sha, parents, tree: { sha: treeSha } }); return sha; }
  const initial = commit([['README.md', '# Study\n\n<!-- STUDY:START -->\n\n<!-- STUDY:END -->\n\nKeep this text.\n']]);
  refs.set('main', initial);
  function filesAt(sha) { return objects.get(objects.get(sha).tree.sha).files; }
  function contains(sha, ancestor) { return sha === ancestor || objects.get(sha).parents.some(parent => contains(parent, ancestor)); }
  const github = {
    refs, pulls, objects,
    async readText(path, ref) { const sha = refs.get(ref) || ref; return filesAt(sha).get(path) ?? null; },
    async list(path) {
      if (path.startsWith('/git/matching-refs/heads/')) return [...refs].map(([name, sha]) => ({ ref: `refs/heads/${name}`, object: { sha } }));
      const query = new URL('https://example.org' + path).searchParams;
      return pulls.filter(pr => (!query.get('state') || query.get('state') === 'all' || pr.state === query.get('state')) &&
        (!query.get('base') || pr.base.ref === query.get('base')) && (!query.get('head') || `team:${pr.head.ref}` === query.get('head')));
    },
    async request(path, { method = 'GET', body, optional = false } = {}) {
      if (path.startsWith('/git/ref/heads/')) {
        const name = path.slice('/git/ref/heads/'.length), sha = refs.get(name);
        if (!sha && !optional) throw new Error('missing ref');
        return sha ? { object: { sha } } : null;
      }
      if (path === '/git/refs' && method === 'POST') {
        const name = body.ref.slice('refs/heads/'.length);
        if (refs.has(name)) throw new Error('ref already exists');
        refs.set(name, body.sha); return {};
      }
      if (path.startsWith('/git/refs/heads/') && method === 'PATCH') {
        const name = path.slice('/git/refs/heads/'.length);
        if (body.force !== false || !contains(body.sha, refs.get(name))) throw new Error('non-fast-forward');
        refs.set(name, body.sha); return {};
      }
      if (path === '/git/blobs') { const sha = id(); objects.set(sha, Buffer.from(body.content, 'base64').toString('utf8')); return { sha }; }
      if (path === '/git/trees') {
        const files = new Map(body.base_tree ? objects.get(body.base_tree).files : []);
        for (const entry of body.tree) files.set(entry.path, objects.get(entry.sha));
        return { sha: tree(files) };
      }
      if (path === '/git/commits' && method === 'POST') { const sha = id(); objects.set(sha, { sha, parents: body.parents, tree: { sha: body.tree } }); return { sha }; }
      if (path.startsWith('/git/commits/')) return objects.get(path.slice('/git/commits/'.length));
      if (path.startsWith('/git/trees/')) return { truncated: false, tree: [...objects.get(path.split('/')[3].split('?')[0]).files].map(([path]) => ({ path, type: 'blob' })) };
      if (path === '/pulls' && method === 'POST') {
        if (pulls.some(pr => pr.state === 'open' && pr.head.ref === body.head && pr.base.ref === body.base)) throw new Error('PR already exists');
        const pr = { number: pulls.length + 1, state: 'open', title: body.title, body: body.body, head: { ref: body.head }, base: { ref: body.base }, html_url: `https://github.com/team/study/pull/${pulls.length + 1}` };
        pulls.push(pr); return pr;
      }
      throw new Error(`Unexpected ${method} ${path}`);
    },
    merge(number) {
      const pr = pulls.find(pr => pr.number === number), base = refs.get(pr.base.ref), head = refs.get(pr.head.ref);
      const baseFiles = new Map(filesAt(base));
      // 제출 파일은 추가만 하고 문제 README는 대상 브랜치의 것을 유지한다.
      for (const [path, content] of filesAt(head)) if (path !== 'README.md' || pr.base.ref === 'main') baseFiles.set(path, content);
      refs.set(pr.base.ref, commit(baseFiles, [base, head])); pr.state = 'closed'; pr.merged_at = new Date().toISOString();
    },
  };
  return github;
}
