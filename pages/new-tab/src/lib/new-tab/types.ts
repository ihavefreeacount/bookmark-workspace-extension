import type { CollectionDropPreview, PointerCoordinates, VerticalListDropPreview } from '@src/lib/dnd/sortable-helpers';

export type BookmarkNode = chrome.bookmarks.BookmarkTreeNode;

export type CollectionSummary = {
  workspaceId: string;
  workspace: string;
  id: string;
  title: string;
  links: BookmarkNode[];
};

export type DeleteTarget =
  | { kind: 'workspace'; id: string; title: string }
  | { kind: 'collection'; id: string; title: string }
  | { kind: 'bookmark'; id: string; title: string; url?: string };

export type ActiveContext = { kind: 'collection'; id: string } | { kind: 'bookmark'; id: string } | null;

export type EditingBookmark = {
  id: string;
  parentId: string;
  index: number;
  originalTitle: string;
  originalUrl: string;
};

export type WorkspaceFlyout = {
  workspaceId: string;
  title: string;
  collections: string[];
  x: number;
  y: number;
};

export type AddBookmarkMorphPhase = 'editing' | 'committing';

export type AddBookmarkMorphState = {
  collectionId: string;
  draftTitle: string;
  draftUrl: string;
  phase: AddBookmarkMorphPhase;
};

export type RecentlyCreatedBookmark = {
  collectionId: string;
  bookmarkId: string;
} | null;

export type BookmarkDragData = {
  kind: 'bookmark';
  bookmarkId: string;
  collectionId: string;
};

export type BookmarkDropPreview = CollectionDropPreview;
export type WorkspaceDropPreview = VerticalListDropPreview;

export type WorkspaceDragData = {
  kind: 'workspace';
  workspaceId: string;
};

export type BookmarkDragOverlayData = {
  title: string;
  domain: string;
};

export type BookmarkPointerDownOrigin = {
  bookmarkId: string;
  collectionId: string;
  pointer: PointerCoordinates;
};

export type WorkspacePointerDownOrigin = {
  workspaceId: string;
  pointer: PointerCoordinates;
};

export type QuickActionItem = {
  key: string;
  label: string;
  onSelect: () => void;
};
