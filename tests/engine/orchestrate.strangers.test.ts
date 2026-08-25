import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../../src/engine/config';
import { addDays } from '../../src/engine/dates';
import { previewDaily, runDaily } from '../../src/engine/orchestrate';
import { StateManager } from '../../src/engine/state';
import type { LocalDate } from '../../src/engine/types';
import { seededRng } from '../../src/providers/fixture/generate';
import { FixtureProvider } from '../../src/providers/fixture/fixtureProvider';
import { buildStrangersSpace } from '../../src/providers/fixture/strangersSpace';

/**
 * Full-day end-to-end against the stranger's space (§12): the primary
 * regression guard for the whole premise. Nothing about this space's
 * schema is known to the code — it is all resolved from config names.
 */

const TODAY = '2026-08-25' as LocalDate;

const strangersConfig = normalizeConfig({
  types: { project: 'Expedition', person: 'Correspondent', note: 'Field Note' },
  properties: {
    projectStart: 'Set Off',
    projectTarget: 'Summit Day',
    projectStatus: 'Phase',
    personBirthday: 'Born On',
  },
  activeStatusValues: ['Underway', 'Basecamp'],
  recall: { tags: ['spark', 'keeper', 'thread'], tagWeights: { spark: 1.5 } },
  rotation: { enabled: true, groupBy: 'tag', groups: ['spark', 'thread'] },
  surfaces: { dailyNote: { enabled: true, maxItems: 8 } },
});

let tick = 0;
const nowIso = (): string => `2026-08-25T09:00:${String((tick++) % 60).padStart(2, '0')}.${tick}Z`;

async function openManager(provider: FixtureProvider) {
  const manager = await StateManager.open(provider, nowIso, strangersConfig);
  return manager;
}

