import { useEffect, useMemo, useState } from 'react';
import '@src/NewTab.css';

type BookmarkNode = chrome.bookmarks.BookmarkTreeNode;

type CollectionSummary = {
  workspace: string;
  id: string;
  title: string;
  links: BookmarkNode[];
};

const ROOT_FOLDER = 'Bookmark Workspace';

function isFolder(node: BookmarkNode) {
  return !node.url;
}

function getDomain(url?: string) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function getFavicon(url?: string) {
  if (!url) return '';
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(url)}&sz=32`;
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

  const collections = useMemo(() => {
    const out: CollectionSummary[] = [];
    for (const ws of workspaces) {
      for (const col of ws.children || []) {
        if (!isFolder(col)) continue;
        const links = (col.children || []).filter(n => !!n.url);
        out.push({
          workspace: ws.title || '',
          id: col.id,
          title: col.title || 'Untitled',
          links,
        });
      }
    }
    return out;
  }, [workspaces]);

  const filteredCollections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return collections;

    return collections.filter(col => {
      const hay = [col.workspace, col.title, ...col.links.map(l => `${l.title} ${l.url}`)].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [query, collections]);

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

  const openLink = async (url?: string) => {
    if (!url) return;
    await chrome.tabs.create({ url, active: true });
  };

  return (
    <div className="nt-root">
      <header className="nt-header">
        <div>
          <h1>Bookmark Workspace</h1>
          <p>Apple Reminders 스타일, 링크 1개 열기 중심 UX</p>
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
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="링크/컬렉션 검색" />
        </div>
      </section>

      <section className="nt-card">
        <h2>Collections</h2>
        <div className="grid">
          {filteredCollections.map(col => (
            <article key={col.id} className="col-card">
              <div className="meta">{col.workspace}</div>
              <h3>{col.title}</h3>
              <p>{col.links.length} links</p>

              <ul className="link-list">
                {col.links.slice(0, 7).map(link => (
                  <li key={link.id}>
                    <button className="link-row" onClick={() => openLink(link.url)} title={link.url || ''}>
                      <img className="fav" src={getFavicon(link.url)} alt="" />
                      <span className="link-main">
                        <span className="link-title">{link.title || link.url}</span>
                        <span className="link-domain">{getDomain(link.url)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              {col.links.length > 7 && <div className="more">+ {col.links.length - 7} more links</div>}

              <details className="secondary-actions">
                <summary>컬렉션 액션</summary>
                <div className="row-inline">
                  <button onClick={() => openCollection(col.id, 'group')}>그룹열기</button>
                  <button onClick={() => openCollection(col.id, 'new-window')}>새창열기</button>
                </div>
              </details>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};

export default NewTab;
