import type { SearchRange } from '@src/lib/search/types';
import type { ReactNode } from 'react';

const mergeRanges = (ranges: readonly SearchRange[]) => {
  if (!ranges.length) return [];

  const sorted = [...ranges].sort((left, right) => left[0] - right[0]);
  const merged: SearchRange[] = [sorted[0]];

  for (const [start, end] of sorted.slice(1)) {
    const current = merged[merged.length - 1];
    if (!current) continue;

    if (start <= current[1] + 1) {
      merged[merged.length - 1] = [current[0], Math.max(current[1], end)];
      continue;
    }

    merged.push([start, end]);
  }

  return merged;
};

const renderHighlightedText = (text: string, ranges: readonly SearchRange[]) => {
  if (!text || !ranges.length) return text;

  const mergedRanges = mergeRanges(ranges);
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const [start, end] of mergedRanges) {
    if (start > cursor) {
      nodes.push(text.slice(cursor, start));
    }

    nodes.push(
      <mark key={`${text}-${start}-${end}`} className="cmdk-highlight">
        {text.slice(start, end + 1)}
      </mark>,
    );
    cursor = end + 1;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
};

export { renderHighlightedText };
