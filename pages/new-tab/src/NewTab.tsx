import { CollectionsBoard } from '@src/components/CollectionsBoard';
import { DeleteConfirmDialog } from '@src/components/DeleteConfirmDialog';
import { NewTabCommandDialog } from '@src/components/NewTabCommandDialog';
import { NewTabHeader } from '@src/components/NewTabHeader';
import { OpenTabsPanel } from '@src/components/OpenTabsPanel';
import { WorkspaceFlyoutPortal } from '@src/components/WorkspaceFlyoutPortal';
import { WorkspaceSidebar } from '@src/components/WorkspaceSidebar';
import { useBookmarkComposer } from '@src/hooks/use-bookmark-composer';
import { useBookmarkDnd } from '@src/hooks/use-bookmark-dnd';
import { useCollectionDnd } from '@src/hooks/use-collection-dnd';
import { useCommandPalette } from '@src/hooks/use-command-palette';
import { useFaviconState } from '@src/hooks/use-favicon-state';
import { useNewTabData } from '@src/hooks/use-new-tab-data';
import { useWorkspaceDnd } from '@src/hooks/use-workspace-dnd';
import { removeBookmarkAfterUserConsent, removeBookmarkTreeAfterUserConsent } from '@src/lib/bookmark-consent';
import { moveBookmarkNodeFromUserAction, updateBookmarkNodeFromUserAction } from '@src/lib/bookmark-user-actions';
import {
  getCollectionDropPreviewFromPointer,
  measureBookmarkDropSlots,
  orderByIds,
} from '@src/lib/dnd/sortable-helpers';
import { getFallbackFavicon, rememberFavicon } from '@src/lib/favicon-resolver';
import { parseCollectionWorkspaceDragPayload } from '@src/lib/new-tab/collection-workspace-drag';
import {
  DND_COLLECTION_MIME,
  DND_TAB_MIME,
  LS_LEFT_COLLAPSED,
  LS_RIGHT_COLLAPSED,
  getPersistedBool,
  isFolder,
} from '@src/lib/new-tab/helpers';
import { parseTabCollectionDragPayload, saveDroppedTabBookmark } from '@src/lib/new-tab/tab-collection-drag';
import { useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ActiveContext,
  BookmarkDropPreview,
  BookmarkNode,
  CollectionSummary,
  DeleteTarget,
  WorkspaceFlyout,
} from '@src/lib/new-tab/types';
import type { DragEvent as ReactDragEvent } from 'react';
import '@src/NewTab.css';

const isSameDropPreview = (left: BookmarkDropPreview | null, right: BookmarkDropPreview | null) =>
  left?.kind === right?.kind &&
  left?.collectionId === right?.collectionId &&
  left?.targetIndex === right?.targetIndex &&
  left?.renderId === right?.renderId &&
  left?.side === right?.side;

