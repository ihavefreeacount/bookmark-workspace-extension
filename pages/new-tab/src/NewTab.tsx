import { useEffect, useMemo, useState } from 'react';
import '@src/NewTab.css';

type BookmarkNode = chrome.bookmarks.BookmarkTreeNode;

const ROOT_FOLDER = 'Bookmark Workspace';

function isFolder(node: BookmarkNode) {
  return !node.url;
}

async function ensureRootFolder() {
  const nodes = await chrome.bookmarks.search({ title: ROOT_FOLDER });
  const existing = nodes.find(n => !n.url);
  if (existing) return existing.id;
  const created = await chrome.bookmarks.create({ parentId: '1', title: ROOT_FOLDER });
  return created.id;
}

async function loadTree() {
  const rootId = await ensureRootFolder();
  const [root] = await chrome.bookmarks.getSubTree(rootId);
  return root;
}

const NewTab = () => {
  const [tree, setTree] = useState<BookmarkNode | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [query, setQuery] = useState('');

  const refresh = async () => {
    const next = await loadTree();
    setTree(next);
    if (!workspaceId && next.children?.[0]?.id) {
      setWorkspaceId(next.children[0].id);
    }
  };

  useEffect(() => {
    refresh().catch(console.error);
    const onChanged = () => refresh().catch(console.error);

    chrome.bookmarks.onCreated.addListener(onChanged);
    chrome.bookmarks.onRemoved.addListener(onChanged);
    chrome.bookmarks.onChanged.addListener(onChanged);
    chrome.bookmarks.onMoved.addListener(onChanged);

    return () => {
      chrome.bookmarks.onCreated.removeListener(onChanged);
      chrome.bookmarks.onRemoved.removeListener(onChanged);
      chrome.bookmarks.onChanged.removeListener(onChanged);
      chrome.bookmarks.onMoved.removeListener(onChanged);
    };
  }, []);

  const workspaces = useMemo(() => (tree?.children || []).filter(isFolder), [tree]);

  const createWorkspace = async () => {
    const name = window.prompt('워크스페이스 이름');
    if (!name) return;
    await chrome.bookmarks.create({ parentId: tree!.id, title: name.trim() });
    await refresh();
  };

  const createCollection = async () => {
    if (!workspaceId) return;
    const name = window.prompt('컬렉션 이름');
    if (!name) return;
    await chrome.bookmarks.create({ parentId: workspaceId, title: name.trim() });
  };

  const saveWindow = async () => {
    if (!workspaceId) return;
    const name = window.prompt('컬렉션 이름', 'Current Window');
    if (!name) return;

    const collection = await chrome.bookmarks.create({ parentId: workspaceId, title: name.trim() });
    const tabs = await chrome.tabs.query({ currentWindow: true });

    const seen = new Set<string>();
    for (const tab of tabs) {
      if (!tab.url || !/^https?:\/\//.test(tab.url) || seen.has(tab.url)) continue;
      seen.add(tab.url);
      await chrome.bookmarks.create({ parentId: collection.id, title: tab.title || tab.url, url: tab.url });
    }
  };

  const openCollection = async (collectionId: string, mode: 'group' | 'new-window') => {
    const [sub] = await chrome.bookmarks.getSubTree(collectionId);
    const links = (sub.children || []).filter(n => !!n.url);
    if (!links.length) return;

    if (mode === 'new-window') {
      await chrome.windows.create({ url: links.map(l => l.url!) });
      return;
    }

    const tabIds: number[] = [];
    for (const l of links) {
      const tab = await chrome.tabs.create({ url: l.url, active: false });
      if (tab.id) tabIds.push(tab.id);
    }

    if (tabIds.length) {
      const groupId = await chrome.tabs.group({ tabIds });
      await chrome.tabGroups.update(groupId, { title: sub.title, color: 'blue', collapsed: false });
      await chrome.tabs.update(tabIds[0], { active: true });
    }
  };

  const filteredCollections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;

    const out: { workspace: string; id: string; title: string; count: number }[] = [];
    for (const ws of workspaces) {
      for (const col of ws.children || []) {
        if (!isFolder(col)) continue;
        const urls = (col.children || []).filter(c => c.url);
        const hit = [col.title, ...urls.map(u => `${u.title} ${u.url}`)].join(' ').toLowerCase().includes(q);
        if (hit) out.push({ workspace: ws.title || '', id: col.id, title: col.title || '', count: urls.length });
      }
    }
    return out;
  }, [query, workspaces]);

  return (
    <div className="nt-root">
      <header className="nt-header">
        <div>
          <h1>Bookmark Workspace</h1>
          <p>New Tab = Project Dashboard (Source of Truth: Bookmarks)</p>
        </div>
      </header>

      <section className="nt-card nt-actions">
        <div className="row">
          <select value={workspaceId} onChange={e => setWorkspaceId(e.target.value)}>
            <option value="">워크스페이스 선택</option>
            {workspaces.map(ws => (
              <option key={ws.id} value={ws.id}>
                {ws.title}
              </option>
            ))}
          </select>
          <button onClick={createWorkspace}>+ Workspace</button>
          <button onClick={createCollection}>+ Collection</button>
          <button className="primary" onClick={saveWindow}>
            Save Window
          </button>
          <button onClick={refresh}>Refresh</button>
        </div>
        <div className="row">
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="컬렉션/링크 검색" />
        </div>
      </section>

      {filteredCollections ? (
        <section className="nt-card">
          <h2>Search Results</h2>
          <div className="grid">
            {filteredCollections.map(col => (
              <article key={col.id} className="col-card">
                <div className="meta">{col.workspace}</div>
                <h3>{col.title}</h3>
                <p>{col.count} links</p>
                <div className="row-inline">
                  <button onClick={() => openCollection(col.id, 'group')}>그룹열기</button>
                  <button onClick={() => openCollection(col.id, 'new-window')}>새창열기</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="nt-card">
          <h2>Workspaces</h2>
          <div className="grid">
            {workspaces.flatMap(ws =>
              (ws.children || []).filter(isFolder).map(col => {
                const count = (col.children || []).filter(c => c.url).length;
                return (
                  <article key={col.id} className="col-card">
                    <div className="meta">{ws.title}</div>
                    <h3>{col.title}</h3>
                    <p>{count} links</p>
                    <div className="row-inline">
                      <button onClick={() => openCollection(col.id, 'group')}>그룹열기</button>
                      <button onClick={() => openCollection(col.id, 'new-window')}>새창열기</button>
                    </div>
                  </article>
                );
              }),
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default NewTab;
