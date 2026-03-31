import { isFolder, LS_SELECTED_SPACE, getPersisted, loadTree } from '@src/lib/new-tab/helpers';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CollectionSummary, BookmarkNode } from '@src/lib/new-tab/types';
import type { RefObject } from 'react';

type UseNewTabDataOptions = {
  suppressBookmarkRefreshRef: RefObject<boolean>;
};

const useNewTabData = ({ suppressBookmarkRefreshRef }: UseNewTabDataOptions) => {
  const [tree, setTree] = useState<BookmarkNode | null>(null);
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]);
  const [workspaceId, setWorkspaceId] = useState<string>(() => getPersisted(LS_SELECTED_SPACE));

  const refresh = useCallback(async () => {
    const next = await loadTree();
    setTree(next);
    setWorkspaceId(previousWorkspaceId => {
      const exists = !!next.children?.some(child => child.id === previousWorkspaceId);
      return exists ? previousWorkspaceId : next.children?.[0]?.id || '';
    });
  }, []);

  const refreshTabs = useCallback(async () => {
    const list = await chrome.tabs.query({ currentWindow: true });
    setTabs(list.filter(tab => tab.url && /^https?:\/\//.test(tab.url)));
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
  }, [refresh, refreshTabs, suppressBookmarkRefreshRef]);

  useEffect(() => {
    window.localStorage.setItem(LS_SELECTED_SPACE, workspaceId);
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [workspaceId]);

  const workspaces = useMemo(() => (tree?.children || []).filter(isFolder), [tree]);
  const selectedWorkspace = useMemo(
    () => workspaces.find(workspace => workspace.id === workspaceId),
    [workspaces, workspaceId],
  );

  const collections = useMemo(() => {
    const result: CollectionSummary[] = [];
    const sourceWorkspaces = selectedWorkspace ? [selectedWorkspace] : workspaces;

    for (const workspace of sourceWorkspaces) {
      for (const collection of workspace.children || []) {
        if (!isFolder(collection)) continue;
        result.push({
          workspaceId: workspace.id,
          workspace: workspace.title || '',
          id: collection.id,
          title: collection.title || 'Untitled',
          links: (collection.children || []).filter(node => !!node.url),
        });
      }
    }

    return result;
  }, [selectedWorkspace, workspaces]);

  return {
    collections,
    refresh,
    selectedWorkspace,
    setWorkspaceId,
    tabs,
    tree,
    workspaceId,
    workspaces,
  };
};

export { useNewTabData };
