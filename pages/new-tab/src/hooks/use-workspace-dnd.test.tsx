// @vitest-environment jsdom

import { useWorkspaceDnd } from './use-workspace-dnd';
import { moveBookmarkNodeFromUserAction } from '@src/lib/bookmark-user-actions';
import { act, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookmarkNode } from '@src/lib/new-tab/types';
import type { PointerEvent as ReactPointerEvent } from 'react';

vi.mock('@src/lib/bookmark-user-actions', () => ({
  moveBookmarkNodeFromUserAction: vi.fn(),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type HookValue = ReturnType<typeof useWorkspaceDnd>;

type HarnessProps = {
  onValue: (value: HookValue) => void;
  refresh: () => Promise<void>;
  setToast: (message: string) => void;
  tree: BookmarkNode | null;
  workspaces: BookmarkNode[];
};

type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const workspacesFixture = [
  { id: 'a', title: 'Alpha' },
  { id: 'b', title: 'Bravo' },
  { id: 'c', title: 'Charlie' },
] as BookmarkNode[];

const Harness = ({ onValue, refresh, setToast, tree, workspaces }: HarnessProps) => {
  const suppressBookmarkRefreshRef = useRef(false);
  const value = useWorkspaceDnd({
    refresh,
    setToast,
    suppressBookmarkRefreshRef,
    tree,
    workspaces,
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

const createActive = (workspaceId: string) =>
  ({
    data: {
      current: {
        kind: 'workspace' as const,
        workspaceId,
      },
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

const createWorkspaceListNode = ({
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
    itemNode.dataset.workspaceId = item.id;
    setNodeRect(itemNode, item.getRect);
    node.appendChild(itemNode);
  }

  return node;
};

describe('useWorkspaceDnd', () => {
  let container: HTMLDivElement;
  let latestValue: HookValue | null;
  let refresh: ReturnType<typeof vi.fn>;
  let root: ReturnType<typeof createRoot>;
  let setToast: ReturnType<typeof vi.fn>;
  let tree: BookmarkNode;

  const renderHarness = async () => {
    await act(async () => {
      root.render(
        <Harness
          onValue={value => {
            latestValue = value;
          }}
          refresh={refresh as () => Promise<void>}
          setToast={setToast as (message: string) => void}
          tree={tree}
          workspaces={workspacesFixture}
        />,
      );
    });
  };

  const startDrag = async (workspaceId: string, x: number, y: number) => {
    const active = createActive(workspaceId);

    await act(async () => {
      latestValue?.handleWorkspacePointerDownCapture(
        {
          kind: 'workspace',
          workspaceId,
        },
        createPointerDownEvent(x, y),
      );
    });

    await act(async () => {
      latestValue?.handleWorkspaceDragStart({
        active,
        activatorEvent: new MouseEvent('pointerdown', {
          clientX: x,
          clientY: y,
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

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    latestValue = null;
    refresh = vi.fn().mockResolvedValue(undefined);
    root = createRoot(container);
    setToast = vi.fn();
    tree = { id: 'root', title: 'My Little Bookmark' } as BookmarkNode;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    vi.mocked(moveBookmarkNodeFromUserAction).mockReset();
    vi.mocked(moveBookmarkNodeFromUserAction).mockResolvedValue({ id: 'a' } as chrome.bookmarks.BookmarkTreeNode);

    await renderHarness();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('shows a bottom drop line preview and persists the reordered workspace sequence', async () => {
    latestValue!.workspaceListNodeRef.current = createWorkspaceListNode({
      getListRect: () => ({ left: 0, top: 0, width: 240, height: 180 }),
      items: [
        { id: 'a', getRect: () => ({ left: 0, top: 0, width: 240, height: 48 }) },
        { id: 'b', getRect: () => ({ left: 0, top: 54, width: 240, height: 48 }) },
        { id: 'c', getRect: () => ({ left: 0, top: 108, width: 240, height: 48 }) },
      ],
    });

    const active = await startDrag('a', 24, 24);
    await movePointer(24, 150);

    await act(async () => {
      latestValue?.handleWorkspaceDragMove({
        active,
        delta: { x: 0, y: 126 },
      } as never);
    });

    expect(latestValue?.workspaceDropPreview).toEqual({
      targetIndex: 2,
      renderId: 'c',
      side: 'bottom',
    });

    await act(async () => {
      await latestValue?.handleWorkspaceDragEnd({
        active,
      } as never);
    });

    expect(latestValue?.workspaceOrderIds).toEqual(['b', 'c', 'a']);
    expect(moveBookmarkNodeFromUserAction).toHaveBeenCalledTimes(3);
    expect(moveBookmarkNodeFromUserAction).toHaveBeenNthCalledWith(1, 'b', {
      parentId: 'root',
      index: 0,
    });
    expect(moveBookmarkNodeFromUserAction).toHaveBeenNthCalledWith(2, 'c', {
      parentId: 'root',
      index: 1,
    });
    expect(moveBookmarkNodeFromUserAction).toHaveBeenNthCalledWith(3, 'a', {
      parentId: 'root',
      index: 2,
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(setToast).toHaveBeenCalledWith('워크스페이스 순서를 변경했습니다.');
  });

  it('does not persist when the drop preview resolves to the current position', async () => {
    latestValue!.workspaceListNodeRef.current = createWorkspaceListNode({
      getListRect: () => ({ left: 0, top: 0, width: 240, height: 180 }),
      items: [
        { id: 'a', getRect: () => ({ left: 0, top: 0, width: 240, height: 48 }) },
        { id: 'b', getRect: () => ({ left: 0, top: 54, width: 240, height: 48 }) },
        { id: 'c', getRect: () => ({ left: 0, top: 108, width: 240, height: 48 }) },
      ],
    });

    const active = await startDrag('b', 24, 78);
    await movePointer(24, 78);

    await act(async () => {
      latestValue?.handleWorkspaceDragMove({
        active,
        delta: { x: 0, y: 0 },
      } as never);
    });

    expect(latestValue?.workspaceDropPreview).toBeNull();

    await act(async () => {
      await latestValue?.handleWorkspaceDragEnd({
        active,
      } as never);
    });

    expect(latestValue?.workspaceOrderIds).toEqual(['a', 'b', 'c']);
    expect(moveBookmarkNodeFromUserAction).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(setToast).not.toHaveBeenCalled();
  });

  it('clears the drop preview when the pointer leaves the workspace list', async () => {
    latestValue!.workspaceListNodeRef.current = createWorkspaceListNode({
      getListRect: () => ({ left: 0, top: 0, width: 240, height: 180 }),
      items: [
        { id: 'a', getRect: () => ({ left: 0, top: 0, width: 240, height: 48 }) },
        { id: 'b', getRect: () => ({ left: 0, top: 54, width: 240, height: 48 }) },
        { id: 'c', getRect: () => ({ left: 0, top: 108, width: 240, height: 48 }) },
      ],
    });

    const active = await startDrag('a', 24, 24);
    await movePointer(24, 150);

    await act(async () => {
      latestValue?.handleWorkspaceDragMove({
        active,
        delta: { x: 0, y: 126 },
      } as never);
    });

    expect(latestValue?.workspaceDropPreview).not.toBeNull();

    await movePointer(320, 220);

    await act(async () => {
      latestValue?.handleWorkspaceDragMove({
        active,
        delta: { x: 296, y: 196 },
      } as never);
    });

    expect(latestValue?.workspaceDropPreview).toBeNull();
  });

  it('rolls back the optimistic order when persistence fails', async () => {
    latestValue!.workspaceListNodeRef.current = createWorkspaceListNode({
      getListRect: () => ({ left: 0, top: 0, width: 240, height: 180 }),
      items: [
        { id: 'a', getRect: () => ({ left: 0, top: 0, width: 240, height: 48 }) },
        { id: 'b', getRect: () => ({ left: 0, top: 54, width: 240, height: 48 }) },
        { id: 'c', getRect: () => ({ left: 0, top: 108, width: 240, height: 48 }) },
      ],
    });
    vi.mocked(moveBookmarkNodeFromUserAction).mockRejectedValueOnce(new Error('boom'));

    const active = await startDrag('a', 24, 24);
    await movePointer(24, 150);

    await act(async () => {
      latestValue?.handleWorkspaceDragMove({
        active,
        delta: { x: 0, y: 126 },
      } as never);
    });

    await act(async () => {
      await latestValue?.handleWorkspaceDragEnd({
        active,
      } as never);
    });

    expect(latestValue?.workspaceOrderIds).toEqual(['a', 'b', 'c']);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(setToast).toHaveBeenCalledWith('워크스페이스 순서를 변경하지 못했습니다.');
  });
});
