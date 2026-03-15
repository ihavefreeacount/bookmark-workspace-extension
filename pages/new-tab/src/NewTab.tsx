import * as AlertDialog from '@radix-ui/react-alert-dialog';
import * as ContextMenu from '@radix-ui/react-context-menu';
import {
  getFallbackFavicon,
  getCachedFavicon,
  getDomain,
  getFaviconCandidates,
  isNegativeFaviconCached,
  rememberFavicon,
  rememberFaviconFailure,
} from '@src/lib/favicon-resolver';
import { buildBookmarkSearchRecords, createBookmarkSearchIndex, searchBookmarks } from '@src/lib/search/engine';
import { includesNormalizedQuery } from '@src/lib/search/normalize';
import { Command } from 'cmdk';
import { Globe, Link2, PanelLeft, PanelRight, Plus, Search } from 'lucide-react';
import { AnimatePresence, LayoutGroup, motion, Reorder, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SearchRange } from '@src/lib/search/types';
import type { ReactNode } from 'react';
import '@src/NewTab.css';

type BookmarkNode = chrome.bookmarks.BookmarkTreeNode;

type CollectionSummary = {
  workspaceId: string;
  workspace: string;
  id: string;
  title: string;
  links: BookmarkNode[];
};

type DeleteTarget =
  | { kind: 'workspace'; id: string; title: string }
  | { kind: 'collection'; id: string; title: string }
  | { kind: 'bookmark'; id: string; title: string; url?: string };

type ActiveContext = { kind: 'collection'; id: string } | { kind: 'bookmark'; id: string } | null;

type EditingBookmark = {
  id: string;
  parentId: string;
  index: number;
  originalTitle: string;
  originalUrl: string;
};

type WorkspaceFlyout = {
  workspaceId: string;
  title: string;
  collections: string[];
  x: number;
  y: number;
};

type AddBookmarkMorphPhase = 'editing' | 'committing';

type AddBookmarkMorphState = {
  collectionId: string;
  draftTitle: string;
  draftUrl: string;
  phase: AddBookmarkMorphPhase;
};

type RecentlyCreatedBookmark = {
  collectionId: string;
  bookmarkId: string;
} | null;

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
const isValidBookmarkUrl = (value: string) => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const mergeRanges = (ranges: readonly SearchRange[]) => {
  if (!ranges.length) return [];

  const sorted = [...ranges].sort((left, right) => left[0] - right[0]);
  const merged: SearchRange[] = [sorted[0]];

  for (const [start, end] of sorted.slice(1)) {
    const current = merged[merged.length - 1];
    if (!current) continue;

    if (start <= current[1] + 1) {
      merged[merged.length - 1] = [current[0], Math.max(current[1], end)];
      continue;
    }

    merged.push([start, end]);
  }

  return merged;
};

const renderHighlightedText = (text: string, ranges: readonly SearchRange[]) => {
  if (!text || !ranges.length) return text;

  const mergedRanges = mergeRanges(ranges);
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const [start, end] of mergedRanges) {
    if (start > cursor) {
      nodes.push(text.slice(cursor, start));
    }

    nodes.push(
      <mark key={`${text}-${start}-${end}`} className="cmdk-highlight">
        {text.slice(start, end + 1)}
      </mark>,
    );
    cursor = end + 1;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
};

