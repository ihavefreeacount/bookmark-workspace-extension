import { closestCenter, DndContext, DragOverlay } from '@dnd-kit/core';
import { BookmarkDragAvatar } from '@src/components/BookmarkDnd';
import { CollectionCard } from '@src/components/CollectionCard';
import { AnimatePresence, motion } from 'motion/react';
import type { CollectionsBoardProps } from '@src/lib/new-tab/collections-board-types';

const CollectionsBoard = ({
  activeContext,
  bookmarkDnd,
  bookmarkEditing,
  bookmarkInlineAdd,
  collectionInline,
  collections,
  dragKind,
  dropCollectionId,
  onCollectionDragEnd,
  onCollectionDragStart,
  onDropCollectionHighlight,
  onDropTabToCollection,
  onFaviconError,
  onGetFaviconSrc,
  onOpenCollection,
  onOpenLink,
  onCopyLink,
  onOpenWorkspaceInlineInput,
  onRequestDeleteCollection,
  onRequestDeleteBookmark,
  selectedWorkspace,
  setActiveContext,
  shouldReduceMotion,
  suppressCollectionTransitions,
  tree,
  workspaces,
}: CollectionsBoardProps) => {
  const {
    activeBookmarkOverlay,
    bookmarkOverlayModifier,
    handleBookmarkDragCancel,
    handleBookmarkDragEnd,
    handleBookmarkDragMove,
    handleBookmarkDragStart,
    sensors,
  } = bookmarkDnd;
  const {
    collectionInlineBusy,
    collectionInlineHideDuringExit,
    collectionInlineName,
    collectionInlineOpen,
    collectionInlineRef,
    onCloseCollectionInlineInput,
    onOpenCollectionInlineInput,
    onSetCollectionInlineName,
    onSubmitCollectionInlineInput,
  } = collectionInline;

  const isEmptyWorkspaceState = tree !== null && workspaces.length === 0;
  const isEmptyCollectionState = tree !== null && collections.length === 0 && !collectionInlineOpen;
  const collectionInlineCard = collectionInlineOpen ? (
    <motion.article
      key="inline-collection-input"
      className={`col-card inline-input-card ${collectionInlineHideDuringExit ? 'is-hiding' : ''}`}
      layout={suppressCollectionTransitions ? false : true}
      initial={suppressCollectionTransitions || shouldReduceMotion ? false : { scale: 0.985, y: -8 }}
      animate={suppressCollectionTransitions ? undefined : shouldReduceMotion ? { scale: 1, y: 0 } : { scale: 1, y: 0 }}
      exit={
        suppressCollectionTransitions
          ? undefined
          : shouldReduceMotion
            ? { opacity: 0, transition: { duration: 0.01 } }
            : { opacity: 0, scale: 0.992, y: -4, transition: { duration: 0.12, ease: 'easeOut' } }
      }
      transition={
        suppressCollectionTransitions
          ? { duration: 0 }
          : shouldReduceMotion
            ? { duration: 0.01 }
            : { duration: 0.18, ease: 'easeOut' }
      }>
      <div className="col-head">
        <input
          ref={collectionInlineRef}
          className="col-inline-input"
          type="text"
          placeholder="새 컬렉션 이름..."
          value={collectionInlineName}
          onChange={event => onSetCollectionInlineName(event.currentTarget.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void onSubmitCollectionInlineInput();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              onCloseCollectionInlineInput({ hideDuringExit: true });
            }
          }}
          onBlur={() => {
            void onSubmitCollectionInlineInput();
          }}
          disabled={collectionInlineBusy}
        />
      </div>
    </motion.article>
  ) : null;
  const collectionCards = collections.map(collection => (
    <CollectionCard
      key={collection.id}
      activeContext={activeContext}
      bookmarkDnd={bookmarkDnd}
      bookmarkEditing={bookmarkEditing}
      bookmarkInlineAdd={bookmarkInlineAdd}
      collection={collection}
      dragKind={dragKind}
      dropCollectionId={dropCollectionId}
      onCollectionDragEnd={onCollectionDragEnd}
      onCollectionDragStart={onCollectionDragStart}
      onDropCollectionHighlight={onDropCollectionHighlight}
      onDropTabToCollection={onDropTabToCollection}
      onFaviconError={onFaviconError}
      onGetFaviconSrc={onGetFaviconSrc}
      onOpenCollection={onOpenCollection}
      onOpenLink={onOpenLink}
      onCopyLink={onCopyLink}
      onRequestDeleteBookmark={onRequestDeleteBookmark}
      onRequestDeleteCollection={onRequestDeleteCollection}
      setActiveContext={setActiveContext}
      shouldReduceMotion={shouldReduceMotion}
      suppressTransitions={suppressCollectionTransitions}
    />
  ));
  const emptyCollectionState = isEmptyCollectionState ? (
    <motion.div
      key="empty-collection"
      initial={suppressCollectionTransitions ? false : { opacity: 0 }}
      animate={suppressCollectionTransitions ? undefined : { opacity: 1 }}
      exit={suppressCollectionTransitions ? undefined : { opacity: 0 }}
      transition={suppressCollectionTransitions ? { duration: 0 } : undefined}
      className="empty-state">
      <h2 className="empty-state-title">
        {selectedWorkspace ? `'${selectedWorkspace.title}'에 컬렉션이 없습니다` : '컬렉션이 없습니다'}
      </h2>
      <p className="empty-state-desc">컬렉션을 추가해서 북마크를 그룹으로 묶어보세요</p>
      <button className="empty-state-btn" onClick={onOpenCollectionInlineInput}>
        컬렉션 추가하기
      </button>
    </motion.div>
  ) : null;

  return (
    <section className="panel center">
      {isEmptyWorkspaceState ? (
        <motion.div
          key="empty-workspace"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="empty-state">
          <h2 className="empty-state-title">워크스페이스가 없습니다</h2>
          <p className="empty-state-desc">워크스페이스를 만들어 북마크를 정리해보세요</p>
          <button className="empty-state-btn" onClick={onOpenWorkspaceInlineInput}>
            첫 워크스페이스 만들기
          </button>
        </motion.div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleBookmarkDragStart}
          onDragMove={handleBookmarkDragMove}
          onDragCancel={handleBookmarkDragCancel}
          onDragEnd={handleBookmarkDragEnd}>
          <div className="grid">
            {suppressCollectionTransitions ? (
              collectionInlineCard
            ) : (
              <AnimatePresence initial={false} mode="popLayout">
                {collectionInlineCard}
              </AnimatePresence>
            )}
            {suppressCollectionTransitions ? (
              collectionCards
            ) : (
              <AnimatePresence initial={false}>{collectionCards}</AnimatePresence>
            )}
            {emptyCollectionState}
          </div>
          <DragOverlay dropAnimation={null} modifiers={[bookmarkOverlayModifier]}>
            {activeBookmarkOverlay ? (
              <BookmarkDragAvatar title={activeBookmarkOverlay.title} domain={activeBookmarkOverlay.domain} />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </section>
  );
};

export { CollectionsBoard };
