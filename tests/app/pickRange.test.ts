import { describe, expect, it } from 'vitest';
import { pickRange } from '../../src/app/views/pickRange';

const shown = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, title: `Note ${id}` }));
const ids = (notes: { id: string }[]): string[] => notes.map((n) => n.id);

describe('pickRange', () => {
  it('picks the rows between two positions, in either order', () => {
    expect(ids(pickRange([], shown, 1, 3, true))).toEqual(['b', 'c', 'd']);
    expect(ids(pickRange([], shown, 3, 1, true))).toEqual(['b', 'c', 'd']);
  });

  it('keeps notes picked elsewhere, with their saved titles', () => {
    const before = [{ id: 'z', title: 'Saved title' }, { id: 'c', title: 'Old title for c' }];
    const after = pickRange(before, shown, 2, 3, true);
    expect(ids(after)).toEqual(['z', 'c', 'd']);
    expect(after.find((n) => n.id === 'c')?.title).toBe('Old title for c');
    expect(after.find((n) => n.id === 'd')?.title).toBe('Note d');
  });

  it('unpicks a range and leaves the rest', () => {
    const before = shown.map((n) => ({ ...n }));
    expect(ids(pickRange(before, shown, 1, 2, false))).toEqual(['a', 'd', 'e']);
  });

  it('works from the picks you started with, so shrinking a drag puts rows back', () => {
    const base = [{ id: 'a', title: 'Note a' }];
    expect(ids(pickRange(base, shown, 1, 4, true))).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(ids(pickRange(base, shown, 1, 2, true))).toEqual(['a', 'b', 'c']);
  });

  it('clamps positions outside the list and copes with an empty list', () => {
    expect(ids(pickRange([], shown, -3, 1, true))).toEqual(['a', 'b']);
    expect(ids(pickRange([], shown, 3, 99, true))).toEqual(['d', 'e']);
    expect(pickRange([], [], 0, 5, true)).toEqual([]);
  });

  it('does not change the list it was given', () => {
    const before = [{ id: 'a', title: 'Note a' }];
    pickRange(before, shown, 0, 4, true);
    expect(before).toEqual([{ id: 'a', title: 'Note a' }]);
  });
});
