/**
 * Core types for the Yesteryear engine.
 *
 * Everything in src/engine is pure: no Capacities SDK, no DOM, no clocks.
 * The current date and randomness are always injected by the caller.
 *
 * The one schema rule that governs this whole module (spec §4): no user
 * object-type IDs, property IDs, or tag names may appear in code. Configs
 * carry human-readable names; resolution to IDs happens per run against
 * what the space actually contains.
 */

/** A calendar date in the user's local timezone, formatted YYYY-MM-DD. */
export type LocalDate = string & { readonly __localDate?: never };

/** Roles a mapped object type can play. Names are the user's own. */
export type TypeRole = 'project' | 'person' | 'note';

/** Roles a mapped property can play. */
export type PropertyRole =
  | 'projectStart'
  | 'projectTarget'
  | 'projectStatus'
  | 'personBirthday';

export interface TemporalConfig {
  enabled: boolean;
  lookbackDays: number[];
  birthdayLeadDays: number;
  targetDateLeadDays: number[];
}

export interface RecallConfig {
  enabled: boolean;
  tags: string[];
  cooldownDays: number;
  dismissMultiplier: number;
  /** Share of daily slots drawn uniformly at random from all eligible items. */
  randomShare: number;
  tagWeights: Record<string, number>;
}

export interface LearnConfig {
  enabled: boolean;
  assignByTag: string[];
  assignByType: string[];
  targetDateProperty: string | null;
  targetRatio: number;
  minGapDays: number;
  maxGapDays: number;
  missedItMultiplier: number;
  maxShareOfDailySlots: number;
  revertToRecallAfterTarget: boolean;
}

export interface GranularityConfig {
  mode: 'object' | 'block';
  blockTypes: string[];
  minBlockLength: number;
  fallbackToObject: boolean;
}

export interface RotationConfig {
  enabled: boolean;
  groupBy: 'tag' | 'property';
  groups: string[];
}

export interface SurfacesConfig {
  dailyNote: {
    enabled: boolean;
    heading: string;
    maxItems: number;
    minimalModeMaxItems: number;
    schedule: string;
  };
  browser: {
    enabled: boolean;
    defaultView: string;
  };
}

export interface YesteryearConfig {
  version: 1;
  spaceId: string | null;
  /** IANA timezone, detected from the browser at init, user-overridable. */
  timezone: string | null;
  /** Surface exactly one item per day, preferring temporal (§8.1). */
  minimalMode: boolean;
  types: Partial<Record<TypeRole, string>>;
  properties: Partial<Record<PropertyRole, string>>;
  activeStatusValues: string[];
  temporal: TemporalConfig;
  recall: RecallConfig;
  learn: LearnConfig;
  granularity: GranularityConfig;
  rotation: RotationConfig;
  surfaces: SurfacesConfig;
}

/* ------------------------------------------------------------------ */
/* State (§10)                                                         */
/* ------------------------------------------------------------------ */

/**
 * Item keys distinguish object-level, block-level, and Learn entries:
 *   obj:<objectId>
 *   blk:<objectId>/<blockId>
 *   …plus a "#learn" suffix for Learn-mode entries.
 */
export type ItemKey = string;

export type RecallResponse = 'keep' | 'dismiss' | 'retire';
export type LearnResponse = 'gotIt' | 'missedIt';
export type ItemResponse = RecallResponse | LearnResponse;

export interface RecallItemState {
  mode: 'recall';
  lastSurfaced: LocalDate | null;
  nextEligible: LocalDate | null;
  surfaceCount: number;
  lastResponse: RecallResponse | null;
  group: string | null;
  /** Retired items stay in state so they are never re-added, but never surface. */
  retired: boolean;
}

export interface LearnItemState {
  mode: 'learn';
  targetDate: LocalDate;
  lastSurfaced: LocalDate | null;
  nextDue: LocalDate | null;
  surfaceCount: number;
  lastResponse: LearnResponse | null;
}

export type ItemState = RecallItemState | LearnItemState;

export interface YesteryearState {
  version: 1;
  /** ISO timestamp of the last write; drives the concurrency guard (§10.3). */
  updatedAt: string;
  items: Record<ItemKey, ItemState>;
  groupLastSurfaced: Record<string, LocalDate>;
  lastRunDate: LocalDate | null;
}

/* ------------------------------------------------------------------ */
/* Candidates and output                                               */
/* ------------------------------------------------------------------ */

/** Why a temporal item came up; drives the §8.5 label. */
export type TemporalReason =
  | { kind: 'lookback'; daysAgo: number; date: LocalDate }
  | { kind: 'birthday'; inDays: number; name: string }
  | { kind: 'anniversary'; years: number }
  | { kind: 'targetDate'; inDays: number };

export interface Candidate {
  key: ItemKey;
  objectId: string;
  blockId: string | null;
  title: string;
  /** Block text or object snippet, when known. */
  excerpt: string | null;
  source: 'temporal' | 'recall' | 'learn';
  temporalReason: TemporalReason | null;
  /** Tag names carried by the object (for weights and tag rotation). */
  tags: string[];
  /** Rotation group, when resolvable. */
  group: string | null;
  /** Learn mode only. */
  targetDate: LocalDate | null;
}

export interface SurfacedItem {
  key: ItemKey;
  objectId: string;
  blockId: string | null;
  title: string;
  excerpt: string | null;
  source: 'temporal' | 'recall' | 'learn';
  /** Human label, e.g. "From 1 year ago" or "Birthday in 3 days". */
  label: string;
  group: string | null;
}

/** A parsed user response from yesterday's Resurfaced section (§8.6). */
export interface ParsedResponse {
  key: ItemKey;
  response: ItemResponse;
}
