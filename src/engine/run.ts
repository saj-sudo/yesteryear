import {
  applyLearnResponse,
  dueLearn,
  ensureLearnScheduled,
  markLearnSurfaced,
  revertExpiredLearn,
} from './learn';
import { labelForReason } from './markdown';
import { rankAndMerge } from './rank';
import { applyRecallResponse, eligibleRecall, markRecallSurfaced, sampleRecall } from './recall';
import type {
  Candidate,
  LocalDate,
  ParsedResponse,
  SurfacedItem,
  YesteryearConfig,
  YesteryearState,
} from './types';

/**
 * The pure heart of a daily run. The orchestrator does the fetching;
 * everything here is deterministic given (state, pools, today, rng).
 * A run happens in three phases so block refinement (which needs I/O)
 * can sit between planning and finalizing:
 *
 *   1. applyResponses  — yesterday's note updates state
 *   2. planDay         — choose today's candidates (object-level)
 *   3. finalizeRun     — record surfacings, produce SurfacedItems
 */

export function applyResponses(
  state: YesteryearState,
  responses: ParsedResponse[],
  config: YesteryearConfig,
): void {
  for (const { key, response } of responses) {
    if (response === 'gotIt' || response === 'missedIt') {
      applyLearnResponse(state, key, response, config.learn);
    } else {
      applyRecallResponse(state, key, response, config.recall);
    }
  }
}

export interface CandidatePools {
  temporal: Candidate[];
  /** Recall pool before cooldown filtering and sampling. */
  recall: Candidate[];
  /** Learn assignments with target dates already resolved. */
  learn: Candidate[];
}

/**
 * Learn housekeeping ahead of choosing: passed targets revert, new
 * assignments get their delayed first review scheduled. Mutates state
 * deterministically (replay-safe for the concurrency guard).
 */
export function prepareLearn(
  state: YesteryearState,
  config: YesteryearConfig,
  today: LocalDate,
  learnCandidates: Candidate[],
): void {
  revertExpiredLearn(state, today, config.learn, config.recall);
  if (!config.learn.enabled) return;
  for (const candidate of learnCandidates) {
    if (!candidate.targetDate) continue; // no target: stays in Recall (§8.3)
    ensureLearnScheduled(state, candidate.key, candidate.targetDate, today, config.learn);
  }
}

/**
 * Choose today's allocation. Read-only on state: prepareLearn must have
 * run first; the chosen list is finalized separately.
 */
export function chooseDay(input: {
  state: YesteryearState;
  config: YesteryearConfig;
  today: LocalDate;
  pools: CandidatePools;
  rng: () => number;
}): Candidate[] {
  const { state, config, today, pools, rng } = input;

  const learnPool = config.learn.enabled
    ? pools.learn.filter((c) => c.targetDate)
    : [];
  const learnDue = dueLearn(learnPool, state, today).sort((a, b) => {
    const ai = state.items[a.key];
    const bi = state.items[b.key];
    const aDue = ai?.mode === 'learn' ? ai.nextDue ?? '' : '';
    const bDue = bi?.mode === 'learn' ? bi.nextDue ?? '' : '';
    return aDue.localeCompare(bDue) || a.key.localeCompare(b.key);
  });

  // Recall: cooldown, then weighted sampling into a shortlist twice the
  // day's slots so ranking still has something to choose between.
  const slots = config.minimalMode
    ? config.surfaces.dailyNote.minimalModeMaxItems
    : config.surfaces.dailyNote.maxItems;
  const recallShortlist = config.recall.enabled
    ? sampleRecall(
        eligibleRecall(pools.recall, state, today),
        state,
        config.recall,
        slots * 2,
        today,
        rng,
      )
    : [];

  return rankAndMerge({
    temporal: pools.temporal,
    recall: recallShortlist,
    learn: learnDue,
    state,
    config,
    today,
  });
}

function labelFor(candidate: Candidate): string {
  if (candidate.temporalReason) return labelForReason(candidate.temporalReason);
  if (candidate.source === 'learn') return 'Review';
  return 'From your notes';
}

/**
 * Record today's surfacings in state and produce the display items.
 * `chosen` may have been refined to block granularity since planning.
 */
export function finalizeRun(
  state: YesteryearState,
  chosen: Candidate[],
  today: LocalDate,
  config: YesteryearConfig,
): SurfacedItem[] {
  const items: SurfacedItem[] = chosen.map((candidate) => {
    if (candidate.source === 'learn') {
      markLearnSurfaced(state, candidate.key, today, config.learn);
    } else {
      markRecallSurfaced(state, candidate.key, candidate.group, today, config.recall);
    }
    return {
      key: candidate.key,
      objectId: candidate.objectId,
      blockId: candidate.blockId,
      title: candidate.title,
      excerpt: candidate.excerpt,
      source: candidate.source,
      label: labelFor(candidate),
      group: candidate.group,
    };
  });

  state.lastRunDate = today;
  state.lastRunItems = items.map((item) => ({
    key: item.key,
    title: item.title,
    learn: item.source === 'learn',
  }));
  return items;
}
