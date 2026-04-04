type OrderedIdsByCollection = Record<string, string[]>;
type CollectionRectsById = Record<string, SlotRect>;
type PointerCoordinates = {
  x: number;
  y: number;
};

type SlotRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type BookmarkDropIndicatorSide = 'left' | 'right';
type VerticalDropIndicatorSide = 'top' | 'bottom';

type BookmarkDropIndicator = {
  index: number;
  renderId: string;
  side: BookmarkDropIndicatorSide;
};

type VerticalDropIndicator = {
  index: number;
  renderId: string;
  side: VerticalDropIndicatorSide;
};

type CollectionDropPreview =
  | {
      kind: 'slot';
      collectionId: string;
      targetIndex: number;
      renderId: string;
      side: BookmarkDropIndicatorSide;
    }
  | {
      kind: 'empty-collection';
      collectionId: string;
      targetIndex: number;
      renderId: null;
      side: null;
    };

type BookmarkDropSlot = {
  index: number;
  renderId: string;
  side: BookmarkDropIndicatorSide;
  rect: SlotRect;
};

type VerticalDropSlot = {
  index: number;
  renderId: string;
  side: VerticalDropIndicatorSide;
  rect: SlotRect;
};

type VerticalListDropPreview = {
  targetIndex: number;
  renderId: string;
  side: VerticalDropIndicatorSide;
};

type CollectionOrderSource = {
  id: string;
  bookmarkIds: string[];
};

const reconcileOrderIds = (currentIds: readonly string[], nextIds: readonly string[]) => {
  if (!currentIds.length) return [...nextIds];

  const kept = currentIds.filter(id => nextIds.includes(id));
  const added = nextIds.filter(id => !kept.includes(id));
  return [...kept, ...added];
};

const reconcileBookmarkOrders = (
  current: Readonly<OrderedIdsByCollection>,
  collections: readonly CollectionOrderSource[],
) => {
  const next: OrderedIdsByCollection = {};

  for (const collection of collections) {
    next[collection.id] = reconcileOrderIds(current[collection.id] || [], collection.bookmarkIds);
  }

  return next;
};

const orderByIds = <T extends { id: string }>(items: readonly T[], orderIds: readonly string[]) => {
  if (!orderIds.length) return [...items];

  const itemById = new Map(items.map(item => [item.id, item]));
  const kept = orderIds.map(id => itemById.get(id)).filter((item): item is T => !!item);
  const appended = items.filter(item => !orderIds.includes(item.id));
  return [...kept, ...appended];
};

const moveIdToIndex = (ids: readonly string[], activeId: string, targetIndex: number) => {
  const currentIndex = ids.indexOf(activeId);
  if (currentIndex < 0) return [...ids];

  const boundedIndex = Math.max(0, Math.min(targetIndex, ids.length - 1));
  if (currentIndex === boundedIndex) return [...ids];

  const nextIds = [...ids];
  const [movedId] = nextIds.splice(currentIndex, 1);

  if (!movedId) return [...ids];

  nextIds.splice(boundedIndex, 0, movedId);
  return nextIds;
};

const getSlotDistance = (pointer: PointerCoordinates, rect: SlotRect) => {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = pointer.x - centerX;
  const dy = pointer.y - centerY;
  return Math.hypot(dx, dy);
};

const getClosestBookmarkDropIndicator = ({
  slots,
  pointer,
  activeId,
  ids,
}: {
  slots: readonly BookmarkDropSlot[];
  pointer: PointerCoordinates | null;
  activeId: string | null;
  ids: readonly string[];
}): BookmarkDropIndicator | null => {
  if (!pointer || !slots.length) return null;

  let bestSlot: BookmarkDropSlot | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const slot of slots) {
    const distance = getSlotDistance(pointer, slot.rect);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestSlot = slot;
    }
  }

  if (!bestSlot) return null;

  const currentIndex = activeId ? ids.indexOf(activeId) : -1;
  const isSameCollectionMove = currentIndex >= 0;

  const effectiveIndex = isSameCollectionMove && bestSlot.index > currentIndex ? bestSlot.index - 1 : bestSlot.index;

  if (isSameCollectionMove && effectiveIndex === currentIndex) return null;

  return {
    index: effectiveIndex,
    renderId: bestSlot.renderId,
    side: bestSlot.side,
  };
};

