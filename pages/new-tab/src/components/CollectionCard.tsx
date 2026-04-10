import * as ContextMenu from '@radix-ui/react-context-menu';
import { BookmarkList } from '@src/components/BookmarkList';
import { isEventFromBookmarkArea } from '@src/lib/new-tab/helpers';
import { useRef } from 'react';
import type {
  BookmarkDndController,
  CollectionDndController,
  BookmarkEditingController,
  BookmarkInlineAddController,
} from '@src/lib/new-tab/collections-board-types';
import type { ActiveContext, BookmarkDropPreview, BookmarkNode, CollectionSummary } from '@src/lib/new-tab/types';
import type { Dispatch, DragEvent as ReactDragEvent, PointerEvent as ReactPointerEvent, SetStateAction } from 'react';

type CollectionCardProps = {
  activeContext: ActiveContext;
  bookmarkDnd: BookmarkDndController;
  bookmarkEditing: BookmarkEditingController;
  bookmarkInlineAdd: BookmarkInlineAddController;
  collectionDnd: CollectionDndController;
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
  collectionDnd,
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
  tabDropPreview,
}: CollectionCardProps) => {
  const { bookmarkCollectionNodesRef, bookmarkDropPreview } = bookmarkDnd;
  const { activeCollectionDragId, collectionDropPreview } = collectionDnd;
  const blockedCollectionDragOriginRef = useRef(false);
  const disableOtherCollections =
    !!bookmarkDnd.activeBookmarkDragCollectionId && bookmarkDnd.activeBookmarkDragCollectionId !== collection.id;
  const activeDropPreview = bookmarkDropPreview ?? tabDropPreview;
  const isEmptyDropTarget =
    activeDropPreview?.kind === 'empty-collection' && activeDropPreview.collectionId === collection.id;
  const showTopPreview = collectionDropPreview?.renderId === collection.id && collectionDropPreview.side === 'top';
  const showBottomPreview =
    collectionDropPreview?.renderId === collection.id && collectionDropPreview.side === 'bottom';
  const isDraggingCollection = activeCollectionDragId === collection.id;

  return (
    <ContextMenu.Root
      modal={false}
      onOpenChange={setScopedContextState(setActiveContext, {
        kind: 'collection',
        id: collection.id,
      })}>
      <ContextMenu.Trigger asChild>
        <article
          ref={node => {
            if (!node) {
              delete bookmarkCollectionNodesRef.current[collection.id];
              return;
            }

            bookmarkCollectionNodesRef.current[collection.id] = node;
          }}
          data-collection-card-id={collection.id}
          className={`col-card ${isEmptyDropTarget ? 'drop-target' : ''} ${
            activeContext?.kind === 'collection' && activeContext.id === collection.id ? 'context-active' : ''
          } ${isDraggingCollection ? 'is-dragging' : ''}`}
          draggable
          onPointerDownCapture={(event: ReactPointerEvent<HTMLElement>) => {
            blockedCollectionDragOriginRef.current = isEventFromBookmarkArea(event.target);
          }}
          onDragStart={event => {
            if (blockedCollectionDragOriginRef.current || isEventFromBookmarkArea(event.target)) {
              blockedCollectionDragOriginRef.current = false;
              event.preventDefault();
              return;
            }
            onCollectionDragStart(event as unknown as ReactDragEvent<HTMLElement>, collection);
          }}
          onDragEnd={() => {
            blockedCollectionDragOriginRef.current = false;
            onCollectionDragEnd();
          }}
          onDragOver={event => {
            if (dragKind !== 'tab') return;
            event.preventDefault();
          }}
          onDrop={event => {
            if (dragKind !== 'tab') return;
            void onDropTabToCollection(event);
          }}>
          {showTopPreview ? <div className="collection-drop-line top" aria-hidden /> : null}
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
          {showBottomPreview ? <div className="collection-drop-line bottom" aria-hidden /> : null}
        </article>
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
