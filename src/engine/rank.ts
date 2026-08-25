import { diffDays } from './dates';
import type {
  Candidate,
  LocalDate,
  YesteryearConfig,
  YesteryearState,
} from './types';

/**
 * Merging the three producers into one daily allocation (§8.4).
 *
 *   score = tagWeight × rotationBoost × recencyPenalty
 *
 * rotationBoost rises the longer a group has gone unsurfaced — the most
 * important rule here: without it the queue fills with whichever group
 * generates the most volume. Learn items are due-driven and placed
 * first, capped at maxShareOfDailySlots; overflow spills to tomorrow
 * (they simply stay due) rather than expanding the allocation.
 */

export function tagWeightOf(candidate: Candidate, config: YesteryearConfig): number {
  let weight = 1;
  for (const tag of candidate.tags) {
    const w = config.recall.tagWeights[tag];
    if (w !== undefined && w > weight) weight = w;
  }
  return weight;
}

export function rotationBoostOf(
  candidate: Candidate,
  state: YesteryearState,
  config: YesteryearConfig,
  today: LocalDate,
): number {
  if (!config.rotation.enabled || !candidate.group) return 1;
  const last = state.groupLastSurfaced[candidate.group];
  if (!last) return 4; // a group never surfaced is the most neglected
  return 1 + Math.min(3, diffDays(today, last) / 7);
}

export function recencyPenaltyOf(
  candidate: Candidate,
  state: YesteryearState,
  config: YesteryearConfig,
  today: LocalDate,
): number {
  const item = state.items[candidate.key];
  const last = item?.lastSurfaced ?? null;
  if (!last) return 1;
  return Math.min(1, diffDays(today, last) / Math.max(1, config.recall.cooldownDays));
}

export function scoreOf(
  candidate: Candidate,
  state: YesteryearState,
  config: YesteryearConfig,
  today: LocalDate,
): number {
  return (
    tagWeightOf(candidate, config) *
    rotationBoostOf(candidate, state, config, today) *
    recencyPenaltyOf(candidate, state, config, today)
  );
}

function isRetired(candidate: Candidate, state: YesteryearState): boolean {
  const item = state.items[candidate.key];
  return item?.mode === 'recall' && item.retired;
}

function dedupe(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    if (seen.has(c.key)) return false;
    seen.add(c.key);
    return true;
  });
}

/**
 * Choose today's allocation. Inputs are already-filtered pools: recall
 * candidates have passed cooldown sampling, learn candidates are due.
 * In minimal mode one item surfaces, preferring temporal — "here is
 * what you wrote a year ago" costs nothing to receive on a bad day —
 * unless a Learn item is due (§8.4).
 */
export function rankAndMerge(input: {
  temporal: Candidate[];
  recall: Candidate[];
  learn: Candidate[];
  state: YesteryearState;
  config: YesteryearConfig;
  today: LocalDate;
}): Candidate[] {
  const { state, config, today } = input;
  const slots = config.minimalMode
    ? config.surfaces.dailyNote.minimalModeMaxItems
    : config.surfaces.dailyNote.maxItems;

  const learn = dedupe(input.learn).filter((c) => !isRetired(c, state));
  const temporal = dedupe(input.temporal).filter((c) => !isRetired(c, state));
  const recall = dedupe(input.recall).filter(
    (c) =>
      !isRetired(c, state) &&
      !temporal.some((t) => t.key === c.key) &&
      !learn.some((l) => l.key === c.key),
  );

  if (config.minimalMode) {
    const pick =
      learn[0] ??
      temporal[0] ??
      [...recall].sort(
        (a, b) => scoreOf(b, state, config, today) - scoreOf(a, state, config, today),
      )[0];
    return pick ? [pick] : [];
  }

  const learnCap = Math.max(
    learn.length > 0 ? 1 : 0,
    Math.floor(slots * config.learn.maxShareOfDailySlots),
  );
  const chosen: Candidate[] = learn.slice(0, Math.min(learnCap, slots));

  const byScore = (pool: Candidate[]): Candidate[] =>
    pool
      .map((candidate) => ({ candidate, score: scoreOf(candidate, state, config, today) }))
      .sort((a, b) => b.score - a.score || a.candidate.key.localeCompare(b.candidate.key))
      .map((s) => s.candidate);

  // The sampled pool is the product's center of gravity — unexpected
  // connections — so it gets at least half the slots. Two temporal tiers
  // sit around it: birthdays, target dates, and anniversaries are rare
  // and have a real cost when missed, so they always land; same-day
  // lookbacks connect things the calendar already connected, so they
  // compete for what's left.
  const critical = byScore(
    temporal.filter((c) => c.temporalReason && c.temporalReason.kind !== 'lookback'),
  );
  const lookbacks = byScore(
    temporal.filter((c) => !c.temporalReason || c.temporalReason.kind === 'lookback'),
  );
  const recallRanked = byScore(recall);

  chosen.push(...critical.slice(0, Math.max(0, slots - chosen.length)));
  const recallTake = Math.min(
    recallRanked.length,
    Math.max(0, Math.min(slots - chosen.length, Math.ceil(slots / 2))),
  );
  chosen.push(...recallRanked.slice(0, recallTake));
  for (const candidate of [...lookbacks, ...recallRanked]) {
    if (chosen.length >= slots) break;
    if (!chosen.includes(candidate)) chosen.push(candidate);
  }
  return chosen;
}
