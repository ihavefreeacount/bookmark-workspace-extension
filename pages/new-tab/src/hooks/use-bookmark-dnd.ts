import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { moveBookmarkNodeFromUserAction } from '@src/lib/bookmark-user-actions';
import {
  getCollectionDropPreviewFromPointer,
  measureBookmarkDropSlots,
  moveIdBetweenCollections,
  reconcileBookmarkOrders,
} from '@src/lib/dnd/sortable-helpers';
import { getDomain } from '@src/lib/favicon-resolver';
import {
  BOOKMARK_DRAG_AVATAR_SIZE,
  getDragPointerCoordinates,
  getPointerCoordinates,
  isBookmarkDragOriginExempt,
} from '@src/lib/new-tab/helpers';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEndEvent, DragMoveEvent, DragStartEvent, Modifier } from '@dnd-kit/core';
import type {
  BookmarkDropSlot,
  CollectionRectsById,
  OrderedIdsByCollection,
  PointerCoordinates,
} from '@src/lib/dnd/sortable-helpers';
import type {
  BookmarkDragData,
  BookmarkDragOverlayData,
  BookmarkDropPreview,
  BookmarkNode,
  BookmarkPointerDownOrigin,
  CollectionSummary,
} from '@src/lib/new-tab/types';
import type { PointerEvent as ReactPointerEvent } from 'react';

type UseBookmarkDndOptions = {
  collections: CollectionSummary[];
  clearActiveContext: () => void;
  refresh: () => Promise<void>;
  setToast: (message: string) => void;
};

const BOOKMARK_DRAG_ACTIVATION_DISTANCE = 8;

