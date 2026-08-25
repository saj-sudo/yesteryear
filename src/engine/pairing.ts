import { diffDays } from './dates';
import type { ItemKey, LocalDate, YesteryearState } from './types';

/**
 * Serendipity pairings: two items deliberately drawn from different
 * corners of the space — different tags, different types, different
 * eras — presented side by side to invite a connection that no filing
 * system would have made. This is the product's center of gravity:
 * same-day-across-years connects things the calendar already connected;
 * this connects things that had no reason to meet.
 *
 * A pairing is a lens, not a scheduled surfacing: drawing one reads no
 * cooldowns, starts no cooldowns, and never mutates state. Retired
 * items are the one exclusion — retired means never show me this again.
 */

export interface PairingCandidate {
  key: ItemKey;
  objectId: string;
  title: string;
  /** Structure/type id when known; null otherwise. */
  structureId: string | null;
  tags: string[];
  /** For daily notes: the note's date. Null for undated items. */
  date: LocalDate | null;
}

export interface Pairing {
  a: PairingCandidate;
  b: PairingCandidate;
}

/** How many random candidates compete to be the far side of the pair. */
const CONTRAST_SAMPLE = 20;

/**
 * Distance between two items: bigger is stranger. No shared tags +2,
 * different type +1, far apart in time up to +1 (different modality —
 * one dated, one not — counts +0.5).
 */
export function pairingDistance(a: PairingCandidate, b: PairingCandidate): number {
  let distance = 0;
  const aTags = new Set(a.tags);
  const shared = b.tags.some((t) => aTags.has(t));
  if ((a.tags.length > 0 || b.tags.length > 0) && !shared) distance += 2;
  if (a.structureId && b.structureId && a.structureId !== b.structureId) distance += 1;
  if (a.date && b.date) {
    distance += Math.min(1, Math.abs(diffDays(a.date, b.date)) / 365);
  } else if (Boolean(a.date) !== Boolean(b.date)) {
    distance += 0.5;
  }
  return distance;
}

function notRetired(state: YesteryearState) {
  return (c: PairingCandidate): boolean => {
    const item = state.items[c.key];
    return !(item?.mode === 'recall' && item.retired);
  };
}

/**
 * Draw a pairing: one uniform pick, then the most-distant of a random
 * sample of the rest. Deterministic for a given rng; returns null when
 * fewer than two eligible items exist.
 */
export function drawPairing(
  pool: PairingCandidate[],
  state: YesteryearState,
  rng: () => number,
): Pairing | null {
  const eligible = pool.filter(notRetired(state));
  if (eligible.length < 2) return null;

  const aIndex = Math.floor(rng() * eligible.length);
  const a = eligible[aIndex]!;
  const rest = eligible.filter((_, i) => i !== aIndex);

  let best: PairingCandidate = rest[0]!;
  let bestDistance = -1;
  const sampleSize = Math.min(CONTRAST_SAMPLE, rest.length);
  const seen = new Set<number>();
  for (let n = 0; n < sampleSize; n += 1) {
    let idx = Math.floor(rng() * rest.length);
    while (seen.has(idx)) idx = (idx + 1) % rest.length;
    seen.add(idx);
    const candidate = rest[idx]!;
    const distance = pairingDistance(a, candidate);
    if (distance > bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return { a, b: best };
}
