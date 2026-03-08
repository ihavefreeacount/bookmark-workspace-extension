import { getKeyboardLayoutVariants } from '@src/lib/search/keyboard-layout';
import {
  compactChoseongQuery,
  extractChoseongMetadata,
  findCaseInsensitiveRanges,
  isPureChoseongQuery,
  mapChoseongRangesToTitleRanges,
  normalizeSearchText,
} from '@src/lib/search/normalize';
import { buildSynonymAliases } from '@src/lib/search/synonyms';
import Fuse from 'fuse.js';
import type {
  BookmarkSearchHit,
  BookmarkSearchSourceNode,
  MatchField,
  MatchReason,
  SearchRange,
  SearchableBookmarkRecord,
} from '@src/lib/search/types';
import type { FuseResult, FuseResultMatch, IFuseOptions } from 'fuse.js';

const DEFAULT_LIMIT = 10;
const SEARCH_LIMIT_MULTIPLIER = 3;

const TEXT_SEARCH_KEYS = [
  { name: 'title', weight: 0.55 },
  { name: 'aliasTerms', weight: 0.2 },
  { name: 'domain', weight: 0.1 },
  { name: 'workspaceTitle', weight: 0.075 },
  { name: 'collectionTitle', weight: 0.05 },
  { name: 'url', weight: 0.025 },
] as const satisfies IFuseOptions<SearchableBookmarkRecord>['keys'];

const TEXT_FUSE_OPTIONS: IFuseOptions<SearchableBookmarkRecord> = {
  includeMatches: true,
  includeScore: true,
  ignoreLocation: true,
  threshold: 0.3,
  keys: TEXT_SEARCH_KEYS,
};

type SearchVariant = {
  query: string;
  source: 'raw' | 'layout';
  mode: 'text' | 'single-char' | 'choseong';
};

type BookmarkSearchIndex = {
  records: SearchableBookmarkRecord[];
  textFuse: Fuse<SearchableBookmarkRecord>;
};

const buildBookmarkSearchRecords = (workspaces: ReadonlyArray<BookmarkSearchSourceNode>) => {
  const records: SearchableBookmarkRecord[] = [];

  for (const workspace of workspaces) {
    const workspaceTitle = workspace.title || 'Untitled';
    for (const collection of workspace.children || []) {
      if (collection.url) continue;
      const collectionTitle = collection.title || 'Untitled';
      for (const link of collection.children || []) {
        if (!link.url) continue;

        const title = link.title || link.url || 'Untitled';
        const domain = getDomainFromUrl(link.url);
        const titleChoseong = extractChoseongMetadata(title);
        const aliasTerms = buildSynonymAliases(title);

        records.push({
          key: `${collection.id}-${link.id}`,
          bookmarkId: link.id,
          workspaceId: workspace.id,
          workspaceTitle,
          collectionId: collection.id,
          collectionTitle,
          title,
          url: link.url,
          domain,
          titleChoseong: titleChoseong.value,
          titleChoseongPositions: titleChoseong.positions,
          aliasTerms,
        });
      }
    }
  }

  return records;
};

const createBookmarkSearchIndex = (records: ReadonlyArray<SearchableBookmarkRecord>): BookmarkSearchIndex => {
  const source = [...records];
  const textIndex = Fuse.createIndex(TEXT_SEARCH_KEYS, source);

  return {
    records: source,
    textFuse: new Fuse(source, TEXT_FUSE_OPTIONS, textIndex),
  };
};

const searchBookmarks = (index: BookmarkSearchIndex, rawQuery: string, limit = DEFAULT_LIMIT): BookmarkSearchHit[] => {
  if (!index.records.length) return [];

  const normalizedQuery = normalizeSearchText(rawQuery);
  if (!normalizedQuery) {
    return index.records.slice(0, limit).map(record => ({
      record,
      reason: 'default',
      matchedField: 'default',
      score: 1,
      titleRanges: [],
      secondaryText: buildDefaultSecondaryText(record),
      secondaryRanges: [],
    }));
  }

  const candidates = new Map<string, BookmarkSearchHit>();
  const searchLimit = Math.max(limit * SEARCH_LIMIT_MULTIPLIER, limit);

  for (const variant of buildSearchVariants(normalizedQuery)) {
    if (variant.mode === 'single-char') {
      for (const hit of searchSingleCharacterRecords(index.records, variant.query, searchLimit, variant.source)) {
        mergeCandidate(candidates, hit);
      }
      continue;
    }

    if (variant.mode === 'choseong') {
      for (const hit of searchChoseongRecords(index.records, compactChoseongQuery(variant.query), searchLimit)) {
        mergeCandidate(candidates, hit);
      }
      continue;
    }

    const results = index.textFuse.search(variant.query, { limit: searchLimit });

    for (const result of results) {
      mergeCandidate(candidates, toSearchHit(result, variant, normalizedQuery));
    }
  }

  return [...candidates.values()]
    .sort((left, right) => left.score - right.score || left.record.title.localeCompare(right.record.title))
    .slice(0, limit);
};

