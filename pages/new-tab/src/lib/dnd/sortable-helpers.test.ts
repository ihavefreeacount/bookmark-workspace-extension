import {
  getClosestBookmarkDropIndicator,
  moveIdToIndex,
  orderByIds,
  reconcileBookmarkOrders,
  reconcileOrderIds,
} from './sortable-helpers';
import { describe, expect, it } from 'vitest';

describe('sortable helpers', () => {
  it('keeps known ids in order and appends new ones', () => {
    expect(reconcileOrderIds(['b', 'a'], ['a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
  });

  it('reconciles bookmark orders collection by collection', () => {
    expect(
      reconcileBookmarkOrders(
        {
          alpha: ['b2', 'b1'],
          stale: ['x1'],
        },
        [
          { id: 'alpha', bookmarkIds: ['b1', 'b2', 'b3'] },
          { id: 'beta', bookmarkIds: ['c1'] },
        ],
      ),
    ).toEqual({
      alpha: ['b2', 'b1', 'b3'],
      beta: ['c1'],
    });
  });

  it('orders objects by ids and appends unknown items at the end', () => {
    expect(
      orderByIds(
        [
          { id: 'a', label: 'first' },
          { id: 'b', label: 'second' },
          { id: 'c', label: 'third' },
        ],
        ['c', 'a'],
      ),
    ).toEqual([
      { id: 'c', label: 'third' },
      { id: 'a', label: 'first' },
      { id: 'b', label: 'second' },
    ]);
  });

  it('moves an id earlier in the same collection', () => {
    expect(moveIdToIndex(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
  });

  it('moves an id later in the same collection', () => {
    expect(moveIdToIndex(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
  });

  it('keeps the list unchanged when the id is missing', () => {
    expect(moveIdToIndex(['a', 'b', 'c'], 'x', 1)).toEqual(['a', 'b', 'c']);
  });

  it('returns the closest middle slot for the pointer', () => {
    expect(
      getClosestBookmarkDropIndicator({
        ids: ['a', 'b', 'c'],
        activeId: 'a',
        pointer: { x: 95, y: 20 },
        slots: [
          { index: 0, renderId: 'a', side: 'left', rect: { left: 8, top: 0, width: 8, height: 40 } },
          { index: 1, renderId: 'b', side: 'left', rect: { left: 90, top: 0, width: 8, height: 40 } },
          { index: 1, renderId: 'a', side: 'right', rect: { left: 66, top: 0, width: 8, height: 40 } },
        ],
      }),
    ).toEqual({
      index: 1,
      renderId: 'b',
      side: 'left',
    });
  });

  it('uses the leading boundary slot when the pointer is in the top-left gutter', () => {
    expect(
      getClosestBookmarkDropIndicator({
        ids: ['a', 'b'],
        activeId: 'b',
        pointer: { x: 18, y: 16 },
        slots: [
          { index: 0, renderId: 'a', side: 'left', rect: { left: 16, top: 0, width: 8, height: 40 } },
          { index: 1, renderId: 'a', side: 'right', rect: { left: 116, top: 0, width: 8, height: 40 } },
        ],
      }),
    ).toEqual({
      index: 0,
      renderId: 'a',
      side: 'left',
    });
  });

  it('uses the trailing boundary slot when the pointer is in the bottom-right gutter', () => {
    expect(
      getClosestBookmarkDropIndicator({
        ids: ['a', 'b'],
        activeId: 'a',
        pointer: { x: 198, y: 90 },
        slots: [
          { index: 0, renderId: 'a', side: 'left', rect: { left: 16, top: 0, width: 8, height: 40 } },
          { index: 2, renderId: 'b', side: 'right', rect: { left: 192, top: 72, width: 8, height: 40 } },
        ],
      }),
    ).toEqual({
      index: 2,
      renderId: 'b',
      side: 'right',
    });
  });

  it('returns null when the closest slot resolves to the current visual position', () => {
    expect(
      getClosestBookmarkDropIndicator({
        ids: ['a', 'b', 'c'],
        activeId: 'b',
        pointer: { x: 96, y: 20 },
        slots: [
          { index: 1, renderId: 'b', side: 'left', rect: { left: 92, top: 0, width: 8, height: 40 } },
          { index: 2, renderId: 'b', side: 'right', rect: { left: 128, top: 0, width: 8, height: 40 } },
        ],
      }),
    ).toBeNull();
  });
});
