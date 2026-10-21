import type { CapacitiesClient } from '@capacities/api';
import { describe, expect, it } from 'vitest';
import type { LocalDate } from '../../src/engine/types';
import { CapacitiesAdapter } from '../../src/providers/capacities/adapter';
import { FixtureProvider } from '../../src/providers/fixture/fixtureProvider';
import { buildMinimalSpace } from '../../src/providers/fixture/minimalSpace';
import { buildStrangersSpace } from '../../src/providers/fixture/strangersSpace';

const TODAY = '2026-08-25' as LocalDate;

describe('searching the fixture spaces', () => {
  const provider = new FixtureProvider(buildStrangersSpace(TODAY));

  it('finds a note by a word in its title', async () => {
    const hits = await provider.searchObjects('switchbacks');
    expect(hits.map((h) => h.title)).toContain('East switchbacks');
  });

  it('matches every word of the phrase, in any order', async () => {
    const hits = await provider.searchObjects('traverse tern');
    expect(hits.map((h) => h.id)).toContain('x-tern');
    expect(await provider.searchObjects('traverse zzzz')).toEqual([]);
  });

  it('can narrow to one type', async () => {
    const all = await provider.searchObjects('a');
    const fieldNotes = await provider.searchObjects('a', { structureId: 'st-fieldnote' });
    expect(fieldNotes.length).toBeGreaterThan(0);
    expect(fieldNotes.every((h) => h.structureId === 'st-fieldnote')).toBe(true);
    expect(fieldNotes.length).toBeLessThan(all.length);
  });

  it('respects the limit and finds nothing for a blank phrase', async () => {
    expect((await provider.searchObjects('a', { limit: 3 })).length).toBe(3);
    expect(await provider.searchObjects('   ')).toEqual([]);
  });

  it('searches daily notes too, on the minimal space', async () => {
    const minimal = new FixtureProvider(buildMinimalSpace(TODAY));
    const hits = await minimal.searchObjects('heron');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.structureId === minimal.dailyNoteStructureId)).toBe(true);
  });
});

describe('searching through the Capacities adapter', () => {
  function adapterWith(search: (body: unknown) => Promise<unknown>) {
    const client = { objects: { search } } as unknown as CapacitiesClient;
    return new CapacitiesAdapter(client);
  }

  it('sends the phrase, the limit and the type filter, and maps the results', async () => {
    let seen: unknown = null;
    const adapter = adapterWith((body) => {
      seen = body;
      return Promise.resolve({
        results: [
          { id: 'a', structureId: 's1', title: 'First', extra: 'ignored' },
          { id: 'b', structureId: 's2', title: 'Second' },
        ],
      });
    });
    const hits = await adapter.searchObjects('  glacier  ', { structureId: 's1', limit: 10 });
    expect(seen).toEqual({ query: 'glacier', limit: 10, structureIds: ['s1'] });
    expect(hits).toEqual([
      { id: 'a', structureId: 's1', title: 'First' },
      { id: 'b', structureId: 's2', title: 'Second' },
    ]);
  });

  it('defaults the limit, omits the filter when there is none, and skips blank phrases', async () => {
    const bodies: unknown[] = [];
    const adapter = adapterWith((body) => {
      bodies.push(body);
      return Promise.resolve({ results: [] });
    });
    await adapter.searchObjects('rope');
    expect(bodies).toEqual([{ query: 'rope', limit: 30 }]);
    expect(await adapter.searchObjects('   ')).toEqual([]);
    expect(bodies).toHaveLength(1);
  });
});
