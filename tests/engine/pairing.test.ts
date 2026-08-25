import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../../src/engine/config';
import { gatherPairingPool } from '../../src/engine/orchestrate';
import {
  drawPairing,
  pairingDistance,
  type PairingCandidate,
} from '../../src/engine/pairing';
import { emptyState, objKey } from '../../src/engine/state';
import type { LocalDate } from '../../src/engine/types';
import { seededRng } from '../../src/providers/fixture/generate';
import { FixtureProvider } from '../../src/providers/fixture/fixtureProvider';
import { buildMinimalSpace } from '../../src/providers/fixture/minimalSpace';
import { buildStrangersSpace } from '../../src/providers/fixture/strangersSpace';

const TODAY = '2026-08-25' as LocalDate;

function item(id: string, over: Partial<PairingCandidate> = {}): PairingCandidate {
  return {
    key: objKey(id),
    objectId: id,
    title: id,
    structureId: null,
    tags: [],
    date: null,
    ...over,
  };
}

describe('pairingDistance', () => {
  it('rewards disjoint tags, different types, and distant dates', () => {
    const near = pairingDistance(
      item('a', { tags: ['spark'], structureId: 's1', date: '2026-08-01' }),
      item('b', { tags: ['spark'], structureId: 's1', date: '2026-08-02' }),
    );
    const far = pairingDistance(
      item('a', { tags: ['spark'], structureId: 's1', date: '2026-08-01' }),
      item('b', { tags: ['keeper'], structureId: 's2', date: '2023-08-01' }),
    );
    expect(near).toBeLessThan(0.1);
    expect(far).toBeCloseTo(4); // 2 tags + 1 type + 1 capped years apart
  });

  it('counts differing modality (dated vs undated) as distance', () => {
    expect(
      pairingDistance(item('a', { date: '2026-01-01' }), item('b')),
    ).toBeCloseTo(0.5);
  });
});

describe('drawPairing', () => {
  it('prefers the strangest partner from the sample', () => {
    const pool = [
      item('anchor', { tags: ['spark'], structureId: 's1', date: null }),
      item('twin', { tags: ['spark'], structureId: 's1', date: null }),
      item('stranger', { tags: ['keeper'], structureId: 's2', date: '2023-01-01' }),
    ];
    // Try several seeds: whenever 'anchor' or 'twin' leads, the partner
    // must be the distant one, never the near-twin.
    for (let seed = 0; seed < 30; seed += 1) {
      const pair = drawPairing(pool, emptyState('now'), seededRng(seed))!;
      if (pair.a.objectId === 'anchor') expect(pair.b.objectId).toBe('stranger');
      if (pair.a.objectId === 'twin') expect(pair.b.objectId).toBe('stranger');
    }
  });

  it('is deterministic per seed and varies across seeds', () => {
    const pool = Array.from({ length: 30 }, (_, i) =>
      item(`n${i}`, { tags: [i % 2 ? 'odd' : 'even'], date: null }),
    );
    const one = drawPairing(pool, emptyState('now'), seededRng(5))!;
    const two = drawPairing(pool, emptyState('now'), seededRng(5))!;
    expect(one).toEqual(two);
    const anchors = new Set(
      [1, 2, 3, 4, 5, 6].map((s) => drawPairing(pool, emptyState('now'), seededRng(s))!.a.objectId),
    );
    expect(anchors.size).toBeGreaterThan(1);
  });

  it('excludes retired items and never mutates state', () => {
    const state = emptyState('now');
    state.items[objKey('dead')] = {
      mode: 'recall', lastSurfaced: null, nextEligible: null,
      surfaceCount: 0, lastResponse: 'retire', group: null, retired: true,
    };
    const snapshot = structuredClone(state);
    const pool = [item('dead'), item('x'), item('y')];
    for (let seed = 0; seed < 10; seed += 1) {
      const pair = drawPairing(pool, state, seededRng(seed))!;
      expect([pair.a.objectId, pair.b.objectId]).not.toContain('dead');
    }
    expect(state).toEqual(snapshot);
  });

  it('returns null with fewer than two eligible items', () => {
    expect(drawPairing([], emptyState('now'), seededRng(1))).toBeNull();
    expect(drawPairing([item('only')], emptyState('now'), seededRng(1))).toBeNull();
  });
});

describe('gatherPairingPool', () => {
  it('works on the minimal space: daily notes alone make a pool', async () => {
    const provider = new FixtureProvider(buildMinimalSpace(TODAY));
    const pool = await gatherPairingPool(provider, normalizeConfig({}),
      new Map((buildMinimalSpace(TODAY).dailyNotes).map((n) => [n.date, { id: n.id, title: n.title }])),
    );
    expect(pool.length).toBeGreaterThan(10);
    expect(pool.every((p) => p.date !== null)).toBe(true);
    const pair = drawPairing(pool, emptyState('now'), seededRng(2));
    expect(pair).not.toBeNull();
  });

  it('mixes daily notes with tagged items on the stranger space', async () => {
    const space = buildStrangersSpace(TODAY);
    const provider = new FixtureProvider(space);
    const config = normalizeConfig({ recall: { tags: ['spark', 'keeper'] } });
    const pool = await gatherPairingPool(
      provider,
      config,
      new Map(space.dailyNotes.map((n) => [n.date, { id: n.id, title: n.title }])),
    );
    expect(pool.some((p) => p.date !== null)).toBe(true); // daily notes
    expect(pool.some((p) => p.tags.length > 0)).toBe(true); // tagged items
    // An object carrying two swept tags appears once, with both tags.
    const multi = pool.find((p) => p.tags.length > 1);
    expect(multi).toBeDefined();
  });
});
