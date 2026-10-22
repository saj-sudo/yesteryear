import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../../src/engine/config';
import { addDays } from '../../src/engine/dates';
import { listSetMembers, runDaily } from '../../src/engine/orchestrate';
import { StateManager } from '../../src/engine/state';
import type { LocalDate, StudySet } from '../../src/engine/types';
import { FixtureProvider } from '../../src/providers/fixture/fixtureProvider';
import { seededRng } from '../../src/providers/fixture/generate';
import { buildMinimalSpace } from '../../src/providers/fixture/minimalSpace';
import { buildStrangersSpace } from '../../src/providers/fixture/strangersSpace';

/**
 * "Show notes" lists what a study set holds. It has to agree with the
 * daily run, since both answer the same question, and it must only read.
 * Checked on the stranger's space and on the minimal space.
 */

const TODAY = '2026-08-25' as LocalDate;
const day = (n: number): LocalDate => addDays(TODAY, n);

let tick = 0;
const nowIso = (): string => `2026-08-25T09:00:${String((tick++) % 60).padStart(2, '0')}.${tick}Z`;

function set(overrides: Partial<StudySet> & Pick<StudySet, 'id'>): StudySet {
  return { name: overrides.id, targetDate: day(60), tags: [], types: [], notes: [], ...overrides };
}

const strangersConfig = (sets: StudySet[]) =>
  normalizeConfig({
    types: { project: 'Expedition', person: 'Correspondent', note: 'Field Note' },
    recall: { tags: ['spark', 'keeper', 'thread'] },
    learn: { enabled: true, sets },
  });

/** The ids Learn holds after a daily run, which is what the set resolved to. */
async function learnedIds(provider: FixtureProvider, config: ReturnType<typeof normalizeConfig>) {
  const manager = await StateManager.open(provider, nowIso, config);
  await runDaily({ provider, manager, today: TODAY, rng: seededRng(1) });
  return Object.keys(manager.current.state.items)
    .filter((k) => k.endsWith('#learn'))
    .map((k) => k.replace(/^obj:/, '').replace(/#learn$/, ''))
    .sort();
}

describe('listSetMembers on the stranger space', () => {
  const sets: Record<string, StudySet> = {
    'a tag': set({ id: 'set-1', tags: ['thread'] }),
    'a type': set({ id: 'set-1', types: ['Correspondent'] }),
    'notes picked by hand': set({
      id: 'set-1',
      notes: [
        { id: 'c-wren', title: 'old title' },
        { id: 'fn-3', title: 'old title' },
      ],
    }),
    'a mix, with an overlap': set({
      id: 'set-1',
      tags: ['thread'],
      types: ['Correspondent'],
      notes: [{ id: 'c-wren', title: 'old title' }],
    }),
  };

  it.each(Object.entries(sets))('agrees with what the daily run puts into Learn: %s', async (_n, one) => {
    const provider = new FixtureProvider(buildStrangersSpace(TODAY));
    const config = strangersConfig([one]);
    const { members, warnings } = await listSetMembers(provider, one);
    expect(warnings).toEqual([]);
    expect(members.length).toBeGreaterThan(0);
    expect(members.map((m) => m.id).sort()).toEqual(await learnedIds(provider, config));
  });

  it('lists each note once and shows live titles ahead of saved ones', async () => {
    const provider = new FixtureProvider(buildStrangersSpace(TODAY));
    const { members } = await listSetMembers(provider, sets['a mix, with an overlap']!);
    const ids = members.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(members.find((m) => m.id === 'c-wren')?.title).toBe('Wren Okafor');
  });

  it('warns about a tag or type the space lacks and still lists the rest', async () => {
    const provider = new FixtureProvider(buildStrangersSpace(TODAY));
    const { members, warnings } = await listSetMembers(
      provider,
      set({
        id: 'set-1',
        name: 'Midterm',
        tags: ['no-such-tag'],
        types: ['No Such Type'],
        notes: [{ id: 'c-wren', title: 'Wren' }],
      }),
    );
    expect(members.map((m) => m.id)).toEqual(['c-wren']);
    expect(warnings.some((w) => w.includes('Tag "no-such-tag"'))).toBe(true);
    expect(warnings.some((w) => w.includes('Midterm') && w.includes('No Such Type'))).toBe(true);
  });

  it('only reads: the saved state and config do not change', async () => {
    const provider = new FixtureProvider(buildStrangersSpace(TODAY));
    const one = sets['a mix, with an overlap']!;
    const manager = await StateManager.open(provider, nowIso, strangersConfig([one]));
    const before = JSON.stringify(manager.current);
    await listSetMembers(provider, one);
    expect(JSON.stringify(manager.current)).toBe(before);
  });
});

describe('listSetMembers on the minimal space', () => {
  it('lists notes picked by hand and nothing else when nothing is set up', async () => {
    const provider = new FixtureProvider(buildMinimalSpace(TODAY));
    const noteId = provider.dailyNoteIdForDate(addDays(TODAY, -30));
    const one = set({ id: 'set-1', notes: [{ id: noteId!, title: 'A day last month' }] });
    const { members, warnings } = await listSetMembers(provider, one);
    expect(warnings).toEqual([]);
    expect(members).toEqual([{ id: noteId, title: 'A day last month' }]);
  });

  it('warns for a tag the space lacks and lists nothing for it', async () => {
    const provider = new FixtureProvider(buildMinimalSpace(TODAY));
    const { members, warnings } = await listSetMembers(
      provider,
      set({ id: 'set-1', tags: ['exam'] }),
    );
    expect(members).toEqual([]);
    expect(warnings.some((w) => w.includes('Tag "exam"'))).toBe(true);
  });

  it('an empty set lists nothing and does not warn', async () => {
    const provider = new FixtureProvider(buildMinimalSpace(TODAY));
    expect(await listSetMembers(provider, set({ id: 'set-1' }))).toEqual({ members: [], warnings: [] });
  });
});
