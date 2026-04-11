// @vitest-environment jsdom

import { DND_TAB_MIME } from '@src/lib/new-tab/helpers';
import {
  createBookmarkInputFromTabDrop,
  parseTabCollectionDragPayload,
  saveDroppedTabBookmark,
  startTabCollectionDrag,
} from '@src/lib/new-tab/tab-collection-drag';
import { describe, expect, it, vi } from 'vitest';

describe('tab collection drag helpers', () => {
  it('configures a native tab drag payload as a copy interaction', () => {
    const clearData = vi.fn();
    const setData = vi.fn();
    const setDragImage = vi.fn();
    const dataTransfer = {
      clearData,
      effectAllowed: 'all' as DataTransfer['effectAllowed'],
      setData,
      setDragImage,
    };

    const { cleanup, payload } = startTabCollectionDrag({
      dataTransfer,
      document,
      tab: {
        favIconUrl: 'https://alpha.test/favicon.ico',
        title: 'Alpha',
        url: 'https://alpha.test',
      },
    });

    expect(payload).toEqual({
      favIconUrl: 'https://alpha.test/favicon.ico',
      title: 'Alpha',
      url: 'https://alpha.test',
    });
    expect(clearData).toHaveBeenCalledTimes(1);
    expect(dataTransfer.effectAllowed).toBe('copy');
    expect(setData).toHaveBeenCalledTimes(1);
    expect(setData.mock.calls[0]?.[0]).toBe(DND_TAB_MIME);
    expect(JSON.parse(setData.mock.calls[0]?.[1] as string)).toEqual({
      favIconUrl: 'https://alpha.test/favicon.ico',
      title: 'Alpha',
      url: 'https://alpha.test',
    });
    const previewNode = document.body.querySelector('.bookmark-drag-avatar');
    expect(previewNode).not.toBeNull();
    expect(previewNode?.querySelector('.bookmark-drag-avatar-title')?.textContent).toBe('Alpha');
    expect(previewNode?.querySelector('.bookmark-drag-avatar-domain')?.textContent).toBe('alpha.test');
    expect(setDragImage).toHaveBeenCalledWith(previewNode, 18, 18);

    cleanup();

    expect(document.body.querySelector('.bookmark-drag-avatar')).toBeNull();
  });

  it('returns null for malformed tab drag payloads', () => {
    expect(parseTabCollectionDragPayload('not json')).toBeNull();
    expect(parseTabCollectionDragPayload(JSON.stringify({ url: 123 }))).toBeNull();
  });

  it('builds bookmark create input from the resolved drop preview', () => {
    expect(
      createBookmarkInputFromTabDrop({
        payload: {
          title: 'Alpha',
          url: 'https://alpha.test',
        },
        preview: {
          kind: 'slot',
          collectionId: 'collection-1',
          targetIndex: 2,
          renderId: 'bookmark-2',
          side: 'right',
        },
      }),
    ).toEqual({
      index: 2,
      parentId: 'collection-1',
      title: 'Alpha',
      url: 'https://alpha.test',
    });
  });

  it('refreshes, remembers favicon metadata, and reports success after saving a dropped tab', async () => {
    const createBookmark = vi.fn().mockResolvedValue({ id: 'bookmark-3' });
    const refresh = vi.fn().mockResolvedValue(undefined);
    const rememberFavicon = vi.fn();
    const setToast = vi.fn();

    const saved = await saveDroppedTabBookmark({
      createBookmark,
      payload: {
        favIconUrl: 'https://alpha.test/favicon.ico',
        title: 'Alpha',
        url: 'https://alpha.test',
      },
      preview: {
        kind: 'slot',
        collectionId: 'collection-1',
        targetIndex: 1,
        renderId: 'bookmark-1',
        side: 'right',
      },
      refresh,
      rememberFavicon,
      setToast,
    });

    expect(saved).toEqual({
      bookmarkId: 'bookmark-3',
      collectionId: 'collection-1',
    });
    expect(createBookmark).toHaveBeenCalledWith({
      index: 1,
      parentId: 'collection-1',
      title: 'Alpha',
      url: 'https://alpha.test',
    });
    expect(rememberFavicon).toHaveBeenCalledWith('https://alpha.test', 'https://alpha.test/favicon.ico');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(setToast).toHaveBeenCalledWith('북마크를 저장했습니다.');
  });

  it('refreshes and reports failure when saving a dropped tab fails', async () => {
    const error = new Error('save failed');
    const createBookmark = vi.fn().mockRejectedValue(error);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const rememberFavicon = vi.fn();
    const reportError = vi.fn();
    const setToast = vi.fn();

    const saved = await saveDroppedTabBookmark({
      createBookmark,
      payload: {
        title: 'Alpha',
        url: 'https://alpha.test',
      },
      preview: {
        kind: 'empty-collection',
        collectionId: 'collection-2',
        targetIndex: 0,
        renderId: null,
        side: null,
      },
      refresh,
      rememberFavicon,
      reportError,
      setToast,
    });

    expect(saved).toBeNull();
    expect(reportError).toHaveBeenCalledWith(error);
    expect(rememberFavicon).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(setToast).toHaveBeenCalledWith('북마크를 저장하지 못했습니다.');
  });
});