const NewTab = () => {
  const shouldReduceMotion = useReducedMotion();
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
  const [workspaceInlineOpen, setWorkspaceInlineOpen] = useState(false);
  const [workspaceInlineName, setWorkspaceInlineName] = useState('');
  const [workspaceInlineBusy, setWorkspaceInlineBusy] = useState(false);
  const workspaceInlineRef = useRef<HTMLInputElement | null>(null);
  const [collectionInlineOpen, setCollectionInlineOpen] = useState(false);
  const [collectionInlineName, setCollectionInlineName] = useState('');
  const [collectionInlineBusy, setCollectionInlineBusy] = useState(false);
  const [collectionInlineHideDuringExit, setCollectionInlineHideDuringExit] = useState(false);
  const collectionInlineRef = useRef<HTMLInputElement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [activeContext, setActiveContext] = useState<ActiveContext>(null);
  const [workspaceOrderIds, setWorkspaceOrderIds] = useState<string[]>([]);
  const [draggingWorkspaceId, setDraggingWorkspaceId] = useState<string | null>(null);
  const [workspaceReorderBusy, setWorkspaceReorderBusy] = useState(false);
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editingWorkspaceName, setEditingWorkspaceName] = useState('');
  const [editingWorkspaceBusy, setEditingWorkspaceBusy] = useState(false);
  const editingWorkspaceRef = useRef<HTMLInputElement | null>(null);
  const [editingBookmark, setEditingBookmark] = useState<EditingBookmark | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingUrl, setEditingUrl] = useState('');
  const [editingBookmarkBusy, setEditingBookmarkBusy] = useState(false);
  const editingTitleRef = useRef<HTMLInputElement | null>(null);
  const editingUrlRef = useRef<HTMLInputElement | null>(null);
  const [addBookmarkMorphState, setAddBookmarkMorphState] = useState<AddBookmarkMorphState | null>(null);
  const [recentlyCreatedBookmark, setRecentlyCreatedBookmark] = useState<RecentlyCreatedBookmark>(null);
  const addingBookmarkTitleRef = useRef<HTMLInputElement | null>(null);
  const addingBookmarkUrlRef = useRef<HTMLInputElement | null>(null);
  const addingBookmarkFormRef = useRef<HTMLDivElement | null>(null);
  const [workspaceFlyout, setWorkspaceFlyout] = useState<WorkspaceFlyout | null>(null);
  const openFlyoutTimerRef = useRef<number | null>(null);
  const closeFlyoutTimerRef = useRef<number | null>(null);
  const suppressBookmarkRefreshRef = useRef(false);

  const addingBookmarkCollectionId = addBookmarkMorphState?.collectionId ?? null;
  const addingBookmarkTitle = addBookmarkMorphState?.draftTitle ?? '';
  const addingBookmarkUrl = addBookmarkMorphState?.draftUrl ?? '';
  const addingBookmarkBusy = addBookmarkMorphState?.phase === 'committing';
  const addingBookmarkEditing = addBookmarkMorphState?.phase === 'editing';
  const [addingBookmarkInvalid, setAddingBookmarkInvalid] = useState(false);
  const [addingBookmarkShakeToken, setAddingBookmarkShakeToken] = useState(0);

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

    const onBookmarksChanged = () => {
      if (suppressBookmarkRefreshRef.current) return;
      refresh().catch(console.error);
    };
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
    if (!workspaceInlineOpen) return;
    workspaceInlineRef.current?.focus();
  }, [workspaceInlineOpen]);

  useEffect(() => {
    if (!collectionInlineOpen) return;
    collectionInlineRef.current?.focus();
  }, [collectionInlineOpen]);

  useEffect(() => {
    if (!editingBookmark) return;
    requestAnimationFrame(() => {
      editingTitleRef.current?.focus();
      editingTitleRef.current?.select();
    });
  }, [editingBookmark]);

  useEffect(() => {
    if (!addingBookmarkCollectionId || !addingBookmarkEditing) return;
    requestAnimationFrame(() => {
      addingBookmarkTitleRef.current?.focus();
    });
  }, [addingBookmarkCollectionId, addingBookmarkEditing]);

  useEffect(() => {
    if (!editingWorkspaceId) return;
    requestAnimationFrame(() => {
      editingWorkspaceRef.current?.focus();
      editingWorkspaceRef.current?.select();
    });
  }, [editingWorkspaceId]);

  useEffect(
    () => () => {
      if (openFlyoutTimerRef.current) window.clearTimeout(openFlyoutTimerRef.current);
      if (closeFlyoutTimerRef.current) window.clearTimeout(closeFlyoutTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    window.localStorage.setItem(LS_SELECTED_SPACE, workspaceId);
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    window.scrollTo({ top: 0, behavior: 'auto' });
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
  const orderedWorkspaces = useMemo(() => {
    if (!workspaceOrderIds.length) return workspaces;
    const map = new Map(workspaces.map(ws => [ws.id, ws]));
    const kept = workspaceOrderIds.map(id => map.get(id)).filter((v): v is BookmarkNode => !!v);
    const appended = workspaces.filter(ws => !workspaceOrderIds.includes(ws.id));
    return [...kept, ...appended];
  }, [workspaces, workspaceOrderIds]);
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

  const bookmarkSearchRecords = useMemo(() => buildBookmarkSearchRecords(workspaces), [workspaces]);
  const bookmarkSearchIndex = useMemo(() => createBookmarkSearchIndex(bookmarkSearchRecords), [bookmarkSearchRecords]);
  const bookmarkHits = useMemo(
    () => searchBookmarks(bookmarkSearchIndex, commandQuery),
    [bookmarkSearchIndex, commandQuery],
  );

  useEffect(() => {
    if (!addBookmarkMorphState) return;
    if (collections.some(col => col.id === addBookmarkMorphState.collectionId)) return;
    setAddBookmarkMorphState(null);
    setRecentlyCreatedBookmark(null);
    setAddingBookmarkInvalid(false);
  }, [collections, addBookmarkMorphState]);

  useEffect(() => {
    if (!recentlyCreatedBookmark) return;
    const cleanupDelay = shouldReduceMotion ? 40 : 900;
    const timeout = window.setTimeout(() => {
      setRecentlyCreatedBookmark(null);
    }, cleanupDelay);
    return () => window.clearTimeout(timeout);
  }, [recentlyCreatedBookmark, shouldReduceMotion]);

  useEffect(() => {
    if (!addingBookmarkInvalid || addingBookmarkShakeToken <= 0) return;
    const target = addingBookmarkFormRef.current;
    if (!target) return;
    target.getAnimations().forEach(animation => animation.cancel());
    target.animate(
      shouldReduceMotion
        ? [
            { transform: 'translateX(0px)' },
            { transform: 'translateX(-6px)' },
            { transform: 'translateX(6px)' },
            { transform: 'translateX(-3px)' },
            { transform: 'translateX(3px)' },
            { transform: 'translateX(0px)' },
          ]
        : [
            { transform: 'translateX(0px)' },
            { transform: 'translateX(-12px)' },
            { transform: 'translateX(12px)' },
            { transform: 'translateX(-9px)' },
            { transform: 'translateX(9px)' },
            { transform: 'translateX(-5px)' },
            { transform: 'translateX(5px)' },
            { transform: 'translateX(0px)' },
          ],
      {
        duration: shouldReduceMotion ? 220 : 340,
        easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)',
      },
    );
  }, [addingBookmarkInvalid, addingBookmarkShakeToken, shouldReduceMotion]);

  useEffect(() => {
    setWorkspaceOrderIds(prev => {
      const nextIds = workspaces.map(ws => ws.id);
      if (!prev.length) return nextIds;
      const kept = prev.filter(id => nextIds.includes(id));
      const added = nextIds.filter(id => !kept.includes(id));
      return [...kept, ...added];
    });
  }, [workspaces]);

  const openWorkspaceInlineInput = () => {
    setLeftCollapsed(false);
    setWorkspaceInlineName('');
    setWorkspaceInlineOpen(true);
  };

  const closeWorkspaceInlineInput = () => {
    setWorkspaceInlineOpen(false);
    setWorkspaceInlineName('');
    setWorkspaceInlineBusy(false);
  };

  const submitWorkspaceInlineInput = async () => {
    if (workspaceInlineBusy) return;
    const name = workspaceInlineName.trim();
    if (!name || !tree) {
      closeWorkspaceInlineInput();
      return;
    }

    setWorkspaceInlineBusy(true);
    await chrome.bookmarks.create({ parentId: tree.id, title: name });
    await refresh();
    closeWorkspaceInlineInput();
  };

  const openCollectionInlineInput = () => {
    if (!workspaceId) return;
    setCollectionInlineName('');
    setCollectionInlineHideDuringExit(false);
    setCollectionInlineOpen(true);
  };

  const closeCollectionInlineInput = (options?: { hideDuringExit?: boolean }) => {
    if (options?.hideDuringExit) {
      setCollectionInlineHideDuringExit(true);
      requestAnimationFrame(() => {
        setCollectionInlineOpen(false);
        setCollectionInlineName('');
        setCollectionInlineBusy(false);
      });
      return;
    }
    setCollectionInlineHideDuringExit(false);
    setCollectionInlineOpen(false);
    setCollectionInlineName('');
    setCollectionInlineBusy(false);
  };

  const submitCollectionInlineInput = async () => {
    if (collectionInlineBusy) return;
    const name = collectionInlineName.trim();
    if (!name || !workspaceId) {
      closeCollectionInlineInput({ hideDuringExit: true });
      return;
    }

    setCollectionInlineBusy(true);
    await chrome.bookmarks.create({ parentId: workspaceId, title: name, index: 0 });
    closeCollectionInlineInput({ hideDuringExit: true });
    await refresh();
  };

  const saveWindow = async () => {
    if (!workspaceId) return;
    const name = window.prompt('컬렉션 이름', '현재 창');
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
        rememberFavicon(tab.url, tab.favIconUrl);
      }
      count += 1;
    }
    setToast(`링크 ${count}개를 저장했습니다.`);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleteBusy) return;
    setDeleteBusy(true);
    if (deleteTarget.kind === 'workspace') {
      await chrome.bookmarks.removeTree(deleteTarget.id);
      setToast('워크스페이스를 삭제했습니다.');
    } else if (deleteTarget.kind === 'collection') {
      await chrome.bookmarks.removeTree(deleteTarget.id);
      setToast('컬렉션을 삭제했습니다.');
    } else {
      await chrome.bookmarks.remove(deleteTarget.id);
      setToast('북마크를 삭제했습니다.');
    }
    await refresh();
    setDeleteBusy(false);
    setDeleteTarget(null);
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

  const focusTab = async (tabId?: number) => {
    if (tabId == null) return;
    await chrome.tabs.update(tabId, { active: true });
  };

  const copyLink = async (url?: string) => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setToast('링크를 복사했습니다.');
  };

  const startBookmarkEdit = (link: BookmarkNode, parentId: string, index: number) => {
    if (!link.url) return;
    setEditingBookmark({
      id: link.id,
      parentId,
      index,
      originalTitle: link.title || '',
      originalUrl: link.url,
    });
    setEditingTitle(link.title || '');
    setEditingUrl(link.url);
  };

  const cancelBookmarkEdit = () => {
    setEditingBookmark(null);
    setEditingTitle('');
    setEditingUrl('');
    setEditingBookmarkBusy(false);
  };

  const saveBookmarkEdit = async () => {
    if (!editingBookmark || editingBookmarkBusy) return;
    const nextTitle = editingTitle.trim();
    const nextUrl = editingUrl.trim();
    if (!nextUrl) {
      cancelBookmarkEdit();
      return;
    }

    if (nextTitle === editingBookmark.originalTitle && nextUrl === editingBookmark.originalUrl) {
      cancelBookmarkEdit();
      return;
    }

    setEditingBookmarkBusy(true);
    await chrome.bookmarks.update(editingBookmark.id, {
      title: nextTitle || nextUrl,
      url: nextUrl,
    });
    await refresh();
    cancelBookmarkEdit();
    setToast('북마크를 수정했습니다.');
  };

  const updateAddBookmarkDraft = (patch: Partial<Pick<AddBookmarkMorphState, 'draftTitle' | 'draftUrl'>>) => {
    if (addingBookmarkInvalid) {
      setAddingBookmarkInvalid(false);
    }
    setAddBookmarkMorphState(prev => {
      if (!prev || prev.phase !== 'editing') return prev;
      return { ...prev, ...patch };
    });
  };

  const openBookmarkInlineInput = (collectionId: string) => {
    setAddBookmarkMorphState({
      collectionId,
      draftTitle: '',
      draftUrl: '',
      phase: 'editing',
    });
    setAddingBookmarkInvalid(false);
  };

  const closeBookmarkInlineInput = () => {
    setAddBookmarkMorphState(null);
    setAddingBookmarkInvalid(false);
  };

  const submitBookmarkInlineInput = async () => {
    if (!addBookmarkMorphState || addBookmarkMorphState.phase !== 'editing') return;
    const nextTitle = addBookmarkMorphState.draftTitle.trim();
    const nextUrl = addBookmarkMorphState.draftUrl.trim();

    if (!nextTitle && !nextUrl) {
      closeBookmarkInlineInput();
      return;
    }

    if (!isValidBookmarkUrl(nextUrl)) {
      setAddingBookmarkInvalid(true);
      setAddingBookmarkShakeToken(v => v + 1);
      setToast('유효한 URL을 입력해 주세요.');
      return;
    }

    setAddingBookmarkInvalid(false);
    const targetCollectionId = addBookmarkMorphState.collectionId;
    suppressBookmarkRefreshRef.current = true;
    setAddBookmarkMorphState(prev => {
      if (!prev || prev.collectionId !== targetCollectionId) return prev;
      return {
        ...prev,
        draftTitle: nextTitle,
        draftUrl: nextUrl,
        phase: 'committing',
      };
    });

    try {
      const created = await chrome.bookmarks.create({
        parentId: targetCollectionId,
        title: nextTitle || nextUrl,
        url: nextUrl,
      });
      await refresh();
      setRecentlyCreatedBookmark({
        collectionId: targetCollectionId,
        bookmarkId: created.id,
      });
      setAddBookmarkMorphState(null);
      setToast('북마크를 추가했습니다.');
    } catch (error) {
      console.error(error);
      setAddBookmarkMorphState({
        collectionId: targetCollectionId,
        draftTitle: nextTitle,
        draftUrl: nextUrl,
        phase: 'editing',
      });
      setToast('북마크를 추가하지 못했습니다.');
    } finally {
      suppressBookmarkRefreshRef.current = false;
    }
  };

  const scheduleWorkspaceFlyoutOpen = (ws: BookmarkNode, anchorEl: HTMLElement) => {
    if (draggingWorkspaceId) return;
    if (closeFlyoutTimerRef.current) {
      window.clearTimeout(closeFlyoutTimerRef.current);
      closeFlyoutTimerRef.current = null;
    }
    if (openFlyoutTimerRef.current) window.clearTimeout(openFlyoutTimerRef.current);
    openFlyoutTimerRef.current = window.setTimeout(() => {
      const rect = anchorEl.getBoundingClientRect();
      const collections = (ws.children || []).filter(isFolder).map(c => c.title || 'Untitled');
      setWorkspaceFlyout({
        workspaceId: ws.id,
        title: ws.title || 'Untitled',
        collections,
        x: rect.right + 10,
        y: rect.top - 4,
      });
      openFlyoutTimerRef.current = null;
    }, 400);
  };

  const scheduleWorkspaceFlyoutClose = () => {
    if (openFlyoutTimerRef.current) {
      window.clearTimeout(openFlyoutTimerRef.current);
      openFlyoutTimerRef.current = null;
    }
    if (closeFlyoutTimerRef.current) window.clearTimeout(closeFlyoutTimerRef.current);
    closeFlyoutTimerRef.current = window.setTimeout(() => {
      setWorkspaceFlyout(null);
      closeFlyoutTimerRef.current = null;
    }, 200);
  };

  const startWorkspaceEdit = (workspace: BookmarkNode) => {
    setEditingWorkspaceId(workspace.id);
    setEditingWorkspaceName(workspace.title || '');
  };

  const cancelWorkspaceEdit = () => {
    setEditingWorkspaceId(null);
    setEditingWorkspaceName('');
    setEditingWorkspaceBusy(false);
  };

  const saveWorkspaceEdit = async () => {
    if (!editingWorkspaceId || editingWorkspaceBusy) return;
    const nextName = editingWorkspaceName.trim();
    if (!nextName) {
      cancelWorkspaceEdit();
      return;
    }

    const current = workspaces.find(ws => ws.id === editingWorkspaceId)?.title || '';
    if (nextName === current) {
      cancelWorkspaceEdit();
      return;
    }

    setEditingWorkspaceBusy(true);
    await chrome.bookmarks.update(editingWorkspaceId, { title: nextName });
    await refresh();
    cancelWorkspaceEdit();
    setToast('워크스페이스 이름을 변경했습니다.');
  };

  const persistWorkspaceOrder = async () => {
    if (!tree || workspaceReorderBusy) return;
    setWorkspaceReorderBusy(true);
    for (let i = 0; i < workspaceOrderIds.length; i += 1) {
      const id = workspaceOrderIds[i];
      await chrome.bookmarks.move(id, { parentId: tree.id, index: i });
    }
    await refresh();
    setWorkspaceReorderBusy(false);
    setToast('워크스페이스 순서를 변경했습니다.');
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
    setToast(
      `${
        payload.title ? `'${payload.title}' 컬렉션을` : '컬렉션을'
      } '${targetWorkspace.title || '워크스페이스'}'로 이동했습니다.`,
    );
    await refresh();
  };

  const getFaviconSrcByKey = (key: string, url?: string) => {
    if (isNegativeFaviconCached(url)) return getFallbackFavicon();
    const candidates = getFaviconCandidates(url);
    const cached = getCachedFavicon(url);
    const index = faviconIndexById[key] ?? 0;
    if (cached) return cached;
    return candidates[index] || candidates[0] || getFallbackFavicon();
  };

  const onFaviconErrorByKey = (key: string, url?: string) => {
    const candidates = getFaviconCandidates(url);
    setFaviconIndexById(prev => {
      const next = { ...prev };
      const nextIndex = (next[key] ?? 0) + 1;
      if (nextIndex >= Math.max(0, candidates.length - 1)) {
        rememberFaviconFailure(url);
      }
      next[key] = Math.min(nextIndex, Math.max(0, candidates.length - 1));
      return next;
    });
  };

  const getFaviconSrc = (link: BookmarkNode) => getFaviconSrcByKey(link.id, link.url);
  const onFaviconError = (link: BookmarkNode) => onFaviconErrorByKey(link.id, link.url);

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
      rememberFavicon(payload.url, payload.favIconUrl);
    }
    setToast('북마크를 저장했습니다.');
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

  const filteredQuickActions = [
    {
      key: 'create-collection',
      label: '컬렉션 만들기',
      searchText: 'collection create add 컬렉션 만들기 추가',
      onSelect: () => runCommand(() => openCollectionInlineInput()),
    },
    {
      key: 'create-workspace',
      label: '워크스페이스 만들기',
      searchText: 'workspace create add 워크스페이스 만들기 추가',
      onSelect: () => runCommand(() => openWorkspaceInlineInput()),
    },
    {
      key: 'save-window',
      label: '현재 창을 컬렉션으로 저장',
      searchText: 'save window collection 현재 창 컬렉션 저장',
      onSelect: () => runCommand(() => saveWindow()),
    },
  ].filter(action => includesNormalizedQuery(commandQuery, action.label, action.searchText));

  const filteredWorkspaces = workspaces.filter(ws => includesNormalizedQuery(commandQuery, ws.title || ''));
  const filteredCollections = collections.filter(col =>
    includesNormalizedQuery(
      commandQuery,
      col.workspace,
      col.title,
      ...col.links.map(link => link.title || link.url || ''),
    ),
  );
  const hasCommandResults =
    filteredQuickActions.length > 0 ||
    filteredWorkspaces.length > 0 ||
    filteredCollections.length > 0 ||
    bookmarkHits.length > 0;

  return (
    <div className="nt-root">
      <header className="nt-header">
        <div className="header-left-actions">
          <button
            className="tool-btn"
            onClick={() => setLeftCollapsed(v => !v)}
            title={leftCollapsed ? '사이드바 열기' : '사이드바 닫기'}
            aria-label={leftCollapsed ? '사이드바 열기' : '사이드바 닫기'}
            aria-expanded={!leftCollapsed}>
            <PanelLeft size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="header-right-actions">
          <button className="tool-btn" onClick={openCollectionInlineInput} title="컬렉션 추가" aria-label="컬렉션 추가">
            <Plus size={18} aria-hidden="true" />
          </button>
          <button
            className="tool-btn"
            onClick={() => setCommandOpen(true)}
            title="검색 및 명령 (⌘K)"
            aria-label="검색 및 명령">
            <Search size={18} aria-hidden="true" />
          </button>
          <button
            className="tool-btn"
            onClick={() => setRightCollapsed(v => !v)}
            title={rightCollapsed ? '추가 액션 열기' : '추가 액션 닫기'}
            aria-label="추가 액션">
            <PanelRight size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className={`layout ${leftCollapsed ? 'left-collapsed' : ''} ${rightCollapsed ? 'right-collapsed' : ''}`}>
        <aside className={`panel left ${draggingWorkspaceId ? 'workspace-dragging' : ''}`}>
          <div className="panel-content">
            <Reorder.Group
              axis="y"
              values={workspaceOrderIds}
              onReorder={setWorkspaceOrderIds}
              layoutScroll
              className="workspace-list">
              {orderedWorkspaces.map(ws => (
                <Reorder.Item
                  key={ws.id}
                  value={ws.id}
                  className={`workspace-reorder-item ${draggingWorkspaceId === ws.id ? 'dragging' : ''}`}
                  layout="position"
                  dragMomentum={false}
                  whileDrag={{
                    scale: 1,
                    background: 'rgba(255, 255, 255, 0.8)',
                    backdropFilter: 'blur(10px)',
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                  }}
                  transition={draggingWorkspaceId ? { type: 'spring', stiffness: 400, damping: 30 } : { duration: 0 }}
                  onDragStart={() => {
                    setDraggingWorkspaceId(ws.id);
                    setWorkspaceFlyout(null);
                    if (openFlyoutTimerRef.current) {
                      window.clearTimeout(openFlyoutTimerRef.current);
                      openFlyoutTimerRef.current = null;
                    }
                    if (closeFlyoutTimerRef.current) {
                      window.clearTimeout(closeFlyoutTimerRef.current);
                      closeFlyoutTimerRef.current = null;
                    }
                  }}
                  onDragEnd={() => {
                    setDraggingWorkspaceId(null);
                    void persistWorkspaceOrder();
                  }}>
                  <ContextMenu.Root modal={false}>
                    <ContextMenu.Trigger asChild>
                      <div>
                        {editingWorkspaceId === ws.id ? (
                          <div className="workspace-item is-editing">
                            <input
                              ref={editingWorkspaceRef}
                              className="workspace-edit-input"
                              value={editingWorkspaceName}
                              onChange={e => setEditingWorkspaceName(e.currentTarget.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  void saveWorkspaceEdit();
                                } else if (e.key === 'Escape') {
                                  e.preventDefault();
                                  cancelWorkspaceEdit();
                                }
                              }}
                              onBlur={() => {
                                void saveWorkspaceEdit();
                              }}
                              disabled={editingWorkspaceBusy}
                            />
                          </div>
                        ) : (
                          <button
                            className={[
                              'workspace-item',
                              workspaceId === ws.id ? 'active' : '',
                              dropWorkspaceId === ws.id ? 'drop-target' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            onMouseEnter={e => scheduleWorkspaceFlyoutOpen(ws, e.currentTarget)}
                            onMouseLeave={scheduleWorkspaceFlyoutClose}
                            onClick={() => {
                              setWorkspaceFlyout(null);
                              if (openFlyoutTimerRef.current) {
                                window.clearTimeout(openFlyoutTimerRef.current);
                                openFlyoutTimerRef.current = null;
                              }
                              if (closeFlyoutTimerRef.current) {
                                window.clearTimeout(closeFlyoutTimerRef.current);
                                closeFlyoutTimerRef.current = null;
                              }
                              setWorkspaceId(ws.id);
                            }}
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
                        )}
                      </div>
                    </ContextMenu.Trigger>
                    <ContextMenu.Portal>
                      <ContextMenu.Content className="col-context-menu">
                        <div className="col-context-label">워크스페이스 메뉴 · {ws.title}</div>
                        <ContextMenu.Separator className="col-context-separator" />
                        <ContextMenu.Item className="col-context-item" onSelect={() => startWorkspaceEdit(ws)}>
                          수정
                        </ContextMenu.Item>
                        <ContextMenu.Item
                          className="col-context-item col-context-item-destructive"
                          onSelect={() =>
                            setDeleteTarget({
                              kind: 'workspace',
                              id: ws.id,
                              title: ws.title || 'Untitled',
                            })
                          }>
                          워크스페이스 삭제
                        </ContextMenu.Item>
                      </ContextMenu.Content>
                    </ContextMenu.Portal>
                  </ContextMenu.Root>
                </Reorder.Item>
              ))}
            </Reorder.Group>
            <ul className="workspace-list workspace-list-static">
              {workspaceInlineOpen && (
                <li className="workspace-inline-input-item">
                  <input
                    ref={workspaceInlineRef}
                    className="workspace-inline-input"
                    type="text"
                    placeholder="워크스페이스 이름..."
                    value={workspaceInlineName}
                    onChange={e => setWorkspaceInlineName(e.currentTarget.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void submitWorkspaceInlineInput();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        closeWorkspaceInlineInput();
                      }
                    }}
                    onBlur={() => {
                      void submitWorkspaceInlineInput();
                    }}
                    disabled={workspaceInlineBusy}
                  />
                </li>
              )}
              <li>
                <button
                  className="workspace-add-button"
                  onClick={openWorkspaceInlineInput}
                  title="워크스페이스 추가"
                  aria-label="워크스페이스 추가">
                  <Plus size={14} aria-hidden="true" />
                  <span>워크스페이스 추가</span>
                </button>
              </li>
            </ul>
          </div>
        </aside>

        <section className="panel center">
          <div className="grid">
            <AnimatePresence initial={false} mode="popLayout">
              {collectionInlineOpen && (
                <motion.article
                  key="inline-collection-input"
                  className={`col-card inline-input-card ${collectionInlineHideDuringExit ? 'is-hiding' : ''}`}
                  layout
                  initial={shouldReduceMotion ? false : { scale: 0.985, y: -8 }}
                  animate={shouldReduceMotion ? { scale: 1, y: 0 } : { scale: 1, y: 0 }}
                  exit={
                    shouldReduceMotion
                      ? { opacity: 0, transition: { duration: 0.01 } }
                      : { opacity: 0, scale: 0.992, y: -4, transition: { duration: 0.12, ease: 'easeOut' } }
                  }
                  transition={shouldReduceMotion ? { duration: 0.01 } : { duration: 0.18, ease: 'easeOut' }}>
                  <div className="col-head">
                    <input
                      ref={collectionInlineRef}
                      className="col-inline-input"
                      type="text"
                      placeholder="새 컬렉션 이름..."
                      value={collectionInlineName}
                      onChange={e => setCollectionInlineName(e.currentTarget.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void submitCollectionInlineInput();
                        } else if (e.key === 'Escape') {
                          e.preventDefault();
                          closeCollectionInlineInput({ hideDuringExit: true });
                        }
                      }}
                      onBlur={() => {
                        void submitCollectionInlineInput();
                      }}
                      disabled={collectionInlineBusy}
                    />
                  </div>
                </motion.article>
              )}
            </AnimatePresence>
            <AnimatePresence key={`collections-${workspaceId || 'all'}`} initial={false}>
              {collections.map(col => {
                const addStateForCollection =
                  addBookmarkMorphState?.collectionId === col.id ? addBookmarkMorphState : null;
                const addPendingTitle =
                  addStateForCollection?.draftTitle.trim() || addStateForCollection?.draftUrl || '새 북마크';
                const addPendingDomain = getDomain(addStateForCollection?.draftUrl);
                const visibleLinks = col.links;

                return (
                  <ContextMenu.Root
                    modal={false}
                    key={col.id}
                    onOpenChange={open =>
                      setActiveContext(prev =>
                        open
                          ? { kind: 'collection', id: col.id }
                          : prev?.kind === 'collection' && prev.id === col.id
                            ? null
                            : prev,
                      )
                    }>
                    <ContextMenu.Trigger asChild>
                      <motion.article
                        className={`col-card ${dropCollectionId === col.id ? 'drop-target' : ''} ${
                          activeContext?.kind === 'collection' && activeContext.id === col.id ? 'context-active' : ''
                        }`}
                        layout="position"
                        initial={shouldReduceMotion ? false : { opacity: 0, y: -6 }}
                        animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                        exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
                        transition={
                          shouldReduceMotion
                            ? { duration: 0.01 }
                            : {
                                y: { duration: 0.2, ease: 'easeOut' },
                                opacity: { duration: 0.18, ease: 'easeOut' },
                                layout: { type: 'spring', stiffness: 430, damping: 36 },
                              }
                        }
                        draggable
                        onDragStart={e => onDragCollectionStart(e as unknown as React.DragEvent, col)}
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
                          <LayoutGroup id={`collection-links-${col.id}`}>
                            <AnimatePresence initial={false}>
                              {visibleLinks.map((link, linkIndex) => {
                                const icon = getFaviconSrc(link);
                                const isFallbackIcon = icon === getFallbackFavicon();
                                const isNewlyAdded =
                                  recentlyCreatedBookmark?.collectionId === col.id &&
                                  recentlyCreatedBookmark.bookmarkId === link.id;
                                const linkTitle = link.title || link.url || 'Untitled';
                                const linkDomain = getDomain(link.url);
                                return (
                                  <motion.li
                                    key={link.id}
                                    layout
                                    initial={
                                      isNewlyAdded ? (shouldReduceMotion ? false : { opacity: 0, y: 14 }) : false
                                    }
                                    animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
                                    transition={
                                      isNewlyAdded
                                        ? shouldReduceMotion
                                          ? { duration: 0.01 }
                                          : { duration: 0.28, ease: 'easeOut' }
                                        : shouldReduceMotion
                                          ? { duration: 0.01 }
                                          : { duration: 0.16, ease: 'easeOut' }
                                    }>
                                    <ContextMenu.Root
                                      modal={false}
                                      onOpenChange={open =>
                                        setActiveContext(prev =>
                                          open
                                            ? { kind: 'bookmark', id: link.id }
                                            : prev?.kind === 'bookmark' && prev.id === link.id
                                              ? null
                                              : prev,
                                        )
                                      }>
                                      <ContextMenu.Trigger asChild>
                                        {editingBookmark?.id === link.id ? (
                                          <div className="bookmark-item is-editing">
                                            {isFallbackIcon ? (
                                              <span className="fav-fallback" aria-hidden>
                                                <Link2 size={14} />
                                              </span>
                                            ) : (
                                              <img
                                                className="fav"
                                                src={icon}
                                                alt=""
                                                onError={() => onFaviconError(link)}
                                                onLoad={e =>
                                                  rememberFavicon(link.url, (e.currentTarget as HTMLImageElement).src)
                                                }
                                              />
                                            )}
                                            <span className="link-main">
                                              <input
                                                ref={editingTitleRef}
                                                className="bookmark-edit-input title"
                                                value={editingTitle}
                                                onChange={e => setEditingTitle(e.currentTarget.value)}
                                                onKeyDown={e => {
                                                  if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    void saveBookmarkEdit();
                                                  } else if (e.key === 'Escape') {
                                                    e.preventDefault();
                                                    cancelBookmarkEdit();
                                                  }
                                                }}
                                                onBlur={() => {
                                                  setTimeout(() => {
                                                    const active = document.activeElement;
                                                    if (
                                                      active === editingTitleRef.current ||
                                                      active === editingUrlRef.current
                                                    )
                                                      return;
                                                    void saveBookmarkEdit();
                                                  }, 0);
                                                }}
                                                placeholder="제목"
                                                disabled={editingBookmarkBusy}
                                              />
                                              <input
                                                ref={editingUrlRef}
                                                className="bookmark-edit-input url"
                                                value={editingUrl}
                                                onChange={e => setEditingUrl(e.currentTarget.value)}
                                                onKeyDown={e => {
                                                  if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    void saveBookmarkEdit();
                                                  } else if (e.key === 'Escape') {
                                                    e.preventDefault();
                                                    cancelBookmarkEdit();
                                                  }
                                                }}
                                                onBlur={() => {
                                                  setTimeout(() => {
                                                    const active = document.activeElement;
                                                    if (
                                                      active === editingTitleRef.current ||
                                                      active === editingUrlRef.current
                                                    )
                                                      return;
                                                    void saveBookmarkEdit();
                                                  }, 0);
                                                }}
                                                placeholder="https://"
                                                disabled={editingBookmarkBusy}
                                              />
                                            </span>
                                          </div>
                                        ) : (
                                          <motion.button
                                            className={`link-row ${
                                              activeContext?.kind === 'bookmark' && activeContext.id === link.id
                                                ? 'context-active'
                                                : ''
                                            }`}
                                            onClick={() => openLink(link.url)}
                                            title={link.url || ''}>
                                            <motion.span className="bookmark-icon-shell">
                                              <AnimatePresence initial={false} mode="wait">
                                                {isFallbackIcon ? (
                                                  <motion.span
                                                    key="fallback"
                                                    className="fav-fallback bookmark-icon-layer"
                                                    aria-hidden
                                                    initial={shouldReduceMotion ? false : { opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0 }}
                                                    transition={{ duration: shouldReduceMotion ? 0.01 : 0.14 }}>
                                                    <Link2 size={14} />
                                                  </motion.span>
                                                ) : (
                                                  <motion.img
                                                    key={icon}
                                                    className="fav bookmark-icon-layer"
                                                    src={icon}
                                                    alt=""
                                                    onError={() => onFaviconError(link)}
                                                    onLoad={e =>
                                                      rememberFavicon(
                                                        link.url,
                                                        (e.currentTarget as HTMLImageElement).src,
                                                      )
                                                    }
                                                    initial={shouldReduceMotion ? false : { opacity: 0 }}
                                                    animate={{ opacity: 1 }}
                                                    exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0 }}
                                                    transition={{ duration: shouldReduceMotion ? 0.01 : 0.2 }}
                                                  />
                                                )}
                                              </AnimatePresence>
                                            </motion.span>
                                            <motion.span className="link-main">
                                              <motion.span className="link-title">{linkTitle}</motion.span>
                                              <motion.span className="link-domain">{linkDomain}</motion.span>
                                            </motion.span>
                                          </motion.button>
                                        )}
                                      </ContextMenu.Trigger>
                                      <ContextMenu.Portal>
                                        <ContextMenu.Content className="col-context-menu">
                                          <div className="col-context-label">
                                            북마크 메뉴 · {link.title || getDomain(link.url) || 'Untitled'}
                                          </div>
                                          <ContextMenu.Separator className="col-context-separator" />
                                          <ContextMenu.Item
                                            className="col-context-item"
                                            onSelect={() => void openLink(link.url)}>
                                            새 탭에서 열기
                                          </ContextMenu.Item>
                                          <ContextMenu.Item
                                            className="col-context-item"
                                            onSelect={() => void copyLink(link.url)}>
                                            링크 복사
                                          </ContextMenu.Item>
                                          <ContextMenu.Item
                                            className="col-context-item"
                                            onSelect={() => startBookmarkEdit(link, col.id, linkIndex)}>
                                            수정
                                          </ContextMenu.Item>
                                          <ContextMenu.Separator className="col-context-separator" />
                                          <ContextMenu.Item
                                            className="col-context-item col-context-item-destructive"
                                            onSelect={() =>
                                              setDeleteTarget({
                                                kind: 'bookmark',
                                                id: link.id,
                                                title: link.title || link.url || 'Untitled',
                                                url: link.url,
                                              })
                                            }>
                                            북마크 삭제
                                          </ContextMenu.Item>
                                        </ContextMenu.Content>
                                      </ContextMenu.Portal>
                                    </ContextMenu.Root>
                                  </motion.li>
                                );
                              })}
                              <motion.li
                                key={`${col.id}-inline-bookmark`}
                                className="bookmark-inline-add-slot"
                                layout
                                transition={
                                  shouldReduceMotion
                                    ? { duration: 0.01 }
                                    : { type: 'spring', stiffness: 460, damping: 38 }
                                }>
                                {addStateForCollection?.phase === 'editing' ? (
                                  <div
                                    ref={addingBookmarkFormRef}
                                    className={`bookmark-item bookmark-inline-add-form is-editing ${
                                      addingBookmarkInvalid ? 'is-invalid' : ''
                                    }`}>
                                    <span className="fav-fallback" aria-hidden>
                                      <Plus size={14} />
                                    </span>
                                    <span className="link-main">
                                      <div className="bookmark-add-text-shell">
                                        <input
                                          ref={addingBookmarkTitleRef}
                                          className="bookmark-edit-input title inline-add-input"
                                          value={addingBookmarkTitle}
                                          onChange={e => updateAddBookmarkDraft({ draftTitle: e.currentTarget.value })}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              void submitBookmarkInlineInput();
                                            } else if (e.key === 'Escape') {
                                              e.preventDefault();
                                              closeBookmarkInlineInput();
                                            }
                                          }}
                                          onBlur={() => {
                                            setTimeout(() => {
                                              const active = document.activeElement;
                                              if (
                                                active === addingBookmarkTitleRef.current ||
                                                active === addingBookmarkUrlRef.current
                                              )
                                                return;
                                              void submitBookmarkInlineInput();
                                            }, 0);
                                          }}
                                          placeholder="북마크 제목"
                                          disabled={addingBookmarkBusy}
                                        />
                                      </div>
                                      <div className="bookmark-add-text-shell">
                                        <input
                                          ref={addingBookmarkUrlRef}
                                          className="bookmark-edit-input url inline-add-input"
                                          value={addingBookmarkUrl}
                                          onChange={e => updateAddBookmarkDraft({ draftUrl: e.currentTarget.value })}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              void submitBookmarkInlineInput();
                                            } else if (e.key === 'Escape') {
                                              e.preventDefault();
                                              closeBookmarkInlineInput();
                                            }
                                          }}
                                          onBlur={() => {
                                            setTimeout(() => {
                                              const active = document.activeElement;
                                              if (
                                                active === addingBookmarkTitleRef.current ||
                                                active === addingBookmarkUrlRef.current
                                              )
                                                return;
                                              void submitBookmarkInlineInput();
                                            }, 0);
                                          }}
                                          placeholder="https://"
                                          disabled={addingBookmarkBusy}
                                        />
                                      </div>
                                    </span>
                                  </div>
                                ) : addStateForCollection?.phase === 'committing' ? (
                                  <div className="bookmark-item bookmark-inline-add-pending">
                                    <span className="fav-fallback" aria-hidden>
                                      <Plus size={14} />
                                    </span>
                                    <span className="link-main">
                                      <span className="link-title bookmark-inline-add-title">{addPendingTitle}</span>
                                      <span className="link-domain bookmark-inline-add-hint">
                                        {addPendingDomain || addStateForCollection.draftUrl || '북마크 저장 중...'}
                                      </span>
                                    </span>
                                  </div>
                                ) : (
                                  <button
                                    className="bookmark-item bookmark-inline-add-trigger"
                                    onClick={() => openBookmarkInlineInput(col.id)}>
                                    <span className="fav-fallback" aria-hidden>
                                      <Plus size={14} />
                                    </span>
                                    <span className="link-main">
                                      <span className="link-title bookmark-inline-add-title">새 북마크 추가...</span>
                                      <span className="link-domain bookmark-inline-add-hint">URL 붙여넣기</span>
                                    </span>
                                  </button>
                                )}
                              </motion.li>
                            </AnimatePresence>
                          </LayoutGroup>
                        </ul>
                      </motion.article>
                    </ContextMenu.Trigger>
                    <ContextMenu.Portal>
                      <ContextMenu.Content className="col-context-menu" alignOffset={-4}>
                        <div className="col-context-label">컬렉션 메뉴 · {col.title}</div>
                        <ContextMenu.Separator className="col-context-separator" />
                        <ContextMenu.Item
                          className="col-context-item"
                          onSelect={() => void openCollection(col.id, 'group')}>
                          탭 그룹으로 열기
                        </ContextMenu.Item>
                        <ContextMenu.Item
                          className="col-context-item"
                          onSelect={() => void openCollection(col.id, 'new-window')}>
                          새 창으로 열기
                        </ContextMenu.Item>
                        <ContextMenu.Separator className="col-context-separator" />
                        <ContextMenu.Item
                          className="col-context-item col-context-item-destructive"
                          onSelect={() =>
                            setDeleteTarget({
                              kind: 'collection',
                              id: col.id,
                              title: col.title,
                            })
                          }>
                          컬렉션 삭제
                        </ContextMenu.Item>
                      </ContextMenu.Content>
                    </ContextMenu.Portal>
                  </ContextMenu.Root>
                );
              })}
            </AnimatePresence>
          </div>
        </section>

        <aside className="panel right">
          <div className="panel-content">
            <div className="panel-section-header">
              <Globe className="panel-section-icon" size={15} aria-hidden="true" />
              <strong>열린 탭</strong>
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
                  <button
                    type="button"
                    className="link-row tab-row-btn"
                    onClick={() => {
                      void focusTab(tab.id);
                    }}>
                    {getFaviconCandidates(tab.url)[0] === getFallbackFavicon() ? (
                      <span className="fav-fallback" aria-hidden>
                        <Link2 size={14} />
                      </span>
                    ) : (
                      <img className="fav" src={getFaviconCandidates(tab.url)[0]} alt="" />
                    )}
                    <div>
                      <div className="tab-title">{tab.title || tab.url}</div>
                      <div className="tab-domain">{getDomain(tab.url)}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </main>

      {!!toast && <div className="toast">{toast}</div>}

      {createPortal(
        <AnimatePresence>
          {workspaceFlyout && (
            <motion.div
              key={workspaceFlyout.workspaceId}
              className="workspace-flyout"
              style={{ left: workspaceFlyout.x, top: workspaceFlyout.y }}
              initial={{ opacity: 0, x: -8, scale: 0.97, filter: 'blur(4px)' }}
              animate={{
                opacity: 1,
                x: 0,
                scale: 1,
                filter: 'blur(0px)',
                transition: { type: 'spring', stiffness: 450, damping: 30, mass: 0.8 },
              }}
              exit={{ opacity: 0, x: -4, scale: 0.98, transition: { duration: 0.15, ease: 'easeOut' } }}
              onMouseEnter={() => {
                if (closeFlyoutTimerRef.current) {
                  window.clearTimeout(closeFlyoutTimerRef.current);
                  closeFlyoutTimerRef.current = null;
                }
              }}
              onMouseLeave={scheduleWorkspaceFlyoutClose}>
              <div className="workspace-flyout-title">컬렉션 목록</div>
              <ul className="workspace-flyout-list">
                {workspaceFlyout.collections.map((name, idx) => (
                  <li key={`${workspaceFlyout.workspaceId}-${idx}-${name}`}>
                    <span>{name}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      <AlertDialog.Root open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="confirm-overlay" />
          <AlertDialog.Content className="confirm-dialog">
            <AlertDialog.Title className="confirm-title">
              {deleteTarget?.kind === 'bookmark'
                ? '북마크를 삭제하시겠어요?'
                : deleteTarget?.kind === 'workspace'
                  ? '워크스페이스를 삭제하시겠어요?'
                  : '컬렉션을 삭제하시겠어요?'}
            </AlertDialog.Title>
            <AlertDialog.Description className="confirm-desc">
              {deleteTarget?.kind === 'bookmark'
                ? `${deleteTarget.title} 북마크를 삭제합니다. 이 작업은 되돌릴 수 없습니다.`
                : deleteTarget?.kind === 'workspace'
                  ? `${deleteTarget.title} 워크스페이스와 포함된 컬렉션, 북마크를 모두 삭제합니다. 이 작업은 되돌릴 수 없습니다.`
                  : deleteTarget?.title
                    ? `${deleteTarget.title} 컬렉션과 포함된 북마크를 모두 삭제합니다. 이 작업은 되돌릴 수 없습니다.`
                    : '선택한 컬렉션과 포함된 북마크를 모두 삭제합니다. 이 작업은 되돌릴 수 없습니다.'}
            </AlertDialog.Description>
            <div className="confirm-actions">
              <AlertDialog.Cancel asChild>
                <button className="confirm-btn">취소</button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <button className="confirm-btn destructive" onClick={() => void confirmDelete()} disabled={deleteBusy}>
                  삭제
                </button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>

      <Command.Dialog
        className="cmdk-dialog"
        overlayClassName="cmdk-overlay"
        label="커맨드 팔레트"
        modal={false}
        shouldFilter={false}
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
          {!hasCommandResults && <div className="cmdk-empty">결과가 없습니다.</div>}

          {filteredQuickActions.length > 0 && (
            <Command.Group heading="빠른 작업" className="cmdk-group">
              {filteredQuickActions.map(action => (
                <Command.Item key={action.key} className="cmdk-item" onSelect={action.onSelect} value={action.label}>
                  <span className="cmdk-item-text">{action.label}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {filteredWorkspaces.length > 0 && (
            <Command.Group heading="워크스페이스" className="cmdk-group">
              {filteredWorkspaces.map(ws => (
                <Command.Item
                  key={ws.id}
                  className="cmdk-item"
                  value={`workspace ${ws.title}`}
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
          )}

          {filteredCollections.length > 0 && (
            <Command.Group heading="컬렉션 열기" className="cmdk-group">
              {filteredCollections.map(col => (
                <Command.Item
                  key={`${col.id}-group`}
                  className="cmdk-item"
                  value={`${col.workspace} ${col.title} tab group`}
                  onSelect={() => runCommand(() => openCollection(col.id, 'group'))}>
                  {col.title} · 탭 그룹으로 열기
                </Command.Item>
              ))}
              {filteredCollections.map(col => (
                <Command.Item
                  key={`${col.id}-window`}
                  className="cmdk-item"
                  value={`${col.workspace} ${col.title} window`}
                  onSelect={() => runCommand(() => openCollection(col.id, 'new-window'))}>
                  {col.title} · 새 창으로 열기
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {bookmarkHits.length > 0 && (
            <Command.Group heading="저장된 북마크" className="cmdk-group">
              {bookmarkHits.map(hit => {
                const icon = getFaviconSrcByKey(hit.record.key, hit.record.url);
                const isFallbackIcon = icon === getFallbackFavicon();
                return (
                  <Command.Item
                    key={hit.record.key}
                    className="cmdk-item"
                    value={`${hit.record.title} ${hit.record.url} ${hit.record.domain} ${hit.record.workspaceTitle} ${hit.record.collectionTitle}`}
                    onSelect={() => runCommand(() => openLink(hit.record.url))}>
                    {isFallbackIcon ? (
                      <span className="fav-fallback" aria-hidden>
                        <Link2 size={14} />
                      </span>
                    ) : (
                      <img
                        className="fav"
                        src={icon}
                        alt=""
                        onError={() => onFaviconErrorByKey(hit.record.key, hit.record.url)}
                        onLoad={e => rememberFavicon(hit.record.url, (e.currentTarget as HTMLImageElement).src)}
                      />
                    )}
                    <div className="cmdk-item-body">
                      <div className="cmdk-item-title-row">
                        <span className="cmdk-item-text">
                          {renderHighlightedText(hit.record.title, hit.titleRanges)}
                        </span>
                      </div>
                      <span className="cmdk-item-subtitle">
                        {renderHighlightedText(hit.secondaryText, hit.secondaryRanges)}
                      </span>
                    </div>
                  </Command.Item>
                );
              })}
            </Command.Group>
          )}
        </Command.List>
      </Command.Dialog>
    </div>
  );
};

export default NewTab;
