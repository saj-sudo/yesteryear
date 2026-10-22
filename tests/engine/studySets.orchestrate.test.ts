import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../../src/engine/config';
import { addDays } from '../../src/engine/dates';
import { runDaily, syncLearn } from '../../src/engine/orchestrate';
import { exportDoc, normalizeDoc, StateManager } from '../../src/engine/state';
import type { LocalDate, StudySet } from '../../src/engine/types';
import { FixtureProvider } from '../../src/providers/fixture/fixtureProvider';
import { seededRng } from '../../src/providers/fixture/generate';
import { buildMinimalSpace } from '../../src/providers/fixture/minimalSpace';
import { buildStrangersSpace } from '../../src/providers/fixture/strangersSpace';

/**
 * Study sets end to end, on both fixture spaces (the stranger's schema
 * and the minimal space with nothing set up). Dates belong to the set;
 * no date property is configured anywhere in these tests.
 */

const TODAY = '2026-08-25' as LocalDate;

let tick = 0;
const nowIso = (): string => `2026-08-25T09:00:${String((tick++) % 60).padStart(2, '0')}.${tick}Z`;

function set(overrides: Partial<StudySet> & Pick<StudySet, 'id' | 'targetDate'>): StudySet {
  return { name: overrides.id, tags: [], types: [], notes: [], ...overrides };
}

const baseStrangers = {
  types: { project: 'Expedition', person: 'Correspondent', note: 'Field Note' },
  recall: { tags: ['spark', 'keeper', 'thread'] },
  surfaces: { dailyNote: { enabled: true, maxItems: 8 } },
};

async function strangers(sets: StudySet[], extra: Record<string, unknown> = {}) {
  const provider = new FixtureProvider(buildStrangersSpace(TODAY));
  const config = normalizeConfig({ ...baseStrangers, learn: { enabled: true, sets, ...extra } });
  const manager = await StateManager.open(provider, nowIso, config);
  return { provider, manager };
}

const day = (n: number): LocalDate => addDays(TODAY, n);
const run = (
  provider: FixtureProvider,
  manager: StateManager,
  today: LocalDate,
  seed = 1,
) => runDaily({ provider, manager, today, rng: seededRng(seed) });

function learnEntry(manager: StateManager, id: string) {
  const entry = manager.current.state.items[`obj:${id}#learn`];
  return entry?.mode === 'learn' ? entry : null;
}

