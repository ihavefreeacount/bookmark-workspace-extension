// @vitest-environment jsdom

import { useBookmarkDnd } from './use-bookmark-dnd';
import { moveBookmarkNodeFromUserAction } from '@src/lib/bookmark-user-actions';
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CollectionSummary } from '@src/lib/new-tab/types';
import type { PointerEvent as ReactPointerEvent } from 'react';

vi.mock('@src/lib/bookmark-user-actions', () => ({
  moveBookmarkNodeFromUserAction: vi.fn(),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HookValue = ReturnType<typeof useBookmarkDnd>;

type HarnessProps = {
  clearActiveContext: () => void;
  collections: CollectionSummary[];
  onValue: (value: HookValue) => void;
  refresh: () => Promise<void>;
  setToast: (message: string) => void;
};

type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const dragData = {
  kind: 'bookmark' as const,
  bookmarkId: 'a',
  collectionId: 'alpha',
};

const collectionsFixture: CollectionSummary[] = [
  {
    workspaceId: 'workspace-1',
    workspace: 'Workspace',
    id: 'alpha',
    title: 'Alpha',
    links: [
      { id: 'a', title: 'Alpha Link', url: 'https://alpha.test' } as chrome.bookmarks.BookmarkTreeNode,
      { id: 'b', title: 'Bravo Link', url: 'https://bravo.test' } as chrome.bookmarks.BookmarkTreeNode,
    ],
  },
  {
    workspaceId: 'workspace-1',
    workspace: 'Workspace',
    id: 'beta',
    title: 'Beta',
    links: [{ id: 'c', title: 'Charlie Link', url: 'https://charlie.test' } as chrome.bookmarks.BookmarkTreeNode],
  },
];

const collectionsWithEmptyTarget: CollectionSummary[] = [
  collectionsFixture[0],
  {
    workspaceId: 'workspace-1',
    workspace: 'Workspace',
    id: 'beta',
    title: 'Beta',
    links: [],
  },
];

const Harness = ({ clearActiveContext, collections, onValue, refresh, setToast }: HarnessProps) => {
  const value = useBookmarkDnd({
    collections,
    clearActiveContext,
    refresh,
    setToast,
  });

  useEffect(() => {
    onValue(value);
  }, [onValue, value]);

  return null;
};

const createPointerDownEvent = (x: number, y: number) =>
  ({
    isPrimary: true,
    button: 0,
    clientX: x,
    clientY: y,
    target: document.body,
  }) as unknown as ReactPointerEvent<HTMLLIElement>;

const createActive = () =>
  ({
    data: {
      current: dragData,
    },
  }) as const;

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

const createCollectionNode = (getRect: () => Rect) => {
  const node = document.createElement('article');
  setNodeRect(node, getRect);
  return node;
};

const createListNode = ({
  getListRect,
  items,
}: {
  getListRect: () => Rect;
  items: Array<{ getRect: () => Rect; id: string }>;
}) => {
  const node = document.createElement('ul');
  setNodeRect(node, getListRect);

  for (const item of items) {
    const itemNode = document.createElement('li');
    itemNode.dataset.bookmarkId = item.id;
    setNodeRect(itemNode, item.getRect);
    node.appendChild(itemNode);
  }

  return node;
};

describe('useBookmarkDnd', () => {
  let clearActiveContext: ReturnType<typeof vi.fn>;
  let container: HTMLDivElement;
  let latestValue: HookValue | null;
  let refresh: ReturnType<typeof vi.fn>;
  let root: ReturnType<typeof createRoot>;
  let setToast: ReturnType<typeof vi.fn>;

  const renderHarness = async (collections: CollectionSummary[]) => {
    await act(async () => {
      root.render(
        <Harness
          collections={collections}
          clearActiveContext={clearActiveContext as () => void}
          onValue={value => {
            latestValue = value;
          }}
          refresh={refresh as () => Promise<void>}
          setToast={setToast as (message: string) => void}
        />,
      );
    });
  };

  const startDrag = async () => {
    const active = createActive();

    await act(async () => {
      latestValue?.handleBookmarkPointerDownCapture(dragData, createPointerDownEvent(32, 48));
    });

    await act(async () => {
      latestValue?.handleBookmarkDragStart({
        active,
        activatorEvent: new MouseEvent('pointerdown', {
          clientX: 32,
          clientY: 48,
        }),
      } as never);
    });

    return active;
  };

  const movePointer = async (x: number, y: number) => {
    await act(async () => {
      window.dispatchEvent(
        new MouseEvent('pointermove', {
          clientX: x,
          clientY: y,
        }),
      );
    });
  };

  const registerCollectionNodes = (collections: Record<string, HTMLElement>) => {
    latestValue!.bookmarkCollectionNodesRef.current = collections;
  };

  const registerListNodes = (lists: Record<string, HTMLUListElement>) => {
    latestValue!.bookmarkListNodesRef.current = lists;
  };

  beforeEach(async () => {
    clearActiveContext = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    latestValue = null;
    refresh = vi.fn().mockResolvedValue(undefined);
    root = createRoot(container);
    setToast = vi.fn();

    vi.mocked(moveBookmarkNodeFromUserAction).mockReset();
    vi.mocked(moveBookmarkNodeFromUserAction).mockResolvedValue({ id: 'a' } as chrome.bookmarks.BookmarkTreeNode);

    await renderHarness(collectionsFixture);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('moves a bookmark into another populated collection and keeps the preview in sync', async () => {
    const active = await startDrag();

    registerCollectionNodes({
      alpha: createCollectionNode(() => ({ left: 0, top: 0, width: 140, height: 180 })),
      beta: createCollectionNode(() => ({ left: 180, top: 0, width: 140, height: 180 })),
    });
    registerListNodes({
      beta: createListNode({
        getListRect: () => ({ left: 192, top: 20, width: 120, height: 72 }),
        items: [{ id: 'c', getRect: () => ({ left: 208, top: 36, width: 96, height: 40 }) }],
      }),
    });

    await movePointer(198, 48);

    await act(async () => {
      latestValue?.handleBookmarkDragMove({
        active,
        delta: { x: 166, y: 0 },
      } as never);
    });

    expect(latestValue?.bookmarkDropPreview).toEqual({
      kind: 'slot',
      collectionId: 'beta',
      targetIndex: 0,
      renderId: 'c',
      side: 'left',
    });

    await act(async () => {
      await latestValue?.handleBookmarkDragEnd({ active } as never);
    });

    expect(moveBookmarkNodeFromUserAction).toHaveBeenCalledWith('a', {
      parentId: 'beta',
      index: 0,
    });
    expect(latestValue?.orderedBookmarksByCollection.alpha.map(link => link.id)).toEqual(['b']);
    expect(latestValue?.orderedBookmarksByCollection.beta.map(link => link.id)).toEqual(['a', 'c']);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(setToast).toHaveBeenCalledWith('북마크를 이동했습니다.');
  });

  it('treats an empty collection card as a whole drop target and inserts at index zero', async () => {
    await renderHarness(collectionsWithEmptyTarget);

    const active = await startDrag();

    registerCollectionNodes({
      alpha: createCollectionNode(() => ({ left: 0, top: 0, width: 140, height: 180 })),
      beta: createCollectionNode(() => ({ left: 180, top: 0, width: 140, height: 180 })),
    });

    await movePointer(220, 72);

    await act(async () => {
      latestValue?.handleBookmarkDragMove({
        active,
        delta: { x: 188, y: 24 },
      } as never);
    });

    expect(latestValue?.bookmarkDropPreview).toEqual({
      kind: 'empty-collection',
      collectionId: 'beta',
      targetIndex: 0,
      renderId: null,
      side: null,
    });

    await act(async () => {
      await latestValue?.handleBookmarkDragEnd({ active } as never);
    });

    expect(moveBookmarkNodeFromUserAction).toHaveBeenCalledWith('a', {
      parentId: 'beta',
      index: 0,
    });
    expect(latestValue?.orderedBookmarksByCollection.beta.map(link => link.id)).toEqual(['a']);
  });

  it('restores the previous order when a cross-collection move fails', async () => {
    const error = new Error('move failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(moveBookmarkNodeFromUserAction).mockRejectedValue(error);

    const active = await startDrag();

    registerCollectionNodes({
      alpha: createCollectionNode(() => ({ left: 0, top: 0, width: 140, height: 180 })),
      beta: createCollectionNode(() => ({ left: 180, top: 0, width: 140, height: 180 })),
    });
    registerListNodes({
      beta: createListNode({
        getListRect: () => ({ left: 192, top: 20, width: 120, height: 72 }),
        items: [{ id: 'c', getRect: () => ({ left: 208, top: 36, width: 96, height: 40 }) }],
      }),
    });

    await movePointer(302, 48);

    await act(async () => {
      latestValue?.handleBookmarkDragMove({
        active,
        delta: { x: 270, y: 0 },
      } as never);
    });

    await act(async () => {
      await latestValue?.handleBookmarkDragEnd({ active } as never);
    });

    expect(latestValue?.orderedBookmarksByCollection.alpha.map(link => link.id)).toEqual(['a', 'b']);
    expect(latestValue?.orderedBookmarksByCollection.beta.map(link => link.id)).toEqual(['c']);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(setToast).toHaveBeenCalledWith('북마크를 이동하지 못했습니다.');
    expect(consoleError).toHaveBeenCalledWith(error);
  });

  it('re-measures collection and slot positions when the board scrolls during a drag', async () => {
    const active = await startDrag();

    let betaCollectionRect = { left: 180, top: 0, width: 140, height: 180 };
    let betaListRect = { left: 192, top: 20, width: 120, height: 72 };
    let betaItemRect = { left: 208, top: 36, width: 96, height: 40 };

    registerCollectionNodes({
      alpha: createCollectionNode(() => ({ left: 0, top: 0, width: 140, height: 180 })),
      beta: createCollectionNode(() => betaCollectionRect),
    });
    registerListNodes({
      beta: createListNode({
        getListRect: () => betaListRect,
        items: [{ id: 'c', getRect: () => betaItemRect }],
      }),
    });

    await movePointer(198, 48);

    await act(async () => {
      latestValue?.handleBookmarkDragMove({
        active,
        delta: { x: 166, y: 0 },
      } as never);
    });

    expect(latestValue?.bookmarkDropPreview).toEqual({
      kind: 'slot',
      collectionId: 'beta',
      targetIndex: 0,
      renderId: 'c',
      side: 'left',
    });

    betaCollectionRect = { left: 180, top: 320, width: 140, height: 180 };
    betaListRect = { left: 192, top: 340, width: 120, height: 72 };
    betaItemRect = { left: 208, top: 356, width: 96, height: 40 };

    await act(async () => {
      window.dispatchEvent(new Event('scroll'));
    });

    expect(latestValue?.bookmarkDropPreview).toBeNull();
  });
});