const NewTab = () => {
  const shouldReduceMotion = useReducedMotion();
  const [leftCollapsed, setLeftCollapsed] = useState(() => getPersistedBool(LS_LEFT_COLLAPSED));
  const [rightCollapsed, setRightCollapsed] = useState(() => getPersistedBool(LS_RIGHT_COLLAPSED));
  const [tabDropPreview, setTabDropPreview] = useState<BookmarkDropPreview | null>(null);
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
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editingWorkspaceName, setEditingWorkspaceName] = useState('');
  const [editingWorkspaceBusy, setEditingWorkspaceBusy] = useState(false);
  const editingWorkspaceRef = useRef<HTMLInputElement | null>(null);
  const [workspaceFlyout, setWorkspaceFlyout] = useState<WorkspaceFlyout | null>(null);
  const openFlyoutTimerRef = useRef<number | null>(null);
  const closeFlyoutTimerRef = useRef<number | null>(null);
  const suppressBookmarkRefreshRef = useRef(false);
  const { collections, refresh, selectedWorkspace, setWorkspaceId, tabs, tree, workspaceId, workspaces } =
    useNewTabData({
      suppressBookmarkRefreshRef,
    });
  const { getFaviconSrc, getFaviconSrcByKey, onFaviconError, onFaviconErrorByKey } = useFaviconState();
  const previousWorkspaceIdRef = useRef(workspaceId);
  const clearWorkspaceFlyoutTimers = useCallback(() => {
    if (openFlyoutTimerRef.current) {
      window.clearTimeout(openFlyoutTimerRef.current);
      openFlyoutTimerRef.current = null;
    }

    if (closeFlyoutTimerRef.current) {
      window.clearTimeout(closeFlyoutTimerRef.current);
      closeFlyoutTimerRef.current = null;
    }
  }, []);
  const {
    addBookmarkMorphState,
    addingBookmarkBusy,
    addingBookmarkFormRef,
    addingBookmarkInvalid,
    addingBookmarkTitle,
    addingBookmarkTitleRef,
    addingBookmarkUrl,
    addingBookmarkUrlRef,
    cancelBookmarkEdit,
    closeBookmarkInlineInput,
    editingBookmark,
    editingBookmarkBusy,
    editingTitle,
    editingTitleRef,
    editingUrl,
    editingUrlRef,
    openBookmarkInlineInput,
    recentlyCreatedBookmark,
    saveBookmarkEdit,
    setEditingTitle,
    setEditingUrl,
    startBookmarkEdit,
    submitBookmarkInlineInput,
    updateAddBookmarkDraft,
  } = useBookmarkComposer({
    collections,
    refresh,
    setToast,
    shouldReduceMotion: shouldReduceMotion ?? false,
    suppressBookmarkRefreshRef,
  });

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
    if (!editingWorkspaceId) return;
    requestAnimationFrame(() => {
      editingWorkspaceRef.current?.focus();
      editingWorkspaceRef.current?.select();
    });
  }, [editingWorkspaceId]);

  useEffect(() => clearWorkspaceFlyoutTimers, [clearWorkspaceFlyoutTimers]);
  useEffect(() => {
    previousWorkspaceIdRef.current = workspaceId;
  }, [workspaceId]);

  useEffect(() => {
    window.localStorage.setItem(LS_LEFT_COLLAPSED, leftCollapsed ? '1' : '0');
  }, [leftCollapsed]);

  useEffect(() => {
    window.localStorage.setItem(LS_RIGHT_COLLAPSED, rightCollapsed ? '1' : '0');
  }, [rightCollapsed]);
  const suppressCollectionTransitions = previousWorkspaceIdRef.current !== workspaceId;
  const clearActiveContext = useCallback(() => setActiveContext(null), []);
  const {
    activeBookmarkDragCollectionId,
    activeBookmarkOverlay,
    bookmarkCollectionNodesRef,
    bookmarkListNodesRef,
    bookmarkDropPreview,
    bookmarkOverlayModifier,
    orderedBookmarksByCollection,
    handleBookmarkDragCancel,
    handleBookmarkDragEnd,
    handleBookmarkDragMove,
    handleBookmarkDragStart,
    handleBookmarkPointerDownCapture,
    orderedBookmarkIds,
    sensors,
  } = useBookmarkDnd({
    collections,
    clearActiveContext,
    refresh,
    setToast,
  });
  const {
    activeCollectionDragId,
    clearCollectionDragPreview,
    collectionBoardNodeRef,
    collectionDropPreview,
    handleCollectionBoardDragLeave,
    handleCollectionBoardDragOver,
    handleCollectionBoardDrop,
    handleCollectionDragStart,
    orderedCollections,
    resetCollectionDragState,
  } = useCollectionDnd({
    collections,
    refresh,
    selectedWorkspaceChildren: selectedWorkspace?.children || [],
    selectedWorkspaceId: workspaceId,
    setToast,
    suppressBookmarkRefreshRef,
  });
  const {
    activeWorkspaceDragId,
    handleWorkspaceDragCancel,
    handleWorkspaceDragEnd,
    handleWorkspaceDragMove,
    handleWorkspaceDragStart,
    handleWorkspacePointerDownCapture,
    sensors: workspaceSensors,
    workspaceDropPreview,
    workspaceOverlayModifier,
    workspaceListNodeRef,
    workspaceOrderIds,
    workspaceReorderBusy,
  } = useWorkspaceDnd({
    refresh,
    setToast,
    suppressBookmarkRefreshRef,
    tree,
    workspaces,
  });
  const orderedWorkspaces = useMemo(() => orderByIds(workspaces, workspaceOrderIds), [workspaces, workspaceOrderIds]);

  useEffect(() => {
    if (!activeWorkspaceDragId) return;
    setWorkspaceFlyout(null);
    clearWorkspaceFlyoutTimers();
  }, [activeWorkspaceDragId, clearWorkspaceFlyoutTimers]);

  const measureCollectionRects = useCallback(() => {
    const entries = Object.entries(bookmarkCollectionNodesRef.current).flatMap(([collectionId, node]) => {
      if (!node) return [];

      const rect = node.getBoundingClientRect();
      return [
        [
          collectionId,
          {
            height: rect.height,
            left: rect.left,
            top: rect.top,
            width: rect.width,
          },
        ] as const,
      ];
    });

    return Object.fromEntries(entries);
  }, [bookmarkCollectionNodesRef]);

  const measureSlotsForCollection = useCallback(
    (collectionId: string) => {
      const listNode = bookmarkListNodesRef.current[collectionId];
      if (!listNode) return [];

      return measureBookmarkDropSlots(listNode);
    },
    [bookmarkListNodesRef],
  );

  const resolveCollectionDropPreview = useCallback(
    (pointer: { x: number; y: number } | null) =>
      getCollectionDropPreviewFromPointer({
        orderedIdsByCollection: orderedBookmarkIds,
        pointer,
        rects: measureCollectionRects(),
        slotsByCollection: measureSlotsForCollection,
      }),
    [measureCollectionRects, measureSlotsForCollection, orderedBookmarkIds],
  );

  const updateTabDropPreview = useCallback(
    (pointer: { x: number; y: number } | null) => {
      const nextPreview = resolveCollectionDropPreview(pointer);
      setTabDropPreview(previous => (isSameDropPreview(previous, nextPreview) ? previous : nextPreview));
    },
    [resolveCollectionDropPreview],
  );

  const resetNativeDragState = useCallback(() => {
    resetCollectionDragState();
    setTabDropPreview(null);
    setDropWorkspaceId(null);
    setDragKind(null);
  }, [resetCollectionDragState]);

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
      await removeBookmarkTreeAfterUserConsent(deleteTarget.id);
      setToast('워크스페이스를 삭제했습니다.');
    } else if (deleteTarget.kind === 'collection') {
      await removeBookmarkTreeAfterUserConsent(deleteTarget.id);
      setToast('컬렉션을 삭제했습니다.');
    } else {
      await removeBookmarkAfterUserConsent(deleteTarget.id);
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

  const scheduleWorkspaceFlyoutOpen = (ws: BookmarkNode, anchorEl: HTMLElement) => {
    if (activeWorkspaceDragId) return;
    clearWorkspaceFlyoutTimers();
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
    clearWorkspaceFlyoutTimers();
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
    await updateBookmarkNodeFromUserAction(editingWorkspaceId, { title: nextName });
    await refresh();
    cancelWorkspaceEdit();
    setToast('워크스페이스 이름을 변경했습니다.');
  };

  const onDragCollectionStart = (e: ReactDragEvent<HTMLElement>, collection: CollectionSummary) => {
    setDragKind('collection');
    handleCollectionDragStart(e, collection);
  };

  const onDropCollectionToWorkspace = async (e: ReactDragEvent<HTMLElement>, targetWorkspace: BookmarkNode) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragKind !== 'collection') return;

    try {
      setDropWorkspaceId(null);
      clearCollectionDragPreview();

      const raw = e.dataTransfer.getData(DND_COLLECTION_MIME);
      if (!raw) return;

      const payload = parseCollectionWorkspaceDragPayload(raw);
      if (!payload || payload.workspaceId === targetWorkspace.id) return;

      await moveBookmarkNodeFromUserAction(payload.collectionId, { parentId: targetWorkspace.id });
      setToast(
        `${
          payload.title ? `'${payload.title}' 컬렉션을` : '컬렉션을'
        } '${targetWorkspace.title || '워크스페이스'}'로 이동했습니다.`,
      );
      await refresh();
    } finally {
      resetNativeDragState();
    }
  };

  const handleCollectionsBoardCollectionDragOver = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      if (dragKind !== 'collection') return;

      setDropWorkspaceId(null);
      handleCollectionBoardDragOver(event);
    },
    [dragKind, handleCollectionBoardDragOver],
  );

  const handleCollectionsBoardCollectionDragLeave = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      if (dragKind !== 'collection') return;

      handleCollectionBoardDragLeave(event);
    },
    [dragKind, handleCollectionBoardDragLeave],
  );

  const onDropCollectionToBoard = useCallback(
    async (event: ReactDragEvent<HTMLElement>) => {
      if (dragKind !== 'collection') return;

      try {
        setDropWorkspaceId(null);
        await handleCollectionBoardDrop(event);
      } finally {
        resetNativeDragState();
      }
    },
    [dragKind, handleCollectionBoardDrop, resetNativeDragState],
  );

  const handleCollectionsBoardTabDragOver = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      if (dragKind !== 'tab') return;

      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      updateTabDropPreview({
        x: event.clientX,
        y: event.clientY,
      });
    },
    [dragKind, updateTabDropPreview],
  );

  const handleCollectionsBoardTabDragLeave = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      if (dragKind !== 'tab') return;

      const rect = event.currentTarget.getBoundingClientRect();
      const isInsideBoard =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (!isInsideBoard) {
        setTabDropPreview(null);
      }
    },
    [dragKind],
  );

  const onDropTabToCollection = async (e: ReactDragEvent<HTMLElement>) => {
    if (dragKind !== 'tab') return;

    e.preventDefault();
    e.stopPropagation();

    const raw = e.dataTransfer.getData(DND_TAB_MIME);
    const payload = parseTabCollectionDragPayload(raw);
    const preview =
      tabDropPreview ||
      resolveCollectionDropPreview({
        x: e.clientX,
        y: e.clientY,
      });

    resetNativeDragState();

    if (!payload?.url) return;
    if (!preview) return;

    const droppedTabPayload = {
      ...payload,
      url: payload.url,
    };

    await saveDroppedTabBookmark({
      createBookmark: input => chrome.bookmarks.create(input),
      payload: droppedTabPayload,
      preview,
      refresh,
      rememberFavicon,
      setToast,
    });
  };

  const handleWorkspaceSelect = useCallback(
    (nextWorkspaceId: string) => {
      setWorkspaceFlyout(null);
      clearWorkspaceFlyoutTimers();
      setWorkspaceId(nextWorkspaceId);
    },
    [clearWorkspaceFlyoutTimers, setWorkspaceId],
  );

  const handleBeginTabDrag = useCallback(() => {
    setDragKind('tab');
  }, []);

  const {
    bookmarkHits,
    commandOpen,
    commandQuery,
    filteredCollections,
    filteredQuickActions,
    filteredWorkspaces,
    handleBookmarkCommandSelect,
    handleCollectionCommandSelect,
    handleCommandOpenChange,
    handleWorkspaceCommandSelect,
    hasCommandResults,
    openCommand,
    setCommandQuery,
  } = useCommandPalette({
    collections,
    onOpenBookmark: openLink,
    onOpenCollection: openCollection,
    onOpenCollectionInlineInput: openCollectionInlineInput,
    onOpenWorkspaceInlineInput: openWorkspaceInlineInput,
    onSaveWindow: saveWindow,
    onSelectWorkspace: setWorkspaceId,
    workspaces,
  });

  const bookmarkDndProps = {
    activeBookmarkDragCollectionId,
    activeBookmarkOverlay,
    bookmarkCollectionNodesRef,
    bookmarkListNodesRef,
    bookmarkDropPreview,
    bookmarkOverlayModifier,
    orderedBookmarksByCollection,
    handleBookmarkDragCancel,
    handleBookmarkDragEnd,
    handleBookmarkDragMove,
    handleBookmarkDragStart,
    handleBookmarkPointerDownCapture,
    orderedBookmarkIds,
    sensors,
  };

  const collectionDndProps = {
    activeCollectionDragId,
    collectionBoardNodeRef,
    collectionDropPreview,
    orderedCollections,
  };

  const workspaceDndProps = {
    activeWorkspaceDragId,
    handleWorkspaceDragCancel,
    handleWorkspaceDragEnd,
    handleWorkspaceDragMove,
    handleWorkspaceDragStart,
    handleWorkspacePointerDownCapture,
    sensors: workspaceSensors,
    workspaceDropPreview,
    workspaceOverlayModifier,
    workspaceListNodeRef,
    workspaceOrderIds,
    workspaceReorderBusy,
  };

  const bookmarkEditingProps = {
    editingBookmark,
    editingBookmarkBusy,
    editingTitle,
    editingTitleRef,
    editingUrl,
    editingUrlRef,
    onCancelBookmarkEdit: cancelBookmarkEdit,
    onSaveBookmarkEdit: saveBookmarkEdit,
    onSetEditingTitle: setEditingTitle,
    onSetEditingUrl: setEditingUrl,
    onStartBookmarkEdit: startBookmarkEdit,
  };

  const bookmarkInlineAddProps = {
    addBookmarkMorphState,
    addingBookmarkBusy,
    addingBookmarkFormRef,
    addingBookmarkInvalid,
    addingBookmarkTitle,
    addingBookmarkTitleRef,
    addingBookmarkUrl,
    addingBookmarkUrlRef,
    onCloseBookmarkInlineInput: closeBookmarkInlineInput,
    onOpenBookmarkInlineInput: openBookmarkInlineInput,
    onSubmitBookmarkInlineInput: submitBookmarkInlineInput,
    onUpdateAddBookmarkDraft: updateAddBookmarkDraft,
    recentlyCreatedBookmark,
  };

  const collectionInlineProps = {
    collectionInlineBusy,
    collectionInlineHideDuringExit,
    collectionInlineName,
    collectionInlineOpen,
    collectionInlineRef,
    onCloseCollectionInlineInput: closeCollectionInlineInput,
    onOpenCollectionInlineInput: openCollectionInlineInput,
    onSetCollectionInlineName: setCollectionInlineName,
    onSubmitCollectionInlineInput: submitCollectionInlineInput,
  };

  return (
    <div className="nt-root">
      <NewTabHeader
        leftCollapsed={leftCollapsed}
        rightCollapsed={rightCollapsed}
        onAddCollection={openCollectionInlineInput}
        onOpenCommand={openCommand}
        onToggleLeft={() => setLeftCollapsed(value => !value)}
        onToggleRight={() => setRightCollapsed(value => !value)}
      />

      <main className={`layout ${leftCollapsed ? 'left-collapsed' : ''} ${rightCollapsed ? 'right-collapsed' : ''}`}>
        <WorkspaceSidebar
          dragKind={dragKind}
          dropWorkspaceId={dropWorkspaceId}
          editingWorkspaceBusy={editingWorkspaceBusy}
          editingWorkspaceId={editingWorkspaceId}
          editingWorkspaceName={editingWorkspaceName}
          editingWorkspaceRef={editingWorkspaceRef}
          onCancelWorkspaceEdit={cancelWorkspaceEdit}
          onCloseWorkspaceInlineInput={closeWorkspaceInlineInput}
          onDropWorkspaceHighlight={workspaceId => {
            if (workspaceId) {
              clearCollectionDragPreview();
            }
            setDropWorkspaceId(workspaceId);
          }}
          onEditingWorkspaceNameChange={setEditingWorkspaceName}
          onOpenWorkspaceInlineInput={openWorkspaceInlineInput}
          onRequestDeleteWorkspace={workspace =>
            setDeleteTarget({
              kind: 'workspace',
              id: workspace.id,
              title: workspace.title || 'Untitled',
            })
          }
          onSaveWorkspaceEdit={saveWorkspaceEdit}
          onSelectWorkspace={handleWorkspaceSelect}
          onStartWorkspaceEdit={startWorkspaceEdit}
          onWorkspaceDrop={(event, workspace) => onDropCollectionToWorkspace(event, workspace)}
          onWorkspaceHoverEnter={scheduleWorkspaceFlyoutOpen}
          onWorkspaceHoverLeave={scheduleWorkspaceFlyoutClose}
          onWorkspaceInlineNameChange={setWorkspaceInlineName}
          onSubmitWorkspaceInlineInput={submitWorkspaceInlineInput}
          orderedWorkspaces={orderedWorkspaces}
          selectedWorkspaceId={workspaceId}
          workspaceDnd={workspaceDndProps}
          workspaceInlineBusy={workspaceInlineBusy}
          workspaceInlineName={workspaceInlineName}
          workspaceInlineOpen={workspaceInlineOpen}
          workspaceInlineRef={workspaceInlineRef}
        />

        <CollectionsBoard
          activeContext={activeContext}
          bookmarkDnd={bookmarkDndProps}
          bookmarkEditing={bookmarkEditingProps}
          bookmarkInlineAdd={bookmarkInlineAddProps}
          collectionDnd={collectionDndProps}
          collectionInline={collectionInlineProps}
          dragKind={dragKind}
          onCollectionBoardDragLeave={handleCollectionsBoardCollectionDragLeave}
          onCollectionBoardDragOver={handleCollectionsBoardCollectionDragOver}
          onCollectionDragEnd={resetNativeDragState}
          onCollectionDragStart={onDragCollectionStart}
          onDropCollectionToBoard={onDropCollectionToBoard}
          onDropTabToCollection={onDropTabToCollection}
          onFaviconError={onFaviconError}
          onGetFaviconSrc={getFaviconSrc}
          onOpenCollection={openCollection}
          onOpenLink={openLink}
          onCopyLink={copyLink}
          onOpenWorkspaceInlineInput={openWorkspaceInlineInput}
          onRequestDeleteBookmark={bookmark =>
            setDeleteTarget({
              kind: 'bookmark',
              id: bookmark.id,
              title: bookmark.title || bookmark.url || 'Untitled',
              url: bookmark.url,
            })
          }
          onRequestDeleteCollection={collection =>
            setDeleteTarget({
              kind: 'collection',
              id: collection.id,
              title: collection.title,
            })
          }
          onTabDragLeave={handleCollectionsBoardTabDragLeave}
          onTabDragOver={handleCollectionsBoardTabDragOver}
          selectedWorkspace={selectedWorkspace}
          setActiveContext={setActiveContext}
          shouldReduceMotion={shouldReduceMotion ?? false}
          suppressCollectionTransitions={suppressCollectionTransitions}
          tabDropPreview={tabDropPreview}
          tree={tree}
          workspaces={workspaces}
        />

        <OpenTabsPanel
          tabs={tabs}
          onBeginTabDrag={handleBeginTabDrag}
          onEndTabDrag={resetNativeDragState}
          onFocusTab={focusTab}
        />
      </main>

      {!!toast && <div className="toast">{toast}</div>}

      <WorkspaceFlyoutPortal
        closeFlyoutTimerRef={closeFlyoutTimerRef}
        onMouseLeave={scheduleWorkspaceFlyoutClose}
        workspaceFlyout={workspaceFlyout}
      />

      <DeleteConfirmDialog
        deleteBusy={deleteBusy}
        deleteTarget={deleteTarget}
        onConfirm={() => void confirmDelete()}
        onOpenChange={open => !open && setDeleteTarget(null)}
      />

      <NewTabCommandDialog
        bookmarkHits={bookmarkHits}
        fallbackFavicon={getFallbackFavicon()}
        filteredCollections={filteredCollections}
        filteredQuickActions={filteredQuickActions}
        filteredWorkspaces={filteredWorkspaces}
        getFaviconSrcByKey={getFaviconSrcByKey}
        hasCommandResults={hasCommandResults}
        onBookmarkSelect={handleBookmarkCommandSelect}
        onCollectionSelect={handleCollectionCommandSelect}
        onFaviconErrorByKey={onFaviconErrorByKey}
        onOpenChange={handleCommandOpenChange}
        onQueryChange={setCommandQuery}
        onWorkspaceSelect={handleWorkspaceCommandSelect}
        open={commandOpen}
        query={commandQuery}
        workspaceId={workspaceId}
      />
    </div>
  );
};

export default NewTab;
