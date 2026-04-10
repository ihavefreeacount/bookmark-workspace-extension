import { moveBookmarkNodeFromUserAction } from '@src/lib/bookmark-user-actions';
import { moveIdToIndex, orderByIds } from '@src/lib/dnd/sortable-helpers';
import {
  parseCollectionWorkspaceDragPayload,
  startCollectionWorkspaceDrag,
} from '@src/lib/new-tab/collection-workspace-drag';
import { DND_COLLECTION_MIME } from '@src/lib/new-tab/helpers';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CollectionDragData,
  CollectionDropPreview,
  CollectionSummary,
  BookmarkNode,
} from '@src/lib/new-tab/types';
import type { DragEvent as ReactDragEvent, RefObject } from 'react';

type UseCollectionDndOptions = {
  collections: CollectionSummary[];
  refresh: () => Promise<void>;
  selectedWorkspaceChildren: BookmarkNode[];
  selectedWorkspaceId: string;
  setToast: (message: string) => void;
  suppressBookmarkRefreshRef: RefObject<boolean>;
};

type CollectionDropSlot = {
  renderId: string;
  side: CollectionDropPreview['side'];
  targetIndex: number;
  y: number;
};

type CollectionScrollTarget = {
  getRect: () => { bottom: number; top: number };
  getScrollTop: () => number;
  getMaxScrollTop: () => number;
  setScrollTop: (nextScrollTop: number) => void;
};

const COLLECTION_AUTO_SCROLL_EDGE_THRESHOLD = 120;
const COLLECTION_AUTO_SCROLL_MAX_STEP = 28;

const isSameCollectionDropPreview = (left: CollectionDropPreview | null, right: CollectionDropPreview | null) =>
  left?.targetIndex === right?.targetIndex && left?.renderId === right?.renderId && left?.side === right?.side;

const measureCollectionDropSlots = (boardNode: HTMLElement): CollectionDropSlot[] => {
  const itemElements = Array.from(boardNode.querySelectorAll<HTMLElement>('[data-collection-card-id]'));
  if (!itemElements.length) return [];

  const entries = itemElements
    .map(element => ({
      id: element.getAttribute('data-collection-card-id') || '',
      rect: element.getBoundingClientRect(),
    }))
    .filter(entry => !!entry.id);

  if (!entries.length) return [];

  const slots: CollectionDropSlot[] = [];
  const firstEntry = entries[0];
  const lastEntry = entries[entries.length - 1];

  if (!firstEntry || !lastEntry) return [];

  slots.push({
    renderId: firstEntry.id,
    side: 'top',
    targetIndex: 0,
    y: firstEntry.rect.top,
  });

  for (let index = 1; index < entries.length; index += 1) {
    const previousEntry = entries[index - 1];
    const currentEntry = entries[index];
    if (!previousEntry || !currentEntry) continue;

    slots.push({
      renderId: currentEntry.id,
      side: 'top',
      targetIndex: index,
      y: (previousEntry.rect.bottom + currentEntry.rect.top) / 2,
    });
  }

  slots.push({
    renderId: lastEntry.id,
    side: 'bottom',
    targetIndex: entries.length,
    y: lastEntry.rect.bottom,
  });

  return slots;
};

const getCollectionDropPreview = ({
  activeId,
  ids,
  pointer,
  slots,
}: {
  activeId: string | null;
  ids: string[];
  pointer: { x: number; y: number } | null;
  slots: CollectionDropSlot[];
}): CollectionDropPreview | null => {
  if (!pointer || !slots.length) return null;

  let bestSlot: CollectionDropSlot | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const slot of slots) {
    const distance = Math.abs(pointer.y - slot.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestSlot = slot;
    }
  }

  if (!bestSlot) return null;

  const currentIndex = activeId ? ids.indexOf(activeId) : -1;
  const isSameListMove = currentIndex >= 0;
  const effectiveIndex =
    isSameListMove && bestSlot.targetIndex > currentIndex ? bestSlot.targetIndex - 1 : bestSlot.targetIndex;

  if (isSameListMove && effectiveIndex === currentIndex) return null;

  return {
    renderId: bestSlot.renderId,
    side: bestSlot.side,
    targetIndex: effectiveIndex,
  };
};

const buildFinalChildOrderIds = ({
  nextCollectionOrderIds,
  selectedWorkspaceChildren,
}: {
  nextCollectionOrderIds: string[];
  selectedWorkspaceChildren: BookmarkNode[];
}) => {
  const remainingCollectionIds = [...nextCollectionOrderIds];

  return selectedWorkspaceChildren.map(child => {
    if (child.url) {
      return child.id;
    }

    return remainingCollectionIds.shift() || child.id;
  });
};

