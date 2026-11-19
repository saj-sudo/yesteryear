import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../../src/engine/config';
import { runDaily } from '../../src/engine/orchestrate';
import { ageOf, applyResponse, snapshotItem, undoResponse } from '../../src/engine/respond';
import { emptyState, objKey, StateManager } from '../../src/engine/state';
import type { ItemResponse, LocalDate, YesteryearConfig } from '../../src/engine/types';
import { FixtureProvider } from '../../src/providers/fixture/fixtureProvider';
import { seededRng } from '../../src/providers/fixture/generate';
import { buildMinimalSpace } from '../../src/providers/fixture/minimalSpace';
import { buildStrangersSpace } from '../../src/providers/fixture/strangersSpace';
import type { FixtureSpace } from '../../src/providers/fixture/types';

/**
 * Undo must put state back exactly, for every response, on every item a
 * real day surfaces, in both fixture spaces.
 */

const TODAY = '2026-08-25' as LocalDate;

let tick = 0;
const nowIso = (): string => `2026-08-25T10:00:00.${tick++}Z`;

const SPACES: { name: string; build: (today: LocalDate) => FixtureSpace; config: YesteryearConfig }[] = [
  {
    name: 'the minimal space',
    build: buildMinimalSpace,
    config: normalizeConfig({}),
  },
  {
    name: 'the field office space',
    build: buildStrangersSpace,
    config: normalizeConfig({
      types: { project: 'Expedition', person: 'Correspondent', note: 'Field Note' },
      properties: {
        projectStart: 'Set Off',
        projectTarget: 'Summit Day',
        projectStatus: 'Phase',
        personBirthday: 'Born On',
      },
      activeStatusValues: ['Underway', 'Basecamp'],
      recall: { tags: ['spark', 'keeper', 'thread'] },
      learn: { enabled: true, assignByTag: ['keeper'], targetDateProperty: 'Summit Day' },
    }),
  },
];

describe.each(SPACES)('undo on $name', ({ build, config }) => {
  it('restores state exactly after any response to any surfaced item', async () => {
    const provider = new FixtureProvider(build(TODAY));
    const manager = await StateManager.open(provider, nowIso, config);
    const report = await runDaily({ provider, manager, today: TODAY, rng: seededRng(3) });
    expect(report.surfaced.length).toBeGreaterThan(0);

    const state = manager.current.state;
    for (const item of report.surfaced) {
      const responses: ItemResponse[] =
        item.source === 'learn' ? ['gotIt', 'notYet'] : ['keep', 'dismiss', 'retire'];
      for (const response of responses) {
        const untouched = structuredClone(state);
        const before = applyResponse(state, item.key, response, manager.current.config);
        expect(state.items[item.key]?.lastResponse).toBe(response);
        undoResponse(state, item.key, before);
        expect(state).toEqual(untouched);
      }
    }
  });

  it('a second response after an undo behaves like a first one', async () => {
    const provider = new FixtureProvider(build(TODAY));
    const manager = await StateManager.open(provider, nowIso, config);
    const report = await runDaily({ provider, manager, today: TODAY, rng: seededRng(3) });
    const item = report.surfaced.find((s) => s.source !== 'learn')!;
    const state = manager.current.state;

    const direct = structuredClone(state);
    applyResponse(direct, item.key, 'dismiss', manager.current.config);

    undoResponse(state, item.key, applyResponse(state, item.key, 'retire', manager.current.config));
    applyResponse(state, item.key, 'dismiss', manager.current.config);
    expect(state).toEqual(direct);
  });
});

describe('undo on an item with no entry yet', () => {
  it('removes the entry a recall response created', () => {
    const state = emptyState('now');
    const key = objKey('never-seen');
    const config = normalizeConfig({});
    expect(snapshotItem(state, key)).toBeNull();
    const before = applyResponse(state, key, 'keep', config);
    expect(state.items[key]).toBeDefined();
    undoResponse(state, key, before);
    expect(state.items).toEqual({});
  });

  it('the snapshot does not share arrays with live state', () => {
    const state = emptyState('now');
    const key = `${objKey('a')}#learn`;
    state.items[key] = {
      mode: 'learn', targetDate: '2026-10-01', setIds: ['s1'],
      lastSurfaced: TODAY, nextDue: null, surfaceCount: 1, lastResponse: null,
    };
    const before = snapshotItem(state, key)!;
    (state.items[key] as { setIds: string[] }).setIds.push('s2');
    undoResponse(state, key, before);
    expect(state.items[key]).toMatchObject({ setIds: ['s1'] });
  });
});

describe('the age headline', () => {
  it('is given only for a date basis that lies in the past', () => {
    expect(ageOf({ kind: 'lookback', daysAgo: 1095, date: '2023-08-26' })).toBe('3 years ago');
    expect(ageOf({ kind: 'lookback', daysAgo: 365, date: '2025-08-25' })).toBe('1 year ago');
    expect(ageOf({ kind: 'lookback', daysAgo: 90, date: '2026-05-27' })).toBe('90 days ago');
    expect(ageOf({ kind: 'anniversary', years: 2 })).toBe('2 years ago today');
    expect(ageOf({ kind: 'birthday', inDays: 3, name: 'x' })).toBeNull();
    expect(ageOf({ kind: 'targetDate', inDays: 5 })).toBeNull();
    expect(ageOf(null)).toBeNull();
    expect(ageOf(undefined)).toBeNull();
  });

  it('reaches the surfaced items of a real day', async () => {
    const provider = new FixtureProvider(buildMinimalSpace(TODAY));
    const manager = await StateManager.open(provider, nowIso, normalizeConfig({}));
    const report = await runDaily({ provider, manager, today: TODAY, rng: seededRng(1) });
    expect(report.surfaced.map((s) => ageOf(s.reason))).toContain('1 year ago');
  });
});
