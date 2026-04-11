import { closestCenter, DndContext, DragOverlay } from '@dnd-kit/core';
import { BookmarkDragAvatar } from '@src/components/BookmarkDnd';
import { CollectionCard } from '@src/components/CollectionCard';
import { motion } from 'motion/react';
import type { CollectionsBoardProps } from '@src/lib/new-tab/collections-board-types';

const CollectionsBoard = ({
  activeContext,
  bookmarkDnd,
  bookmarkEditing,
  bookmarkInlineAdd,
  collectionDnd,
  collectionInline,
  dragKind,
  onCollectionBoardDragLeave,
  onCollectionBoardDragOver,
  onCollectionDragEnd,
  onCollectionDragStart,
  onDropCollectionToBoard,
  onDropTabToCollection,
  onFaviconError,
  onGetFaviconSrc,
  onOpenCollection,
  onOpenLink,
  onCopyLink,
  onOpenWorkspaceInlineInput,
  onRequestDeleteCollection,
  onRequestDeleteBookmark,
  onTabDragLeave,
  onTabDragOver,
  selectedWorkspace,
  setActiveContext,
  shouldReduceMotion,
  suppressCollectionTransitions,
  tabDropPreview,
  tree,
  workspaceHandoffToken,
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
  const { activeCollectionDragId, collectionBoardNodeRef, orderedCollections } = collectionDnd;
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
  const isEmptyCollectionState = tree !== null && orderedCollections.length === 0 && !collectionInlineOpen;
  const collectionInlineCard = collectionInlineOpen ? (
    <article className={`col-card inline-input-card ${collectionInlineHideDuringExit ? 'is-hiding' : ''}`}>
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
    </article>
  ) : null;
  const collectionCards = orderedCollections.map(collection => (
    <CollectionCard
      key={collection.id}
      activeContext={activeContext}
      bookmarkDnd={bookmarkDnd}
      bookmarkEditing={bookmarkEditing}
      bookmarkInlineAdd={bookmarkInlineAdd}
      collectionDnd={collectionDnd}
      collection={collection}
      dragKind={dragKind}
      onCollectionDragEnd={onCollectionDragEnd}
      onCollectionDragStart={onCollectionDragStart}
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
      tabDropPreview={tabDropPreview}
    />
  ));
  const emptyCollectionState = isEmptyCollectionState ? (
    <div className="empty-state">
      <h2 className="empty-state-title">
        {selectedWorkspace ? `'${selectedWorkspace.title}'에 컬렉션이 없습니다` : '컬렉션이 없습니다'}
      </h2>
      <p className="empty-state-desc">컬렉션을 추가해서 북마크를 그룹으로 묶어보세요</p>
      <button className="empty-state-btn" onClick={onOpenCollectionInlineInput}>
        컬렉션 추가하기
      </button>
    </div>
  ) : null;
  const boardContent = isEmptyWorkspaceState ? (
    <motion.div
      initial={false}
      animate={{ opacity: 1 }}
      transition={shouldReduceMotion ? { duration: 0.01 } : { duration: 0.12, ease: 'easeOut' }}
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
        {collectionInlineCard}
        {orderedCollections.length > 0 ? (
          <div
            ref={collectionBoardNodeRef}
            className={`collection-card-stack ${activeCollectionDragId ? 'collection-dragging' : ''}`}>
            {collectionCards}
          </div>
        ) : null}
        {emptyCollectionState}
      </div>
      <DragOverlay dropAnimation={null} modifiers={[bookmarkOverlayModifier]}>
        {activeBookmarkOverlay ? (
          <BookmarkDragAvatar title={activeBookmarkOverlay.title} domain={activeBookmarkOverlay.domain} />
        ) : null}
      </DragOverlay>
    </DndContext>
  );

  return (
    <section
      className="panel center"
      onDragLeave={
        dragKind === 'tab' ? onTabDragLeave : dragKind === 'collection' ? onCollectionBoardDragLeave : undefined
      }
      onDragOver={
        dragKind === 'tab' ? onTabDragOver : dragKind === 'collection' ? onCollectionBoardDragOver : undefined
      }
      onDrop={dragKind === 'collection' ? onDropCollectionToBoard : undefined}>
      {workspaceHandoffToken > 0 ? (
        <motion.div
          key={workspaceHandoffToken}
          className="workspace-handoff-shell"
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={shouldReduceMotion ? { duration: 0.1 } : { duration: 0.16, ease: 'easeOut' }}>
          {boardContent}
        </motion.div>
      ) : (
        <div className="workspace-handoff-shell">{boardContent}</div>
      )}
    </section>
  );
};

export { CollectionsBoard };
