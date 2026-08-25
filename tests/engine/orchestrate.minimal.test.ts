import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../../src/engine/config';
import { runDaily } from '../../src/engine/orchestrate';
import { StateManager } from '../../src/engine/state';
import type { LocalDate } from '../../src/engine/types';
import { seededRng } from '../../src/providers/fixture/generate';
import { FixtureProvider } from '../../src/providers/fixture/fixtureProvider';
import { buildMinimalSpace } from '../../src/providers/fixture/minimalSpace';

/**
 * The minimal space (§12): no custom types, no tags, zero configuration.
 * Daily-note lookback must still work — it is the one feature that needs
 * no mapping at all (§8.2).
 */

const TODAY = '2026-08-25' as LocalDate;

let tick = 0;
const nowIso = (): string => `2026-08-25T08:00:00.${tick++}Z`;

describe('a full day on the minimal space with zero configuration', () => {
  it('surfaces daily-note lookbacks and writes the section', async () => {
    const provider = new FixtureProvider(buildMinimalSpace(TODAY));
    const config = normalizeConfig({ surfaces: { dailyNote: { enabled: true } } });
    const manager = await StateManager.open(provider, nowIso, config);
    const report = await runDaily({ provider, manager, today: TODAY, rng: seededRng(1) });

    expect(report.warnings).toEqual([]);
    expect(report.surfaced.length).toBeGreaterThan(0);
    expect(report.surfaced.every((s) => s.source === 'temporal')).toBe(true);
    expect(report.surfaced.map((s) => s.label)).toContain('From 1 year ago');
    expect(provider.dailyNoteBody(TODAY)!).toContain('## Resurfaced');
  });

  it('minimal mode surfaces exactly one temporal item', async () => {
    const provider = new FixtureProvider(buildMinimalSpace(TODAY));
    const config = normalizeConfig({
      minimalMode: true,
      surfaces: { dailyNote: { enabled: true } },
    });
    const manager = await StateManager.open(provider, nowIso, config);
    const report = await runDaily({ provider, manager, today: TODAY, rng: seededRng(1) });
    expect(report.surfaced).toHaveLength(1);
    expect(report.surfaced[0]!.source).toBe('temporal');
  });

  it('a day with zero candidates writes nothing at all — no empty heading', async () => {
    const provider = new FixtureProvider({
      ...buildMinimalSpace(TODAY),
      dailyNotes: [], // an entirely new space
    });
    const config = normalizeConfig({ surfaces: { dailyNote: { enabled: true } } });
    const manager = await StateManager.open(provider, nowIso, config);
    const report = await runDaily({ provider, manager, today: TODAY, rng: seededRng(1) });

    expect(report.surfaced).toEqual([]);
    expect(report.markdown).toBeNull();
    expect(report.wrote).toBe(false);
    expect(provider.dailyNoteBody(TODAY)).toBeNull();
  });

  it('the write surface stays off unless opted in (read before write)', async () => {
    const provider = new FixtureProvider(buildMinimalSpace(TODAY));
    const manager = await StateManager.open(provider, nowIso, normalizeConfig({}));
    const report = await runDaily({ provider, manager, today: TODAY, rng: seededRng(1) });

    expect(report.surfaced.length).toBeGreaterThan(0); // still computed for the site
    expect(report.wrote).toBe(false);
    expect(provider.dailyNoteBody(TODAY) ?? '').not.toContain('## Resurfaced');
  });
});