const buildSearchVariants = (normalizedQuery: string): SearchVariant[] => {
  const seen = new Set<string>();
  const variants: SearchVariant[] = [];

  const pushVariant = (query: string, source: 'raw' | 'layout') => {
    const normalizedVariant = normalizeSearchText(query);
    if (!normalizedVariant || seen.has(normalizedVariant)) return;
    seen.add(normalizedVariant);

    const compactVariant = compactChoseongQuery(normalizedVariant);
    const mode = isPureChoseongQuery(normalizedVariant)
      ? 'choseong'
      : compactVariant.length === 1
        ? 'single-char'
        : 'text';

    variants.push({ query: normalizedVariant, source, mode });
  };

  pushVariant(normalizedQuery, 'raw');
  for (const variant of getKeyboardLayoutVariants(normalizedQuery)) {
    pushVariant(variant, 'layout');
  }

  return variants;
};

const searchSingleCharacterRecords = (
  records: ReadonlyArray<SearchableBookmarkRecord>,
  query: string,
  limit: number,
  source: SearchVariant['source'],
): BookmarkSearchHit[] => {
  const normalizedQuery = normalizeSearchText(query);
  const hits: BookmarkSearchHit[] = [];

  for (const record of records) {
    const titleRanges = findCaseInsensitiveRanges(record.title, normalizedQuery);
    const domainRanges = findCaseInsensitiveRanges(record.domain, normalizedQuery);

    if (!titleRanges.length && !domainRanges.length) continue;

    const titleStartsWith = normalizeSearchText(record.title).startsWith(normalizedQuery);
    const domainStartsWith = normalizeSearchText(record.domain).startsWith(normalizedQuery);
    const baseScore = titleRanges.length ? (titleStartsWith ? 0.02 : 0.12) : domainStartsWith ? 0.26 : 0.34;
    const reason: MatchReason = source === 'layout' ? 'layout' : titleRanges.length ? 'title' : 'url';

    hits.push({
      record,
      reason,
      matchedField: titleRanges.length ? 'title' : 'domain',
      score: baseScore + (source === 'layout' ? 0.04 : 0),
      titleRanges,
      secondaryText: titleRanges.length ? buildDefaultSecondaryText(record) : record.domain,
      secondaryRanges: titleRanges.length ? [] : domainRanges,
    });
  }

  return hits
    .sort((left, right) => left.score - right.score || left.record.title.localeCompare(right.record.title))
    .slice(0, limit);
};

const searchChoseongRecords = (
  records: ReadonlyArray<SearchableBookmarkRecord>,
  query: string,
  limit: number,
): BookmarkSearchHit[] => {
  const hits: BookmarkSearchHit[] = [];

  for (const record of records) {
    const start = record.titleChoseong.indexOf(query);
    if (start < 0) continue;

    const titleRanges = mapChoseongRangesToTitleRanges(record.titleChoseongPositions, [
      [start, start + query.length - 1],
    ]);

    hits.push({
      record,
      reason: 'choseong',
      matchedField: 'titleChoseong',
      score: start === 0 ? 0.03 : 0.16,
      titleRanges,
      secondaryText: buildDefaultSecondaryText(record),
      secondaryRanges: [],
    });
  }

  return hits
    .sort((left, right) => left.score - right.score || left.record.title.localeCompare(right.record.title))
    .slice(0, limit);
};

const toSearchHit = (
  result: FuseResult<SearchableBookmarkRecord>,
  variant: SearchVariant,
  rawQuery: string,
): BookmarkSearchHit => {
  const primaryMatch = pickPrimaryMatch(result.matches);
  const matchedField = toMatchField(primaryMatch?.key);
  const directTitleScore = scoreTitleMatch(result.item, rawQuery);
  const primaryReason = getMatchReason(matchedField, variant.source);
  const score = (result.score ?? 0.5) + getReasonPenalty(primaryReason) + directTitleScore;
  const titleRanges = getTitleRanges(result.item, matchedField, primaryMatch);
  const { secondaryText, secondaryRanges } = buildSecondaryDisplay(result.item, matchedField, primaryMatch);

  return {
    record: result.item,
    reason: primaryReason,
    matchedField,
    score,
    titleRanges,
    secondaryText,
    secondaryRanges,
  };
};

