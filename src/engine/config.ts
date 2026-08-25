import type { YesteryearConfig } from './types';

/**
 * Defaults follow spec §6/§15. They are scheduling parameters, not schema:
 * every name-shaped field (types, properties, tags, groups) defaults empty
 * and is filled by the user from what their space actually contains.
 */
export function defaultConfig(): YesteryearConfig {
  return {
    version: 1,
    spaceId: null,
    timezone: null,
    minimalMode: false,
    types: {},
    properties: {},
    activeStatusValues: [],
    temporal: {
      enabled: true,
      lookbackDays: [30, 90, 365],
      birthdayLeadDays: 7,
      targetDateLeadDays: [7, 3, 1],
    },
    recall: {
      enabled: true,
      tags: [],
      cooldownDays: 45,
      dismissMultiplier: 3,
      randomShare: 0.2,
      tagWeights: {},
    },
    learn: {
      enabled: false,
      assignByTag: [],
      assignByType: [],
      targetDateProperty: null,
      targetRatio: 0.15,
      minGapDays: 7,
      maxGapDays: 90,
      missedItMultiplier: 0.5,
      maxShareOfDailySlots: 0.5,
      revertToRecallAfterTarget: true,
    },
    granularity: {
      mode: 'object',
      blockTypes: [],
      minBlockLength: 40,
      fallbackToObject: true,
    },
    rotation: {
      enabled: false,
      groupBy: 'tag',
      groups: [],
    },
    surfaces: {
      dailyNote: {
        enabled: false,
        heading: 'Resurfaced',
        maxItems: 4,
        minimalModeMaxItems: 1,
        schedule: '07:00',
      },
      browser: {
        enabled: true,
        defaultView: 'onThisDay',
      },
    },
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function str(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.length > 0)
    : [];
}

function numArray(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) return [...fallback];
  const out = value.filter(
    (v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0,
  );
  return out.length > 0 ? out : [...fallback];
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function numberMap(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(record(value))) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v;
  }
  return out;
}

function nameMap<K extends string>(value: unknown, keys: readonly K[]): Partial<Record<K, string>> {
  const src = record(value);
  const out: Partial<Record<K, string>> = {};
  for (const key of keys) {
    const v = src[key];
    if (typeof v === 'string' && v.length > 0) out[key] = v;
  }
  return out;
}

/**
 * Accept any serialized config (older version, hand-edited, partially
 * corrupt) and return a complete valid one. Unknown fields are dropped,
 * missing fields take defaults, out-of-range numbers are clamped. This is
 * the single entry point for config coming from storage or import.
 */
export function normalizeConfig(input: unknown): YesteryearConfig {
  const d = defaultConfig();
  const raw = record(input);
  // Only version 1 exists; future migrations hook in here.

  const temporal = record(raw['temporal']);
  const recall = record(raw['recall']);
  const learn = record(raw['learn']);
  const granularity = record(raw['granularity']);
  const rotation = record(raw['rotation']);
  const surfaces = record(raw['surfaces']);
  const dailyNote = record(surfaces['dailyNote']);
  const browser = record(surfaces['browser']);

  const granularityMode = granularity['mode'];
  const groupBy = rotation['groupBy'];

  return {
    version: 1,
    spaceId: strOrNull(raw['spaceId']),
    timezone: strOrNull(raw['timezone']),
    minimalMode: bool(raw['minimalMode'], d.minimalMode),
    types: nameMap(raw['types'], ['project', 'person', 'note'] as const),
    properties: nameMap(raw['properties'], [
      'projectStart',
      'projectTarget',
      'projectStatus',
      'personBirthday',
    ] as const),
    activeStatusValues: strArray(raw['activeStatusValues']),
    temporal: {
      enabled: bool(temporal['enabled'], d.temporal.enabled),
      lookbackDays: numArray(temporal['lookbackDays'], d.temporal.lookbackDays),
      birthdayLeadDays: clamp(num(temporal['birthdayLeadDays'], d.temporal.birthdayLeadDays), 0, 365),
      targetDateLeadDays: numArray(temporal['targetDateLeadDays'], d.temporal.targetDateLeadDays),
    },
    recall: {
      enabled: bool(recall['enabled'], d.recall.enabled),
      tags: strArray(recall['tags']),
      cooldownDays: clamp(num(recall['cooldownDays'], d.recall.cooldownDays), 1, 3650),
      dismissMultiplier: clamp(num(recall['dismissMultiplier'], d.recall.dismissMultiplier), 1, 100),
      randomShare: clamp(num(recall['randomShare'], d.recall.randomShare), 0, 1),
      tagWeights: numberMap(recall['tagWeights']),
    },
    learn: {
      enabled: bool(learn['enabled'], d.learn.enabled),
      assignByTag: strArray(learn['assignByTag']),
      assignByType: strArray(learn['assignByType']),
      targetDateProperty: strOrNull(learn['targetDateProperty']),
      targetRatio: clamp(num(learn['targetRatio'], d.learn.targetRatio), 0.01, 1),
      minGapDays: clamp(num(learn['minGapDays'], d.learn.minGapDays), 1, 365),
      maxGapDays: clamp(num(learn['maxGapDays'], d.learn.maxGapDays), 1, 3650),
      missedItMultiplier: clamp(num(learn['missedItMultiplier'], d.learn.missedItMultiplier), 0.01, 1),
      maxShareOfDailySlots: clamp(
        num(learn['maxShareOfDailySlots'], d.learn.maxShareOfDailySlots),
        0,
        1,
      ),
      revertToRecallAfterTarget: bool(
        learn['revertToRecallAfterTarget'],
        d.learn.revertToRecallAfterTarget,
      ),
    },
    granularity: {
      mode: granularityMode === 'block' ? 'block' : 'object',
      blockTypes: strArray(granularity['blockTypes']),
      minBlockLength: clamp(num(granularity['minBlockLength'], d.granularity.minBlockLength), 0, 10000),
      fallbackToObject: bool(granularity['fallbackToObject'], d.granularity.fallbackToObject),
    },
    rotation: {
      enabled: bool(rotation['enabled'], d.rotation.enabled),
      groupBy: groupBy === 'property' ? 'property' : 'tag',
      groups: strArray(rotation['groups']),
    },
    surfaces: {
      dailyNote: {
        enabled: bool(dailyNote['enabled'], d.surfaces.dailyNote.enabled),
        heading: str(dailyNote['heading'], d.surfaces.dailyNote.heading),
        maxItems: clamp(num(dailyNote['maxItems'], d.surfaces.dailyNote.maxItems), 1, 20),
        minimalModeMaxItems: clamp(
          num(dailyNote['minimalModeMaxItems'], d.surfaces.dailyNote.minimalModeMaxItems),
          1,
          5,
        ),
        schedule: str(dailyNote['schedule'], d.surfaces.dailyNote.schedule),
      },
      browser: {
        enabled: bool(browser['enabled'], d.surfaces.browser.enabled),
        defaultView: str(browser['defaultView'], d.surfaces.browser.defaultView),
      },
    },
  };
}