describe('study sets on the stranger space', () => {
  it('a set picked by tag gives each tagged note the set date, with no date property', async () => {
    const { provider, manager } = await strangers([
      set({ id: 'set-1', targetDate: day(60), tags: ['thread'] }),
    ]);
    const report = await run(provider, manager, TODAY);

    expect(report.warnings).toEqual([]);
    // "thread" is on the odd-numbered field notes: fn-2, fn-4, fn-6, fn-8.
    for (const id of ['fn-2', 'fn-4', 'fn-6', 'fn-8']) {
      const entry = learnEntry(manager, id);
      expect(entry?.targetDate).toBe(day(60));
      expect(entry?.byRule).toBe(true);
      expect(entry?.nextDue).toBe(addDays(TODAY, 7)); // delayed first review
    }
    expect(learnEntry(manager, 'fn-1')).toBeNull();
  });

  it('a set picked by type covers every note of that type', async () => {
    const { provider, manager } = await strangers([
      set({ id: 'set-1', targetDate: day(30), types: ['Field Note'] }),
    ]);
    await run(provider, manager, TODAY);
    for (let i = 1; i <= 8; i += 1) {
      expect(learnEntry(manager, `fn-${i}`)?.targetDate).toBe(day(30));
    }
    expect(learnEntry(manager, 'x-tern')).toBeNull();
  });

  it('warns about a type the space does not have and lists what it does have', async () => {
    const { provider, manager } = await strangers([
      set({ id: 'set-1', name: 'Boat exam', targetDate: day(30), types: ['Flashcard'] }),
    ]);
    const report = await run(provider, manager, TODAY);
    const warning = report.warnings.find((w) => w.includes('Boat exam'));
    expect(warning).toContain('"Flashcard"');
    expect(warning).toContain('"Field Note"');
  });

  it('notes picked one by one need no tag or type, and a due one surfaces with its current title', async () => {
    const { provider, manager } = await strangers([
      set({
        id: 'set-1',
        targetDate: day(40),
        notes: [{ id: 'c-wren', title: 'old saved title' }],
      }),
    ]);
    await run(provider, manager, TODAY);
    expect(learnEntry(manager, 'c-wren')?.targetDate).toBe(day(40));

    const later = await run(provider, manager, day(8), 2);
    const item = later.surfaced.find((s) => s.source === 'learn');
    expect(item?.key).toBe('obj:c-wren#learn');
    expect(item?.title).toBe('Wren Okafor'); // live title, not the saved one
    expect(item?.label).toContain('to target');
  });

  it('a picked note that was deleted drops out when it comes due and its state goes', async () => {
    const { provider, manager } = await strangers([
      set({ id: 'set-1', targetDate: day(40), notes: [{ id: 'gone-1', title: 'Deleted note' }] }),
    ]);
    await run(provider, manager, TODAY);
    expect(learnEntry(manager, 'gone-1')).not.toBeNull();

    const later = await run(provider, manager, day(8), 2);
    expect(later.surfaced.some((s) => s.objectId === 'gone-1')).toBe(false);
    expect(learnEntry(manager, 'gone-1')).toBeNull();
  });

  it('a deleted picked note also leaves its set, so it does not come back', async () => {
    const { provider, manager } = await strangers([
      set({
        id: 'set-1',
        targetDate: day(40),
        notes: [
          { id: 'gone-1', title: 'Deleted note' },
          { id: 'c-wren', title: 'Wren' },
        ],
      }),
    ]);
    await run(provider, manager, TODAY);
    await run(provider, manager, day(8), 2);

    expect(manager.current.config.learn.sets[0]?.notes.map((n) => n.id)).toEqual(['c-wren']);

    // A sync after that must not bring the deleted note back into Learn.
    await syncLearn({ provider, manager, today: day(9) });
    expect(learnEntry(manager, 'gone-1')).toBeNull();
    expect(learnEntry(manager, 'c-wren')).not.toBeNull();
  });

  it('a note in two sets studies toward the nearer date, then the later one', async () => {
    const { provider, manager } = await strangers([
      set({ id: 'set-1', name: 'Midterm', targetDate: day(20), notes: [{ id: 'fn-3', title: 'x' }] }),
      set({ id: 'set-2', name: 'Final', targetDate: day(60), tags: ['spark'] }), // fn-3 is spark
    ]);
    await run(provider, manager, TODAY);
    expect(learnEntry(manager, 'fn-3')?.targetDate).toBe(day(20));

    // It has been reviewed a few times since. Then the midterm passes.
    manager.mutate((doc) => {
      const item = doc.state.items['obj:fn-3#learn'];
      if (item?.mode === 'learn') {
        item.surfaceCount = 3;
        item.lastSurfaced = day(12);
        item.nextDue = day(30);
      }
    });
    await run(provider, manager, day(21), 2);

    // It keeps its history and its next review, and now aims at the final.
    const after = learnEntry(manager, 'fn-3');
    expect(after?.targetDate).toBe(day(60));
    expect(after?.byRule).toBe(true);
    expect(after?.surfaceCount).toBe(3);
    expect(after?.lastSurfaced).toBe(day(12));
    expect(after?.nextDue).toBe(day(30));
  });

  it('records which sets select a note, nearest date first, and drops a set once it has passed', async () => {
    const { provider, manager } = await strangers([
      set({ id: 'set-1', name: 'Midterm', targetDate: day(20), notes: [{ id: 'fn-3', title: 'x' }] }),
      set({ id: 'set-2', name: 'Final', targetDate: day(60), tags: ['spark'] }), // fn-3 is spark
    ]);
    await run(provider, manager, TODAY);
    expect(learnEntry(manager, 'fn-3')?.setIds).toEqual(['set-1', 'set-2']);
    // A note only the final selects names only the final.
    const onlyFinal = Object.keys(manager.current.state.items)
      .filter((k) => k.endsWith('#learn') && k !== 'obj:fn-3#learn')
      .map((k) => manager.current.state.items[k])
      .filter((i) => i?.mode === 'learn');
    expect(onlyFinal.length).toBeGreaterThan(0);
    for (const item of onlyFinal) expect(item?.mode === 'learn' && item.setIds).toEqual(['set-2']);

    await run(provider, manager, day(21), 2);
    expect(learnEntry(manager, 'fn-3')?.setIds).toEqual(['set-2']);
  });

  it('keeps the set ids through a save and a reload, and loads state saved without them', async () => {
    const { provider, manager } = await strangers([
      set({ id: 'set-1', targetDate: day(40), notes: [{ id: 'c-wren', title: 'x' }] }),
    ]);
    await run(provider, manager, TODAY);
    expect(learnEntry(manager, 'c-wren')?.setIds).toEqual(['set-1']);

    const reloaded = normalizeDoc(JSON.parse(exportDoc(manager.current)), nowIso());
    const item = reloaded.state.items['obj:c-wren#learn'];
    expect(item?.mode === 'learn' && item.setIds).toEqual(['set-1']);

    // State written before set ids existed has none, and still loads.
    const legacy = JSON.parse(exportDoc(manager.current)) as { state: { items: Record<string, Record<string, unknown>> } };
    delete legacy.state.items['obj:c-wren#learn']!['setIds'];
    const old = normalizeDoc(legacy, nowIso()).state.items['obj:c-wren#learn'];
    expect(old?.mode === 'learn' && old.setIds).toBeUndefined();
  });

  it('moving a set to a later date moves its notes and keeps their schedule', async () => {
    const { provider, manager } = await strangers([
      set({ id: 'set-1', targetDate: day(30), tags: ['thread'] }),
    ]);
    await run(provider, manager, TODAY);
    const nextDue = learnEntry(manager, 'fn-2')!.nextDue;

    manager.mutate((doc) => {
      doc.config.learn.sets[0]!.targetDate = day(90);
    });
    await run(provider, manager, day(1), 2);
    const entry = learnEntry(manager, 'fn-2');
    expect(entry?.targetDate).toBe(day(90));
    expect(entry?.nextDue).toBe(nextDue);
  });

  it('moving a set earlier never leaves the next review after the new date', async () => {
    const { provider, manager } = await strangers([
      set({ id: 'set-1', targetDate: day(120), tags: ['thread'] }),
    ]);
    await run(provider, manager, TODAY);
    // A review at day 8 pushes the next one out (0.15 x 112 = 17 days).
    manager.mutate((doc) => {
      const item = doc.state.items['obj:fn-2#learn'];
      if (item?.mode === 'learn') item.nextDue = day(60);
      doc.config.learn.sets[0]!.targetDate = day(10);
    });
    await run(provider, manager, day(1), 2);
    const entry = learnEntry(manager, 'fn-2');
    expect(entry?.targetDate).toBe(day(10));
    expect(entry!.nextDue! <= day(10)).toBe(true);
  });

  it('taking a note out of a set, or deleting the set, sends it back to Recall', async () => {
    const { provider, manager } = await strangers([
      set({ id: 'set-1', targetDate: day(60), notes: [{ id: 'c-wren', title: 'x' }], tags: ['ember'] }),
    ]);
    await run(provider, manager, TODAY);
    expect(learnEntry(manager, 'c-wren')).not.toBeNull();
    expect(learnEntry(manager, 'c-cordelia')).not.toBeNull(); // tagged ember

    manager.mutate((doc) => {
      doc.config.learn.sets[0]!.notes = [];
    });
    await run(provider, manager, day(1), 2);
    expect(learnEntry(manager, 'c-wren')).toBeNull();
    expect(manager.current.state.items['obj:c-wren']?.mode).toBe('recall');
    expect(learnEntry(manager, 'c-cordelia')).not.toBeNull();

    manager.mutate((doc) => {
      doc.config.learn.sets = [];
    });
    await run(provider, manager, day(2), 3);
    expect(learnEntry(manager, 'c-cordelia')).toBeNull();
  });

  it('leaves a note flagged by hand alone when a set stops selecting it', async () => {
    const { provider, manager } = await strangers([]);
    manager.mutate((doc) => {
      doc.state.items['obj:fn-4#learn'] = {
        mode: 'learn',
        targetDate: day(40),
        lastSurfaced: null,
        nextDue: day(30),
        surfaceCount: 0,
        lastResponse: null,
      };
    });
    await run(provider, manager, TODAY);
    expect(learnEntry(manager, 'fn-4')?.byRule).toBeUndefined();
    expect(learnEntry(manager, 'fn-4')?.targetDate).toBe(day(40));
  });

  it('a repeat exam: the passed set releases its notes, a new date brings them back', async () => {
    const { provider, manager } = await strangers([
      set({ id: 'set-1', targetDate: day(14), tags: ['thread'] }),
    ]);
    await run(provider, manager, TODAY);
    expect(learnEntry(manager, 'fn-2')).not.toBeNull();

    // The exam date goes by.
    await run(provider, manager, day(15), 2);
    expect(learnEntry(manager, 'fn-2')).toBeNull();
    expect(manager.current.state.items['obj:fn-2']?.mode).toBe('recall');

    // Next term: the same set gets a new date, the same notes come back.
    manager.mutate((doc) => {
      doc.config.learn.sets[0]!.targetDate = day(120);
    });
    await run(provider, manager, day(16), 3);
    const again = learnEntry(manager, 'fn-2');
    expect(again?.targetDate).toBe(day(120));
    expect(again?.nextDue).toBe(addDays(day(16), 7));
  });

  it('a date property and a set both count; the nearer date wins', async () => {
    // x-tern carries "keeper" and has Summit Day = today + 5.
    const { provider, manager } = await strangers(
      [set({ id: 'set-1', targetDate: day(90), notes: [{ id: 'x-tern', title: 'x' }] })],
      { assignByTag: ['keeper'], targetDateProperty: 'Summit Day' },
    );
    await run(provider, manager, TODAY);
    expect(learnEntry(manager, 'x-tern')?.targetDate).toBe(day(5));
  });

  it('ignores sets while Learn is off', async () => {
    const provider = new FixtureProvider(buildStrangersSpace(TODAY));
    const config = normalizeConfig({
      ...baseStrangers,
      learn: { enabled: false, sets: [set({ id: 'set-1', targetDate: day(30), tags: ['thread'] })] },
    });
    const manager = await StateManager.open(provider, nowIso, config);
    await run(provider, manager, TODAY);
    expect(learnEntry(manager, 'fn-2')).toBeNull();
  });
});

