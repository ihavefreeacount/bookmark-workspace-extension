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

const isFolder = (node: BookmarkNode) => !node.url;

const ensureRootFolder = async () => {
  const nodes = await chrome.bookmarks.search({ title: ROOT_FOLDER });
  const existing = nodes.find(n => !n.url);
  if (existing) return existing.id;
  const created = await chrome.bookmarks.create({ parentId: '1', title: ROOT_FOLDER });
  return created.id;
};

const loadTree = async () => {
  const rootId = await ensureRootFolder();
  const [root] = await chrome.bookmarks.getSubTree(rootId);
  return root;
};

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
    if (!workspaceId && next.children?.[0]?.id) setWorkspaceId(next.children[0].id);
  };

  const refreshTabs = async () => {
    const list = await chrome.tabs.query({ currentWindow: true });
    setTabs(list.filter(t => t.url && /^https?:\/\//.test(t.url)));
  };

  useEffect(() => {
    refresh().catch(console.error);
    refreshTabs().catch(console.error);

    const onBookmarksChanged = () => refresh().catch(console.error);
    const onTabsChanged = () => refreshTabs().catch(console.error);

    chrome.bookmarks.onCreated.addListener(onBookmarksChanged);
    chrome.bookmarks.onRemoved.addListener(onBookmarksChanged);
    chrome.bookmarks.onChanged.addListener(onBookmarksChanged);
    chrome.bookmarks.onMoved.addListener(onBookmarksChanged);

    chrome.tabs.onCreated.addListener(onTabsChanged);
    chrome.tabs.onRemoved.addListener(onTabsChanged);
    chrome.tabs.onUpdated.addListener(onTabsChanged);
    chrome.tabs.onActivated.addListener(onTabsChanged);

    return () => {
      chrome.bookmarks.onCreated.removeListener(onBookmarksChanged);
      chrome.bookmarks.onRemoved.removeListener(onBookmarksChanged);
      chrome.bookmarks.onChanged.removeListener(onBookmarksChanged);
      chrome.bookmarks.onMoved.removeListener(onBookmarksChanged);

      chrome.tabs.onCreated.removeListener(onTabsChanged);
      chrome.tabs.onRemoved.removeListener(onTabsChanged);
      chrome.tabs.onUpdated.removeListener(onTabsChanged);
      chrome.tabs.onActivated.removeListener(onTabsChanged);
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
        out.push({
          workspace: ws.title || '',
          id: col.id,
          title: col.title || 'Untitled',
          links: (col.children || []).filter(n => !!n.url),
        });
      }
    }
    return out;
  }, [workspaces, selectedWorkspace]);

  const filteredCollections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return collections;
    return collections.filter(col =>
      [col.workspace, col.title, ...col.links.map(l => `${l.title} ${l.url}`)]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
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
      next[link.id] = Math.min((next[link.id] ?? 0) + 1, Math.max(0, candidates.length - 1));
      return next;
    });
  };

  const onDropTabToCollection = async (e: React.DragEvent, collectionId: string) => {
    e.preventDefault();
    setDropCollectionId(null);
    const raw = e.dataTransfer.getData('application/x-bookmark-workspace-tab');
    if (!raw) return;

    const payload = JSON.parse(raw) as { url?: string; title?: string };
    if (!payload.url) return;

    await chrome.bookmarks.create({ parentId: collectionId, title: payload.title || payload.url, url: payload.url });
    setToast('링크 저장됨');
    await refresh();
  };

  return (
    <div className="nt-root">
      <header className="nt-header">
        <div className="brand">Bookmark Workspace</div>
        <div className="top-actions">
          <button className="icon" onClick={() => setLeftCollapsed(v => !v)} title="왼쪽 패널">
            {leftCollapsed ? '⟫' : '⟪'}
          </button>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="검색" />
          <button onClick={createCollection}>+ Collection</button>
          <button className="primary" onClick={saveWindow}>
            Save Window
          </button>
          <button className="icon" onClick={() => setRightCollapsed(v => !v)} title="오른쪽 패널">
            {rightCollapsed ? '⟪' : '⟫'}
          </button>
        </div>
      </header>

      <main className={`layout ${leftCollapsed ? 'left-collapsed' : ''} ${rightCollapsed ? 'right-collapsed' : ''}`}>
        <aside className="panel left">
          {!leftCollapsed ? (
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
          ) : (
            <button className="expand-only" onClick={() => setLeftCollapsed(false)} title="열기">
              ⟫
            </button>
          )}
        </aside>

        <section className="panel center">
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
                <ul className="link-list">
                  {col.links.slice(0, 8).map(link => {
                    const icon = getFaviconSrc(link);
                    return (
                      <li key={link.id}>
                        <button className="link-row" onClick={() => openLink(link.url)} title={link.url || ''}>
                          <img
                            className="fav"
                            src={icon}
                            alt=""
                            onError={() => onFaviconError(link)}
                            onLoad={e => rememberFavicon(link.url, (e.currentTarget as HTMLImageElement).src)}
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
                  <summary>•••</summary>
                  <div className="row-inline">
                    <button onClick={() => openCollection(col.id, 'group')}>Group</button>
                    <button onClick={() => openCollection(col.id, 'new-window')}>Window</button>
                  </div>
                </details>
              </article>
            ))}
          </div>
        </section>

        <aside className="panel right">
          {!rightCollapsed ? (
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
          ) : (
            <button className="expand-only" onClick={() => setRightCollapsed(false)} title="열기">
              ⟪
            </button>
          )}
        </aside>
      </main>

      {!!toast && <div className="toast">{toast}</div>}
    </div>
  );
};

export default NewTab;
