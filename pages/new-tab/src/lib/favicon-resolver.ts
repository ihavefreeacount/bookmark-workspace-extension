const CACHE_KEY = 'bw:favicon-cache:v1';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

type CacheValue = {
  src: string;
  at: number;
};

type CacheMap = Record<string, CacheValue>;

function safeParse(json: string | null): CacheMap {
  if (!json) return {};
  try {
    return JSON.parse(json) as CacheMap;
  } catch {
    return {};
  }
}

function readCache(): CacheMap {
  return safeParse(localStorage.getItem(CACHE_KEY));
}

function writeCache(cache: CacheMap) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

export function getDomain(url?: string) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function getFaviconCandidates(url?: string): string[] {
  if (!url) return [];
  const domain = getDomain(url);
  if (!domain) return [];

  // External providers are always ON by product decision.
  return [
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`,
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`,
  ];
}

export function getCachedFavicon(url?: string): string | null {
  const domain = getDomain(url);
  if (!domain) return null;

  const cache = readCache();
  const entry = cache[domain];
  if (!entry) return null;
  if (Date.now() - entry.at > TTL_MS) {
    delete cache[domain];
    writeCache(cache);
    return null;
  }
  return entry.src;
}

export function rememberFavicon(url: string | undefined, src: string) {
  const domain = getDomain(url);
  if (!domain || !src) return;

  const cache = readCache();
  cache[domain] = { src, at: Date.now() };
  writeCache(cache);
}
