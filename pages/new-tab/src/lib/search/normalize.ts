import { getChoseong } from 'es-hangul';
import type { SearchRange } from '@src/lib/search/types';

const WHITESPACE_RE = /\s+/g;
const CHOSEONG_ONLY_RE = /^[ㄱ-ㅎᄀ-ᄒ]+$/;

const normalizeSearchText = (value: string) => value.normalize('NFC').toLowerCase().replace(WHITESPACE_RE, ' ').trim();

const compactChoseongQuery = (value: string) => normalizeSearchText(value).replace(WHITESPACE_RE, '');

const isPureChoseongQuery = (value: string) => {
  const compact = compactChoseongQuery(value);
  return compact.length > 0 && CHOSEONG_ONLY_RE.test(compact);
};

const includesNormalizedQuery = (query: string, ...values: Array<string | undefined>) => {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  return values.some(value => normalizeSearchText(value ?? '').includes(normalizedQuery));
};

const extractChoseongMetadata = (value: string) => {
  const positions: number[] = [];
  let compactValue = '';
  let offset = 0;

  for (const character of value) {
    const choseong = getChoseong(character);
    if (CHOSEONG_ONLY_RE.test(choseong)) {
      compactValue += choseong;
      positions.push(offset);
    }
    offset += character.length;
  }

  return { value: compactValue, positions };
};

const mapChoseongRangesToTitleRanges = (positions: readonly number[], ranges: readonly SearchRange[]) => {
  const mapped: SearchRange[] = [];

  for (const [start, end] of ranges) {
    const mappedStart = positions[start];
    const mappedEnd = positions[end];
    if (mappedStart === undefined || mappedEnd === undefined) continue;
    mapped.push([mappedStart, mappedEnd]);
  }

  return mapped;
};

const findCaseInsensitiveRanges = (value: string, query: string): SearchRange[] => {
  const normalizedValue = normalizeSearchText(value);
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedValue || !normalizedQuery) return [];

  const start = normalizedValue.indexOf(normalizedQuery);
  if (start < 0) return [];

  return [[start, start + normalizedQuery.length - 1]];
};

export {
  compactChoseongQuery,
  extractChoseongMetadata,
  findCaseInsensitiveRanges,
  includesNormalizedQuery,
  isPureChoseongQuery,
  mapChoseongRangesToTitleRanges,
  normalizeSearchText,
};
