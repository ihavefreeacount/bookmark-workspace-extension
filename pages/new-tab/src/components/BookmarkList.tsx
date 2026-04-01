import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { BookmarkDropLine, SortableBookmarkItem } from '@src/components/BookmarkDnd';
import { getDomain, getFallbackFavicon, rememberFavicon } from '@src/lib/favicon-resolver';
import { getBookmarkDndId } from '@src/lib/new-tab/helpers';
import { Link2, Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type {
  BookmarkDndController,
  BookmarkEditingController,
  BookmarkInlineAddController,
} from '@src/lib/new-tab/collections-board-types';
import type { ActiveContext, BookmarkNode, CollectionSummary } from '@src/lib/new-tab/types';
import type { Dispatch, SetStateAction } from 'react';

type BookmarkListProps = {
  activeContext: ActiveContext;
  bookmarkDnd: BookmarkDndController;
  bookmarkEditing: BookmarkEditingController;
  bookmarkInlineAdd: BookmarkInlineAddController;
  collection: CollectionSummary;
  disableOtherCollections: boolean;
  onCopyLink: (url?: string) => Promise<void> | void;
  onFaviconError: (bookmark: BookmarkNode) => void;
  onGetFaviconSrc: (bookmark: BookmarkNode) => string;
  onOpenLink: (url?: string) => Promise<void> | void;
  onRequestDeleteBookmark: (bookmark: BookmarkNode) => void;
  setActiveContext: Dispatch<SetStateAction<ActiveContext>>;
  shouldReduceMotion: boolean;
};

const setScopedContextState =
  (setActiveContext: Dispatch<SetStateAction<ActiveContext>>, nextContext: Exclude<ActiveContext, null>) =>
  (open: boolean) =>
    setActiveContext(previous =>
      open ? nextContext : previous?.kind === nextContext.kind && previous.id === nextContext.id ? null : previous,
    );

const BookmarkList = ({
  activeContext,
  bookmarkDnd,
  bookmarkEditing,
  bookmarkInlineAdd,
  collection,
  disableOtherCollections,
  onCopyLink,
  onFaviconError,
  onGetFaviconSrc,
  onOpenLink,
  onRequestDeleteBookmark,
  setActiveContext,
  shouldReduceMotion,
}: BookmarkListProps) => {
  const { bookmarkDropPreview, bookmarkListNodesRef, handleBookmarkPointerDownCapture, orderedBookmarksByCollection } =
    bookmarkDnd;
  const {
    editingBookmark,
    editingBookmarkBusy,
    editingTitle,
    editingTitleRef,
    editingUrl,
    editingUrlRef,
    onCancelBookmarkEdit,
    onSaveBookmarkEdit,
    onSetEditingTitle,
    onSetEditingUrl,
    onStartBookmarkEdit,
  } = bookmarkEditing;
  const {
    addBookmarkMorphState,
    addingBookmarkBusy,
    addingBookmarkFormRef,
    addingBookmarkInvalid,
    addingBookmarkTitle,
    addingBookmarkTitleRef,
    addingBookmarkUrl,
    addingBookmarkUrlRef,
    onCloseBookmarkInlineInput,
    onOpenBookmarkInlineInput,
    onSubmitBookmarkInlineInput,
    onUpdateAddBookmarkDraft,
    recentlyCreatedBookmark,
  } = bookmarkInlineAdd;

  const addStateForCollection = addBookmarkMorphState?.collectionId === collection.id ? addBookmarkMorphState : null;
  const addPendingTitle = addStateForCollection?.draftTitle.trim() || addStateForCollection?.draftUrl || '새 북마크';
  const addPendingDomain = getDomain(addStateForCollection?.draftUrl);
  const visibleLinks = orderedBookmarksByCollection[collection.id] || collection.links;

  return (
    <SortableContext items={visibleLinks.map(link => getBookmarkDndId(link.id))} strategy={rectSortingStrategy}>
      <ul
        className="link-list"
        ref={node => {
          if (!node) {
            delete bookmarkListNodesRef.current[collection.id];
            return;
          }

          bookmarkListNodesRef.current[collection.id] = node;
        }}>
        <AnimatePresence initial={false}>
          {visibleLinks.map((link, linkIndex) => {
            const icon = onGetFaviconSrc(link);
            const isEditing = editingBookmark?.id === link.id;
            const isFallbackIcon = icon === getFallbackFavicon();
            const isNewlyAdded =
              recentlyCreatedBookmark?.collectionId === collection.id && recentlyCreatedBookmark.bookmarkId === link.id;
            const linkTitle = link.title || link.url || 'Untitled';
            const linkDomain = getDomain(link.url);
            const showLeftPreview =
              bookmarkDropPreview?.kind === 'slot' &&
              bookmarkDropPreview?.collectionId === collection.id &&
              bookmarkDropPreview.renderId === link.id &&
              bookmarkDropPreview.side === 'left';
            const showRightPreview =
              bookmarkDropPreview?.kind === 'slot' &&
              bookmarkDropPreview?.collectionId === collection.id &&
              bookmarkDropPreview.renderId === link.id &&
              bookmarkDropPreview.side === 'right';

            return (
              <SortableBookmarkItem
                key={link.id}
                id={getBookmarkDndId(link.id)}
                data={{
                  kind: 'bookmark',
                  bookmarkId: link.id,
                  collectionId: collection.id,
                }}
                className="bookmark-sortable-item"
                disabled={isEditing || disableOtherCollections}
                onPointerDownCapture={event =>
                  handleBookmarkPointerDownCapture(
                    {
                      kind: 'bookmark',
                      bookmarkId: link.id,
                      collectionId: collection.id,
                    },
                    event,
                  )
                }
                motionProps={{
                  'data-bookmark-id': link.id,
                  'data-collection-id': collection.id,
                  initial: isNewlyAdded ? (shouldReduceMotion ? false : { opacity: 0, y: 14 }) : false,
                  animate: shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 },
                  exit: shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 },
                  transition: isNewlyAdded
                    ? shouldReduceMotion
                      ? { duration: 0.01 }
                      : { duration: 0.28, ease: 'easeOut' }
                    : shouldReduceMotion
                      ? { duration: 0.01 }
                      : { duration: 0.16, ease: 'easeOut' },
                }}>
                {showLeftPreview && <BookmarkDropLine side="left" />}
                <ContextMenu.Root
                  modal={false}
                  onOpenChange={setScopedContextState(setActiveContext, {
                    kind: 'bookmark',
                    id: link.id,
                  })}>
                  <ContextMenu.Trigger asChild>
                    {isEditing ? (
                      <div className="bookmark-item is-editing">
                        {isFallbackIcon ? (
                          <span className="fav-fallback" aria-hidden>
                            <Link2 size={14} />
                          </span>
                        ) : (
                          <img
                            className="fav"
                            src={icon}
                            alt=""
                            draggable={false}
                            onError={() => onFaviconError(link)}
                            onLoad={event => rememberFavicon(link.url, (event.currentTarget as HTMLImageElement).src)}
                          />
                        )}
                        <span className="link-main">
                          <input
                            ref={editingTitleRef}
                            className="bookmark-edit-input title"
                            value={editingTitle}
                            onChange={event => onSetEditingTitle(event.currentTarget.value)}
                            onKeyDown={event => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                void onSaveBookmarkEdit();
                              } else if (event.key === 'Escape') {
                                event.preventDefault();
                                onCancelBookmarkEdit();
                              }
                            }}
                            onBlur={() => {
                              setTimeout(() => {
                                const activeElement = document.activeElement;
                                if (
                                  activeElement === editingTitleRef.current ||
                                  activeElement === editingUrlRef.current
                                )
                                  return;
                                void onSaveBookmarkEdit();
                              }, 0);
                            }}
                            onPointerDown={event => event.stopPropagation()}
                            placeholder="제목"
                            disabled={editingBookmarkBusy}
                          />
                          <input
                            ref={editingUrlRef}
                            className="bookmark-edit-input url"
                            value={editingUrl}
                            onChange={event => onSetEditingUrl(event.currentTarget.value)}
                            onKeyDown={event => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                void onSaveBookmarkEdit();
                              } else if (event.key === 'Escape') {
                                event.preventDefault();
                                onCancelBookmarkEdit();
                              }
                            }}
                            onBlur={() => {
                              setTimeout(() => {
                                const activeElement = document.activeElement;
                                if (
                                  activeElement === editingTitleRef.current ||
                                  activeElement === editingUrlRef.current
                                )
                                  return;
                                void onSaveBookmarkEdit();
                              }, 0);
                            }}
                            onPointerDown={event => event.stopPropagation()}
                            placeholder="https://"
                            disabled={editingBookmarkBusy}
                          />
                        </span>
                      </div>
                    ) : (
                      <motion.button
                        className={`link-row ${
                          activeContext?.kind === 'bookmark' && activeContext.id === link.id ? 'context-active' : ''
                        }`}
                        draggable={false}
                        onClick={() => {
                          void onOpenLink(link.url);
                        }}
                        title={link.url || ''}>
                        <motion.span className="bookmark-icon-shell">
                          <AnimatePresence initial={false} mode="wait">
                            {isFallbackIcon ? (
                              <motion.span
                                key="fallback"
                                className="fav-fallback bookmark-icon-layer"
                                aria-hidden
                                initial={shouldReduceMotion ? false : { opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0 }}
                                transition={{ duration: shouldReduceMotion ? 0.01 : 0.14 }}>
                                <Link2 size={14} />
                              </motion.span>
                            ) : (
                              <motion.img
                                key={icon}
                                className="fav bookmark-icon-layer"
                                src={icon}
                                alt=""
                                draggable={false}
                                onError={() => onFaviconError(link)}
                                onLoad={event =>
                                  rememberFavicon(link.url, (event.currentTarget as HTMLImageElement).src)
                                }
                                initial={shouldReduceMotion ? false : { opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0 }}
                                transition={{ duration: shouldReduceMotion ? 0.01 : 0.2 }}
                              />
                            )}
                          </AnimatePresence>
                        </motion.span>
                        <motion.span className="link-main">
                          <motion.span className="link-title">{linkTitle}</motion.span>
                          <motion.span className="link-domain">{linkDomain}</motion.span>
                        </motion.span>
                      </motion.button>
                    )}
                  </ContextMenu.Trigger>
                  <ContextMenu.Portal>
                    <ContextMenu.Content className="col-context-menu">
                      <div className="col-context-label">
                        북마크 메뉴 · {link.title || getDomain(link.url) || 'Untitled'}
                      </div>
                      <ContextMenu.Separator className="col-context-separator" />
                      <ContextMenu.Item
                        className="col-context-item"
                        onSelect={() => {
                          void onOpenLink(link.url);
                        }}>
                        새 탭에서 열기
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        className="col-context-item"
                        onSelect={() => {
                          void onCopyLink(link.url);
                        }}>
                        링크 복사
                      </ContextMenu.Item>
                      <ContextMenu.Item
                        className="col-context-item"
                        onSelect={() => onStartBookmarkEdit(link, collection.id, linkIndex)}>
                        수정
                      </ContextMenu.Item>
                      <ContextMenu.Separator className="col-context-separator" />
                      <ContextMenu.Item
                        className="col-context-item col-context-item-destructive"
                        onSelect={() => onRequestDeleteBookmark(link)}>
                        북마크 삭제
                      </ContextMenu.Item>
                    </ContextMenu.Content>
                  </ContextMenu.Portal>
                </ContextMenu.Root>
                {showRightPreview && <BookmarkDropLine side="right" />}
              </SortableBookmarkItem>
            );
          })}
          <motion.li
            key={`${collection.id}-inline-bookmark`}
            className="bookmark-inline-add-slot"
            layout
            transition={shouldReduceMotion ? { duration: 0.01 } : { type: 'spring', stiffness: 460, damping: 38 }}>
            {addStateForCollection?.phase === 'editing' ? (
              <div
                ref={addingBookmarkFormRef}
                className={`bookmark-item bookmark-inline-add-form is-editing ${
                  addingBookmarkInvalid ? 'is-invalid' : ''
                }`}>
                <span className="fav-fallback" aria-hidden>
                  <Plus size={14} />
                </span>
                <span className="link-main">
                  <div className="bookmark-add-text-shell">
                    <input
                      ref={addingBookmarkTitleRef}
                      className="bookmark-edit-input title inline-add-input"
                      value={addingBookmarkTitle}
                      onChange={event => onUpdateAddBookmarkDraft({ draftTitle: event.currentTarget.value })}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void onSubmitBookmarkInlineInput();
                        } else if (event.key === 'Escape') {
                          event.preventDefault();
                          onCloseBookmarkInlineInput();
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          const activeElement = document.activeElement;
                          if (
                            activeElement === addingBookmarkTitleRef.current ||
                            activeElement === addingBookmarkUrlRef.current
                          )
                            return;
                          void onSubmitBookmarkInlineInput();
                        }, 0);
                      }}
                      placeholder="북마크 제목"
                      disabled={addingBookmarkBusy}
                    />
                  </div>
                  <div className="bookmark-add-text-shell">
                    <input
                      ref={addingBookmarkUrlRef}
                      className="bookmark-edit-input url inline-add-input"
                      value={addingBookmarkUrl}
                      onChange={event => onUpdateAddBookmarkDraft({ draftUrl: event.currentTarget.value })}
                      onKeyDown={event => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void onSubmitBookmarkInlineInput();
                        } else if (event.key === 'Escape') {
                          event.preventDefault();
                          onCloseBookmarkInlineInput();
                        }
                      }}
                      onBlur={() => {
                        setTimeout(() => {
                          const activeElement = document.activeElement;
                          if (
                            activeElement === addingBookmarkTitleRef.current ||
                            activeElement === addingBookmarkUrlRef.current
                          )
                            return;
                          void onSubmitBookmarkInlineInput();
                        }, 0);
                      }}
                      placeholder="https://"
                      disabled={addingBookmarkBusy}
                    />
                  </div>
                </span>
              </div>
            ) : addStateForCollection?.phase === 'committing' ? (
              <div className="bookmark-item bookmark-inline-add-pending">
                <span className="fav-fallback" aria-hidden>
                  <Plus size={14} />
                </span>
                <span className="link-main">
                  <span className="link-title bookmark-inline-add-title">{addPendingTitle}</span>
                  <span className="link-domain bookmark-inline-add-hint">
                    {addPendingDomain || addStateForCollection.draftUrl || '북마크 저장 중...'}
                  </span>
                </span>
              </div>
            ) : (
              <button
                className="bookmark-item bookmark-inline-add-trigger"
                onClick={() => onOpenBookmarkInlineInput(collection.id)}>
                <span className="fav-fallback" aria-hidden>
                  <Plus size={14} />
                </span>
                <span className="link-main">
                  <span className="link-title bookmark-inline-add-title">새 북마크 추가...</span>
                  <span className="link-domain bookmark-inline-add-hint">URL 붙여넣기</span>
                </span>
              </button>
            )}
          </motion.li>
        </AnimatePresence>
      </ul>
    </SortableContext>
  );
};

export { BookmarkList };
