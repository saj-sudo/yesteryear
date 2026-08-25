import type { FullObject, SimpleBlock } from './provider';
import { blockKey, parseKey } from './state';
import type {
  Candidate,
  GranularityConfig,
  LocalDate,
  YesteryearState,
} from './types';

/**
 * Block granularity (§8.3b): a 2,000-word page is not a resurfaceable
 * unit, but one paragraph inside it is. Objects are still enumerated and
 * sampled cheaply at the object level (spec §5.4: never fetch the whole
 * space); the winning objects are fetched, and the block to surface is
 * chosen from their qualifying blocks — least recently surfaced first.
 */

export function qualifyingBlocks(
  object: FullObject,
  config: GranularityConfig,
): SimpleBlock[] {
  const wanted = new Set(config.blockTypes);
  return object.blocks.filter(
    (b) =>
      (wanted.size === 0 || wanted.has(b.type)) &&
      b.text.trim().length >= config.minBlockLength,
  );
}

/**
 * Drop state entries for blocks that no longer exist on the object —
 * edited or deleted blocks disappear silently (§8.3b).
 */
export function pruneStaleBlockState(
  state: YesteryearState,
  object: FullObject,
): void {
  const alive = new Set(object.blocks.map((b) => b.id));
  for (const key of Object.keys(state.items)) {
    const parsed = parseKey(key);
    if (parsed?.objectId === object.id && parsed.blockId && !alive.has(parsed.blockId)) {
      delete state.items[key];
    }
  }
}

/**
 * Refine an object-level candidate to the block that should surface.
 * Returns the candidate unchanged in object mode; in block mode picks
 * the least-recently-surfaced qualifying block (never-surfaced first,
 * ties broken by document order). With no qualifying blocks, falls back
 * to the whole object when configured, else null.
 */
export function refineToBlock(
  candidate: Candidate,
  object: FullObject,
  config: GranularityConfig,
  state: YesteryearState,
): Candidate | null {
  if (config.mode !== 'block') return candidate;
  pruneStaleBlockState(state, object);
  const blocks = qualifyingBlocks(object, config);
  if (blocks.length === 0) {
    return config.fallbackToObject ? candidate : null;
  }

  let best: SimpleBlock | null = null;
  let bestLast: LocalDate | null | 'never' = 'never';
  for (const block of blocks) {
    const item = state.items[blockKey(object.id, block.id)];
    if (item?.mode === 'recall' && item.retired) continue;
    const last = item?.lastSurfaced ?? null;
    if (last === null) {
      best = block;
      break; // never surfaced, in document order: take it
    }
    if (bestLast === 'never' || (bestLast !== null && last < bestLast)) {
      best = block;
      bestLast = last;
    }
  }
  if (!best) return config.fallbackToObject ? candidate : null;

  return {
    ...candidate,
    key: blockKey(object.id, best.id),
    blockId: best.id,
    excerpt: best.text,
  };
}
