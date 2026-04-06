import { DND_COLLECTION_MIME } from '@src/lib/new-tab/helpers';
import type { CollectionSummary, CollectionWorkspaceDragPayload } from '@src/lib/new-tab/types';

type NativeCollectionPreviewCleanup = () => void;

type CollectionDragImageDataTransfer = Pick<DataTransfer, 'clearData' | 'setData' | 'setDragImage'> & {
  effectAllowed: DataTransfer['effectAllowed'];
};

const COLLECTION_DRAG_PREVIEW_POINTER_OFFSET = { x: 18, y: 18 } as const;

const createCollectionWorkspaceDragPayload = (
  collection: Pick<CollectionSummary, 'id' | 'title' | 'workspaceId'>,
): CollectionWorkspaceDragPayload => ({
  collectionId: collection.id,
  title: collection.title,
  workspaceId: collection.workspaceId,
});

const createCollectionDragPreviewNode = (title: string, doc: Document) => {
  const preview = doc.createElement('div');
  preview.className = 'collection-drag-preview';
  preview.setAttribute('aria-hidden', 'true');
  preview.style.position = 'fixed';
  preview.style.top = '-10000px';
  preview.style.left = '-10000px';
  preview.style.pointerEvents = 'none';

  const previewTitle = doc.createElement('div');
  previewTitle.className = 'collection-drag-preview-title';
  previewTitle.textContent = title.trim() || 'Untitled';

  preview.appendChild(previewTitle);

  return preview;
};

const attachCollectionDragPreview = ({
  dataTransfer,
  document: doc = globalThis.document,
  title,
}: {
  dataTransfer: Pick<DataTransfer, 'setDragImage'>;
  document?: Document | null;
  title: string;
}): NativeCollectionPreviewCleanup => {
  if (!doc?.body) return () => undefined;

  const preview = createCollectionDragPreviewNode(title, doc);
  doc.body.appendChild(preview);
  dataTransfer.setDragImage(
    preview,
    COLLECTION_DRAG_PREVIEW_POINTER_OFFSET.x,
    COLLECTION_DRAG_PREVIEW_POINTER_OFFSET.y,
  );

  return () => {
    preview.remove();
  };
};

const startCollectionWorkspaceDrag = ({
  collection,
  dataTransfer,
  document: doc = globalThis.document,
}: {
  collection: Pick<CollectionSummary, 'id' | 'title' | 'workspaceId'>;
  dataTransfer: CollectionDragImageDataTransfer;
  document?: Document | null;
}) => {
  const payload = createCollectionWorkspaceDragPayload(collection);
  const cleanup = attachCollectionDragPreview({
    dataTransfer,
    document: doc,
    title: payload.title,
  });

  dataTransfer.clearData();
  dataTransfer.effectAllowed = 'move';
  dataTransfer.setData(DND_COLLECTION_MIME, JSON.stringify(payload));

  return {
    cleanup,
    payload,
  };
};

const parseCollectionWorkspaceDragPayload = (raw: string): CollectionWorkspaceDragPayload | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<CollectionWorkspaceDragPayload>;
    if (
      typeof parsed.collectionId !== 'string' ||
      typeof parsed.workspaceId !== 'string' ||
      typeof parsed.title !== 'string'
    ) {
      return null;
    }

    return {
      collectionId: parsed.collectionId,
      title: parsed.title,
      workspaceId: parsed.workspaceId,
    };
  } catch {
    return null;
  }
};

export {
  attachCollectionDragPreview,
  createCollectionWorkspaceDragPayload,
  parseCollectionWorkspaceDragPayload,
  startCollectionWorkspaceDrag,
};
export type { CollectionWorkspaceDragPayload };