const getCollectionScrollDelta = (pointerY: number, rect: { bottom: number; top: number }) => {
  const topDistance = pointerY - rect.top;
  if (topDistance < COLLECTION_AUTO_SCROLL_EDGE_THRESHOLD) {
    const strength = (COLLECTION_AUTO_SCROLL_EDGE_THRESHOLD - topDistance) / COLLECTION_AUTO_SCROLL_EDGE_THRESHOLD;
    return -Math.ceil(Math.max(1, strength * COLLECTION_AUTO_SCROLL_MAX_STEP));
  }

  const bottomDistance = rect.bottom - pointerY;
  if (bottomDistance < COLLECTION_AUTO_SCROLL_EDGE_THRESHOLD) {
    const strength = (COLLECTION_AUTO_SCROLL_EDGE_THRESHOLD - bottomDistance) / COLLECTION_AUTO_SCROLL_EDGE_THRESHOLD;
    return Math.ceil(Math.max(1, strength * COLLECTION_AUTO_SCROLL_MAX_STEP));
  }

  return 0;
};

const isScrollableOverflow = (overflowValue: string) => /(auto|overlay|scroll)/.test(overflowValue);

const isScrollableElement = (element: HTMLElement) => {
  const style = window.getComputedStyle(element);
  return (
    (isScrollableOverflow(style.overflowY) || isScrollableOverflow(style.overflow)) &&
    element.scrollHeight > element.clientHeight + 1
  );
};

const resolveCollectionScrollTarget = (boardNode: HTMLElement): CollectionScrollTarget | null => {
  let ancestor = boardNode.parentElement;

  while (ancestor) {
    if (isScrollableElement(ancestor)) {
      const scrollableAncestor = ancestor;

      return {
        getRect: () => scrollableAncestor.getBoundingClientRect(),
        getScrollTop: () => scrollableAncestor.scrollTop,
        getMaxScrollTop: () => scrollableAncestor.scrollHeight - scrollableAncestor.clientHeight,
        setScrollTop: nextScrollTop => {
          scrollableAncestor.scrollTop = nextScrollTop;
        },
      };
    }

    ancestor = ancestor.parentElement;
  }

  const scrollingElement = document.scrollingElement as HTMLElement | null;
  if (!scrollingElement) return null;

  const viewportHeight = window.innerHeight || scrollingElement.clientHeight;
  if (scrollingElement.scrollHeight <= viewportHeight + 1) return null;

  return {
    getRect: () => ({
      top: 0,
      bottom: window.innerHeight || scrollingElement.clientHeight,
    }),
    getScrollTop: () => scrollingElement.scrollTop,
    getMaxScrollTop: () => scrollingElement.scrollHeight - (window.innerHeight || scrollingElement.clientHeight),
    setScrollTop: nextScrollTop => {
      scrollingElement.scrollTop = nextScrollTop;
    },
  };
};

// Keep drag-managed order for existing collections, but insert newly created ones
// where the bookmark tree says they belong.
const reconcileCollectionOrderIds = (currentIds: readonly string[], nextIds: readonly string[]) => {
  if (!currentIds.length) return [...nextIds];

  const kept = currentIds.filter(id => nextIds.includes(id));
  if (!kept.length) return [...nextIds];

  const keptSet = new Set(kept);
  const nextKnownIdByAddedId = new Map<string, string | null>();

  for (let index = nextIds.length - 1; index >= 0; index -= 1) {
    const id = nextIds[index];
    if (!id) continue;

    if (keptSet.has(id)) {
      nextKnownIdByAddedId.set(id, id);
      continue;
    }

    const nextKnownId = nextIds.slice(index + 1).find(candidate => candidate && keptSet.has(candidate)) || null;
    nextKnownIdByAddedId.set(id, nextKnownId);
  }

  const result = [...kept];

  for (const id of nextIds) {
    if (!id || keptSet.has(id)) continue;

    const nextKnownId = nextKnownIdByAddedId.get(id) || null;
    if (!nextKnownId) {
      result.push(id);
      continue;
    }

    const insertionIndex = result.indexOf(nextKnownId);
    if (insertionIndex < 0) {
      result.push(id);
      continue;
    }

    result.splice(insertionIndex, 0, id);
  }

  return result;
};

