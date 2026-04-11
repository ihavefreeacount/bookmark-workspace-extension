import { updateBookmarkNodeFromUserAction } from '@src/lib/bookmark-user-actions';
import { isValidBookmarkUrl } from '@src/lib/new-tab/helpers';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CollectionSummary,
  BookmarkNode,
  AddBookmarkMorphState,
  BookmarkSuccessFlash,
  EditingBookmark,
} from '@src/lib/new-tab/types';
import type { RefObject } from 'react';

type UseBookmarkComposerOptions = {
  collections: CollectionSummary[];
  onBookmarkCreated: (flash: NonNullable<BookmarkSuccessFlash>) => void;
  refresh: () => Promise<void>;
  setToast: (message: string) => void;
  shouldReduceMotion: boolean;
  suppressBookmarkRefreshRef: RefObject<boolean>;
};

const useBookmarkComposer = ({
  collections,
  onBookmarkCreated,
  refresh,
  setToast,
  shouldReduceMotion,
  suppressBookmarkRefreshRef,
}: UseBookmarkComposerOptions) => {
  const [editingBookmark, setEditingBookmark] = useState<EditingBookmark | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingUrl, setEditingUrl] = useState('');
  const [editingBookmarkBusy, setEditingBookmarkBusy] = useState(false);
  const editingTitleRef = useRef<HTMLInputElement | null>(null);
  const editingUrlRef = useRef<HTMLInputElement | null>(null);
  const [addBookmarkMorphState, setAddBookmarkMorphState] = useState<AddBookmarkMorphState | null>(null);
  const addingBookmarkTitleRef = useRef<HTMLInputElement | null>(null);
  const addingBookmarkUrlRef = useRef<HTMLInputElement | null>(null);
  const addingBookmarkFormRef = useRef<HTMLDivElement | null>(null);
  const [addingBookmarkInvalid, setAddingBookmarkInvalid] = useState(false);
  const [addingBookmarkShakeToken, setAddingBookmarkShakeToken] = useState(0);

  const addingBookmarkTitle = addBookmarkMorphState?.draftTitle ?? '';
  const addingBookmarkUrl = addBookmarkMorphState?.draftUrl ?? '';
  const addingBookmarkBusy = addBookmarkMorphState?.phase === 'committing';
  const addingBookmarkEditing = addBookmarkMorphState?.phase === 'editing';
  const addingBookmarkCollectionId = addBookmarkMorphState?.collectionId ?? null;

  useEffect(() => {
    if (!editingBookmark) return;
    requestAnimationFrame(() => {
      editingTitleRef.current?.focus();
      editingTitleRef.current?.select();
    });
  }, [editingBookmark]);

  useEffect(() => {
    if (!addingBookmarkCollectionId || !addingBookmarkEditing) return;
    requestAnimationFrame(() => {
      addingBookmarkTitleRef.current?.focus();
    });
  }, [addingBookmarkCollectionId, addingBookmarkEditing]);

  useEffect(() => {
    if (!addBookmarkMorphState) return;
    if (collections.some(collection => collection.id === addBookmarkMorphState.collectionId)) return;

    setAddBookmarkMorphState(null);
    setAddingBookmarkInvalid(false);
  }, [addBookmarkMorphState, collections]);

  useEffect(() => {
    if (!addingBookmarkInvalid || addingBookmarkShakeToken <= 0) return;

    const target = addingBookmarkFormRef.current;
    if (!target) return;

    target.getAnimations().forEach(animation => animation.cancel());
    target.animate(
      shouldReduceMotion
        ? [
            { transform: 'translateX(0px)' },
            { transform: 'translateX(-6px)' },
            { transform: 'translateX(6px)' },
            { transform: 'translateX(-3px)' },
            { transform: 'translateX(3px)' },
            { transform: 'translateX(0px)' },
          ]
        : [
            { transform: 'translateX(0px)' },
            { transform: 'translateX(-12px)' },
            { transform: 'translateX(12px)' },
            { transform: 'translateX(-9px)' },
            { transform: 'translateX(9px)' },
            { transform: 'translateX(-5px)' },
            { transform: 'translateX(5px)' },
            { transform: 'translateX(0px)' },
          ],
      {
        duration: shouldReduceMotion ? 220 : 340,
        easing: 'cubic-bezier(0.36, 0.07, 0.19, 0.97)',
      },
    );
  }, [addingBookmarkInvalid, addingBookmarkShakeToken, shouldReduceMotion]);

  const startBookmarkEdit = useCallback((bookmark: BookmarkNode, parentId: string, index: number) => {
    if (!bookmark.url) return;

    setEditingBookmark({
      id: bookmark.id,
      parentId,
      index,
      originalTitle: bookmark.title || '',
      originalUrl: bookmark.url,
    });
    setEditingTitle(bookmark.title || '');
    setEditingUrl(bookmark.url);
  }, []);

  const cancelBookmarkEdit = useCallback(() => {
    setEditingBookmark(null);
    setEditingTitle('');
    setEditingUrl('');
    setEditingBookmarkBusy(false);
  }, []);

  const saveBookmarkEdit = useCallback(async () => {
    if (!editingBookmark || editingBookmarkBusy) return;

    const nextTitle = editingTitle.trim();
    const nextUrl = editingUrl.trim();

    if (!nextUrl) {
      cancelBookmarkEdit();
      return;
    }

    if (nextTitle === editingBookmark.originalTitle && nextUrl === editingBookmark.originalUrl) {
      cancelBookmarkEdit();
      return;
    }

    setEditingBookmarkBusy(true);
    await updateBookmarkNodeFromUserAction(editingBookmark.id, {
      title: nextTitle || nextUrl,
      url: nextUrl,
    });
    await refresh();
    cancelBookmarkEdit();
    setToast('북마크를 수정했습니다.');
  }, [cancelBookmarkEdit, editingBookmark, editingBookmarkBusy, editingTitle, editingUrl, refresh, setToast]);

  const updateAddBookmarkDraft = useCallback(
    (patch: Partial<Pick<AddBookmarkMorphState, 'draftTitle' | 'draftUrl'>>) => {
      if (addingBookmarkInvalid) {
        setAddingBookmarkInvalid(false);
      }

      setAddBookmarkMorphState(previous => {
        if (!previous || previous.phase !== 'editing') return previous;
        return { ...previous, ...patch };
      });
    },
    [addingBookmarkInvalid],
  );

  const openBookmarkInlineInput = useCallback((collectionId: string) => {
    setAddBookmarkMorphState({
      collectionId,
      draftTitle: '',
      draftUrl: '',
      phase: 'editing',
    });
    setAddingBookmarkInvalid(false);
  }, []);

  const closeBookmarkInlineInput = useCallback(() => {
    setAddBookmarkMorphState(null);
    setAddingBookmarkInvalid(false);
  }, []);

  const submitBookmarkInlineInput = useCallback(async () => {
    if (!addBookmarkMorphState || addBookmarkMorphState.phase !== 'editing') return;

    const nextTitle = addBookmarkMorphState.draftTitle.trim();
    const nextUrl = addBookmarkMorphState.draftUrl.trim();

    if (!nextTitle && !nextUrl) {
      closeBookmarkInlineInput();
      return;
    }

    if (!isValidBookmarkUrl(nextUrl)) {
      setAddingBookmarkInvalid(true);
      setAddingBookmarkShakeToken(previous => previous + 1);
      setToast('유효한 URL을 입력해 주세요.');
      return;
    }

    setAddingBookmarkInvalid(false);
    const targetCollectionId = addBookmarkMorphState.collectionId;
    suppressBookmarkRefreshRef.current = true;

    setAddBookmarkMorphState(previous => {
      if (!previous || previous.collectionId !== targetCollectionId) return previous;
      return {
        ...previous,
        draftTitle: nextTitle,
        draftUrl: nextUrl,
        phase: 'committing',
      };
    });

    try {
      const created = await chrome.bookmarks.create({
        parentId: targetCollectionId,
        title: nextTitle || nextUrl,
        url: nextUrl,
      });
      await refresh();
      onBookmarkCreated({
        bookmarkId: created.id,
        collectionId: targetCollectionId,
        source: 'inline-add',
      });
      setAddBookmarkMorphState(null);
      setToast('북마크를 추가했습니다.');
    } catch (error) {
      console.error(error);
      setAddBookmarkMorphState({
        collectionId: targetCollectionId,
        draftTitle: nextTitle,
        draftUrl: nextUrl,
        phase: 'editing',
      });
      setToast('북마크를 추가하지 못했습니다.');
    } finally {
      suppressBookmarkRefreshRef.current = false;
    }
  }, [
    addBookmarkMorphState,
    closeBookmarkInlineInput,
    onBookmarkCreated,
    refresh,
    setToast,
    suppressBookmarkRefreshRef,
  ]);

  return {
    addBookmarkMorphState,
    addingBookmarkBusy,
    addingBookmarkCollectionId,
    addingBookmarkEditing,
    addingBookmarkFormRef,
    addingBookmarkInvalid,
    addingBookmarkTitle,
    addingBookmarkTitleRef,
    addingBookmarkUrl,
    addingBookmarkUrlRef,
    cancelBookmarkEdit,
    closeBookmarkInlineInput,
    editingBookmark,
    editingBookmarkBusy,
    editingTitle,
    editingTitleRef,
    editingUrl,
    editingUrlRef,
    openBookmarkInlineInput,
    saveBookmarkEdit,
    setEditingTitle,
    setEditingUrl,
    startBookmarkEdit,
    submitBookmarkInlineInput,
    updateAddBookmarkDraft,
  };
};

export { useBookmarkComposer };
