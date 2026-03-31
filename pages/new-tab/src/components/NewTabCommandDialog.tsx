import { rememberFavicon } from '@src/lib/favicon-resolver';
import { renderHighlightedText } from '@src/lib/new-tab/highlight-text';
import { Command } from 'cmdk';
import { Link2 } from 'lucide-react';
import type { CollectionSummary, BookmarkNode, QuickActionItem } from '@src/lib/new-tab/types';
import type { BookmarkSearchHit } from '@src/lib/search/types';

type NewTabCommandDialogProps = {
  bookmarkHits: BookmarkSearchHit[];
  fallbackFavicon: string;
  filteredCollections: CollectionSummary[];
  filteredQuickActions: QuickActionItem[];
  filteredWorkspaces: BookmarkNode[];
  getFaviconSrcByKey: (key: string, url?: string) => string;
  hasCommandResults: boolean;
  onBookmarkSelect: (url?: string) => void;
  onCollectionSelect: (collectionId: string, mode: 'group' | 'new-window') => void;
  onFaviconErrorByKey: (key: string, url?: string) => void;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (value: string) => void;
  onWorkspaceSelect: (workspaceId: string) => void;
  open: boolean;
  query: string;
  workspaceId: string;
};

const NewTabCommandDialog = ({
  bookmarkHits,
  fallbackFavicon,
  filteredCollections,
  filteredQuickActions,
  filteredWorkspaces,
  getFaviconSrcByKey,
  hasCommandResults,
  onBookmarkSelect,
  onCollectionSelect,
  onFaviconErrorByKey,
  onOpenChange,
  onQueryChange,
  onWorkspaceSelect,
  open,
  query,
  workspaceId,
}: NewTabCommandDialogProps) => (
  <Command.Dialog
    className="cmdk-dialog"
    overlayClassName="cmdk-overlay"
    label="커맨드 팔레트"
    shouldFilter={false}
    open={open}
    onOpenChange={onOpenChange}>
    <Command.Input
      className="cmdk-input"
      placeholder="명령, 워크스페이스, 컬렉션 검색..."
      value={query}
      onValueChange={onQueryChange}
    />
    <Command.List className="cmdk-list">
      {!hasCommandResults && <div className="cmdk-empty">결과가 없습니다.</div>}

      {filteredQuickActions.length > 0 && (
        <Command.Group heading="빠른 작업" className="cmdk-group">
          {filteredQuickActions.map(action => (
            <Command.Item key={action.key} className="cmdk-item" onSelect={action.onSelect} value={action.label}>
              <span className="cmdk-item-text">{action.label}</span>
            </Command.Item>
          ))}
        </Command.Group>
      )}

      {filteredWorkspaces.length > 0 && (
        <Command.Group heading="워크스페이스" className="cmdk-group">
          {filteredWorkspaces.map(workspace => (
            <Command.Item
              key={workspace.id}
              className="cmdk-item"
              value={`workspace ${workspace.title}`}
              onSelect={() => onWorkspaceSelect(workspace.id)}>
              {workspaceId === workspace.id ? '✓ ' : ''}
              {workspace.title}
            </Command.Item>
          ))}
        </Command.Group>
      )}

      {filteredCollections.length > 0 && (
        <Command.Group heading="컬렉션 열기" className="cmdk-group">
          {filteredCollections.map(collection => (
            <Command.Item
              key={`${collection.id}-group`}
              className="cmdk-item"
              value={`${collection.workspace} ${collection.title} tab group`}
              onSelect={() => onCollectionSelect(collection.id, 'group')}>
              {collection.title} · 탭 그룹으로 열기
            </Command.Item>
          ))}
          {filteredCollections.map(collection => (
            <Command.Item
              key={`${collection.id}-window`}
              className="cmdk-item"
              value={`${collection.workspace} ${collection.title} window`}
              onSelect={() => onCollectionSelect(collection.id, 'new-window')}>
              {collection.title} · 새 창으로 열기
            </Command.Item>
          ))}
        </Command.Group>
      )}

      {bookmarkHits.length > 0 && (
        <Command.Group heading="저장된 북마크" className="cmdk-group">
          {bookmarkHits.map(hit => {
            const icon = getFaviconSrcByKey(hit.record.key, hit.record.url);
            const isFallbackIcon = icon === fallbackFavicon;

            return (
              <Command.Item
                key={hit.record.key}
                className="cmdk-item"
                value={`${hit.record.title} ${hit.record.url} ${hit.record.domain} ${hit.record.workspaceTitle} ${hit.record.collectionTitle}`}
                onSelect={() => onBookmarkSelect(hit.record.url)}>
                {isFallbackIcon ? (
                  <span className="fav-fallback" aria-hidden>
                    <Link2 size={14} />
                  </span>
                ) : (
                  <img
                    className="fav"
                    src={icon}
                    alt=""
                    onError={() => onFaviconErrorByKey(hit.record.key, hit.record.url)}
                    onLoad={event => rememberFavicon(hit.record.url, (event.currentTarget as HTMLImageElement).src)}
                  />
                )}
                <div className="cmdk-item-body">
                  <div className="cmdk-item-title-row">
                    <span className="cmdk-item-text">{renderHighlightedText(hit.record.title, hit.titleRanges)}</span>
                  </div>
                  <span className="cmdk-item-subtitle">
                    {renderHighlightedText(hit.secondaryText, hit.secondaryRanges)}
                  </span>
                </div>
              </Command.Item>
            );
          })}
        </Command.Group>
      )}
    </Command.List>
  </Command.Dialog>
);

export { NewTabCommandDialog };
