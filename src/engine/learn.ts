import { addDays, diffDays } from './dates';
import type {
  Candidate,
  ItemKey,
  LearnConfig,
  LearnItemState,
  LearnResponse,
  LocalDate,
  RecallConfig,
  YesteryearState,
} from './types';

/**
 * Learn mode (§8.3): opt-in, and only where a target date exists — the
 * spacing literature's optimal-gap findings are proportions of the
 * retention interval, so without a target there is no principled
 * schedule and the item stays in Recall instead. Never invent one.
 *
 *   gap = clamp(targetRatio × daysUntilTarget, minGap, maxGap)
 *
 * recomputed after every review, so gaps contract as the date nears —
 * deliberately the opposite of an expanding ladder (§15). The first
 * review is always delayed by at least minGap: the effortful first
 * retrieval is what carries the effect.
 */

export function learnGapDays(
  daysUntilTarget: number,
  config: LearnConfig,
  multiplier = 1,
): number {
  const raw = config.targetRatio * Math.max(0, daysUntilTarget) * multiplier;
  return Math.round(
    Math.min(config.maxGapDays, Math.max(config.minGapDays, raw)),
  );
}

function learnState(state: YesteryearState, key: ItemKey): LearnItemState | null {
  const item = state.items[key];
  return item?.mode === 'learn' ? item : null;
}

/**
 * First sight of a Learn item: schedule its delayed first review. Never
 * sooner than minGap, even when the target is close.
 */
export function ensureLearnScheduled(
  state: YesteryearState,
  key: ItemKey,
  targetDate: LocalDate,
  today: LocalDate,
  config: LearnConfig,
): LearnItemState {
  const existing = learnState(state, key);
  if (existing) {
    existing.targetDate = targetDate; // the user may have moved the date
    return existing;
  }
  const fresh: LearnItemState = {
    mode: 'learn',
    targetDate,
    lastSurfaced: null,
    nextDue: addDays(today, config.minGapDays),
    surfaceCount: 0,
    lastResponse: null,
  };
  state.items[key] = fresh;
  return fresh;
}

/** Due = scheduled on or before today. Overdue keeps its place (§11). */
export function dueLearn(
  candidates: Candidate[],
  state: YesteryearState,
  today: LocalDate,
): Candidate[] {
  return candidates.filter((c) => {
    const item = learnState(state, c.key);
    return item !== null && item.nextDue !== null && item.nextDue <= today;
  });
}

/**
 * Record a surfacing: the next gap is set immediately at the full ratio,
 * so no response safely means "got it" (§8.3).
 */
export function markLearnSurfaced(
  state: YesteryearState,
  key: ItemKey,
  today: LocalDate,
  config: LearnConfig,
): void {
  const item = learnState(state, key);
  if (!item) return;
  item.lastSurfaced = today;
  item.surfaceCount += 1;
  item.lastResponse = null;
  item.nextDue = addDays(today, learnGapDays(diffDays(item.targetDate, today), config));
}

/** Apply an explicit recall grade from the previous note. */
export function applyLearnResponse(
  state: YesteryearState,
  key: ItemKey,
  response: LearnResponse,
  config: LearnConfig,
): void {
  const item = learnState(state, key);
  if (!item) return;
  item.lastResponse = response;
  if (response === 'missedIt' && item.lastSurfaced) {
    const daysUntil = diffDays(item.targetDate, item.lastSurfaced);
    item.nextDue = addDays(
      item.lastSurfaced,
      learnGapDays(daysUntil, config, config.missedItMultiplier),
    );
  }
  // gotIt: the full-ratio gap set at surfacing already stands.
}

/**
 * After the target passes, the item reverts to Recall rather than
 * disappearing (§8.3): nothing that mattered enough to study should
 * vanish the day after it was needed. Returns the reverted keys.
 */
export function revertExpiredLearn(
  state: YesteryearState,
  today: LocalDate,
  learnConfig: LearnConfig,
  recallConfig: RecallConfig,
): ItemKey[] {
  if (!learnConfig.revertToRecallAfterTarget) return [];
  const reverted: ItemKey[] = [];
  for (const [key, item] of Object.entries(state.items)) {
    if (item.mode !== 'learn' || item.targetDate >= today) continue;
    const baseKey = key.endsWith('#learn') ? key.slice(0, -'#learn'.length) : key;
    delete state.items[key];
    if (!state.items[baseKey]) {
      state.items[baseKey] = {
        mode: 'recall',
        lastSurfaced: item.lastSurfaced,
        nextEligible: item.lastSurfaced
          ? addDays(item.lastSurfaced, recallConfig.cooldownDays)
          : null,
        surfaceCount: item.surfaceCount,
        lastResponse: null,
        group: null,
        retired: false,
      };
    }
    reverted.push(key);
  }
  return reverted;
}