describe('study sets on the minimal space', () => {
  it('works with notes picked by hand and nothing else configured', async () => {
    const provider = new FixtureProvider(buildMinimalSpace(TODAY));
    const oldNote = addDays(TODAY, -30);
    const noteId = provider.dailyNoteIdForDate(oldNote);
    expect(noteId).not.toBeNull();
    const config = normalizeConfig({
      learn: {
        enabled: true,
        sets: [set({ id: 'set-1', targetDate: day(50), notes: [{ id: noteId!, title: 'A day last month' }] })],
      },
    });
    const manager = await StateManager.open(provider, nowIso, config);

    const first = await run(provider, manager, TODAY);
    expect(first.warnings).toEqual([]);
    expect(learnEntry(manager, noteId!)?.targetDate).toBe(day(50));

    const later = await run(provider, manager, day(8), 2);
    expect(later.surfaced.some((s) => s.source === 'learn' && s.objectId === noteId)).toBe(true);
    expect(learnEntry(manager, noteId!)?.setIds).toEqual(['set-1']);
  });

  it('a picked note that was deleted leaves its set on the minimal space too', async () => {
    const provider = new FixtureProvider(buildMinimalSpace(TODAY));
    const noteId = provider.dailyNoteIdForDate(addDays(TODAY, -30));
    const config = normalizeConfig({
      learn: {
        enabled: true,
        sets: [
          set({
            id: 'set-1',
            targetDate: day(50),
            notes: [
              { id: noteId!, title: 'A day last month' },
              { id: 'long-gone', title: 'Deleted note' },
            ],
          }),
        ],
      },
    });
    const manager = await StateManager.open(provider, nowIso, config);
    await run(provider, manager, TODAY);
    await run(provider, manager, day(8), 2);
    expect(manager.current.config.learn.sets[0]?.notes.map((n) => n.id)).toEqual([noteId]);
  });

  it('a set that names a tag the space lacks warns and does nothing else', async () => {
    const provider = new FixtureProvider(buildMinimalSpace(TODAY));
    const config = normalizeConfig({
      learn: { enabled: true, sets: [set({ id: 'set-1', targetDate: day(50), tags: ['exam'] })] },
    });
    const manager = await StateManager.open(provider, nowIso, config);
    const report = await run(provider, manager, TODAY);
    expect(report.warnings.some((w) => w.includes('Tag "exam"'))).toBe(true);
    expect(Object.keys(manager.current.state.items).filter((k) => k.endsWith('#learn'))).toEqual([]);
  });
});

