import { addDays, yearOf } from '../../engine/dates';
import type { LocalDate } from '../../engine/types';

/**
 * Shared helpers for building fixture spaces relative to an injected
 * "today", so the demo reads well on any date and tests stay
 * deterministic.
 */

/** Deterministic PRNG (mulberry32). */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** Capacities-style daily note title: "Aug 27, 2025". */
export function dailyNoteTitle(date: LocalDate): string {
  const month = MONTH_ABBR[Number(date.slice(5, 7)) - 1]!;
  const day = Number(date.slice(8));
  return `${month} ${day}, ${yearOf(date)}`;
}

export interface GeneratedDailyNote {
  date: LocalDate;
  id: string;
  title: string;
  markdown: string;
}

/**
 * Generate a scatter of daily notes over the past `spanDays`, always
 * including `guaranteedOffsets` (so lookbacks land on real notes), with
 * roughly `density` of the remaining days filled.
 */
export function generateDailyNotes(opts: {
  today: LocalDate;
  spanDays: number;
  density: number;
  guaranteedOffsets: number[];
  seed: number;
  bodyFor: (date: LocalDate, rng: () => number) => string;
}): GeneratedDailyNote[] {
  const rng = seededRng(opts.seed);
  const offsets = new Set<number>(opts.guaranteedOffsets);
  for (let off = 1; off <= opts.spanDays; off += 1) {
    if (rng() < opts.density) offsets.add(off);
  }
  const notes: GeneratedDailyNote[] = [];
  for (const off of [...offsets].sort((a, b) => a - b)) {
    const date = addDays(opts.today, -off);
    notes.push({
      date,
      id: `dn-${date}`,
      title: dailyNoteTitle(date),
      markdown: opts.bodyFor(date, rng),
    });
  }
  return notes;
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}
