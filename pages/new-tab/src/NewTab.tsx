import {
  getCachedFavicon,
  getDomain,
  getFaviconCandidates,
  rememberFavicon,
  rememberFaviconFailure,
} from '@src/lib/favicon-resolver';
import { Command } from 'cmdk';
import { useCallback, useEffect, useMemo, useState } from 'react';
import '@src/NewTab.css';

type BookmarkNode = chrome.bookmarks.BookmarkTreeNode;

type CollectionSummary = {
  workspaceId: string;
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
const DND_TAB_MIME = 'application/x-bookmark-workspace-tab';
const DND_COLLECTION_MIME = 'application/x-bookmark-workspace-collection';
const LS_SELECTED_SPACE = 'bw:selected-space-id';
const LS_LEFT_COLLAPSED = 'bw:left-collapsed';
const LS_RIGHT_COLLAPSED = 'bw:right-collapsed';

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

const getPersisted = (key: string) => window.localStorage.getItem(key) || '';
const getPersistedBool = (key: string) => window.localStorage.getItem(key) === '1';

const NewTab = () => {
  const [tree, setTree] = useState<BookmarkNode | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string>(() => getPersisted(LS_SELECTED_SPACE));
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [faviconIndexById, setFaviconIndexById] = useState<Record<string, number>>({});
  const [leftCollapsed, setLeftCollapsed] = useState(() => getPersistedBool(LS_LEFT_COLLAPSED));
  const [rightCollapsed, setRightCollapsed] = useState(() => getPersistedBool(LS_RIGHT_COLLAPSED));
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]);
  const [dropCollectionId, setDropCollectionId] = useState<string | null>(null);
  const [dropWorkspaceId, setDropWorkspaceId] = useState<string | null>(null);
  const [dragKind, setDragKind] = useState<'tab' | 'collection' | null>(null);
  const [toast, setToast] = useState('');

  const refresh = useCallback(async () => {
    const next = await loadTree();
    setTree(next);
    setWorkspaceId(prev => {
      const exists = !!next.children?.some(c => c.id === prev);
      return exists ? prev : next.children?.[0]?.id || '';
    });
  }, []);

  const refreshTabs = useCallback(async () => {
    const list = await chrome.tabs.query({ currentWindow: true });
    setTabs(list.filter(t => t.url && /^https?:\/\//.test(t.url)));
  }, []);

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
  }, [refresh, refreshTabs]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 1400);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    window.localStorage.setItem(LS_SELECTED_SPACE, workspaceId);
  }, [workspaceId]);

  useEffect(() => {
    window.localStorage.setItem(LS_LEFT_COLLAPSED, leftCollapsed ? '1' : '0');
  }, [leftCollapsed]);

  useEffect(() => {
    window.localStorage.setItem(LS_RIGHT_COLLAPSED, rightCollapsed ? '1' : '0');
  }, [rightCollapsed]);

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
          workspaceId: ws.id,
          workspace: ws.title || '',
          id: col.id,
          title: col.title || 'Untitled',
          links: (col.children || []).filter(n => !!n.url),
        });
      }
    }
    return out;
  }, [workspaces, selectedWorkspace]);

  const commandLinks = useMemo<CommandLink[]>(() => {
    const out: CommandLink[] = [];
    for (const ws of workspaces) {
      for (const col of ws.children || []) {
        if (!isFolder(col)) continue;
        for (const link of (col.children || []).filter(n => !!n.url)) {
          out.push({
            key: `${col.id}-${link.id}`,
            title: link.title || link.url || 'Untitled',
            url: link.url,
            domain: getDomain(link.url),
            workspace: ws.title || '',
            collection: col.title || 'Untitled',
          });
        }
      }
    }
    return out;
  }, [workspaces]);

  const createWorkspace = async () => {
    const name = window.prompt('스페이스 이름');
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
      if (tab.favIconUrl) {
        rememberFavicon(tab.url, tab.favIconUrl, 'tab-favicon');
      }
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

  const onDragCollectionStart = (e: React.DragEvent, collection: CollectionSummary) => {
    setDragKind('collection');
    e.dataTransfer.clearData();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(
      DND_COLLECTION_MIME,
      JSON.stringify({
        collectionId: collection.id,
        title: collection.title,
        workspaceId: collection.workspaceId,
      }),
    );
  };

  const onDropCollectionToWorkspace = async (e: React.DragEvent, targetWorkspace: BookmarkNode) => {
    e.preventDefault();
    e.stopPropagation();
    setDropWorkspaceId(null);
    if (dragKind !== 'collection') return;

    const raw = e.dataTransfer.getData(DND_COLLECTION_MIME);
    if (!raw) return;

    const payload = JSON.parse(raw) as { collectionId?: string; title?: string; workspaceId?: string };
    if (!payload.collectionId || !payload.workspaceId || payload.workspaceId === targetWorkspace.id) return;

    await chrome.bookmarks.move(payload.collectionId, { parentId: targetWorkspace.id });
    setToast(`'${payload.title || '컬렉션'}' → '${targetWorkspace.title || '스페이스'}' 이동됨`);
    await refresh();
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
      const nextIndex = (next[link.id] ?? 0) + 1;
      if (nextIndex > Math.max(0, candidates.length - 1)) {
        rememberFaviconFailure(link.url);
      }
      next[link.id] = Math.min(nextIndex, Math.max(0, candidates.length - 1));
      return next;
    });
  };

  const onDropTabToCollection = async (e: React.DragEvent, collectionId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDropCollectionId(null);
    if (dragKind !== 'tab') return;
    const raw = e.dataTransfer.getData(DND_TAB_MIME);
    if (!raw) return;

    const payload = JSON.parse(raw) as { url?: string; title?: string; favIconUrl?: string };
    if (!payload.url) return;

    await chrome.bookmarks.create({ parentId: collectionId, title: payload.title || payload.url, url: payload.url });
    if (payload.favIconUrl) {
      rememberFavicon(payload.url, payload.favIconUrl, 'tab-favicon');
    }
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
          <button className="icon search-trigger" onClick={() => setCommandOpen(true)} title="검색 / 커맨드 (⌘K)">
            ⌕
          </button>
          <button className="icon" onClick={createCollection} title="컬렉션 추가" aria-label="컬렉션 추가">
            ⊞
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
          {!leftCollapsed && (
            <>
              <button className="full" onClick={createWorkspace}>
                + 스페이스
              </button>
              <ul className="workspace-list">
                {workspaces.map(ws => (
                  <li key={ws.id}>
                    <button
                      className={`${workspaceId === ws.id ? 'active' : ''} ${dropWorkspaceId === ws.id ? 'drop-target' : ''}`}
                      onClick={() => setWorkspaceId(ws.id)}
                      onDragOver={e => {
                        if (dragKind !== 'collection') return;
                        e.preventDefault();
                        if (dropWorkspaceId !== ws.id) setDropWorkspaceId(ws.id);
                      }}
                      onDragLeave={() => {
                        if (dropWorkspaceId === ws.id) setDropWorkspaceId(null);
                      }}
                      onDrop={e => onDropCollectionToWorkspace(e, ws)}>
                      {ws.title}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
        <button
          className={`sidebar-handle sidebar-handle-left ${leftCollapsed ? 'collapsed' : ''}`}
          onClick={() => setLeftCollapsed(v => !v)}
          aria-label={leftCollapsed ? '왼쪽 패널 열기' : '왼쪽 패널 닫기'}
          aria-expanded={!leftCollapsed}
          title={leftCollapsed ? '왼쪽 패널 열기' : '왼쪽 패널 닫기'}>
          {leftCollapsed ? '›' : '‹'}
        </button>

        <section className="panel center">
          <div className="grid">
            {collections.map(col => (
              <article
                key={col.id}
                className={`col-card ${dropCollectionId === col.id ? 'drop-target' : ''}`}
                draggable
                onDragStart={e => onDragCollectionStart(e, col)}
                onDragEnd={() => {
                  setDropWorkspaceId(null);
                  setDropCollectionId(null);
                  setDragKind(null);
                }}
                onDragOver={e => {
                  if (dragKind !== 'tab') return;
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
            <>
              <div className="panel-section-header">
                <span className="panel-section-icon" aria-hidden>
                  🌐
                </span>
                <strong>현재 열려있는 탭</strong>
              </div>
              <ul className="tab-list">
                {tabs.map(tab => (
                  <li
                    className={tab.active ? 'active' : ''}
                    key={tab.id}
                    draggable
                    onDragStart={e => {
                      setDragKind('tab');
                      e.dataTransfer.setData(
                        DND_TAB_MIME,
                        JSON.stringify({ title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl }),
                      );
                    }}
                    onDragEnd={() => {
                      setDropCollectionId(null);
                      setDropWorkspaceId(null);
                      setDragKind(null);
                    }}>
                    <img className="fav" src={getFaviconCandidates(tab.url)[0]} alt="" />
                    <div>
                      <div className="tab-title">{tab.title || tab.url}</div>
                      <div className="tab-domain">{getDomain(tab.url)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
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
          placeholder="명령, 스페이스, 컬렉션 검색..."
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
              스페이스 만들기
            </Command.Item>
            <Command.Item className="cmdk-item" onSelect={() => runCommand(() => saveWindow())}>
              현재 창 저장
            </Command.Item>
          </Command.Group>

          <Command.Group heading="스페이스" className="cmdk-group">
            {workspaces.map(ws => (
              <Command.Item
                key={ws.id}
                className="cmdk-item"
                value={`space-${ws.title}`}
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