const useBookmarkDnd = ({ collections, clearActiveContext, refresh, setToast }: UseBookmarkDndOptions) => {
  const [bookmarkOrderIdsByCollection, setBookmarkOrderIdsByCollection] = useState<OrderedIdsByCollection>({});
  const [activeBookmarkDrag, setActiveBookmarkDrag] = useState<BookmarkDragData | null>(null);
  const [bookmarkDropPreview, setBookmarkDropPreview] = useState<BookmarkDropPreview | null>(null);

  const bookmarkCollectionNodesRef = useRef<Record<string, HTMLElement>>({});
  const bookmarkListNodesRef = useRef<Record<string, HTMLUListElement>>({});
  const bookmarkDragPointerOriginRef = useRef<PointerCoordinates | null>(null);
  const bookmarkPointerDownOriginRef = useRef<BookmarkPointerDownOrigin | null>(null);
  const bookmarkCurrentPointerRef = useRef<PointerCoordinates | null>(null);
  const bookmarkPointerTrackingCleanupRef = useRef<(() => void) | null>(null);

  const orderedBookmarkIds = useMemo(
    () =>
      Object.fromEntries(
        collections.map(col => [col.id, bookmarkOrderIdsByCollection[col.id] || col.links.map(link => link.id)]),
      ) as OrderedIdsByCollection,
    [collections, bookmarkOrderIdsByCollection],
  );

  const bookmarkById = useMemo(
    () => new Map(collections.flatMap(col => col.links.map(link => [link.id, link] as const))),
    [collections],
  );

  const orderedBookmarksByCollection = useMemo(
    () =>
      Object.fromEntries(
        collections.map(col => [
          col.id,
          (orderedBookmarkIds[col.id] || [])
            .map(id => bookmarkById.get(id))
            .filter((link): link is BookmarkNode => !!link),
        ]),
      ) as Record<string, BookmarkNode[]>,
    [bookmarkById, collections, orderedBookmarkIds],
  );

  const bookmarkDragOverlayById = useMemo(
    () =>
      new Map(
        collections.flatMap(col =>
          col.links.map(link => [
            link.id,
            {
              title: link.title || link.url || 'Untitled',
              domain: getDomain(link.url),
            } satisfies BookmarkDragOverlayData,
          ]),
        ),
      ),
    [collections],
  );

  const activeBookmarkOverlay =
    activeBookmarkDrag && activeBookmarkDrag.kind === 'bookmark'
      ? bookmarkDragOverlayById.get(activeBookmarkDrag.bookmarkId) || null
      : null;

  useEffect(() => {
    setBookmarkOrderIdsByCollection(prev =>
      reconcileBookmarkOrders(
        prev,
        collections.map(col => ({
          id: col.id,
          bookmarkIds: col.links.map(link => link.id),
        })),
      ),
    );
  }, [collections]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: BOOKMARK_DRAG_ACTIVATION_DISTANCE,
      },
    }),
  );

  const stopBookmarkPointerTracking = useCallback(() => {
    bookmarkPointerTrackingCleanupRef.current?.();
    bookmarkPointerTrackingCleanupRef.current = null;
  }, []);

  const startBookmarkPointerTracking = useCallback(() => {
    stopBookmarkPointerTracking();

    const updatePointer = (event: Event) => {
      const pointer = getPointerCoordinates(event);
      if (pointer) {
        bookmarkCurrentPointerRef.current = pointer;
      }
    };
    const stopTracking = () => stopBookmarkPointerTracking();

    window.addEventListener('pointermove', updatePointer, { capture: true, passive: true });
    window.addEventListener('touchmove', updatePointer, { capture: true, passive: true });
    window.addEventListener('pointerup', stopTracking, { passive: true });
    window.addEventListener('pointercancel', stopTracking, { passive: true });
    window.addEventListener('touchend', stopTracking, { passive: true });
    window.addEventListener('touchcancel', stopTracking, { passive: true });

    bookmarkPointerTrackingCleanupRef.current = () => {
      window.removeEventListener('pointermove', updatePointer, true);
      window.removeEventListener('touchmove', updatePointer, true);
      window.removeEventListener('pointerup', stopTracking);
      window.removeEventListener('pointercancel', stopTracking);
      window.removeEventListener('touchend', stopTracking);
      window.removeEventListener('touchcancel', stopTracking);
    };
  }, [stopBookmarkPointerTracking]);

  useEffect(() => stopBookmarkPointerTracking, [stopBookmarkPointerTracking]);

  const resetBookmarkDragState = useCallback(() => {
    setActiveBookmarkDrag(null);
    setBookmarkDropPreview(null);
    bookmarkDragPointerOriginRef.current = null;
    bookmarkPointerDownOriginRef.current = null;
    bookmarkCurrentPointerRef.current = null;
    stopBookmarkPointerTracking();
  }, [stopBookmarkPointerTracking]);

  const bookmarkOverlayModifier = useCallback<Modifier>(
    ({ active, activeNodeRect, overlayNodeRect, transform, windowRect }) => {
      const data = active?.data.current as BookmarkDragData | undefined;
      const origin = bookmarkDragPointerOriginRef.current;
      const livePointer = bookmarkCurrentPointerRef.current;
      const baseRect = activeNodeRect;

      if (!data || data.kind !== 'bookmark' || !origin || !baseRect) {
        return transform;
      }

      const pointerX = livePointer?.x ?? origin.x + transform.x;
      const pointerY = livePointer?.y ?? origin.y + transform.y;
      const avatarWidth = overlayNodeRect?.width ?? BOOKMARK_DRAG_AVATAR_SIZE.width;
      const avatarHeight = overlayNodeRect?.height ?? BOOKMARK_DRAG_AVATAR_SIZE.height;
      const maxLeft = windowRect ? Math.max(0, windowRect.width - avatarWidth) : pointerX;
      const maxTop = windowRect ? Math.max(0, windowRect.height - avatarHeight) : pointerY;
      const desiredLeft = Math.min(pointerX, maxLeft);
      const desiredTop = Math.min(pointerY, maxTop);

      return {
        ...transform,
        x: desiredLeft - baseRect.left - BOOKMARK_DRAG_ACTIVATION_DISTANCE,
        y: desiredTop - baseRect.top - BOOKMARK_DRAG_ACTIVATION_DISTANCE,
      };
    },
    [],
  );

  const handleBookmarkDragStart = useCallback(
    ({ active, activatorEvent }: DragStartEvent) => {
      const data = active.data.current as BookmarkDragData | undefined;
      if (!data || data.kind !== 'bookmark') return;

      setActiveBookmarkDrag(data);
      setBookmarkDropPreview(null);

      const currentPointer = bookmarkCurrentPointerRef.current;
      const pointerDownOrigin = bookmarkPointerDownOriginRef.current;
      bookmarkDragPointerOriginRef.current =
        currentPointer &&
        pointerDownOrigin?.bookmarkId === data.bookmarkId &&
        pointerDownOrigin.collectionId === data.collectionId
          ? currentPointer
          : getPointerCoordinates(activatorEvent);

      clearActiveContext();
    },
    [clearActiveContext],
  );

  const handleBookmarkDragCancel = useCallback(() => {
    resetBookmarkDragState();
  }, [resetBookmarkDragState]);

  const handleBookmarkPointerDownCapture = useCallback(
    (data: BookmarkDragData, event: ReactPointerEvent<HTMLLIElement>) => {
      if (!event.isPrimary || event.button !== 0) return;
      if (isBookmarkDragOriginExempt(event.target)) return;

      const pointer = {
        x: event.clientX,
        y: event.clientY,
      };

      bookmarkPointerDownOriginRef.current = {
        bookmarkId: data.bookmarkId,
        collectionId: data.collectionId,
        pointer,
      };
      bookmarkCurrentPointerRef.current = pointer;
      startBookmarkPointerTracking();
    },
    [startBookmarkPointerTracking],
  );

  const measureCollectionRects = useCallback((): CollectionRectsById => {
    const entries = Object.entries(bookmarkCollectionNodesRef.current).flatMap(([collectionId, node]) => {
      if (!node) return [];

      const rect = node.getBoundingClientRect();
      return [
        [
          collectionId,
          {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          },
        ] as const,
      ];
    });

    return Object.fromEntries(entries) as CollectionRectsById;
  }, []);

  const measureSlotsForCollection = useCallback((collectionId: string): BookmarkDropSlot[] => {
    const listNode = bookmarkListNodesRef.current[collectionId];
    if (!listNode) return [];

    return measureBookmarkDropSlots(listNode);
  }, []);

  const updateBookmarkDropPreview = useCallback(
    ({ activeData, pointer }: { activeData: BookmarkDragData; pointer: PointerCoordinates | null }) => {
      if (!pointer) {
        setBookmarkDropPreview(null);
        return;
      }

      setBookmarkDropPreview(
        getCollectionDropPreviewFromPointer({
          activeId: activeData.bookmarkId,
          orderedIdsByCollection: orderedBookmarkIds,
          pointer,
          rects: measureCollectionRects(),
          slotsByCollection: measureSlotsForCollection,
        }),
      );
    },
    [measureCollectionRects, measureSlotsForCollection, orderedBookmarkIds],
  );

  const handleBookmarkDragMove = useCallback(
    ({ active, delta }: DragMoveEvent) => {
      const activeData = active.data.current as BookmarkDragData | undefined;
      if (!activeData || activeData.kind !== 'bookmark') {
        setBookmarkDropPreview(null);
        return;
      }

      const pointer =
        bookmarkCurrentPointerRef.current ?? getDragPointerCoordinates(bookmarkDragPointerOriginRef.current, delta);
      updateBookmarkDropPreview({
        activeData,
        pointer,
      });
    },
    [updateBookmarkDropPreview],
  );

  useEffect(() => {
    if (!activeBookmarkDrag) return;

    const handleLayoutChange = () => {
      const pointer = bookmarkCurrentPointerRef.current ?? bookmarkDragPointerOriginRef.current;
      updateBookmarkDropPreview({
        activeData: activeBookmarkDrag,
        pointer,
      });
    };

    window.addEventListener('scroll', handleLayoutChange, { capture: true, passive: true });
    window.addEventListener('resize', handleLayoutChange, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleLayoutChange, true);
      window.removeEventListener('resize', handleLayoutChange);
    };
  }, [activeBookmarkDrag, updateBookmarkDropPreview]);

  const handleBookmarkDragEnd = useCallback(
    async ({ active }: DragEndEvent) => {
      const activeData = active.data.current as BookmarkDragData | undefined;
      const preview = bookmarkDropPreview;
      const previousOrderIdsByCollection = orderedBookmarkIds;

      resetBookmarkDragState();

      if (!activeData || activeData.kind !== 'bookmark') return;
      if (!preview) return;

      const sourceCollectionId = activeData.collectionId;
      const targetCollectionId = preview.collectionId;
      const sourceOrderIds = orderedBookmarkIds[sourceCollectionId] || [];
      const targetOrderIds = orderedBookmarkIds[targetCollectionId] || [];
      const currentIndex = sourceOrderIds.indexOf(activeData.bookmarkId);
      const isSameCollectionMove = sourceCollectionId === targetCollectionId;

      if (currentIndex < 0) return;

      const boundedTargetIndex = isSameCollectionMove
        ? Math.max(0, Math.min(preview.targetIndex, sourceOrderIds.length - 1))
        : Math.max(0, Math.min(preview.targetIndex, targetOrderIds.length));

      if (isSameCollectionMove && currentIndex === boundedTargetIndex) return;

      const nextOrderIdsByCollection = moveIdBetweenCollections({
        orderedIdsByCollection: orderedBookmarkIds,
        activeId: activeData.bookmarkId,
        sourceCollectionId,
        targetCollectionId,
        targetIndex: boundedTargetIndex,
      });
      const resolvedIndex = nextOrderIdsByCollection[targetCollectionId]?.indexOf(activeData.bookmarkId) ?? -1;

      if (resolvedIndex < 0) return;

      setBookmarkOrderIdsByCollection(nextOrderIdsByCollection);

      try {
        await moveBookmarkNodeFromUserAction(activeData.bookmarkId, {
          parentId: targetCollectionId,
          index: resolvedIndex,
        });
        await refresh();
        setToast(isSameCollectionMove ? '북마크 순서를 변경했습니다.' : '북마크를 이동했습니다.');
      } catch (error) {
        console.error(error);
        setBookmarkOrderIdsByCollection(previousOrderIdsByCollection);
        await refresh();
        setToast(isSameCollectionMove ? '북마크 순서를 변경하지 못했습니다.' : '북마크를 이동하지 못했습니다.');
      }
    },
    [bookmarkDropPreview, orderedBookmarkIds, refresh, resetBookmarkDragState, setToast],
  );

  return {
    activeBookmarkDragId: activeBookmarkDrag?.bookmarkId ?? null,
    activeBookmarkDragCollectionId: activeBookmarkDrag?.collectionId ?? null,
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
};

export { useBookmarkDnd };
