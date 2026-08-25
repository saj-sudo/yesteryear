import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/engine/config';
import {
  applyRecallResponse,
  eligibleRecall,
  markRecallSurfaced,
  sampleRecall,
} from '../../src/engine/recall';
import { emptyState, objKey } from '../../src/engine/state';
import type { Candidate, LocalDate } from '../../src/engine/types';
import { seededRng } from '../../src/providers/fixture/generate';

const TODAY = '2026-08-25' as LocalDate;
const cfg = { ...defaultConfig().recall, tags: ['spark'] };

function cand(id: string, tags: string[] = []): Candidate {
  return {
    key: objKey(id),
    objectId: id,
    blockId: null,
    title: id,
    excerpt: null,
    source: 'recall',
    temporalReason: null,
    tags,
    group: null,
    targetDate: null,
  };
}

describe('cooldown eligibility', () => {
  it('a surfaced item is ineligible until its cooldown passes', () => {
    const state = emptyState('now');
    markRecallSurfaced(state, objKey('a'), null, TODAY, cfg);
    expect(eligibleRecall([cand('a')], state, TODAY)).toEqual([]);
    // 44 days later: still cooling (default 45).
    expect(eligibleRecall([cand('a')], state, '2026-10-08')).toEqual([]);
    // Day 45: eligible again.
    expect(eligibleRecall([cand('a')], state, '2026-10-09')).toHaveLength(1);
  });

  it('overdue items keep their place — no backlog dump after missed days', () => {
    const state = emptyState('now');
    markRecallSurfaced(state, objKey('a'), null, '2025-01-01', cfg);
    expect(eligibleRecall([cand('a')], state, TODAY)).toHaveLength(1);
  });

  it('never-surfaced items are eligible immediately', () => {
    expect(eligibleRecall([cand('new')], emptyState('now'), TODAY)).toHaveLength(1);
  });
});

describe('responses (§8.3 table)', () => {
  it('keep leaves the normal cooldown', () => {
    const state = emptyState('now');
    markRecallSurfaced(state, objKey('a'), null, TODAY, cfg);
    applyRecallResponse(state, objKey('a'), 'keep', cfg);
    expect(state.items[objKey('a')]).toMatchObject({ nextEligible: '2026-10-09' });
  });

  it('dismiss multiplies the cooldown by 3', () => {
    const state = emptyState('now');
    markRecallSurfaced(state, objKey('a'), null, TODAY, cfg);
    applyRecallResponse(state, objKey('a'), 'dismiss', cfg);
    // 45 × 3 = 135 days after surfacing.
    expect(state.items[objKey('a')]).toMatchObject({ nextEligible: '2027-01-07' });
  });

  it('retire removes permanently; nothing else ever removes', () => {
    const state = emptyState('now');
    markRecallSurfaced(state, objKey('a'), null, TODAY, cfg);
    applyRecallResponse(state, objKey('a'), 'retire', cfg);
    expect(eligibleRecall([cand('a')], state, '2030-01-01')).toEqual([]);
  });

  it('no response means the standard interval advance (silence is valid)', () => {
    const state = emptyState('now');
    markRecallSurfaced(state, objKey('a'), null, TODAY, cfg);
    // No applyRecallResponse call at all:
    expect(state.items[objKey('a')]).toMatchObject({
      nextEligible: '2026-10-09',
      lastResponse: null,
    });
  });
});

describe('weighted sampling', () => {
  it('fills the requested slots without duplicates', () => {
    const pool = ['a', 'b', 'c', 'd', 'e'].map((id) => cand(id));
    const picked = sampleRecall(pool, emptyState('now'), cfg, 3, TODAY, seededRng(7));
    expect(picked).toHaveLength(3);
    expect(new Set(picked.map((c) => c.key)).size).toBe(3);
  });

  it('varies with the seed (sampling, not a fixed ranking)', () => {
    const pool = Array.from({ length: 20 }, (_, i) => cand(`n${i}`));
    const runs = new Set(
      [1, 2, 3, 4, 5].map((seed) =>
        sampleRecall(pool, emptyState('now'), cfg, 3, TODAY, seededRng(seed))
          .map((c) => c.key)
          .join(','),
      ),
    );
    expect(runs.size).toBeGreaterThan(1);
  });

  it('favors higher-weighted tags over many draws', () => {
    const config = { ...cfg, randomShare: 0, tagWeights: { spark: 8 } };
    const pool = [cand('weighted', ['spark']), cand('plain-1'), cand('plain-2')];
    let weightedWins = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      const [first] = sampleRecall(pool, emptyState('now'), config, 1, TODAY, seededRng(seed));
      if (first!.objectId === 'weighted') weightedWins += 1;
    }
    // weight 8 of total 10 → expect a clear majority.
    expect(weightedWins).toBeGreaterThan(120);
  });

  it('the randomShare slice ignores weights entirely', () => {
    const config = { ...cfg, randomShare: 1, tagWeights: { spark: 1000 } };
    const pool = [cand('heavy', ['spark']), cand('light-1'), cand('light-2')];
    let heavyWins = 0;
    for (let seed = 0; seed < 300; seed += 1) {
      const [first] = sampleRecall(pool, emptyState('now'), config, 1, TODAY, seededRng(seed));
      if (first!.objectId === 'heavy') heavyWins += 1;
    }
    // Uniform: ~1/3, nowhere near the weighted majority.
    expect(heavyWins).toBeGreaterThan(50);
    expect(heavyWins).toBeLessThan(150);
  });
});