const getClosestVerticalDropIndicator = ({
  slots,
  pointer,
  activeId,
  ids,
}: {
  slots: readonly VerticalDropSlot[];
  pointer: PointerCoordinates | null;
  activeId: string | null;
  ids: readonly string[];
}): VerticalDropIndicator | null => {
  if (!pointer || !slots.length) return null;

  let bestSlot: VerticalDropSlot | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const slot of slots) {
    const distance = getSlotDistance(pointer, slot.rect);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestSlot = slot;
    }
  }

  if (!bestSlot) return null;

  const currentIndex = activeId ? ids.indexOf(activeId) : -1;
  const isSameListMove = currentIndex >= 0;
  const effectiveIndex = isSameListMove && bestSlot.index > currentIndex ? bestSlot.index - 1 : bestSlot.index;

  if (isSameListMove && effectiveIndex === currentIndex) return null;

  return {
    index: effectiveIndex,
    renderId: bestSlot.renderId,
    side: bestSlot.side,
  };
};

const getCollectionDropPreview = ({
  activeId = null,
  collectionId,
  ids,
  pointer,
  slots,
}: {
  activeId?: string | null;
  collectionId: string;
  ids: readonly string[];
  pointer: PointerCoordinates | null;
  slots: readonly BookmarkDropSlot[];
}): CollectionDropPreview | null => {
  if (!pointer) return null;

  if (ids.length === 0) {
    return {
      kind: 'empty-collection',
      collectionId,
      targetIndex: 0,
      renderId: null,
      side: null,
    };
  }

  const indicator = getClosestBookmarkDropIndicator({
    slots,
    pointer,
    activeId,
    ids,
  });

  if (!indicator) return null;

  return {
    kind: 'slot',
    collectionId,
    targetIndex: indicator.index,
    renderId: indicator.renderId,
    side: indicator.side,
  };
};

const getCollectionDropPreviewFromPointer = ({
  activeId = null,
  orderedIdsByCollection,
  pointer,
  rects,
  slotsByCollection,
}: {
  activeId?: string | null;
  orderedIdsByCollection: Readonly<OrderedIdsByCollection>;
  pointer: PointerCoordinates | null;
  rects: Readonly<CollectionRectsById>;
  slotsByCollection: (collectionId: string) => readonly BookmarkDropSlot[];
}): CollectionDropPreview | null => {
  const collectionId = getCollectionIdFromPointer({
    pointer,
    rects,
  });

  if (!collectionId) return null;

  return getCollectionDropPreview({
    activeId,
    collectionId,
    ids: orderedIdsByCollection[collectionId] || [],
    pointer,
    slots: slotsByCollection(collectionId),
  });
};

const getCollectionIdFromPointer = ({
  pointer,
  rects,
}: {
  pointer: PointerCoordinates | null;
  rects: Readonly<CollectionRectsById>;
}) => {
  if (!pointer) return null;

  for (const [collectionId, rect] of Object.entries(rects)) {
    const withinHorizontalBounds = pointer.x >= rect.left && pointer.x <= rect.left + rect.width;
    const withinVerticalBounds = pointer.y >= rect.top && pointer.y <= rect.top + rect.height;

    if (withinHorizontalBounds && withinVerticalBounds) {
      return collectionId;
    }
  }

  return null;
};

const getVerticalListDropPreview = ({
  activeId = null,
  ids,
  pointer,
  slots,
}: {
  activeId?: string | null;
  ids: readonly string[];
  pointer: PointerCoordinates | null;
  slots: readonly VerticalDropSlot[];
}): VerticalListDropPreview | null => {
  const indicator = getClosestVerticalDropIndicator({
    slots,
    pointer,
    activeId,
    ids,
  });

  if (!indicator) return null;

  return {
    targetIndex: indicator.index,
    renderId: indicator.renderId,
    side: indicator.side,
  };
};

const moveIdBetweenCollections = ({
  orderedIdsByCollection,
  activeId,
  sourceCollectionId,
  targetCollectionId,
  targetIndex,
}: {
  orderedIdsByCollection: Readonly<OrderedIdsByCollection>;
  activeId: string;
  sourceCollectionId: string;
  targetCollectionId: string;
  targetIndex: number;
}) => {
  if (sourceCollectionId === targetCollectionId) {
    return {
      ...orderedIdsByCollection,
      [sourceCollectionId]: moveIdToIndex(
        orderedIdsByCollection[sourceCollectionId] || [],
        activeId,
        Math.max(0, targetIndex),
      ),
    };
  }

  const sourceIds = [...(orderedIdsByCollection[sourceCollectionId] || [])];
  const targetIds = [...(orderedIdsByCollection[targetCollectionId] || [])];
  const sourceIndex = sourceIds.indexOf(activeId);

  if (sourceIndex < 0) {
    return { ...orderedIdsByCollection };
  }

  sourceIds.splice(sourceIndex, 1);
  const boundedTargetIndex = Math.max(0, Math.min(targetIndex, targetIds.length));
  targetIds.splice(boundedTargetIndex, 0, activeId);

  return {
    ...orderedIdsByCollection,
    [sourceCollectionId]: sourceIds,
    [targetCollectionId]: targetIds,
  };
};

