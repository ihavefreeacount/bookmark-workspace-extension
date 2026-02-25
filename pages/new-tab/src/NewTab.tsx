import { getCachedFavicon, getDomain, getFaviconCandidates, rememberFavicon } from '@src/lib/favicon-resolver';
import { Command } from 'cmdk';
import { useEffect, useMemo, useState } from 'react';
import '@src/NewTab.css';

type BookmarkNode = chrome.bookmarks.BookmarkTreeNode;

type CollectionSummary = {
  workspace: string;
  id: string;
  title: string;
  links: BookmarkNode[];
};

type CommandLink = {
  key: string;
  title: string;
  url?: string;
  domain: string;
  workspace: string;
  collection: string;
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
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen(v => !v);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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

  const commandLinks = useMemo<CommandLink[]>(
    () =>
      collections.flatMap(col =>
        col.links.map(link => ({
          key: `${col.id}-${link.id}`,
          title: link.title || link.url || 'Untitled',
          url: link.url,
          domain: getDomain(link.url),
          workspace: col.workspace,
          collection: col.title,
        })),
      ),
    [collections],
  );

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

  const closeCommand = () => {
    setCommandOpen(false);
    setCommandQuery('');
  };

  const runCommand = (fn: () => Promise<void> | void) => {
    closeCommand();
    Promise.resolve(fn()).catch(console.error);
  };

  return (
    <div className="nt-root">
      <header className="nt-header">
        <div className="top-actions">
          <button className="icon" onClick={() => setLeftCollapsed(v => !v)} title="왼쪽 패널">
            {leftCollapsed ? '⟫' : '⟪'}
          </button>
          <button className="icon search-trigger" onClick={() => setCommandOpen(true)} title="검색 / 커맨드 (⌘K)">
            ⌕
          </button>
          <button className="secondary" onClick={createCollection}>
            + 컬렉션
          </button>
          <button className="primary" onClick={saveWindow}>
            창 저장
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
                + 워크스페이스
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
            {collections.map(col => (
              <article
                key={col.id}
                className={`col-card ${dropCollectionId === col.id ? 'drop-target' : ''}`}
                onDragOver={e => {
                  e.preventDefault();
                  setDropCollectionId(col.id);
                }}
                onDragLeave={() => setDropCollectionId(null)}
                onDrop={e => onDropTabToCollection(e, col.id)}>
                <div className="col-head">
                  <h3 className="col-title">{col.title}</h3>
                </div>
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
                  <summary>작업</summary>
                  <div className="row-inline">
                    <button onClick={() => openCollection(col.id, 'group')}>그룹 열기</button>
                    <button onClick={() => openCollection(col.id, 'new-window')}>새 창 열기</button>
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

      <Command.Dialog
        className="cmdk-dialog"
        overlayClassName="cmdk-overlay"
        label="커맨드 팔레트"
        open={commandOpen}
        onOpenChange={open => {
          setCommandOpen(open);
          if (!open) setCommandQuery('');
        }}>
        <Command.Input
          className="cmdk-input"
          placeholder="명령, 워크스페이스, 컬렉션 검색..."
          value={commandQuery}
          onValueChange={setCommandQuery}
        />
        <Command.List className="cmdk-list">
          <Command.Empty className="cmdk-empty">결과가 없습니다.</Command.Empty>

          <Command.Group heading="빠른 작업" className="cmdk-group">
            <Command.Item className="cmdk-item" onSelect={() => runCommand(() => createCollection())}>
              컬렉션 만들기
            </Command.Item>
            <Command.Item className="cmdk-item" onSelect={() => runCommand(() => createWorkspace())}>
              워크스페이스 만들기
            </Command.Item>
            <Command.Item className="cmdk-item" onSelect={() => runCommand(() => saveWindow())}>
              현재 창 저장
            </Command.Item>
          </Command.Group>

          <Command.Group heading="워크스페이스" className="cmdk-group">
            {workspaces.map(ws => (
              <Command.Item
                key={ws.id}
                className="cmdk-item"
                value={`workspace-${ws.title}`}
                onSelect={() =>
                  runCommand(() => {
                    setWorkspaceId(ws.id);
                  })
                }>
                {workspaceId === ws.id ? '✓ ' : ''}
                {ws.title}
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading="컬렉션 열기" className="cmdk-group">
            {collections.map(col => (
              <Command.Item
                key={`${col.id}-group`}
                className="cmdk-item"
                value={`${col.workspace} ${col.title} group`}
                onSelect={() => runCommand(() => openCollection(col.id, 'group'))}>
                {col.title} · 그룹 열기
              </Command.Item>
            ))}
            {collections.map(col => (
              <Command.Item
                key={`${col.id}-window`}
                className="cmdk-item"
                value={`${col.workspace} ${col.title} window`}
                onSelect={() => runCommand(() => openCollection(col.id, 'new-window'))}>
                {col.title} · 새 창 열기
              </Command.Item>
            ))}
          </Command.Group>

          <Command.Group heading="저장된 북마크" className="cmdk-group">
            {commandLinks.map(link => (
              <Command.Item
                key={link.key}
                className="cmdk-item"
                value={`${link.title} ${link.url || ''} ${link.domain} ${link.workspace} ${link.collection}`}
                onSelect={() => runCommand(() => openLink(link.url))}>
                {link.title}
              </Command.Item>
            ))}
          </Command.Group>
        </Command.List>
      </Command.Dialog>
    </div>
  );
};

export default NewTab;
