import type { PointerCoordinates } from '@src/lib/dnd/sortable-helpers';
import type { BookmarkNode } from '@src/lib/new-tab/types';

const ROOT_FOLDER = 'My Little Bookmark';

const DND_TAB_MIME = 'application/x-bookmark-workspace-tab';
const DND_COLLECTION_MIME = 'application/x-bookmark-workspace-collection';
const LS_SELECTED_SPACE = 'bw:selected-space-id';
const LS_LEFT_COLLAPSED = 'bw:left-collapsed';
const LS_RIGHT_COLLAPSED = 'bw:right-collapsed';
const BOOKMARK_DND_PREFIX = 'bookmark';
const BOOKMARK_DRAG_AVATAR_SIZE = { width: 192, height: 52 } as const;

const isFolder = (node: BookmarkNode) => !node.url;

const getBookmarkDndId = (id: string) => `${BOOKMARK_DND_PREFIX}:${id}`;

const isEventFromBookmarkArea = (target: EventTarget | null) =>
  target instanceof HTMLElement && !!target.closest('.link-list');

const isBookmarkDragOriginExempt = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  !!target.closest(
    'input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-bookmark-drag-origin-exempt]',
  );

const getPointerCoordinates = (event: Event | null | undefined): PointerCoordinates | null => {
  if (!event) return null;

  if ('changedTouches' in event) {
    const changedTouches = (event as TouchEvent).changedTouches;
    if (changedTouches.length === 0) return null;
    const touch = changedTouches[0];
    return { x: touch.clientX, y: touch.clientY };
  }

  if ('touches' in event) {
    const touches = (event as TouchEvent).touches;
    if (touches.length === 0) return null;
    const touch = touches[0];
    return { x: touch.clientX, y: touch.clientY };
  }

  const mouseEvent = event as MouseEvent;
  if (typeof mouseEvent.clientX !== 'number' || typeof mouseEvent.clientY !== 'number') return null;

  return {
    x: mouseEvent.clientX,
    y: mouseEvent.clientY,
  };
};

const getDragPointerCoordinates = (
  origin: PointerCoordinates | null,
  delta: { x: number; y: number },
): PointerCoordinates | null => {
  if (!origin) return null;

  return {
    x: origin.x + delta.x,
    y: origin.y + delta.y,
  };
};

const ensureRootFolder = async () => {
  const nodes = await chrome.bookmarks.search({ title: ROOT_FOLDER });
  const existing = nodes.find(node => !node.url);
  if (existing) return existing.id;

  const created = await chrome.bookmarks.create({ parentId: '1', title: ROOT_FOLDER });
  return created.id;
};

const loadTree = async () => {
  const rootId = await ensureRootFolder();
  const [root] = await chrome.bookmarks.getSubTree(rootId);
  return root;
};

const getPersisted = (key: string) => window.localStorage.getItem(key) || '';

const getPersistedBool = (key: string) => window.localStorage.getItem(key) === '1';

const isValidBookmarkUrl = (value: string) => {
  if (!value) return false;

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export {
  BOOKMARK_DRAG_AVATAR_SIZE,
  DND_COLLECTION_MIME,
  DND_TAB_MIME,
  LS_LEFT_COLLAPSED,
  LS_RIGHT_COLLAPSED,
  LS_SELECTED_SPACE,
  ensureRootFolder,
  getBookmarkDndId,
  getDragPointerCoordinates,
  getPersisted,
  getPersistedBool,
  getPointerCoordinates,
  isBookmarkDragOriginExempt,
  isEventFromBookmarkArea,
  isFolder,
  isValidBookmarkUrl,
  loadTree,
};
