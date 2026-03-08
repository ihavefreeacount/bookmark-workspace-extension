export type BookmarkSearchSourceNode = {
  id: string;
  title?: string;
  url?: string;
  children?: BookmarkSearchSourceNode[];
};

export type SearchableBookmarkRecord = {
  key: string;
  bookmarkId: string;
  workspaceId: string;
  workspaceTitle: string;
  collectionId: string;
  collectionTitle: string;
  title: string;
  url: string;
  domain: string;
  titleChoseong: string;
  titleChoseongPositions: number[];
  aliasTerms: string[];
};

export type SearchRange = readonly [number, number];

export type MatchReason = 'default' | 'title' | 'url' | 'context' | 'synonym' | 'layout' | 'choseong';

export type MatchField =
  | 'default'
  | 'title'
  | 'url'
  | 'domain'
  | 'workspaceTitle'
  | 'collectionTitle'
  | 'titleChoseong'
  | 'aliasTerms';

export type BookmarkSearchHit = {
  record: SearchableBookmarkRecord;
  reason: MatchReason;
  matchedField: MatchField;
  score: number;
  titleRanges: SearchRange[];
  secondaryText: string;
  secondaryRanges: SearchRange[];
};