describe('a full day on the stranger space', () => {
  it('runs, surfaces temporal + recall, and writes one section', async () => {
    const provider = new FixtureProvider(buildStrangersSpace(TODAY));
    const manager = await openManager(provider);
    const report = await runDaily({ provider, manager, today: TODAY, rng: seededRng(1) });

    expect(report.warnings).toEqual([]);
    expect(report.wrote).toBe(true);
    expect(report.surfaced.length).toBeGreaterThan(0);

    const labels = report.surfaced.map((s) => s.label);
    expect(labels).toContain('From 1 year ago'); // guaranteed lookback note
    expect(labels).toContain('Birthday in 3 days'); // Cordelia
    expect(labels).toContain('Started 1 year ago today'); // Tern Ridge set off

    const note = provider.dailyNoteBody(TODAY)!;
    expect(note).toContain('## Resurfaced');
    expect(note).toContain('[[');

    // The abandoned expedition near its target must NOT surface.
    expect(report.surfaced.map((s) => s.objectId)).not.toContain('x-abandoned');
  });

  it('two runs in one day produce one section (§11 idempotency)', async () => {
    const provider = new FixtureProvider(buildStrangersSpace(TODAY));
    const manager = await openManager(provider);
    await runDaily({ provider, manager, today: TODAY, rng: seededRng(1) });
    const second = await runDaily({ provider, manager, today: TODAY, rng: seededRng(2) });

    expect(second.skipped).toBe('alreadyRanToday');
    expect(second.wrote).toBe(false);
    const note = provider.dailyNoteBody(TODAY)!;
    expect(note.match(/## Resurfaced/g)).toHaveLength(1);
  });

  it('a second device the same day sees the section and does not re-append', async () => {
    const provider = new FixtureProvider(buildStrangersSpace(TODAY));
    const laptop = await openManager(provider);
    await runDaily({ provider, manager: laptop, today: TODAY, rng: seededRng(1) });

    // The phone opens with stale local state (fresh manager without
    // lastRunDate would recompute) — simulate by clearing lastRunDate.
    const phone = await StateManager.open(provider, nowIso, strangersConfig);
    phone.mutate((doc) => {
      doc.state.lastRunDate = null;
    });
    const report = await runDaily({ provider, manager: phone, today: TODAY, rng: seededRng(3) });
    expect(report.skipped).toBe('sectionAlreadyPresent');
    expect(provider.dailyNoteBody(TODAY)!.match(/## Resurfaced/g)).toHaveLength(1);
  });

  it('responses in yesterday’s note change scheduling today', async () => {
    const provider = new FixtureProvider(buildStrangersSpace(TODAY));
    const manager = await openManager(provider);
    const day1 = await runDaily({ provider, manager, today: TODAY, rng: seededRng(1) });

    // The user strikes retire on the first recall item.
    const victim = day1.surfaced.find((s) => s.source === 'recall');
    expect(victim).toBeDefined();
    const note = provider.dailyNoteBody(TODAY)!;
    provider.setDailyNoteBody(
      TODAY,
      note.replace(/`retire`/, '~~`retire`~~'), // first marker line = first item; adjust below
    );
    // Make sure the strike landed on the victim's line: rewrite precisely.
    const lines = note.split('\n');
    const idx = lines.findIndex((l) => l.includes(`[[${victim!.title}]]`));
    lines[idx + 1] = lines[idx + 1]!.replace('`retire`', '~~`retire`~~');
    provider.setDailyNoteBody(TODAY, lines.join('\n'));

    const tomorrow = addDays(TODAY, 1);
    await runDaily({ provider, manager, today: tomorrow, rng: seededRng(9) });
    const item = manager.current.state.items[victim!.key];
    expect(item?.mode === 'recall' && item.retired).toBe(true);
  });

  it('learn assignments with a resolvable target date get scheduled', async () => {
    const provider = new FixtureProvider(buildStrangersSpace(TODAY));
    const learnConfig = normalizeConfig({
      ...strangersConfig,
      learn: {
        enabled: true,
        assignByTag: ['keeper'],
        targetDateProperty: 'Summit Day',
      },
    });
    const manager = await StateManager.open(provider, nowIso, learnConfig);
    await runDaily({ provider, manager, today: TODAY, rng: seededRng(1) });

    // x-tern carries the keeper tag and has Summit Day = today+5.
    const entry = manager.current.state.items['obj:x-tern#learn'];
    expect(entry?.mode).toBe('learn');
    expect(entry?.mode === 'learn' && entry.targetDate).toBe(addDays(TODAY, 5));
    // First review delayed by minGap — never sooner, even near the target.
    expect(entry?.mode === 'learn' && entry.nextDue).toBe(addDays(TODAY, 7));
  });

  it('an item flagged for Learn in the UI surfaces when due — no tag or type needed', async () => {
    const provider = new FixtureProvider(buildStrangersSpace(TODAY));
    const learnConfig = normalizeConfig({
      ...strangersConfig,
      learn: { enabled: true }, // no assignByTag, no assignByType
    });
    const manager = await StateManager.open(provider, nowIso, learnConfig);
    // The user flagged a field note from the queue with a manual target date.
    manager.mutate((doc) => {
      doc.state.items['obj:fn-4#learn'] = {
        mode: 'learn',
        targetDate: addDays(TODAY, 40),
        lastSurfaced: addDays(TODAY, -9),
        nextDue: TODAY,
        surfaceCount: 1,
        lastResponse: null,
      };
    });
    const report = await runDaily({ provider, manager, today: TODAY, rng: seededRng(1) });

    const learnItem = report.surfaced.find((s) => s.source === 'learn');
    expect(learnItem).toBeDefined();
    expect(learnItem!.key).toBe('obj:fn-4#learn');
    expect(learnItem!.label).toContain('to target');
    // Surfacing rescheduled it at the contracting ratio.
    const entry = manager.current.state.items['obj:fn-4#learn'];
    expect(entry?.mode === 'learn' && entry.nextDue).toBe(addDays(TODAY, 7)); // 40×0.15 → floor 7
  });

  it('block granularity surfaces individual blocks with block keys', async () => {
    const provider = new FixtureProvider(buildStrangersSpace(TODAY));
    const blockConfig = normalizeConfig({
      ...strangersConfig,
      granularity: { mode: 'block', blockTypes: ['TextBlock', 'QuoteBlock'], minBlockLength: 40 },
    });
    const manager = await StateManager.open(provider, nowIso, blockConfig);
    const report = await runDaily({ provider, manager, today: TODAY, rng: seededRng(4) });

    const blockItems = report.surfaced.filter((s) => s.blockId);
    expect(blockItems.length).toBeGreaterThan(0);
    for (const item of blockItems) {
      expect(item.key).toMatch(/^blk:/);
      expect(item.excerpt).toBeTruthy();
      expect(manager.current.state.items[item.key]).toBeDefined();
    }
  });

  it('preview computes the same shape without writing anything', async () => {
    const provider = new FixtureProvider(buildStrangersSpace(TODAY));
    const manager = await openManager(provider);
    const preview = await previewDaily({ provider, manager, today: TODAY, rng: seededRng(1) });

    expect(preview.surfaced.length).toBeGreaterThan(0);
    expect(preview.markdown).toContain('## Resurfaced');
    // Nothing was written: no daily-note section, no state, manager clean.
    expect(provider.dailyNoteBody(TODAY) ?? '').not.toContain('## Resurfaced');
    expect(manager.current.state.lastRunDate).toBeNull();
    expect(manager.dirty).toBe(false);
    expect(await provider.load()).toBeNull();
  });
});
