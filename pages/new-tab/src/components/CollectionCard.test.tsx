// @vitest-environment jsdom

import { CollectionCard } from './CollectionCard';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  BookmarkDndController,
  BookmarkEditingController,
  BookmarkInlineAddController,
  CollectionDndController,
} from '@src/lib/new-tab/collections-board-types';
import type { CollectionSummary } from '@src/lib/new-tab/types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const collection: CollectionSummary = {
  id: 'collection-1',
  links: [],
  title: '읽을거리',
  workspace: 'Workspace',
  workspaceId: 'workspace-1',
};

const collectionWithBookmark: CollectionSummary = {
  ...collection,
  links: [{ id: 'bookmark-1', title: 'Alpha', url: 'https://alpha.test' } as chrome.bookmarks.BookmarkTreeNode],
};

const createBookmarkDnd = (): BookmarkDndController => ({
  activeBookmarkDragId: null,
  activeBookmarkDragCollectionId: null,
  activeBookmarkOverlay: null,
  bookmarkCollectionNodesRef: { current: {} },
  bookmarkDropPreview: null,
  bookmarkListNodesRef: { current: {} },
  bookmarkOverlayModifier: args => args.transform,
  handleBookmarkDragCancel: vi.fn(),
  handleBookmarkDragEnd: vi.fn(),
  handleBookmarkDragMove: vi.fn(),
  handleBookmarkDragStart: vi.fn(),
  handleBookmarkPointerDownCapture: vi.fn(),
  orderedBookmarkIds: {},
  orderedBookmarksByCollection: {},
  sensors: [],
});

const bookmarkEditing: BookmarkEditingController = {
  editingBookmark: null,
  editingBookmarkBusy: false,
  editingTitle: '',
  editingTitleRef: { current: null },
  editingUrl: '',
  editingUrlRef: { current: null },
  onCancelBookmarkEdit: vi.fn(),
  onSaveBookmarkEdit: vi.fn(),
  onSetEditingTitle: vi.fn(),
  onSetEditingUrl: vi.fn(),
  onStartBookmarkEdit: vi.fn(),
};

const bookmarkInlineAdd: BookmarkInlineAddController = {
  addBookmarkMorphState: null,
  addingBookmarkBusy: false,
  addingBookmarkFormRef: { current: null },
  addingBookmarkInvalid: false,
  addingBookmarkTitle: '',
  addingBookmarkTitleRef: { current: null },
  addingBookmarkUrl: '',
  addingBookmarkUrlRef: { current: null },
  onCloseBookmarkInlineInput: vi.fn(),
  onOpenBookmarkInlineInput: vi.fn(),
  onSubmitBookmarkInlineInput: vi.fn(),
  onUpdateAddBookmarkDraft: vi.fn(),
  recentlyCreatedBookmark: null,
};

const createCollectionDnd = (): CollectionDndController => ({
  activeCollectionDragId: null,
  collectionBoardNodeRef: { current: null },
  collectionDropPreview: null,
  orderedCollections: [collection],
});

describe('CollectionCard', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('does not intercept collection drops meant for board reorder', async () => {
    const onDropTabToCollection = vi.fn();

    await act(async () => {
      root.render(
        <CollectionCard
          activeContext={null}
          bookmarkDnd={createBookmarkDnd()}
          bookmarkEditing={bookmarkEditing}
          bookmarkInlineAdd={bookmarkInlineAdd}
          collection={collection}
          collectionDnd={createCollectionDnd()}
          dragKind="collection"
          onCollectionDragEnd={vi.fn()}
          onCollectionDragStart={vi.fn()}
          onCopyLink={vi.fn()}
          onDropTabToCollection={onDropTabToCollection}
          onFaviconError={vi.fn()}
          onGetFaviconSrc={vi.fn().mockReturnValue('')}
          onOpenCollection={vi.fn()}
          onOpenLink={vi.fn()}
          onRequestDeleteBookmark={vi.fn()}
          onRequestDeleteCollection={vi.fn()}
          setActiveContext={vi.fn()}
          shouldReduceMotion
          suppressTransitions
          tabDropPreview={null}
        />,
      );
    });

    const card = container.querySelector('[data-collection-card-id="collection-1"]');
    if (!card) throw new Error('Expected collection card to render');

    await act(async () => {
      card.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    });

    expect(onDropTabToCollection).not.toHaveBeenCalled();
  });

  it('still forwards tab drops to the bookmark drop handler', async () => {
    const onDropTabToCollection = vi.fn();

    await act(async () => {
      root.render(
        <CollectionCard
          activeContext={null}
          bookmarkDnd={createBookmarkDnd()}
          bookmarkEditing={bookmarkEditing}
          bookmarkInlineAdd={bookmarkInlineAdd}
          collection={collection}
          collectionDnd={createCollectionDnd()}
          dragKind="tab"
          onCollectionDragEnd={vi.fn()}
          onCollectionDragStart={vi.fn()}
          onCopyLink={vi.fn()}
          onDropTabToCollection={onDropTabToCollection}
          onFaviconError={vi.fn()}
          onGetFaviconSrc={vi.fn().mockReturnValue('')}
          onOpenCollection={vi.fn()}
          onOpenLink={vi.fn()}
          onRequestDeleteBookmark={vi.fn()}
          onRequestDeleteCollection={vi.fn()}
          setActiveContext={vi.fn()}
          shouldReduceMotion
          suppressTransitions
          tabDropPreview={null}
        />,
      );
    });

    const card = container.querySelector('[data-collection-card-id="collection-1"]');
    if (!card) throw new Error('Expected collection card to render');

    await act(async () => {
      card.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }));
    });

    expect(onDropTabToCollection).toHaveBeenCalledTimes(1);
  });

  it('does not start collection drag when the pointer down began inside the bookmark area', async () => {
    const onCollectionDragStart = vi.fn();

    await act(async () => {
      root.render(
        <CollectionCard
          activeContext={null}
          bookmarkDnd={createBookmarkDnd()}
          bookmarkEditing={bookmarkEditing}
          bookmarkInlineAdd={bookmarkInlineAdd}
          collection={collectionWithBookmark}
          collectionDnd={createCollectionDnd()}
          dragKind={null}
          onCollectionDragEnd={vi.fn()}
          onCollectionDragStart={onCollectionDragStart}
          onCopyLink={vi.fn()}
          onDropTabToCollection={vi.fn()}
          onFaviconError={vi.fn()}
          onGetFaviconSrc={vi.fn().mockReturnValue('')}
          onOpenCollection={vi.fn()}
          onOpenLink={vi.fn()}
          onRequestDeleteBookmark={vi.fn()}
          onRequestDeleteCollection={vi.fn()}
          setActiveContext={vi.fn()}
          shouldReduceMotion
          suppressTransitions
          tabDropPreview={null}
        />,
      );
    });

    const bookmarkRow = container.querySelector('.link-row');
    const card = container.querySelector('[data-collection-card-id="collection-1"]');

    if (!bookmarkRow || !card) throw new Error('Expected bookmark row and collection card to render');

    await act(async () => {
      bookmarkRow.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
        }),
      );
      card.dispatchEvent(new Event('dragstart', { bubbles: true, cancelable: true }));
    });

    expect(onCollectionDragStart).not.toHaveBeenCalled();
  });
});