const measureBookmarkDropSlots = (listNode: HTMLElement): BookmarkDropSlot[] => {
  const itemElements = Array.from(listNode.querySelectorAll<HTMLElement>('[data-bookmark-id]'));
  if (!itemElements.length) return [];

  const listRect = listNode.getBoundingClientRect();
  const firstElement = itemElements[0];
  const lastElement = itemElements[itemElements.length - 1];
  const firstRect = firstElement?.getBoundingClientRect();
  const lastRect = lastElement?.getBoundingClientRect();
  const slots: BookmarkDropSlot[] = [];

  if (firstRect && firstElement) {
    slots.push({
      index: 0,
      renderId: firstElement.dataset.bookmarkId || '',
      side: 'left',
      rect: {
        left: listRect.left + 12,
        top: listRect.top,
        width: 8,
        height: Math.max(firstRect.top - listRect.top + firstRect.height, firstRect.height),
      },
    });
  }

  itemElements.forEach((element, index) => {
    const bookmarkId = element.dataset.bookmarkId || '';
    const rect = element.getBoundingClientRect();

    slots.push({
      index,
      renderId: bookmarkId,
      side: 'left',
      rect: {
        left: rect.left - 4,
        top: rect.top,
        width: 8,
        height: rect.height,
      },
    });

    slots.push({
      index: index + 1,
      renderId: bookmarkId,
      side: 'right',
      rect: {
        left: rect.right - 4,
        top: rect.top,
        width: 8,
        height: rect.height,
      },
    });
  });

  if (lastRect && lastElement) {
    slots.push({
      index: itemElements.length,
      renderId: lastElement.dataset.bookmarkId || '',
      side: 'right',
      rect: {
        left: lastRect.right - 4,
        top: lastRect.top,
        width: 8,
        height: Math.max(listRect.bottom - lastRect.top, lastRect.height),
      },
    });
  }

  return slots;
};

const measureVerticalDropSlots = (listNode: HTMLElement, itemSelector = '[data-workspace-id]'): VerticalDropSlot[] => {
  const itemElements = Array.from(listNode.querySelectorAll<HTMLElement>(itemSelector));
  if (!itemElements.length) return [];

  const listRect = listNode.getBoundingClientRect();
  const slots: VerticalDropSlot[] = [];

  itemElements.forEach((element, index) => {
    const renderId = element.dataset.workspaceId || '';
    const rect = element.getBoundingClientRect();
    const previousRect = itemElements[index - 1]?.getBoundingClientRect() ?? null;
    const nextRect = itemElements[index + 1]?.getBoundingClientRect() ?? null;
    const topBoundary = previousRect ? (previousRect.bottom + rect.top) / 2 : listRect.top;
    const bottomBoundary = nextRect ? (rect.bottom + nextRect.top) / 2 : listRect.bottom;
    const middleY = rect.top + rect.height / 2;

    slots.push({
      index,
      renderId,
      side: 'top',
      rect: {
        left: listRect.left,
        top: topBoundary,
        width: listRect.width,
        height: Math.max(middleY - topBoundary, 8),
      },
    });

    slots.push({
      index: index + 1,
      renderId,
      side: 'bottom',
      rect: {
        left: listRect.left,
        top: middleY,
        width: listRect.width,
        height: Math.max(bottomBoundary - middleY, 8),
      },
    });
  });

  return slots;
};

export {
  getClosestBookmarkDropIndicator,
  getClosestVerticalDropIndicator,
  getCollectionDropPreview,
  getCollectionDropPreviewFromPointer,
  getCollectionIdFromPointer,
  getVerticalListDropPreview,
  measureBookmarkDropSlots,
  measureVerticalDropSlots,
  moveIdBetweenCollections,
  moveIdToIndex,
  orderByIds,
  reconcileBookmarkOrders,
  reconcileOrderIds,
};
export type {
  BookmarkDropIndicator,
  BookmarkDropIndicatorSide,
  BookmarkDropSlot,
  CollectionDropPreview,
  CollectionRectsById,
  OrderedIdsByCollection,
  PointerCoordinates,
  SlotRect,
  VerticalDropIndicator,
  VerticalDropIndicatorSide,
  VerticalDropSlot,
  VerticalListDropPreview,
};
