import { buildBookmarkSearchRecords, createBookmarkSearchIndex, searchBookmarks } from '@src/lib/search/engine';
import { includesNormalizedQuery } from '@src/lib/search/normalize';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CollectionSummary, BookmarkNode, QuickActionItem } from '@src/lib/new-tab/types';

type UseCommandPaletteOptions = {
  collections: CollectionSummary[];
  onOpenBookmark: (url?: string) => Promise<void> | void;
  onOpenCollection: (collectionId: string, mode: 'group' | 'new-window') => Promise<void> | void;
  onOpenCollectionInlineInput: () => void;
  onOpenWorkspaceInlineInput: () => void;
  onSaveWindow: () => Promise<void> | void;
  onSelectWorkspace: (workspaceId: string) => void;
  workspaces: BookmarkNode[];
};

type CommandActionSpec = QuickActionItem & {
  searchText: string;
};

const useCommandPalette = ({
  collections,
  onOpenBookmark,
  onOpenCollection,
  onOpenCollectionInlineInput,
  onOpenWorkspaceInlineInput,
  onSaveWindow,
  onSelectWorkspace,
  workspaces,
}: UseCommandPaletteOptions) => {
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const bookmarkSearchRecords = useMemo(() => buildBookmarkSearchRecords(workspaces), [workspaces]);
  const bookmarkSearchIndex = useMemo(() => createBookmarkSearchIndex(bookmarkSearchRecords), [bookmarkSearchRecords]);
  const bookmarkHits = useMemo(
    () => searchBookmarks(bookmarkSearchIndex, commandQuery),
    [bookmarkSearchIndex, commandQuery],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(previous => !previous);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const closeCommand = useCallback(() => {
    setCommandOpen(false);
    setCommandQuery('');
  }, []);

  const runCommand = useCallback(
    (fn: () => Promise<void> | void) => {
      closeCommand();
      Promise.resolve(fn()).catch(console.error);
    },
    [closeCommand],
  );

  const handleCommandOpenChange = (open: boolean) => {
    setCommandOpen(open);
    if (!open) {
      setCommandQuery('');
    }
  };

  const handleWorkspaceCommandSelect = (workspaceId: string) => {
    runCommand(() => {
      onSelectWorkspace(workspaceId);
    });
  };

  const handleCollectionCommandSelect = (collectionId: string, mode: 'group' | 'new-window') => {
    runCommand(() => onOpenCollection(collectionId, mode));
  };

  const handleBookmarkCommandSelect = (url?: string) => {
    runCommand(() => onOpenBookmark(url));
  };

  const filteredQuickActions = useMemo(
    () =>
      [
        {
          key: 'create-collection',
          label: '컬렉션 만들기',
          searchText: 'collection create add 컬렉션 만들기 추가',
          onSelect: () => runCommand(() => onOpenCollectionInlineInput()),
        },
        {
          key: 'create-workspace',
          label: '워크스페이스 만들기',
          searchText: 'workspace create add 워크스페이스 만들기 추가',
          onSelect: () => runCommand(() => onOpenWorkspaceInlineInput()),
        },
        {
          key: 'save-window',
          label: '현재 창을 컬렉션으로 저장',
          searchText: 'save window collection 현재 창 컬렉션 저장',
          onSelect: () => runCommand(() => onSaveWindow()),
        },
      ].filter(action => includesNormalizedQuery(commandQuery, action.label, action.searchText)),
    [commandQuery, onOpenCollectionInlineInput, onOpenWorkspaceInlineInput, onSaveWindow, runCommand],
  ) as CommandActionSpec[];

  const filteredWorkspaces = useMemo(
    () => workspaces.filter(workspace => includesNormalizedQuery(commandQuery, workspace.title || '')),
    [commandQuery, workspaces],
  );

  const filteredCollections = useMemo(
    () =>
      collections.filter(collection =>
        includesNormalizedQuery(
          commandQuery,
          collection.workspace,
          collection.title,
          ...collection.links.map(link => link.title || link.url || ''),
        ),
      ),
    [collections, commandQuery],
  );

  const hasCommandResults =
    filteredQuickActions.length > 0 ||
    filteredWorkspaces.length > 0 ||
    filteredCollections.length > 0 ||
    bookmarkHits.length > 0;

  return {
    bookmarkHits,
    commandOpen,
    commandQuery,
    filteredCollections,
    filteredQuickActions: filteredQuickActions as QuickActionItem[],
    filteredWorkspaces,
    handleBookmarkCommandSelect,
    handleCollectionCommandSelect,
    handleCommandOpenChange,
    handleWorkspaceCommandSelect,
    hasCommandResults,
    openCommand: () => setCommandOpen(true),
    setCommandQuery,
  };
};

export { useCommandPalette };
