import { getDomain } from '@src/lib/favicon-resolver';
import { DND_TAB_MIME } from '@src/lib/new-tab/helpers';
import type { BookmarkDropPreview } from '@src/lib/new-tab/types';

type NativeTabPreviewCleanup = () => void;

type TabCollectionDragPayload = {
  title?: string;
  url?: string;
  favIconUrl?: string;
};

type TabCollectionDragDataTransfer = Pick<DataTransfer, 'clearData' | 'setData' | 'setDragImage'> & {
  effectAllowed: DataTransfer['effectAllowed'];
};

const TAB_DRAG_PREVIEW_POINTER_OFFSET = { x: 18, y: 18 } as const;

const createTabCollectionDragPayload = ({
  favIconUrl,
  title,
  url,
}: Pick<chrome.tabs.Tab, 'favIconUrl' | 'title' | 'url'>): TabCollectionDragPayload => ({
  ...(typeof title === 'string' ? { title } : {}),
  ...(typeof url === 'string' ? { url } : {}),
  ...(typeof favIconUrl === 'string' ? { favIconUrl } : {}),
});

const createBookmarkLikeDragPreviewNode = ({
  document: doc,
  domain,
  title,
}: {
  document: Document;
  domain: string;
  title: string;
}) => {
  const preview = doc.createElement('div');
  preview.className = 'bookmark-drag-avatar';
  preview.setAttribute('aria-hidden', 'true');
  preview.style.position = 'fixed';
  preview.style.top = '-10000px';
  preview.style.left = '-10000px';
  preview.style.pointerEvents = 'none';

  const previewTitle = doc.createElement('div');
  previewTitle.className = 'bookmark-drag-avatar-title';
  previewTitle.textContent = title.trim() || 'Untitled';

  const previewDomain = doc.createElement('div');
  previewDomain.className = 'bookmark-drag-avatar-domain';
  previewDomain.textContent = domain;

  preview.append(previewTitle, previewDomain);

  return preview;
};

const attachTabDragPreview = ({
  dataTransfer,
  document: doc = globalThis.document,
  payload,
}: {
  dataTransfer: Pick<DataTransfer, 'setDragImage'>;
  document?: Document | null;
  payload: TabCollectionDragPayload;
}): NativeTabPreviewCleanup => {
  if (!doc?.body) return () => undefined;

  const preview = createBookmarkLikeDragPreviewNode({
    document: doc,
    domain: getDomain(payload.url),
    title: payload.title || payload.url || 'Untitled',
  });

  doc.body.appendChild(preview);
  dataTransfer.setDragImage(preview, TAB_DRAG_PREVIEW_POINTER_OFFSET.x, TAB_DRAG_PREVIEW_POINTER_OFFSET.y);

  return () => {
    preview.remove();
  };
};

const startTabCollectionDrag = ({
  dataTransfer,
  document: doc = globalThis.document,
  tab,
}: {
  dataTransfer: TabCollectionDragDataTransfer;
  document?: Document | null;
  tab: Pick<chrome.tabs.Tab, 'favIconUrl' | 'title' | 'url'>;
}) => {
  const payload = createTabCollectionDragPayload(tab);
  const cleanup = attachTabDragPreview({
    dataTransfer,
    document: doc,
    payload,
  });

  dataTransfer.clearData();
  dataTransfer.effectAllowed = 'copy';
  dataTransfer.setData(DND_TAB_MIME, JSON.stringify(payload));

  return {
    cleanup,
    payload,
  };
};

const parseTabCollectionDragPayload = (raw: string): TabCollectionDragPayload | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<TabCollectionDragPayload>;

    if (
      ('title' in parsed && typeof parsed.title !== 'string') ||
      ('url' in parsed && typeof parsed.url !== 'string') ||
      ('favIconUrl' in parsed && typeof parsed.favIconUrl !== 'string')
    ) {
      return null;
    }

    return {
      ...(typeof parsed.title === 'string' ? { title: parsed.title } : {}),
      ...(typeof parsed.url === 'string' ? { url: parsed.url } : {}),
      ...(typeof parsed.favIconUrl === 'string' ? { favIconUrl: parsed.favIconUrl } : {}),
    };
  } catch {
    return null;
  }
};

const createBookmarkInputFromTabDrop = ({
  payload,
  preview,
}: {
  payload: TabCollectionDragPayload & { url: string };
  preview: BookmarkDropPreview;
}): chrome.bookmarks.CreateDetails => ({
  index: preview.targetIndex,
  parentId: preview.collectionId,
  title: payload.title || payload.url,
  url: payload.url,
});

const saveDroppedTabBookmark = async ({
  createBookmark,
  payload,
  preview,
  refresh,
  rememberFavicon,
  reportError = console.error,
  setToast,
}: {
  createBookmark: (input: chrome.bookmarks.CreateDetails) => Promise<chrome.bookmarks.BookmarkTreeNode>;
  payload: TabCollectionDragPayload & { url: string };
  preview: BookmarkDropPreview;
  refresh: () => Promise<void>;
  rememberFavicon: (url: string, faviconUrl: string) => void;
  reportError?: (error: unknown) => void;
  setToast: (message: string) => void;
}) => {
  try {
    await createBookmark(
      createBookmarkInputFromTabDrop({
        payload,
        preview,
      }),
    );

    if (payload.favIconUrl) {
      rememberFavicon(payload.url, payload.favIconUrl);
    }

    await refresh();
    setToast('북마크를 저장했습니다.');
    return true;
  } catch (error) {
    reportError(error);
    await refresh();
    setToast('북마크를 저장하지 못했습니다.');
    return false;
  }
};

export {
  attachTabDragPreview,
  createBookmarkInputFromTabDrop,
  createBookmarkLikeDragPreviewNode,
  createTabCollectionDragPayload,
  parseTabCollectionDragPayload,
  saveDroppedTabBookmark,
  startTabCollectionDrag,
};
export type { TabCollectionDragPayload };