const pickPrimaryMatch = (matches: ReadonlyArray<FuseResultMatch> | undefined) => {
  if (!matches?.length) return undefined;

  const priority: MatchField[] = [
    'title',
    'titleChoseong',
    'aliasTerms',
    'domain',
    'url',
    'workspaceTitle',
    'collectionTitle',
  ];

  return [...matches].sort((left, right) => {
    const leftPriority = priority.indexOf(toMatchField(left.key));
    const rightPriority = priority.indexOf(toMatchField(right.key));
    return leftPriority - rightPriority;
  })[0];
};

const toMatchField = (key: string | undefined): MatchField => {
  switch (key) {
    case 'title':
    case 'titleChoseong':
    case 'url':
    case 'domain':
    case 'workspaceTitle':
    case 'collectionTitle':
    case 'aliasTerms':
      return key;
    default:
      return 'default';
  }
};

const getMatchReason = (field: MatchField, source: SearchVariant['source']): MatchReason => {
  if (field === 'titleChoseong') return 'choseong';
  if (source === 'layout') return 'layout';
  if (field === 'aliasTerms') return 'synonym';
  if (field === 'url' || field === 'domain') return 'url';
  if (field === 'workspaceTitle' || field === 'collectionTitle') return 'context';
  if (field === 'title') return 'title';
  return 'default';
};

const getReasonPenalty = (reason: MatchReason) => {
  switch (reason) {
    case 'title':
      return -0.06;
    case 'choseong':
      return -0.04;
    case 'synonym':
      return 0.05;
    case 'layout':
      return 0.04;
    case 'url':
      return 0.09;
    case 'context':
      return 0.12;
    default:
      return 0;
  }
};

const scoreTitleMatch = (record: SearchableBookmarkRecord, rawQuery: string) => {
  const normalizedTitle = normalizeSearchText(record.title);
  const normalizedQuery = normalizeSearchText(rawQuery);

  if (!normalizedTitle || !normalizedQuery) return 0;
  if (normalizedTitle === normalizedQuery) return -0.2;
  if (normalizedTitle.startsWith(normalizedQuery)) return -0.12;
  if (normalizedTitle.includes(normalizedQuery)) return -0.04;
  return 0;
};

const getTitleRanges = (
  record: SearchableBookmarkRecord,
  field: MatchField,
  match: FuseResultMatch | undefined,
): SearchRange[] => {
  if (!match?.indices.length) return [];

  if (field === 'title') return [...match.indices];
  if (field === 'titleChoseong') {
    return mapChoseongRangesToTitleRanges(record.titleChoseongPositions, match.indices);
  }

  return [];
};

const buildSecondaryDisplay = (
  record: SearchableBookmarkRecord,
  field: MatchField,
  match: FuseResultMatch | undefined,
) => {
  if (field === 'url' || field === 'domain') {
    return {
      secondaryText: field === 'url' ? record.url : record.domain,
      secondaryRanges: [...(match?.indices ?? [])],
    };
  }

  if (field === 'workspaceTitle' || field === 'collectionTitle') {
    const separator = ' · ';
    const secondaryText = `${record.workspaceTitle}${separator}${record.collectionTitle}`;
    const secondaryRanges =
      field === 'workspaceTitle'
        ? [...(match?.indices ?? [])]
        : (match?.indices ?? []).map(
            ([start, end]) =>
              [
                start + record.workspaceTitle.length + separator.length,
                end + record.workspaceTitle.length + separator.length,
              ] as const,
          );

    return { secondaryText, secondaryRanges };
  }

  return {
    secondaryText: buildDefaultSecondaryText(record),
    secondaryRanges: [],
  };
};

const buildDefaultSecondaryText = (record: SearchableBookmarkRecord) =>
  [record.domain, `${record.workspaceTitle} / ${record.collectionTitle}`].filter(Boolean).join(' · ');

const mergeCandidate = (store: Map<string, BookmarkSearchHit>, hit: BookmarkSearchHit) => {
  const existing = store.get(hit.record.key);
  if (!existing || hit.score < existing.score) {
    store.set(hit.record.key, hit);
  }
};

const getDomainFromUrl = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

export { buildBookmarkSearchRecords, createBookmarkSearchIndex, searchBookmarks };
export type { BookmarkSearchIndex };
