// @vitest-environment jsdom

import { useCollectionDnd } from './use-collection-dnd';
import { moveBookmarkNodeFromUserAction } from '@src/lib/bookmark-user-actions';
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookmarkNode, CollectionSummary } from '@src/lib/new-tab/types';
import type { DragEvent as ReactDragEvent } from 'react';

vi.mock('@src/lib/bookmark-user-actions', () => ({
  moveBookmarkNodeFromUserAction: vi.fn(),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const originalScrollingElementDescriptor = Object.getOwnPropertyDescriptor(document, 'scrollingElement');
const originalInnerHeightDescriptor = Object.getOwnPropertyDescriptor(window, 'innerHeight');

type HookValue = ReturnType<typeof useCollectionDnd>;

type HarnessProps = {
  collections: CollectionSummary[];
  onValue: (value: HookValue) => void;
  refresh: () => Promise<void>;
  selectedWorkspaceChildren: BookmarkNode[];
  selectedWorkspaceId: string;
  setToast: (message: string) => void;
  suppressBookmarkRefreshRef: { current: boolean };
};

type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const collectionsFixture: CollectionSummary[] = [
  {
    id: 'alpha',
    links: [],
    title: 'Alpha',
    workspace: 'Workspace',
    workspaceId: 'workspace-1',
  },
  {
    id: 'beta',
    links: [],
    title: 'Beta',
    workspace: 'Workspace',
    workspaceId: 'workspace-1',
  },
  {
    id: 'gamma',
    links: [],
    title: 'Gamma',
    workspace: 'Workspace',
    workspaceId: 'workspace-1',
  },
];

const workspaceChildrenFixture = collectionsFixture.map(
  collection =>
    ({
      id: collection.id,
      title: collection.title,
    }) as BookmarkNode,
);

const Harness = ({
  collections,
  onValue,
  refresh,
  selectedWorkspaceChildren,
  selectedWorkspaceId,
  setToast,
  suppressBookmarkRefreshRef,
}: HarnessProps) => {
  const value = useCollectionDnd({
    collections,
    refresh,
    selectedWorkspaceChildren,
    selectedWorkspaceId,
    setToast,
    suppressBookmarkRefreshRef,
  });

  useEffect(() => {
    onValue(value);
  }, [onValue, value]);

  return null;
};

const toDomRect = ({ left, top, width, height }: Rect) =>
  ({
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  }) as DOMRect;

const setNodeRect = (node: Element, getRect: () => Rect) => {
  Object.defineProperty(node, 'getBoundingClientRect', {
    configurable: true,
    value: () => toDomRect(getRect()),
  });
};

const createCollectionBoardNode = ({
  getBoardRect,
  items,
}: {
  getBoardRect: () => Rect;
  items: Array<{ getRect: () => Rect; id: string }>;
}) => {
  const node = document.createElement('div');
  setNodeRect(node, getBoardRect);

  for (const item of items) {
    const itemNode = document.createElement('article');
    itemNode.setAttribute('data-collection-card-id', item.id);
    setNodeRect(itemNode, item.getRect);
    node.appendChild(itemNode);
  }

  return node;
};

const createDataTransfer = () => {
  const store = new Map<string, string>();

  return {
    clearData: vi.fn(() => store.clear()),
    dropEffect: 'none' as DataTransfer['dropEffect'],
    effectAllowed: 'all' as DataTransfer['effectAllowed'],
    getData: vi.fn((type: string) => store.get(type) || ''),
    setData: vi.fn((type: string, value: string) => {
      store.set(type, value);
    }),
    setDragImage: vi.fn(),
  };
};

const createCollectionDragEvent = ({
  clientX,
  clientY,
  currentTarget,
  dataTransfer,
}: {
  clientX: number;
  clientY: number;
  currentTarget: HTMLElement;
  dataTransfer: ReturnType<typeof createDataTransfer>;
}) =>
  ({
    clientX,
    clientY,
    currentTarget,
    dataTransfer,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  }) as unknown as ReactDragEvent<HTMLElement>;

describe('useCollectionDnd', () => {
  let container: HTMLDivElement;
  let latestValue: HookValue | null;
  let refresh: ReturnType<typeof vi.fn>;
  let root: ReturnType<typeof createRoot>;
  let setToast: ReturnType<typeof vi.fn>;
  let suppressBookmarkRefreshRef: { current: boolean };

  const renderHarness = async ({
    collections = collectionsFixture,
    selectedWorkspaceChildren = workspaceChildrenFixture,
    selectedWorkspaceId = 'workspace-1',
  }: {
    collections?: CollectionSummary[];
    selectedWorkspaceChildren?: BookmarkNode[];
    selectedWorkspaceId?: string;
  } = {}) => {
    await act(async () => {
      root.render(
        <Harness
          collections={collections}
          onValue={value => {
            latestValue = value;
          }}
          refresh={refresh as () => Promise<void>}
          selectedWorkspaceChildren={selectedWorkspaceChildren}
          selectedWorkspaceId={selectedWorkspaceId}
          setToast={setToast as (message: string) => void}
          suppressBookmarkRefreshRef={suppressBookmarkRefreshRef}
        />,
      );
    });
  };

  const registerBoardNode = () => {
    latestValue!.collectionBoardNodeRef.current = createCollectionBoardNode({
      getBoardRect: () => ({ left: 0, top: 0, width: 320, height: 156 }),
      items: [
        { id: 'alpha', getRect: () => ({ left: 0, top: 0, width: 320, height: 48 }) },
        { id: 'beta', getRect: () => ({ left: 0, top: 54, width: 320, height: 48 }) },
        { id: 'gamma', getRect: () => ({ left: 0, top: 108, width: 320, height: 48 }) },
      ],
    });
  };

  const registerScrollableBoardNode = () => {
    const scrollContainer = document.createElement('section');
    scrollContainer.className = 'panel center';
    scrollContainer.style.overflowY = 'auto';
    let scrollTopValue = 0;

    Object.defineProperty(scrollContainer, 'scrollTop', {
      configurable: true,
      get: () => scrollTopValue,
      set: value => {
        scrollTopValue = value as number;
      },
    });
    Object.defineProperty(scrollContainer, 'clientHeight', {
      configurable: true,
      value: 180,
    });
    Object.defineProperty(scrollContainer, 'scrollHeight', {
      configurable: true,
      value: 480,
    });
    setNodeRect(scrollContainer, () => ({ left: 0, top: 0, width: 360, height: 180 }));

    const boardNode = createCollectionBoardNode({
      getBoardRect: () => ({ left: 0, top: 0, width: 320, height: 260 }),
      items: [
        { id: 'alpha', getRect: () => ({ left: 0, top: 0, width: 320, height: 48 }) },
        { id: 'beta', getRect: () => ({ left: 0, top: 54, width: 320, height: 48 }) },
        { id: 'gamma', getRect: () => ({ left: 0, top: 108, width: 320, height: 48 }) },
      ],
    });

    scrollContainer.appendChild(boardNode);
    container.appendChild(scrollContainer);
    latestValue!.collectionBoardNodeRef.current = boardNode;

    return scrollContainer;
  };

  const registerViewportScrollableBoardNode = () => {
    const boardNode = createCollectionBoardNode({
      getBoardRect: () => ({ left: 0, top: 0, width: 320, height: 260 }),
      items: [
        { id: 'alpha', getRect: () => ({ left: 0, top: 0, width: 320, height: 48 }) },
        { id: 'beta', getRect: () => ({ left: 0, top: 54, width: 320, height: 48 }) },
        { id: 'gamma', getRect: () => ({ left: 0, top: 108, width: 320, height: 48 }) },
      ],
    });
    let scrollTopValue = 0;

    const scrollingElement = document.createElement('div');
    Object.defineProperty(scrollingElement, 'scrollTop', {
      configurable: true,
      get: () => scrollTopValue,
      set: value => {
        scrollTopValue = value as number;
      },
    });
    Object.defineProperty(scrollingElement, 'clientHeight', {
      configurable: true,
      value: 180,
    });
    Object.defineProperty(scrollingElement, 'scrollHeight', {
      configurable: true,
      value: 540,
    });
    Object.defineProperty(document, 'scrollingElement', {
      configurable: true,
      value: scrollingElement,
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 180,
    });

    container.appendChild(boardNode);
    latestValue!.collectionBoardNodeRef.current = boardNode;

    return scrollingElement;
  };

  const startDrag = async (collectionId: string) => {
    const dataTransfer = createDataTransfer();
    const collection = collectionsFixture.find(item => item.id === collectionId);
    if (!collection) throw new Error(`Unknown collection: ${collectionId}`);

    await act(async () => {
      latestValue?.handleCollectionDragStart(
        createCollectionDragEvent({
          clientX: 20,
          clientY: 20,
          currentTarget: document.createElement('article'),
          dataTransfer,
        }) as unknown as ReactDragEvent<HTMLElement>,
        collection,
      );
    });

    return dataTransfer;
  };

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    latestValue = null;
    refresh = vi.fn().mockResolvedValue(undefined);
    root = createRoot(container);
    setToast = vi.fn();
    suppressBookmarkRefreshRef = { current: false };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.useRealTimers();

    vi.mocked(moveBookmarkNodeFromUserAction).mockReset();
    vi.mocked(moveBookmarkNodeFromUserAction).mockResolvedValue({ id: 'alpha' } as chrome.bookmarks.BookmarkTreeNode);

    await renderHarness();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    if (originalScrollingElementDescriptor) {
      Object.defineProperty(document, 'scrollingElement', originalScrollingElementDescriptor);
    }
    if (originalInnerHeightDescriptor) {
      Object.defineProperty(window, 'innerHeight', originalInnerHeightDescriptor);
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('shows a bottom preview and persists the reordered collection sequence', async () => {
    registerBoardNode();
    const dataTransfer = await startDrag('alpha');

    await act(async () => {
      latestValue?.handleCollectionBoardDragOver(
        createCollectionDragEvent({
          clientX: 32,
          clientY: 150,
          currentTarget: latestValue!.collectionBoardNodeRef.current!,
          dataTransfer,
        }),
      );
    });

    expect(latestValue?.collectionDropPreview).toEqual({
      targetIndex: 2,
      renderId: 'gamma',
      side: 'bottom',
    });

    await act(async () => {
      await latestValue?.handleCollectionBoardDrop(
        createCollectionDragEvent({
          clientX: 32,
          clientY: 150,
          currentTarget: latestValue!.collectionBoardNodeRef.current!,
          dataTransfer,
        }),
      );
    });

    expect(latestValue?.orderedCollections.map(collection => collection.id)).toEqual(['beta', 'gamma', 'alpha']);
    expect(moveBookmarkNodeFromUserAction).toHaveBeenCalledTimes(3);
    expect(moveBookmarkNodeFromUserAction).toHaveBeenNthCalledWith(1, 'beta', {
      parentId: 'workspace-1',
      index: 0,
    });
    expect(moveBookmarkNodeFromUserAction).toHaveBeenNthCalledWith(2, 'gamma', {
      parentId: 'workspace-1',
      index: 1,
    });
    expect(moveBookmarkNodeFromUserAction).toHaveBeenNthCalledWith(3, 'alpha', {
      parentId: 'workspace-1',
      index: 2,
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(setToast).toHaveBeenCalledWith('컬렉션 순서를 변경했습니다.');
    expect(suppressBookmarkRefreshRef.current).toBe(false);
  });

  it('shows a top preview and moves a collection earlier in the list', async () => {
    registerBoardNode();
    const dataTransfer = await startDrag('gamma');

    await act(async () => {
      latestValue?.handleCollectionBoardDragOver(
        createCollectionDragEvent({
          clientX: 32,
          clientY: 8,
          currentTarget: latestValue!.collectionBoardNodeRef.current!,
          dataTransfer,
        }),
      );
    });

    expect(latestValue?.collectionDropPreview).toEqual({
      targetIndex: 0,
      renderId: 'alpha',
      side: 'top',
    });

    await act(async () => {
      await latestValue?.handleCollectionBoardDrop(
        createCollectionDragEvent({
          clientX: 32,
          clientY: 8,
          currentTarget: latestValue!.collectionBoardNodeRef.current!,
          dataTransfer,
        }),
      );
    });

    expect(latestValue?.orderedCollections.map(collection => collection.id)).toEqual(['gamma', 'alpha', 'beta']);
    expect(moveBookmarkNodeFromUserAction).toHaveBeenCalledTimes(3);
    expect(moveBookmarkNodeFromUserAction).toHaveBeenNthCalledWith(1, 'gamma', {
      parentId: 'workspace-1',
      index: 0,
    });
    expect(moveBookmarkNodeFromUserAction).toHaveBeenNthCalledWith(2, 'alpha', {
      parentId: 'workspace-1',
      index: 1,
    });
    expect(moveBookmarkNodeFromUserAction).toHaveBeenNthCalledWith(3, 'beta', {
      parentId: 'workspace-1',
      index: 2,
    });
  });

  it('keeps the same preview line anywhere inside the gap between the first and second item', async () => {
    registerBoardNode();
    const dataTransfer = await startDrag('gamma');

    await act(async () => {
      latestValue?.handleCollectionBoardDragOver(
        createCollectionDragEvent({
          clientX: 32,
          clientY: 50,
          currentTarget: latestValue!.collectionBoardNodeRef.current!,
          dataTransfer,
        }),
      );
    });

    expect(latestValue?.collectionDropPreview).toEqual({
      targetIndex: 1,
      renderId: 'beta',
      side: 'top',
    });

    await act(async () => {
      latestValue?.handleCollectionBoardDragOver(
        createCollectionDragEvent({
          clientX: 32,
          clientY: 58,
          currentTarget: latestValue!.collectionBoardNodeRef.current!,
          dataTransfer,
        }),
      );
    });

    expect(latestValue?.collectionDropPreview).toEqual({
      targetIndex: 1,
      renderId: 'beta',
      side: 'top',
    });
  });

  it('moves the last collection to immediately after the first item when dropped in that gap', async () => {
    registerBoardNode();
    const dataTransfer = await startDrag('gamma');

    await act(async () => {
      latestValue?.handleCollectionBoardDragOver(
        createCollectionDragEvent({
          clientX: 32,
          clientY: 54,
          currentTarget: latestValue!.collectionBoardNodeRef.current!,
          dataTransfer,
        }),
      );
    });

    expect(latestValue?.collectionDropPreview).toEqual({
      targetIndex: 1,
      renderId: 'beta',
      side: 'top',
    });

    await act(async () => {
      await latestValue?.handleCollectionBoardDrop(
        createCollectionDragEvent({
          clientX: 32,
          clientY: 54,
          currentTarget: latestValue!.collectionBoardNodeRef.current!,
          dataTransfer,
        }),
      );
    });

    expect(latestValue?.orderedCollections.map(collection => collection.id)).toEqual(['alpha', 'gamma', 'beta']);
    expect(moveBookmarkNodeFromUserAction).toHaveBeenCalledTimes(3);
    expect(moveBookmarkNodeFromUserAction).toHaveBeenNthCalledWith(1, 'alpha', {
      parentId: 'workspace-1',
      index: 0,
    });
    expect(moveBookmarkNodeFromUserAction).toHaveBeenNthCalledWith(2, 'gamma', {
      parentId: 'workspace-1',
      index: 1,
    });
    expect(moveBookmarkNodeFromUserAction).toHaveBeenNthCalledWith(3, 'beta', {
      parentId: 'workspace-1',
      index: 2,
    });
  });

  it('ignores nested bookmark rows when measuring collection drop slots', async () => {
    registerBoardNode();

    const nestedBookmarkNode = document.createElement('li');
    nestedBookmarkNode.setAttribute('data-collection-id', 'alpha');
    setNodeRect(nestedBookmarkNode, () => ({ left: 0, top: 20, width: 320, height: 16 }));
    latestValue!.collectionBoardNodeRef.current!.firstElementChild?.appendChild(nestedBookmarkNode);

    const dataTransfer = await startDrag('gamma');

    await act(async () => {
      latestValue?.handleCollectionBoardDragOver(
        createCollectionDragEvent({
          clientX: 32,
          clientY: 54,
          currentTarget: latestValue!.collectionBoardNodeRef.current!,
          dataTransfer,
        }),
      );
    });

    expect(latestValue?.collectionDropPreview).toEqual({
      targetIndex: 1,
      renderId: 'beta',
      side: 'top',
    });
  });

  it('auto-scrolls the center panel when dragging near the bottom edge', async () => {
    const scrollContainer = registerScrollableBoardNode();
    const dataTransfer = await startDrag('alpha');
    let rafCallback: FrameRequestCallback | null = null;

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      rafCallback = callback;
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    await act(async () => {
      latestValue?.handleCollectionBoardDragOver(
        createCollectionDragEvent({
          clientX: 32,
          clientY: 174,
          currentTarget: scrollContainer,
          dataTransfer,
        }),
      );
    });

    expect(rafCallback).not.toBeNull();

    await act(async () => {
      rafCallback?.(performance.now());
    });

    expect(scrollContainer.scrollTop).toBeGreaterThan(0);
  });

  it('falls back to the page scroll root when the board itself is not inside a scrollable panel', async () => {
    const scrollingElement = registerViewportScrollableBoardNode();
    const dataTransfer = await startDrag('alpha');
    let rafCallback: FrameRequestCallback | null = null;

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      rafCallback = callback;
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);

    await act(async () => {
      latestValue?.handleCollectionBoardDragOver(
        createCollectionDragEvent({
          clientX: 32,
          clientY: 174,
          currentTarget: latestValue!.collectionBoardNodeRef.current!,
          dataTransfer,
        }),
      );
    });

    expect(rafCallback).not.toBeNull();

    await act(async () => {
      rafCallback?.(performance.now());
    });

    expect(scrollingElement.scrollTop).toBeGreaterThan(0);
  });

  it('does not persist when the drop preview resolves to the current position', async () => {
    registerBoardNode();
    const dataTransfer = await startDrag('beta');

    await act(async () => {
      latestValue?.handleCollectionBoardDragOver(
        createCollectionDragEvent({
          clientX: 32,
          clientY: 78,
          currentTarget: latestValue!.collectionBoardNodeRef.current!,
          dataTransfer,
        }),
      );
    });

    expect(latestValue?.collectionDropPreview).toBeNull();

    await act(async () => {
      await latestValue?.handleCollectionBoardDrop(
        createCollectionDragEvent({
          clientX: 32,
          clientY: 78,
          currentTarget: latestValue!.collectionBoardNodeRef.current!,
          dataTransfer,
        }),
      );
    });

    expect(latestValue?.orderedCollections.map(collection => collection.id)).toEqual(['alpha', 'beta', 'gamma']);
    expect(moveBookmarkNodeFromUserAction).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(setToast).not.toHaveBeenCalled();
  });

  it('rolls back the optimistic order when persistence fails', async () => {
    registerBoardNode();
    const dataTransfer = await startDrag('alpha');
    vi.mocked(moveBookmarkNodeFromUserAction).mockRejectedValueOnce(new Error('boom'));

    await act(async () => {
      latestValue?.handleCollectionBoardDragOver(
        createCollectionDragEvent({
          clientX: 32,
          clientY: 150,
          currentTarget: latestValue!.collectionBoardNodeRef.current!,
          dataTransfer,
        }),
      );
    });

    await act(async () => {
      await latestValue?.handleCollectionBoardDrop(
        createCollectionDragEvent({
          clientX: 32,
          clientY: 150,
          currentTarget: latestValue!.collectionBoardNodeRef.current!,
          dataTransfer,
        }),
      );
    });

    expect(latestValue?.orderedCollections.map(collection => collection.id)).toEqual(['alpha', 'beta', 'gamma']);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(setToast).toHaveBeenCalledWith('컬렉션 순서를 변경하지 못했습니다.');
    expect(suppressBookmarkRefreshRef.current).toBe(false);
  });

  it('clears the preview when the pointer leaves the board or the workspace target takes over', async () => {
    registerBoardNode();
    const dataTransfer = await startDrag('alpha');

    await act(async () => {
      latestValue?.handleCollectionBoardDragOver(
        createCollectionDragEvent({
          clientX: 32,
          clientY: 150,
          currentTarget: latestValue!.collectionBoardNodeRef.current!,
          dataTransfer,
        }),
      );
    });

    expect(latestValue?.collectionDropPreview).not.toBeNull();

    await act(async () => {
      latestValue?.handleCollectionBoardDragLeave(
        createCollectionDragEvent({
          clientX: 420,
          clientY: 220,
          currentTarget: latestValue!.collectionBoardNodeRef.current!,
          dataTransfer,
        }),
      );
    });

    expect(latestValue?.collectionDropPreview).toBeNull();

    await act(async () => {
      latestValue?.handleCollectionBoardDragOver(
        createCollectionDragEvent({
          clientX: 32,
          clientY: 150,
          currentTarget: latestValue!.collectionBoardNodeRef.current!,
          dataTransfer,
        }),
      );
    });

    expect(latestValue?.collectionDropPreview).not.toBeNull();

    await act(async () => {
      latestValue?.clearCollectionDragPreview();
    });

    expect(latestValue?.collectionDropPreview).toBeNull();
  });
});
