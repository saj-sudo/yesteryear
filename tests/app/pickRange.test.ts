import { describe, expect, it } from 'vitest';
import { pickRange, tapRange } from '../../src/app/views/pickRange';
import type { LocalDate } from '../../src/engine/types';
import { FixtureProvider } from '../../src/providers/fixture/fixtureProvider';
import { buildMinimalSpace } from '../../src/providers/fixture/minimalSpace';
import { buildStrangersSpace } from '../../src/providers/fixture/strangersSpace';

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

describe('tapRange', () => {
  it('marks the start on the first tap and changes nothing else', () => {
    const picked = [{ id: 'z', title: 'Saved' }];
    const step = tapRange(null, 2, picked, shown);
    expect(step.start).toBe(2);
    expect(step.picked).toEqual(picked);
  });

  it('picks the rows between two taps, in either order, and closes the range', () => {
    const first = tapRange(null, 1, [], shown);
    const forward = tapRange(first.start, 3, first.picked, shown);
    expect(forward.start).toBeNull();
    expect(ids(forward.picked)).toEqual(['b', 'c', 'd']);
    const second = tapRange(null, 3, [], shown);
    expect(ids(tapRange(second.start, 1, second.picked, shown).picked)).toEqual(['b', 'c', 'd']);
  });

  it('picks one row when the same row is tapped twice', () => {
    const first = tapRange(null, 2, [], shown);
    expect(ids(tapRange(first.start, 2, first.picked, shown).picked)).toEqual(['c']);
  });

  it('unpicks a range that was already all picked, so a second pass undoes the first', () => {
    const all = shown.map((n) => ({ ...n }));
    expect(ids(tapRange(1, 3, all, shown).picked)).toEqual(['a', 'e']);
  });

  it('picks the whole range when only some of it was picked', () => {
    const some = [{ id: 'c', title: 'Note c' }];
    expect(ids(tapRange(1, 3, some, shown).picked)).toEqual(['c', 'b', 'd']);
  });

  it('keeps notes picked elsewhere', () => {
    const elsewhere = [{ id: 'z', title: 'From another search' }];
    expect(ids(tapRange(0, 1, elsewhere, shown).picked)).toEqual(['z', 'a', 'b']);
  });

  it('clamps taps outside the list and copes with an empty list', () => {
    expect(ids(tapRange(3, 99, [], shown).picked)).toEqual(['d', 'e']);
    expect(tapRange(0, 1, [], []).picked).toEqual([]);
  });

  it('does not change the list it was given', () => {
    const before = [{ id: 'a', title: 'Note a' }];
    tapRange(0, 3, before, shown);
    expect(before).toEqual([{ id: 'a', title: 'Note a' }]);
  });
});

// The same two taps on what the note picker really shows: search results from
// both fixture spaces (the stranger's schema, and a space of daily notes only).
describe('tapRange on the fixture spaces', () => {
  const TODAY = '2026-08-25' as LocalDate;

  it.each([
    ['the stranger\'s space', new FixtureProvider(buildStrangersSpace(TODAY)), 'a'],
    ['the minimal space', new FixtureProvider(buildMinimalSpace(TODAY)), 'the'],
  ])('picks exactly the results between two taps on %s', async (_name, provider, query) => {
    const results = await provider.searchObjects(query, { limit: 30 });
    expect(results.length).toBeGreaterThan(4);
    const first = tapRange(null, 1, [], results);
    const done = tapRange(first.start, 4, first.picked, results);
    expect(done.picked.map((n) => n.id)).toEqual(results.slice(1, 5).map((r) => r.id));
    expect(done.picked.map((n) => n.title)).toEqual(results.slice(1, 5).map((r) => r.title));
    // Tapping the same range again takes them back out.
    expect(tapRange(1, 4, done.picked, results).picked).toEqual([]);
  });
});
