import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/engine/config';
import { emptyDoc, objKey, StateManager } from '../../src/engine/state';
import type { LocalDate, RecallItemState } from '../../src/engine/types';
import {
  docFromMarkdown,
  docToMarkdown,
} from '../../src/providers/capacities/stateStore';
import { FixtureProvider } from '../../src/providers/fixture/fixtureProvider';
import { buildMinimalSpace } from '../../src/providers/fixture/minimalSpace';

const TODAY = '2026-08-25' as LocalDate;

let tick = 0;
const nowIso = (): string => `2026-08-25T09:00:${String(tick++).padStart(2, '0')}Z`;

function recallItem(overrides: Partial<RecallItemState> = {}): RecallItemState {
  return {
    mode: 'recall',
    lastSurfaced: null,
    nextEligible: null,
    surfaceCount: 0,
    lastResponse: null,
    group: null,
    retired: false,
    ...overrides,
  };
}

describe('StateManager over a StateStore', () => {
  it('missing state is a valid first run', async () => {
    const store = new FixtureProvider(buildMinimalSpace(TODAY));
    const mgr = await StateManager.open(store, nowIso);
    expect(mgr.current.state.items).toEqual({});
    expect(mgr.dirty).toBe(false);
  });

  it('persists mutations and reloads them', async () => {
    const store = new FixtureProvider(buildMinimalSpace(TODAY));
    const mgr = await StateManager.open(store, nowIso);
    mgr.mutate((doc) => {
      doc.state.items[objKey('o1')] = recallItem({ lastSurfaced: TODAY });
    });
    await mgr.flush();
    expect(mgr.dirty).toBe(false);

    const again = await StateManager.open(store, nowIso);
    expect(again.current.state.items[objKey('o1')]).toMatchObject({
      lastSurfaced: TODAY,
    });
  });

  it('replays pending changes onto the fresh remote on conflict (two tabs)', async () => {
    const store = new FixtureProvider(buildMinimalSpace(TODAY));

    const tabA = await StateManager.open(store, nowIso);
    const tabB = await StateManager.open(store, nowIso);

    tabA.mutate((doc) => {
      doc.state.items[objKey('from-a')] = recallItem();
    });
    await tabA.flush();

    tabB.mutate((doc) => {
      doc.state.items[objKey('from-b')] = recallItem();
    });
    await tabB.flush(); // conflicts with A's write, replays, succeeds

    const final = await StateManager.open(store, nowIso);
    // Nothing was blindly overwritten: both survive.
    expect(Object.keys(final.current.state.items).sort()).toEqual([
      objKey('from-a'),
      objKey('from-b'),
    ]);
  });

  it('an interrupted write leaves the prior valid state', async () => {
    const store = new FixtureProvider(buildMinimalSpace(TODAY));
    const mgr = await StateManager.open(store, nowIso);
    mgr.mutate((doc) => {
      doc.state.items[objKey('first')] = recallItem();
    });
    await mgr.flush();

    mgr.mutate((doc) => {
      doc.state.items[objKey('second')] = recallItem();
    });
    store.failNextSave = true;
    await expect(mgr.flush()).rejects.toThrow('simulated write failure');

    // Remote still holds the last good document.
    const reread = await StateManager.open(store, nowIso);
    expect(Object.keys(reread.current.state.items)).toEqual([objKey('first')]);

    // And the pending change is not lost: the next flush lands it.
    await mgr.flush();
    const final = await StateManager.open(store, nowIso);
    expect(Object.keys(final.current.state.items).sort()).toEqual([
      objKey('first'),
      objKey('second'),
    ]);
  });

  it('flushes nothing when clean', async () => {
    const store = new FixtureProvider(buildMinimalSpace(TODAY));
    const mgr = await StateManager.open(store, nowIso);
    await expect(mgr.flush()).resolves.toBeUndefined();
  });
});

describe('state document markdown embedding', () => {
  it('round-trips through the page markdown', () => {
    const doc = emptyDoc(defaultConfig(), '2026-08-25T09:00:00Z');
    doc.state.items[objKey('o1')] = recallItem({ group: 'Harbors' });
    const parsed = docFromMarkdown(docToMarkdown(doc), '2026-08-25T10:00:00Z');
    expect(parsed).toEqual(doc);
  });

  it('a mangled page is a first run, not an error', () => {
    expect(docFromMarkdown('# Someone deleted the block', 'now')).toBeNull();
    expect(docFromMarkdown('```json\n{oops\n```', 'now')).toBeNull();
  });

  it('survives a user writing above and below the block', () => {
    const doc = emptyDoc(defaultConfig(), '2026-08-25T09:00:00Z');
    const page = `my own note\n\n${docToMarkdown(doc)}\n\nand more below`;
    expect(docFromMarkdown(page, 'now')).toEqual(doc);
  });
});
