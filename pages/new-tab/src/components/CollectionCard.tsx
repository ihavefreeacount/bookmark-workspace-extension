import * as ContextMenu from '@radix-ui/react-context-menu';
import { BookmarkList } from '@src/components/BookmarkList';
import { isEventFromBookmarkArea } from '@src/lib/new-tab/helpers';
import { motion } from 'motion/react';
import type {
  BookmarkDndController,
  BookmarkEditingController,
  BookmarkInlineAddController,
} from '@src/lib/new-tab/collections-board-types';
import type { ActiveContext, BookmarkDropPreview, BookmarkNode, CollectionSummary } from '@src/lib/new-tab/types';
import type { Dispatch, DragEvent as ReactDragEvent, SetStateAction } from 'react';

type CollectionCardProps = {
  activeContext: ActiveContext;
  bookmarkDnd: BookmarkDndController;
  bookmarkEditing: BookmarkEditingController;
  bookmarkInlineAdd: BookmarkInlineAddController;
  collection: CollectionSummary;
  dragKind: 'tab' | 'collection' | null;
  onCollectionDragEnd: () => void;
  onCollectionDragStart: (event: ReactDragEvent<HTMLElement>, collection: CollectionSummary) => void;
  onDropTabToCollection: (event: ReactDragEvent<HTMLElement>) => Promise<void> | void;
  onFaviconError: (bookmark: BookmarkNode) => void;
  onGetFaviconSrc: (bookmark: BookmarkNode) => string;
  onOpenCollection: (collectionId: string, mode: 'group' | 'new-window') => Promise<void> | void;
  onOpenLink: (url?: string) => Promise<void> | void;
  onCopyLink: (url?: string) => Promise<void> | void;
  onRequestDeleteBookmark: (bookmark: BookmarkNode) => void;
  onRequestDeleteCollection: (collection: CollectionSummary) => void;
  setActiveContext: Dispatch<SetStateAction<ActiveContext>>;
  shouldReduceMotion: boolean;
  suppressTransitions: boolean;
  tabDropPreview: BookmarkDropPreview | null;
};

const setScopedContextState =
  (setActiveContext: Dispatch<SetStateAction<ActiveContext>>, nextContext: Exclude<ActiveContext, null>) =>
  (open: boolean) =>
    setActiveContext(previous =>
      open ? nextContext : previous?.kind === nextContext.kind && previous.id === nextContext.id ? null : previous,
    );

const CollectionCard = ({
  activeContext,
  bookmarkDnd,
  bookmarkEditing,
  bookmarkInlineAdd,
  collection,
  dragKind,
  onCollectionDragEnd,
  onCollectionDragStart,
  onDropTabToCollection,
  onFaviconError,
  onGetFaviconSrc,
  onOpenCollection,
  onOpenLink,
  onCopyLink,
  onRequestDeleteBookmark,
  onRequestDeleteCollection,
  setActiveContext,
  shouldReduceMotion,
  suppressTransitions,
  tabDropPreview,
}: CollectionCardProps) => {
  const { bookmarkCollectionNodesRef, bookmarkDropPreview } = bookmarkDnd;
  const disableOtherCollections =
    !!bookmarkDnd.activeBookmarkDragCollectionId && bookmarkDnd.activeBookmarkDragCollectionId !== collection.id;
  const activeDropPreview = bookmarkDropPreview ?? tabDropPreview;
  const isEmptyDropTarget =
    activeDropPreview?.kind === 'empty-collection' && activeDropPreview.collectionId === collection.id;

  return (
    <ContextMenu.Root
      modal={false}
      onOpenChange={setScopedContextState(setActiveContext, {
        kind: 'collection',
        id: collection.id,
      })}>
      <ContextMenu.Trigger asChild>
        <motion.article
          ref={node => {
            if (!node) {
              delete bookmarkCollectionNodesRef.current[collection.id];
              return;
            }

            bookmarkCollectionNodesRef.current[collection.id] = node;
          }}
          className={`col-card ${isEmptyDropTarget ? 'drop-target' : ''} ${
            activeContext?.kind === 'collection' && activeContext.id === collection.id ? 'context-active' : ''
          }`}
          layout={suppressTransitions ? false : 'position'}
          initial={suppressTransitions || shouldReduceMotion ? false : { opacity: 0, y: -6 }}
          animate={suppressTransitions ? undefined : shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={suppressTransitions ? undefined : shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
          transition={
            suppressTransitions
              ? { duration: 0 }
              : shouldReduceMotion
                ? { duration: 0.01 }
                : {
                    y: { duration: 0.2, ease: 'easeOut' },
                    opacity: { duration: 0.18, ease: 'easeOut' },
                    layout: { type: 'spring', stiffness: 430, damping: 36 },
                  }
          }
          draggable
          onDragStart={event => {
            if (isEventFromBookmarkArea(event.target)) {
              event.preventDefault();
              return;
            }
            onCollectionDragStart(event as unknown as ReactDragEvent<HTMLElement>, collection);
          }}
          onDragEnd={onCollectionDragEnd}
          onDragOver={event => {
            if (dragKind !== 'tab') return;
            event.preventDefault();
          }}
          onDrop={event => {
            void onDropTabToCollection(event);
          }}>
          <div className="col-head">
            <h3 className="col-title">{collection.title}</h3>
          </div>
          <BookmarkList
            activeContext={activeContext}
            bookmarkDnd={bookmarkDnd}
            bookmarkEditing={bookmarkEditing}
            bookmarkInlineAdd={bookmarkInlineAdd}
            collection={collection}
            disableOtherCollections={disableOtherCollections}
            externalDropPreview={tabDropPreview}
            onCopyLink={onCopyLink}
            onFaviconError={onFaviconError}
            onGetFaviconSrc={onGetFaviconSrc}
            onOpenLink={onOpenLink}
            onRequestDeleteBookmark={onRequestDeleteBookmark}
            setActiveContext={setActiveContext}
            shouldReduceMotion={shouldReduceMotion}
          />
        </motion.article>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="col-context-menu" alignOffset={-4}>
          <div className="col-context-label">컬렉션 메뉴 · {collection.title}</div>
          <ContextMenu.Separator className="col-context-separator" />
          <ContextMenu.Item
            className="col-context-item"
            onSelect={() => {
              void onOpenCollection(collection.id, 'group');
            }}>
            탭 그룹으로 열기
          </ContextMenu.Item>
          <ContextMenu.Item
            className="col-context-item"
            onSelect={() => {
              void onOpenCollection(collection.id, 'new-window');
            }}>
            새 창으로 열기
          </ContextMenu.Item>
          <ContextMenu.Separator className="col-context-separator" />
          <ContextMenu.Item
            className="col-context-item col-context-item-destructive"
            onSelect={() => onRequestDeleteCollection(collection)}>
            컬렉션 삭제
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
};

export { CollectionCard };
