import {
  getCachedFavicon,
  getFallbackFavicon,
  getFaviconCandidates,
  isNegativeFaviconCached,
  rememberFaviconFailure,
} from '@src/lib/favicon-resolver';
import { useCallback, useState } from 'react';
import type { BookmarkNode } from '@src/lib/new-tab/types';

const useFaviconState = () => {
  const [faviconIndexById, setFaviconIndexById] = useState<Record<string, number>>({});

  const getFaviconSrcByKey = useCallback(
    (key: string, url?: string) => {
      if (isNegativeFaviconCached(url)) return getFallbackFavicon();

      const candidates = getFaviconCandidates(url);
      const cached = getCachedFavicon(url);
      const index = faviconIndexById[key] ?? 0;

      if (cached) return cached;

      return candidates[index] || candidates[0] || getFallbackFavicon();
    },
    [faviconIndexById],
  );

  const onFaviconErrorByKey = useCallback((key: string, url?: string) => {
    const candidates = getFaviconCandidates(url);

    setFaviconIndexById(previous => {
      const next = { ...previous };
      const nextIndex = (next[key] ?? 0) + 1;

      if (nextIndex >= Math.max(0, candidates.length - 1)) {
        rememberFaviconFailure(url);
      }

      next[key] = Math.min(nextIndex, Math.max(0, candidates.length - 1));
      return next;
    });
  }, []);

  const getFaviconSrc = useCallback(
    (bookmark: BookmarkNode) => getFaviconSrcByKey(bookmark.id, bookmark.url),
    [getFaviconSrcByKey],
  );

  const onFaviconError = useCallback(
    (bookmark: BookmarkNode) => onFaviconErrorByKey(bookmark.id, bookmark.url),
    [onFaviconErrorByKey],
  );

  return {
    getFaviconSrc,
    getFaviconSrcByKey,
    onFaviconError,
    onFaviconErrorByKey,
  };
};

export { useFaviconState };
