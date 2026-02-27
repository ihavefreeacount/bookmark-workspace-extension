const CACHE_KEY = 'bw:favicon-cache:v2';
const SUCCESS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 500;
const DEFAULT_SIZE = 32;

type FaviconProvider = 'chain' | 'raycast' | 'google' | 'duckduckgo' | 'direct';

const getProvider = (): FaviconProvider => {
  const raw = String(import.meta.env.VITE_FAVICON_PROVIDER || 'chain').toLowerCase();
  if (raw === 'raycast' || raw === 'google' || raw === 'duckduckgo' || raw === 'direct' || raw === 'chain') {
    return raw;
  }
  return 'chain';
};

type CacheValue = {
  src: string;
  at: number;
  ok: boolean;
  provider?: string;
};

type CacheMap = Record<string, CacheValue>;

const safeParse = (json: string | null): CacheMap => {
  if (!json) return {};
  try {
    return JSON.parse(json) as CacheMap;
  } catch {
    return {};
  }
};

const readCache = (): CacheMap => safeParse(localStorage.getItem(CACHE_KEY));

const writeCache = (cache: CacheMap) => {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
};

const pruneCache = (cache: CacheMap) => {
  const entries = Object.entries(cache);
  if (entries.length <= MAX_ENTRIES) return cache;
  entries.sort((a, b) => (a[1].at || 0) - (b[1].at || 0));
  const trimmed = entries.slice(entries.length - MAX_ENTRIES);
  return Object.fromEntries(trimmed);
};

const isExpired = (entry: CacheValue) => {
  const ttl = entry.ok ? SUCCESS_TTL_MS : FAILURE_TTL_MS;
  return Date.now() - entry.at > ttl;
};

export const getDomain = (url?: string) => {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

export const getFaviconCandidates = (url?: string): string[] => {
  if (!url) return [];
  const domain = getDomain(url);
  if (!domain) return [];

  const encoded = encodeURIComponent(domain);
  const direct = [`https://${domain}/favicon.ico`, `https://${domain}/apple-touch-icon.png`];
  const google = [`https://www.google.com/s2/favicons?domain=${encoded}&sz=${DEFAULT_SIZE}`];
  const duck = [`https://icons.duckduckgo.com/ip3/${encoded}.ico`];
  const raycast = [`https://api.ray.so/favicon?url=${encoded}&size=${DEFAULT_SIZE}`];

  const provider = getProvider();
  if (provider === 'direct') return direct;
  if (provider === 'google') return google;
  if (provider === 'duckduckgo') return duck;
  if (provider === 'raycast') return raycast;
  return [...direct, ...google, ...duck, ...raycast];
};

export const getCachedFavicon = (url?: string): string | null => {
  const domain = getDomain(url);
  if (!domain) return null;

  const cache = readCache();
  const entry = cache[domain];
  if (!entry) return null;
  if (isExpired(entry)) {
    delete cache[domain];
    writeCache(cache);
    return null;
  }
  return entry.ok ? entry.src : null;
};

export const isNegativeFaviconCached = (url?: string): boolean => {
  const domain = getDomain(url);
  if (!domain) return false;

  const cache = readCache();
  const entry = cache[domain];
  if (!entry) return false;
  if (isExpired(entry)) {
    delete cache[domain];
    writeCache(cache);
    return false;
  }
  return !entry.ok;
};

export const rememberFavicon = (url: string | undefined, src: string, provider = 'unknown') => {
  const domain = getDomain(url);
  if (!domain || !src) return;

  const next = readCache();
  next[domain] = { src, at: Date.now(), ok: true, provider };
  writeCache(pruneCache(next));
};

export const rememberFaviconFailure = (url?: string, provider = 'chain-exhausted') => {
  const domain = getDomain(url);
  if (!domain) return;

  const next = readCache();
  next[domain] = { src: '', at: Date.now(), ok: false, provider };
  writeCache(pruneCache(next));
};
