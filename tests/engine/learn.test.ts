import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/engine/config';
import {
  applyLearnResponse,
  dueLearn,
  ensureLearnScheduled,
  learnGapDays,
  markLearnSurfaced,
  revertExpiredLearn,
} from '../../src/engine/learn';
import { emptyState, learnKey, objKey } from '../../src/engine/state';
import type { Candidate, LocalDate } from '../../src/engine/types';

const TODAY = '2026-08-25' as LocalDate;
const cfg = { ...defaultConfig().learn, enabled: true };
const recallCfg = defaultConfig().recall;
const KEY = learnKey(objKey('o1'));

function cand(): Candidate {
  return {
    key: KEY,
    objectId: 'o1',
    blockId: null,
    title: 'Fog instruments',
    excerpt: null,
    source: 'learn',
    temporalReason: null,
    tags: [],
    group: null,
    targetDate: '2026-11-01',
  };
}

describe('learnGapDays', () => {
  it('is the target ratio of days-until-target', () => {
    expect(learnGapDays(100, cfg)).toBe(15); // 0.15 × 100
    expect(learnGapDays(200, cfg)).toBe(30);
  });

  it('clamps to the floor and the ceiling', () => {
    expect(learnGapDays(10, cfg)).toBe(7); // floor minGapDays
    expect(learnGapDays(10_000, cfg)).toBe(90); // ceiling maxGapDays
    expect(learnGapDays(0, cfg)).toBe(7);
  });

  it('halves at the missed-it multiplier, floor still applying', () => {
    expect(learnGapDays(200, cfg, 0.5)).toBe(15);
    expect(learnGapDays(60, cfg, 0.5)).toBe(7); // 4.5 → floor 7
  });
});

describe('scheduling', () => {
  it('delays the first review by minGap even when the target is close', () => {
    const state = emptyState('now');
    const item = ensureLearnScheduled(state, KEY, '2026-08-28', TODAY, cfg);
    expect(item.nextDue).toBe('2026-09-01'); // today + 7, past the target
  });

  it('gaps contract as the target approaches', () => {
    const state = emptyState('now');
    ensureLearnScheduled(state, KEY, '2026-11-01', TODAY, cfg);

    markLearnSurfaced(state, KEY, TODAY, cfg); // 68 days out → gap 10
    const first = state.items[KEY]!;
    expect(first.mode === 'learn' && first.nextDue).toBe('2026-09-04');

    markLearnSurfaced(state, KEY, '2026-10-05', cfg); // 27 days out → floor 7
    const second = state.items[KEY]!;
    expect(second.mode === 'learn' && second.nextDue).toBe('2026-10-12');
  });

  it('due only when nextDue arrives; overdue keeps its place', () => {
    const state = emptyState('now');
    ensureLearnScheduled(state, KEY, '2026-11-01', TODAY, cfg);
    expect(dueLearn([cand()], state, TODAY)).toEqual([]);
    expect(dueLearn([cand()], state, '2026-09-01')).toHaveLength(1);
    expect(dueLearn([cand()], state, '2026-10-20')).toHaveLength(1); // long overdue: still one item
  });
});

describe('responses', () => {
  function surfacedState() {
    const state = emptyState('now');
    ensureLearnScheduled(state, KEY, '2026-11-01', TODAY, cfg);
    markLearnSurfaced(state, KEY, TODAY, cfg);
    return state;
  }

  it('got it keeps the full-ratio gap', () => {
    const state = surfacedState();
    applyLearnResponse(state, KEY, 'gotIt', cfg);
    const item = state.items[KEY]!;
    expect(item.mode === 'learn' && item.nextDue).toBe('2026-09-04');
  });

  it('missed it halves the next gap', () => {
    const state = surfacedState();
    applyLearnResponse(state, KEY, 'missedIt', cfg);
    const item = state.items[KEY]!;
    // 68 days out × 0.15 × 0.5 ≈ 5 → floor 7.
    expect(item.mode === 'learn' && item.nextDue).toBe('2026-09-01');
  });

  it('no response is treated as got it — silence stays safe', () => {
    const state = surfacedState();
    const item = state.items[KEY]!;
    expect(item.mode === 'learn' && item.nextDue).toBe('2026-09-04');
    expect(item.lastResponse).toBeNull();
  });
});

describe('revert after target (§8.3)', () => {
  it('a passed target becomes a recall item instead of disappearing', () => {
    const state = emptyState('now');
    ensureLearnScheduled(state, KEY, '2026-08-01', '2026-07-01', cfg);
    markLearnSurfaced(state, KEY, '2026-07-20', cfg);

    const reverted = revertExpiredLearn(state, TODAY, cfg, recallCfg);
    expect(reverted).toEqual([KEY]);
    expect(state.items[KEY]).toBeUndefined();
    expect(state.items[objKey('o1')]).toMatchObject({
      mode: 'recall',
      lastSurfaced: '2026-07-20',
      surfaceCount: 1,
    });
  });

  it('respects revertToRecallAfterTarget = false', () => {
    const state = emptyState('now');
    ensureLearnScheduled(state, KEY, '2026-08-01', '2026-07-01', cfg);
    const off = { ...cfg, revertToRecallAfterTarget: false };
    expect(revertExpiredLearn(state, TODAY, off, recallCfg)).toEqual([]);
    expect(state.items[KEY]).toBeDefined();
  });

  it('does not clobber an existing recall entry for the same object', () => {
    const state = emptyState('now');
    state.items[objKey('o1')] = {
      mode: 'recall', lastSurfaced: '2026-08-10', nextEligible: '2026-09-24',
      surfaceCount: 5, lastResponse: 'keep', group: 'Harbors', retired: false,
    };
    ensureLearnScheduled(state, KEY, '2026-08-01', '2026-07-01', cfg);
    revertExpiredLearn(state, TODAY, cfg, recallCfg);
    expect(state.items[objKey('o1')]).toMatchObject({ surfaceCount: 5, group: 'Harbors' });
  });
});