const useCollectionDnd = ({
  collections,
  refresh,
  selectedWorkspaceChildren,
  selectedWorkspaceId,
  setToast,
  suppressBookmarkRefreshRef,
}: UseCollectionDndOptions) => {
  const [collectionOrderIds, setCollectionOrderIds] = useState<string[]>([]);
  const [activeCollectionDrag, setActiveCollectionDrag] = useState<CollectionDragData | null>(null);
  const [collectionDropPreview, setCollectionDropPreview] = useState<CollectionDropPreview | null>(null);

  const collectionBoardNodeRef = useRef<HTMLDivElement | null>(null);
  const collectionDragPreviewCleanupRef = useRef<(() => void) | null>(null);
  const collectionAutoScrollFrameRef = useRef<number | null>(null);
  const collectionLastPointerRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setCollectionOrderIds(previous =>
      reconcileCollectionOrderIds(
        previous,
        collections.map(collection => collection.id),
      ),
    );
  }, [collections]);

  const orderedCollections = useMemo(
    () => orderByIds(collections, collectionOrderIds),
    [collectionOrderIds, collections],
  );

  const clearCollectionDragPreview = useCallback(() => {
    setCollectionDropPreview(null);
  }, []);

  const stopCollectionAutoScroll = useCallback(() => {
    if (collectionAutoScrollFrameRef.current == null) return;
    window.cancelAnimationFrame(collectionAutoScrollFrameRef.current);
    collectionAutoScrollFrameRef.current = null;
  }, []);

  useEffect(
    () => () => {
      collectionDragPreviewCleanupRef.current?.();
      collectionDragPreviewCleanupRef.current = null;
      stopCollectionAutoScroll();
    },
    [stopCollectionAutoScroll],
  );

  const clearNativeCollectionDragPreview = useCallback(() => {
    collectionDragPreviewCleanupRef.current?.();
    collectionDragPreviewCleanupRef.current = null;
  }, []);

  const resetCollectionDragState = useCallback(() => {
    clearCollectionDragPreview();
    clearNativeCollectionDragPreview();
    collectionLastPointerRef.current = null;
    stopCollectionAutoScroll();
    setActiveCollectionDrag(null);
  }, [clearCollectionDragPreview, clearNativeCollectionDragPreview, stopCollectionAutoScroll]);

  const resolveCollectionDropPreview = useCallback(
    (pointer: { x: number; y: number } | null) => {
      const boardNode = collectionBoardNodeRef.current;
      if (!pointer || !boardNode) return null;

      return getCollectionDropPreview({
        activeId: activeCollectionDrag?.collectionId ?? null,
        ids: collectionOrderIds,
        pointer,
        slots: measureCollectionDropSlots(boardNode),
      });
    },
    [activeCollectionDrag?.collectionId, collectionOrderIds],
  );

  const handleCollectionDragStart = useCallback(
    (event: ReactDragEvent<HTMLElement>, collection: CollectionSummary) => {
      clearNativeCollectionDragPreview();
      clearCollectionDragPreview();
      collectionLastPointerRef.current = null;
      stopCollectionAutoScroll();

      const { cleanup, payload } = startCollectionWorkspaceDrag({
        collection,
        dataTransfer: event.dataTransfer,
      });

      collectionDragPreviewCleanupRef.current = cleanup;
      setActiveCollectionDrag({
        kind: 'collection',
        ...payload,
      });
    },
    [clearCollectionDragPreview, clearNativeCollectionDragPreview, stopCollectionAutoScroll],
  );

  const runCollectionAutoScroll = useCallback(() => {
    const boardNode = collectionBoardNodeRef.current;
    const pointer = collectionLastPointerRef.current;
    const scrollTarget = boardNode ? resolveCollectionScrollTarget(boardNode) : null;

    if (!boardNode || !pointer || !scrollTarget) {
      stopCollectionAutoScroll();
      return;
    }

    const delta = getCollectionScrollDelta(pointer.y, scrollTarget.getRect());
    if (delta === 0) {
      stopCollectionAutoScroll();
      return;
    }

    const currentScrollTop = scrollTarget.getScrollTop();
    const maxScrollTop = scrollTarget.getMaxScrollTop();
    const nextScrollTop = Math.max(0, Math.min(currentScrollTop + delta, maxScrollTop));

    if (nextScrollTop === currentScrollTop) {
      stopCollectionAutoScroll();
      return;
    }

    scrollTarget.setScrollTop(nextScrollTop);

    const nextPreview = resolveCollectionDropPreview(pointer);
    setCollectionDropPreview(previous => (isSameCollectionDropPreview(previous, nextPreview) ? previous : nextPreview));

    collectionAutoScrollFrameRef.current = window.requestAnimationFrame(runCollectionAutoScroll);
  }, [resolveCollectionDropPreview, stopCollectionAutoScroll]);

  const ensureCollectionAutoScroll = useCallback(() => {
    if (collectionAutoScrollFrameRef.current != null) return;
    collectionAutoScrollFrameRef.current = window.requestAnimationFrame(runCollectionAutoScroll);
  }, [runCollectionAutoScroll]);

  const handleCollectionBoardDragOver = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      if (!activeCollectionDrag) return;

      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      collectionLastPointerRef.current = {
        x: event.clientX,
        y: event.clientY,
      };

      const nextPreview = resolveCollectionDropPreview(collectionLastPointerRef.current);

      setCollectionDropPreview(previous =>
        isSameCollectionDropPreview(previous, nextPreview) ? previous : nextPreview,
      );

      ensureCollectionAutoScroll();
    },
    [activeCollectionDrag, ensureCollectionAutoScroll, resolveCollectionDropPreview],
  );

  const handleCollectionBoardDragLeave = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      if (!activeCollectionDrag) return;

      const rect = event.currentTarget.getBoundingClientRect();
      const isInsideBoard =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (!isInsideBoard) {
        clearCollectionDragPreview();
        collectionLastPointerRef.current = null;
        stopCollectionAutoScroll();
      }
    },
    [activeCollectionDrag, clearCollectionDragPreview, stopCollectionAutoScroll],
  );

  const handleCollectionBoardDrop = useCallback(
    async (event: ReactDragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (!activeCollectionDrag || !selectedWorkspaceId) return;

      const raw = event.dataTransfer.getData(DND_COLLECTION_MIME);
      const payload = parseCollectionWorkspaceDragPayload(raw) || {
        collectionId: activeCollectionDrag.collectionId,
        title: activeCollectionDrag.title,
        workspaceId: activeCollectionDrag.workspaceId,
      };
      const preview =
        collectionDropPreview ||
        resolveCollectionDropPreview({
          x: event.clientX,
          y: event.clientY,
        });

      if (!preview || payload.workspaceId !== selectedWorkspaceId) return;

      const previousOrderIds = collectionOrderIds;
      const currentIndex = collectionOrderIds.indexOf(payload.collectionId);
      const boundedTargetIndex = Math.max(0, Math.min(preview.targetIndex, collectionOrderIds.length - 1));

      if (currentIndex < 0 || currentIndex === boundedTargetIndex) return;

      const nextOrderIds = moveIdToIndex(collectionOrderIds, payload.collectionId, boundedTargetIndex);
      const finalChildOrderIds = buildFinalChildOrderIds({
        nextCollectionOrderIds: nextOrderIds,
        selectedWorkspaceChildren,
      });

      setCollectionOrderIds(nextOrderIds);

      try {
        suppressBookmarkRefreshRef.current = true;

        for (let index = 0; index < finalChildOrderIds.length; index += 1) {
          const childId = finalChildOrderIds[index];
          if (!childId) continue;

          await moveBookmarkNodeFromUserAction(childId, {
            parentId: selectedWorkspaceId,
            index,
          });
        }

        await refresh();
        setToast('컬렉션 순서를 변경했습니다.');
      } catch (error) {
        console.error(error);
        setCollectionOrderIds(previousOrderIds);
        await refresh();
        setToast('컬렉션 순서를 변경하지 못했습니다.');
      } finally {
        suppressBookmarkRefreshRef.current = false;
      }
    },
    [
      activeCollectionDrag,
      collectionDropPreview,
      collectionOrderIds,
      refresh,
      resolveCollectionDropPreview,
      selectedWorkspaceChildren,
      selectedWorkspaceId,
      setToast,
      suppressBookmarkRefreshRef,
    ],
  );

  return {
    activeCollectionDragId: activeCollectionDrag?.collectionId ?? null,
    clearCollectionDragPreview,
    collectionBoardNodeRef,
    collectionDropPreview,
    handleCollectionBoardDragLeave,
    handleCollectionBoardDragOver,
    handleCollectionBoardDrop,
    handleCollectionDragStart,
    orderedCollections,
    resetCollectionDragState,
  };
};

export { useCollectionDnd };
