import { useEffect, useMemo, useState } from 'react';
import '@src/NewTab.css';
import { getCachedFavicon, getDomain, getFaviconCandidates, rememberFavicon } from '@src/lib/favicon-resolver';

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
  const [faviconIndexById, setFaviconIndexById] = useState<Record<string, number>>({});
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]);
  const [dropCollectionId, setDropCollectionId] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const refresh = async () => {
    const next = await loadTree();
    setTree(next);
    if (!workspaceId && next.children?.[0]?.id) {
      setWorkspaceId(next.children[0].id);
    }
  };

  const refreshTabs = async () => {
    const list = await chrome.tabs.query({ currentWindow: true });
    setTabs(list.filter(t => t.url && /^https?:\/\//.test(t.url)));
  };

  useEffect(() => {
    refresh().catch(console.error);
    refreshTabs().catch(console.error);

    const onChanged = () => refresh().catch(console.error);
    const onTabs = () => refreshTabs().catch(console.error);

    chrome.bookmarks.onCreated.addListener(onChanged);
    chrome.bookmarks.onRemoved.addListener(onChanged);
    chrome.bookmarks.onChanged.addListener(onChanged);
    chrome.bookmarks.onMoved.addListener(onChanged);

    chrome.tabs.onCreated.addListener(onTabs);
    chrome.tabs.onRemoved.addListener(onTabs);
    chrome.tabs.onUpdated.addListener(onTabs);
    chrome.tabs.onActivated.addListener(onTabs);

    return () => {
      chrome.bookmarks.onCreated.removeListener(onChanged);
      chrome.bookmarks.onRemoved.removeListener(onChanged);
      chrome.bookmarks.onChanged.removeListener(onChanged);
      chrome.bookmarks.onMoved.removeListener(onChanged);

      chrome.tabs.onCreated.removeListener(onTabs);
      chrome.tabs.onRemoved.removeListener(onTabs);
      chrome.tabs.onUpdated.removeListener(onTabs);
      chrome.tabs.onActivated.removeListener(onTabs);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 1400);
    return () => clearTimeout(t);
  }, [toast]);

  const workspaces = useMemo(() => (tree?.children || []).filter(isFolder), [tree]);
  const selectedWorkspace = useMemo(() => workspaces.find(w => w.id === workspaceId), [workspaces, workspaceId]);

  const collections = useMemo(() => {
    const out: CollectionSummary[] = [];
    const source = selectedWorkspace ? [selectedWorkspace] : workspaces;

    for (const ws of source) {
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
  }, [workspaces, selectedWorkspace]);

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
    if (!name || !tree) return;
    await chrome.bookmarks.create({ parentId: tree.id, title: name.trim() });
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
    const list = await chrome.tabs.query({ currentWindow: true });

    const seen = new Set<string>();
    let count = 0;
    for (const tab of list) {
      if (!tab.url || !/^https?:\/\//.test(tab.url) || seen.has(tab.url)) continue;
      seen.add(tab.url);
      await chrome.bookmarks.create({ parentId: collection.id, title: tab.title || tab.url, url: tab.url });
      count += 1;
    }
    setToast(`${count}개 링크 저장됨`);
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

  const getFaviconSrc = (link: BookmarkNode) => {
    const candidates = getFaviconCandidates(link.url);
    const cached = getCachedFavicon(link.url);
    const index = faviconIndexById[link.id] ?? 0;
    if (cached) return cached;
    return candidates[index] || candidates[0] || '';
  };

  const onFaviconError = (link: BookmarkNode) => {
    const candidates = getFaviconCandidates(link.url);
    setFaviconIndexById(prev => {
      const next = { ...prev };
      const cur = next[link.id] ?? 0;
      next[link.id] = Math.min(cur + 1, Math.max(0, candidates.length - 1));
      return next;
    });
  };

  const onFaviconLoad = (link: BookmarkNode, src: string) => {
    rememberFavicon(link.url, src);
  };

  const onDropTabToCollection = async (e: React.DragEvent, collectionId: string) => {
    e.preventDefault();
    setDropCollectionId(null);
    const raw = e.dataTransfer.getData('application/x-bookmark-workspace-tab');
    if (!raw) return;

    const payload = JSON.parse(raw) as { url?: string; title?: string };
    if (!payload.url) return;

    await chrome.bookmarks.create({
      parentId: collectionId,
      title: payload.title || payload.url,
      url: payload.url,
    });

    setToast('링크 저장됨');
    await refresh();
  };

  return (
    <div className="nt-root">
      <header className="nt-header">
        <h1>Bookmark Workspace</h1>
        <div className="top-actions">
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="링크/컬렉션 검색" />
          <button onClick={createCollection}>+ Collection</button>
          <button className="primary" onClick={saveWindow}>
            Save Window
          </button>
          <button onClick={refresh}>Refresh</button>
        </div>
      </header>

      <main className={`layout ${leftCollapsed ? 'left-collapsed' : ''} ${rightCollapsed ? 'right-collapsed' : ''}`}>
        <aside className="panel left">
          <div className="panel-head">
            <h2>Workspaces</h2>
            <button onClick={() => setLeftCollapsed(v => !v)}>{leftCollapsed ? '▶' : '◀'}</button>
          </div>
          {!leftCollapsed && (
            <>
              <button className="full" onClick={createWorkspace}>
                + Workspace
              </button>
              <ul className="workspace-list">
                {workspaces.map(ws => (
                  <li key={ws.id}>
                    <button className={workspaceId === ws.id ? 'active' : ''} onClick={() => setWorkspaceId(ws.id)}>
                      {ws.title}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>

        <section className="panel center">
          <h2>Collections</h2>
          <div className="grid">
            {filteredCollections.map(col => (
              <article
                key={col.id}
                className={`col-card ${dropCollectionId === col.id ? 'drop-target' : ''}`}
                onDragOver={e => {
                  e.preventDefault();
                  setDropCollectionId(col.id);
                }}
                onDragLeave={() => setDropCollectionId(null)}
                onDrop={e => onDropTabToCollection(e, col.id)}>
                <div className="meta">{col.workspace}</div>
                <h3>{col.title}</h3>
                <p>{col.links.length} links</p>

                <ul className="link-list">
                  {col.links.slice(0, 7).map(link => {
                    const icon = getFaviconSrc(link);
                    return (
                      <li key={link.id}>
                        <button className="link-row" onClick={() => openLink(link.url)} title={link.url || ''}>
                          <img
                            className="fav"
                            src={icon}
                            alt=""
                            onError={() => onFaviconError(link)}
                            onLoad={e => onFaviconLoad(link, (e.currentTarget as HTMLImageElement).src)}
                          />
                          <span className="link-main">
                            <span className="link-title">{link.title || link.url}</span>
                            <span className="link-domain">{getDomain(link.url)}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>

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

        <aside className="panel right">
          <div className="panel-head">
            <h2>Current Tabs</h2>
            <button onClick={() => setRightCollapsed(v => !v)}>{rightCollapsed ? '◀' : '▶'}</button>
          </div>
          {!rightCollapsed && (
            <ul className="tab-list">
              {tabs.map(tab => (
                <li
                  key={tab.id}
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.setData(
                      'application/x-bookmark-workspace-tab',
                      JSON.stringify({ title: tab.title, url: tab.url }),
                    );
                  }}>
                  <img className="fav" src={getFaviconCandidates(tab.url)[0]} alt="" />
                  <div>
                    <div className="tab-title">{tab.title || tab.url}</div>
                    <div className="tab-domain">{getDomain(tab.url)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </main>

      {!!toast && <div className="toast">{toast}</div>}
    </div>
  );
};

export default NewTab;
