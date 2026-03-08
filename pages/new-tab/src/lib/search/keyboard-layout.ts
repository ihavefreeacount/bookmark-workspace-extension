import { normalizeSearchText } from '@src/lib/search/normalize';
import { convertHangulToQwerty, convertQwertyToHangul } from 'es-hangul';

const HANGUL_RE = /[ㄱ-ㅎㅏ-ㅣ가-힣]/;
const LATIN_RE = /[a-z]/i;

const getKeyboardLayoutVariants = (query: string) => {
  const normalizedQuery = normalizeSearchText(query);
  const variants = new Set<string>();

  if (!normalizedQuery) return [];

  if (LATIN_RE.test(query)) {
    const converted = normalizeSearchText(convertQwertyToHangul(query));
    if (converted && converted !== normalizedQuery) variants.add(converted);
  }

  if (HANGUL_RE.test(query)) {
    const converted = normalizeSearchText(convertHangulToQwerty(query));
    if (converted && converted !== normalizedQuery) variants.add(converted);
  }

  return [...variants];
};

export { getKeyboardLayoutVariants };
