import { normalizeSearchText } from '@src/lib/search/normalize';

const RAW_SYNONYM_GROUPS = [
  ['alpha', '알파'],
  ['beta', '베타'],
  ['react', '리액트'],
  ['javascript', '자바스크립트', '자바스크립'],
  ['typescript', '타입스크립트'],
  ['github', '깃허브'],
  ['chrome', '크롬'],
  ['notion', '노션'],
  ['figma', '피그마'],
] as const;

const SYNONYM_GROUPS = RAW_SYNONYM_GROUPS.map(group => group.map(term => normalizeSearchText(term)));

const buildSynonymAliases = (value: string) => {
  const normalizedValue = normalizeSearchText(value);
  const aliases = new Set<string>();

  if (!normalizedValue) return [];

  for (const group of SYNONYM_GROUPS) {
    if (!group.some(term => normalizedValue.includes(term))) continue;
    for (const term of group) {
      aliases.add(term);
    }
  }

  return [...aliases];
};

export { buildSynonymAliases };