describe('applying a change straight away', () => {
  it('syncLearn puts a new set to work without waiting for tomorrow, and takes a removed note out', async () => {
    const { provider, manager } = await strangers([]);
    await run(provider, manager, TODAY); // today's run is done
    expect(learnEntry(manager, 'fn-2')).toBeNull();

    manager.mutate((doc) => {
      doc.config.learn.sets.push(set({ id: 'set-1', targetDate: day(45), tags: ['thread'] }));
    });
    const result = await syncLearn({ provider, manager, today: TODAY });
    expect(result.warnings).toEqual([]);
    expect(learnEntry(manager, 'fn-2')?.targetDate).toBe(day(45));
    expect(learnEntry(manager, 'fn-2')?.nextDue).toBe(addDays(TODAY, 7));
    expect(manager.dirty).toBe(false); // written through

    manager.mutate((doc) => {
      doc.config.learn.sets = [];
    });
    await syncLearn({ provider, manager, today: TODAY });
    expect(learnEntry(manager, 'fn-2')).toBeNull();
  });

  it('syncLearn does nothing while Learn is off', async () => {
    const provider = new FixtureProvider(buildStrangersSpace(TODAY));
    const config = normalizeConfig({
      ...baseStrangers,
      learn: { enabled: false, sets: [set({ id: 'set-1', targetDate: day(45), tags: ['thread'] })] },
    });
    const manager = await StateManager.open(provider, nowIso, config);
    await syncLearn({ provider, manager, today: TODAY });
    expect(learnEntry(manager, 'fn-2')).toBeNull();
  });

  it('syncLearn reports a type the space lacks', async () => {
    const { provider, manager } = await strangers([
      set({ id: 'set-1', name: 'Boat exam', targetDate: day(30), types: ['Flashcard'] }),
    ]);
    const result = await syncLearn({ provider, manager, today: TODAY });
    expect(result.warnings.some((w) => w.includes('Boat exam') && w.includes('"Flashcard"'))).toBe(true);
  });
});
