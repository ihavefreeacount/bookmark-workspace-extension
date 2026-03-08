import { buildBookmarkSearchRecords, createBookmarkSearchIndex, searchBookmarks } from './engine';
import { describe, expect, it } from 'vitest';
import type { BookmarkSearchSourceNode } from './types';

const buildFixture = () => {
  const workspaces: BookmarkSearchSourceNode[] = [
    {
      id: 'ws-1',
      title: 'Engineering',
      children: [
        {
          id: 'col-1',
          title: 'Docs',
          children: [
            {
              id: 'bookmark-1',
              title: '리액트 베타 문서',
              url: 'https://beta.react.dev/learn',
            },
            {
              id: 'bookmark-2',
              title: 'GitHub Repository',
              url: 'https://github.com/example/repo',
            },
            {
              id: 'bookmark-3',
              title: 'Archive',
              url: 'https://github.com/example/archive',
            },
          ],
        },
      ],
    },
  ];

  const records = buildBookmarkSearchRecords(workspaces);
  return {
    records,
    index: createBookmarkSearchIndex(records),
  };
};

describe('bookmark search engine', () => {
  it('injects bidirectional synonym aliases during indexing', () => {
    const { records } = buildFixture();
    expect(records[0]?.aliasTerms).toContain('beta');
    expect(records[0]?.aliasTerms).toContain('베타');
    expect(records[0]?.aliasTerms).toContain('react');
    expect(records[0]?.aliasTerms).toContain('리액트');
  });

  it('matches english queries against korean titles through synonym aliases', () => {
    const { index } = buildFixture();
    const hits = searchBookmarks(index, 'beta');

    expect(hits[0]?.record.title).toBe('리액트 베타 문서');
    expect(hits[0]?.reason).toBe('synonym');
  });

  it('matches keyboard-layout typos against hangul titles', () => {
    const { index } = buildFixture();
    const hits = searchBookmarks(index, 'fldorxm');

    expect(hits[0]?.record.title).toBe('리액트 베타 문서');
    expect(hits[0]?.reason).toBe('layout');
    expect(hits[0]?.titleRanges).toEqual([[0, 2]]);
  });

  it('matches pure choseong queries and maps highlight ranges back to the title', () => {
    const { index } = buildFixture();
    const hits = searchBookmarks(index, 'ㄹㅇㅌ');

    expect(hits[0]?.record.title).toBe('리액트 베타 문서');
    expect(hits[0]?.reason).toBe('choseong');
    expect(hits[0]?.titleRanges).toEqual([[0, 2]]);
  });

  it('keeps direct title matches above url-only matches', () => {
    const { index } = buildFixture();
    const hits = searchBookmarks(index, 'github');

    expect(hits[0]?.record.title).toBe('GitHub Repository');
    expect(hits[0]?.reason).toBe('title');
    expect(hits[1]?.record.title).toBe('Archive');
    expect(hits[1]?.reason).toBe('url');
  });
});
