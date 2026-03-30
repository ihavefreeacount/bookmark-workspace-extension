type OrderedIdsByCollection = Record<string, string[]>;
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

type BookmarkDropIndicator = {
  index: number;
  renderId: string;
  side: BookmarkDropIndicatorSide;
};

type BookmarkDropSlot = {
  index: number;
  renderId: string;
  side: BookmarkDropIndicatorSide;
  rect: SlotRect;
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
  activeId: string;
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

  const currentIndex = ids.indexOf(activeId);
  if (currentIndex < 0) return null;

  const effectiveIndex =
    bestSlot.index > currentIndex && bestSlot.side === 'right' ? bestSlot.index - 1 : bestSlot.index;

  if (effectiveIndex === currentIndex) return null;

  return {
    index: bestSlot.index,
    renderId: bestSlot.renderId,
    side: bestSlot.side,
  };
};

export { getClosestBookmarkDropIndicator, moveIdToIndex, orderByIds, reconcileBookmarkOrders, reconcileOrderIds };
export type {
  BookmarkDropIndicator,
  BookmarkDropIndicatorSide,
  BookmarkDropSlot,
  OrderedIdsByCollection,
  PointerCoordinates,
  SlotRect,
};
