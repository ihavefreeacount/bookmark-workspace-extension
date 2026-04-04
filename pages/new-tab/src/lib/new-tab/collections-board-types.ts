import type {
  DragEndEvent,
  DragMoveEvent,
  DragStartEvent,
  Modifier,
  SensorDescriptor,
  SensorOptions,
} from '@dnd-kit/core';
import type { OrderedIdsByCollection } from '@src/lib/dnd/sortable-helpers';
import type {
  ActiveContext,
  AddBookmarkMorphState,
  BookmarkDragData,
  BookmarkDragOverlayData,
  BookmarkDropPreview,
  BookmarkNode,
  CollectionSummary,
  EditingBookmark,
  RecentlyCreatedBookmark,
} from '@src/lib/new-tab/types';
import type {
  Dispatch,
  DragEvent as ReactDragEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
  SetStateAction,
} from 'react';

type BookmarkDndController = {
  activeBookmarkDragCollectionId: string | null;
  activeBookmarkOverlay: BookmarkDragOverlayData | null;
  bookmarkCollectionNodesRef: RefObject<Record<string, HTMLElement>>;
  bookmarkListNodesRef: RefObject<Record<string, HTMLUListElement>>;
  bookmarkDropPreview: BookmarkDropPreview | null;
  bookmarkOverlayModifier: Modifier;
  orderedBookmarksByCollection: Record<string, BookmarkNode[]>;
  handleBookmarkDragCancel: () => void;
  handleBookmarkDragEnd: (event: DragEndEvent) => Promise<void> | void;
  handleBookmarkDragMove: (event: DragMoveEvent) => void;
  handleBookmarkDragStart: (event: DragStartEvent) => void;
  handleBookmarkPointerDownCapture: (data: BookmarkDragData, event: ReactPointerEvent<HTMLLIElement>) => void;
  orderedBookmarkIds: OrderedIdsByCollection;
  sensors: SensorDescriptor<SensorOptions>[];
};

type BookmarkEditingController = {
  editingBookmark: EditingBookmark | null;
  editingBookmarkBusy: boolean;
  editingTitle: string;
  editingTitleRef: RefObject<HTMLInputElement | null>;
  editingUrl: string;
  editingUrlRef: RefObject<HTMLInputElement | null>;
  onCancelBookmarkEdit: () => void;
  onSaveBookmarkEdit: () => Promise<void> | void;
  onSetEditingTitle: (value: string) => void;
  onSetEditingUrl: (value: string) => void;
  onStartBookmarkEdit: (bookmark: BookmarkNode, parentId: string, index: number) => void;
};

type BookmarkInlineAddController = {
  addBookmarkMorphState: AddBookmarkMorphState | null;
  addingBookmarkBusy: boolean;
  addingBookmarkFormRef: RefObject<HTMLDivElement | null>;
  addingBookmarkInvalid: boolean;
  addingBookmarkTitle: string;
  addingBookmarkTitleRef: RefObject<HTMLInputElement | null>;
  addingBookmarkUrl: string;
  addingBookmarkUrlRef: RefObject<HTMLInputElement | null>;
  onCloseBookmarkInlineInput: () => void;
  onOpenBookmarkInlineInput: (collectionId: string) => void;
  onSubmitBookmarkInlineInput: () => Promise<void> | void;
  onUpdateAddBookmarkDraft: (patch: Partial<Pick<AddBookmarkMorphState, 'draftTitle' | 'draftUrl'>>) => void;
  recentlyCreatedBookmark: RecentlyCreatedBookmark;
};

type CollectionInlineController = {
  collectionInlineBusy: boolean;
  collectionInlineHideDuringExit: boolean;
  collectionInlineName: string;
  collectionInlineOpen: boolean;
  collectionInlineRef: RefObject<HTMLInputElement | null>;
  onCloseCollectionInlineInput: (options?: { hideDuringExit?: boolean }) => void;
  onOpenCollectionInlineInput: () => void;
  onSetCollectionInlineName: (value: string) => void;
  onSubmitCollectionInlineInput: () => Promise<void> | void;
};

type CollectionsBoardProps = {
  activeContext: ActiveContext;
  bookmarkDnd: BookmarkDndController;
  bookmarkEditing: BookmarkEditingController;
  bookmarkInlineAdd: BookmarkInlineAddController;
  collectionInline: CollectionInlineController;
  collections: CollectionSummary[];
  dragKind: 'tab' | 'collection' | null;
  onCollectionDragEnd: () => void;
  onCollectionDragStart: (event: ReactDragEvent<HTMLElement>, collection: CollectionSummary) => void;
  onDropTabToCollection: (event: ReactDragEvent<HTMLElement>) => Promise<void> | void;
  onFaviconError: (bookmark: BookmarkNode) => void;
  onGetFaviconSrc: (bookmark: BookmarkNode) => string;
  onOpenCollection: (collectionId: string, mode: 'group' | 'new-window') => Promise<void> | void;
  onOpenLink: (url?: string) => Promise<void> | void;
  onCopyLink: (url?: string) => Promise<void> | void;
  onOpenWorkspaceInlineInput: () => void;
  onRequestDeleteCollection: (collection: CollectionSummary) => void;
  onRequestDeleteBookmark: (bookmark: BookmarkNode) => void;
  onTabDragLeave: (event: ReactDragEvent<HTMLElement>) => void;
  onTabDragOver: (event: ReactDragEvent<HTMLElement>) => void;
  selectedWorkspace: BookmarkNode | undefined;
  setActiveContext: Dispatch<SetStateAction<ActiveContext>>;
  shouldReduceMotion: boolean;
  suppressCollectionTransitions: boolean;
  tabDropPreview: BookmarkDropPreview | null;
  tree: BookmarkNode | null;
  workspaces: BookmarkNode[];
};

export type {
  BookmarkDndController,
  BookmarkEditingController,
  BookmarkInlineAddController,
  CollectionInlineController,
  CollectionsBoardProps,
};
