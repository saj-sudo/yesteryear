import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../../src/engine/config';
import { rankAndMerge, rotationBoostOf, scoreOf } from '../../src/engine/rank';
import { emptyState, learnKey, objKey } from '../../src/engine/state';
import type { Candidate, LocalDate } from '../../src/engine/types';

const TODAY = '2026-08-25' as LocalDate;

function cand(id: string, over: Partial<Candidate> = {}): Candidate {
  return {
    key: objKey(id),
    objectId: id,
    blockId: null,
    title: id,
    excerpt: null,
    source: 'recall',
    temporalReason: null,
    tags: [],
    group: null,
    targetDate: null,
    ...over,
  };
}

const config = normalizeConfig({
  recall: { tagWeights: { hot: 1.5 } },
  rotation: { enabled: true, groupBy: 'tag', groups: ['Work', 'Health'] },
  surfaces: { dailyNote: { maxItems: 4 } },
});

describe('rotation (§8.4 — the most important rule in the module)', () => {
  it('a neglected group outranks a higher-weighted item from an over-surfaced group', () => {
    const state = emptyState('now');
    state.groupLastSurfaced['Work'] = '2026-08-24'; // surfaced yesterday
    state.groupLastSurfaced['Health'] = '2026-07-25'; // a month neglected

    const workHot = cand('work', { tags: ['hot', 'Work'], group: 'Work' });
    const healthPlain = cand('health', { tags: ['Health'], group: 'Health' });

    expect(scoreOf(healthPlain, state, config, TODAY)).toBeGreaterThan(
      scoreOf(workHot, state, config, TODAY),
    );

    const merged = rankAndMerge({
      temporal: [],
      recall: [workHot, healthPlain],
      learn: [],
      state,
      config,
      today: TODAY,
    });
    expect(merged[0]!.objectId).toBe('health');
  });

  it('a group never surfaced at all boosts the most', () => {
    const state = emptyState('now');
    state.groupLastSurfaced['Work'] = '2026-08-18';
    expect(rotationBoostOf(cand('x', { group: 'Health' }), state, config, TODAY)).toBe(4);
    expect(
      rotationBoostOf(cand('y', { group: 'Work' }), state, config, TODAY),
    ).toBeCloseTo(2);
  });

  it('rotation off means no boost', () => {
    const off = normalizeConfig({ rotation: { enabled: false } });
    expect(rotationBoostOf(cand('x', { group: 'Health' }), emptyState('now'), off, TODAY)).toBe(1);
  });
});

describe('learn share (§8.4)', () => {
  const learnCands = ['l1', 'l2', 'l3'].map((id) =>
    cand(id, { key: learnKey(objKey(id)), source: 'learn', targetDate: '2026-11-01' }),
  );

  it('learn items go first but never past maxShareOfDailySlots', () => {
    const merged = rankAndMerge({
      temporal: [cand('t1', { source: 'temporal' })],
      recall: [cand('r1'), cand('r2'), cand('r3')],
      learn: learnCands,
      state: emptyState('now'),
      config,
      today: TODAY,
    });
    expect(merged).toHaveLength(4);
    expect(merged.filter((c) => c.source === 'learn')).toHaveLength(2); // half of 4
    expect(merged[0]!.source).toBe('learn');
    // Overflow simply stays due — nothing expands the allocation.
  });
});

describe('minimal mode (§8.1)', () => {
  const minimal = normalizeConfig({ minimalMode: true });

  it('surfaces exactly one item and prefers temporal', () => {
    const merged = rankAndMerge({
      temporal: [cand('t1', { source: 'temporal' })],
      recall: [cand('r1'), cand('r2')],
      learn: [],
      state: emptyState('now'),
      config: minimal,
      today: TODAY,
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]!.objectId).toBe('t1');
  });

  it('a due Learn item takes the single slot', () => {
    const merged = rankAndMerge({
      temporal: [cand('t1', { source: 'temporal' })],
      recall: [],
      learn: [cand('l1', { key: learnKey(objKey('l1')), source: 'learn' })],
      state: emptyState('now'),
      config: minimal,
      today: TODAY,
    });
    expect(merged.map((c) => c.objectId)).toEqual(['l1']);
  });
});

describe('sampled-pool-first merge', () => {
  it('recall gets at least half the slots; lookbacks compete for the rest', () => {
    const lookback = (id: string, daysAgo: number): Candidate =>
      cand(id, {
        source: 'temporal',
        temporalReason: { kind: 'lookback', daysAgo, date: '2026-05-27' },
      });
    const merged = rankAndMerge({
      temporal: [lookback('lb1', 30), lookback('lb2', 90), lookback('lb3', 365)],
      recall: [cand('r1'), cand('r2'), cand('r3')],
      learn: [],
      state: emptyState('now'),
      config, // maxItems 4
      today: TODAY,
    });
    expect(merged).toHaveLength(4);
    expect(merged.filter((c) => c.source === 'recall')).toHaveLength(2); // ceil(4/2)
    expect(merged.filter((c) => c.source === 'temporal')).toHaveLength(2);
  });

  it('birthdays and target dates always land, even in a full day', () => {
    const merged = rankAndMerge({
      temporal: [
        cand('bday', {
          source: 'temporal',
          temporalReason: { kind: 'birthday', inDays: 2, name: 'X' },
        }),
        cand('due', {
          source: 'temporal',
          temporalReason: { kind: 'targetDate', inDays: 3 },
        }),
        cand('lb', {
          source: 'temporal',
          temporalReason: { kind: 'lookback', daysAgo: 365, date: '2025-08-25' },
        }),
      ],
      recall: [cand('r1'), cand('r2'), cand('r3'), cand('r4')],
      learn: [],
      state: emptyState('now'),
      config, // maxItems 4
      today: TODAY,
    });
    const ids = merged.map((c) => c.objectId);
    expect(ids).toContain('bday');
    expect(ids).toContain('due');
    expect(merged.filter((c) => c.source === 'recall')).toHaveLength(2);
    expect(ids).not.toContain('lb'); // the calendar-connected item is what yields
  });
});

describe('edges', () => {
  it('zero candidates is a normal state', () => {
    expect(
      rankAndMerge({
        temporal: [], recall: [], learn: [],
        state: emptyState('now'), config, today: TODAY,
      }),
    ).toEqual([]);
  });

  it('retired items never surface, not even via temporal', () => {
    const state = emptyState('now');
    state.items[objKey('t1')] = {
      mode: 'recall', lastSurfaced: null, nextEligible: null,
      surfaceCount: 1, lastResponse: 'retire', group: null, retired: true,
    };
    const merged = rankAndMerge({
      temporal: [cand('t1', { source: 'temporal' })],
      recall: [],
      learn: [],
      state, config, today: TODAY,
    });
    expect(merged).toEqual([]);
  });

  it('a candidate in both temporal and recall surfaces once, as temporal', () => {
    const merged = rankAndMerge({
      temporal: [cand('dup', { source: 'temporal' })],
      recall: [cand('dup')],
      learn: [],
      state: emptyState('now'), config, today: TODAY,
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]!.source).toBe('temporal');
  });
});
