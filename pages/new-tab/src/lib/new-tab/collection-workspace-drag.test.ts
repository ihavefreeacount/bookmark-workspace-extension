// @vitest-environment jsdom

import {
  parseCollectionWorkspaceDragPayload,
  startCollectionWorkspaceDrag,
} from '@src/lib/new-tab/collection-workspace-drag';
import { DND_COLLECTION_MIME } from '@src/lib/new-tab/helpers';
import { describe, expect, it, vi } from 'vitest';

describe('collection workspace drag helpers', () => {
  it('configures native drag payload and preview, then cleans up the preview node', () => {
    const clearData = vi.fn();
    const setData = vi.fn();
    const setDragImage = vi.fn();
    const dataTransfer = {
      clearData,
      effectAllowed: 'all' as DataTransfer['effectAllowed'],
      setData,
      setDragImage,
    };

    const { cleanup, payload } = startCollectionWorkspaceDrag({
      collection: {
        id: 'collection-1',
        title: '읽을거리',
        workspaceId: 'workspace-1',
      },
      dataTransfer,
      document,
    });

    expect(payload).toEqual({
      collectionId: 'collection-1',
      title: '읽을거리',
      workspaceId: 'workspace-1',
    });
    expect(clearData).toHaveBeenCalledTimes(1);
    expect(dataTransfer.effectAllowed).toBe('move');
    expect(setData).toHaveBeenCalledWith(
      DND_COLLECTION_MIME,
      JSON.stringify({
        collectionId: 'collection-1',
        title: '읽을거리',
        workspaceId: 'workspace-1',
      }),
    );

    const previewNode = document.body.querySelector('.collection-drag-preview');
    expect(previewNode).not.toBeNull();
    expect(previewNode?.querySelector('.collection-drag-preview-title')?.textContent).toBe('읽을거리');
    expect(setDragImage).toHaveBeenCalledWith(previewNode, 18, 18);

    cleanup();

    expect(document.body.querySelector('.collection-drag-preview')).toBeNull();
  });

  it('falls back to a safe title for empty collection names', () => {
    const setDragImage = vi.fn();

    const { cleanup } = startCollectionWorkspaceDrag({
      collection: {
        id: 'collection-1',
        title: '   ',
        workspaceId: 'workspace-1',
      },
      dataTransfer: {
        clearData: vi.fn(),
        effectAllowed: 'all',
        setData: vi.fn(),
        setDragImage,
      },
      document,
    });

    expect(document.body.querySelector('.collection-drag-preview-title')?.textContent).toBe('Untitled');

    cleanup();
  });

  it('returns null for malformed collection drag payloads', () => {
    expect(parseCollectionWorkspaceDragPayload('not json')).toBeNull();
    expect(parseCollectionWorkspaceDragPayload(JSON.stringify({ collectionId: 'a' }))).toBeNull();
  });
});
