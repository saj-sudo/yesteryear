import { describe, expect, it } from 'vitest';
import { defaultConfig, normalizeConfig } from '../../src/engine/config';

describe('defaultConfig', () => {
  const d = defaultConfig();

  it('contains no schema names — types, properties, tags all start empty (§4)', () => {
    expect(d.types).toEqual({});
    expect(d.properties).toEqual({});
    expect(d.recall.tags).toEqual([]);
    expect(d.recall.tagWeights).toEqual({});
    expect(d.activeStatusValues).toEqual([]);
    expect(d.rotation.groups).toEqual([]);
    expect(d.learn.assignByTag).toEqual([]);
    expect(d.learn.assignByType).toEqual([]);
  });

  it('carries the spec §6 scheduling defaults', () => {
    expect(d.recall.cooldownDays).toBe(45);
    expect(d.recall.randomShare).toBe(0.2);
    expect(d.learn.targetRatio).toBe(0.15);
    expect(d.learn.minGapDays).toBe(7);
    expect(d.temporal.lookbackDays).toEqual([30, 90, 365]);
  });

  it('keeps write surfaces off until opted in (read before write)', () => {
    expect(d.surfaces.dailyNote.enabled).toBe(false);
    expect(d.learn.enabled).toBe(false);
  });
});

describe('normalizeConfig', () => {
  it('fills a full config from nothing (valid first run)', () => {
    expect(normalizeConfig(undefined)).toEqual(defaultConfig());
    expect(normalizeConfig({})).toEqual(defaultConfig());
    expect(normalizeConfig('garbage')).toEqual(defaultConfig());
  });

  it('preserves user values and merges the rest', () => {
    const cfg = normalizeConfig({
      spaceId: 'abc',
      types: { project: 'Expedition', bogus: 'x' },
      recall: { tags: ['spark'], cooldownDays: 10 },
    });
    expect(cfg.spaceId).toBe('abc');
    expect(cfg.types).toEqual({ project: 'Expedition' });
    expect(cfg.recall.tags).toEqual(['spark']);
    expect(cfg.recall.cooldownDays).toBe(10);
    expect(cfg.recall.randomShare).toBe(0.2); // default kept
  });

  it('clamps out-of-range numbers and drops junk', () => {
    const cfg = normalizeConfig({
      recall: { randomShare: 7, cooldownDays: -3, tagWeights: { a: 2, b: 'x' } },
      learn: { targetRatio: 99 },
      temporal: { lookbackDays: ['x', -5] },
    });
    expect(cfg.recall.randomShare).toBe(1);
    expect(cfg.recall.cooldownDays).toBe(1);
    expect(cfg.recall.tagWeights).toEqual({ a: 2 });
    expect(cfg.learn.targetRatio).toBe(1);
    expect(cfg.temporal.lookbackDays).toEqual([30, 90, 365]); // fallback
  });
});
