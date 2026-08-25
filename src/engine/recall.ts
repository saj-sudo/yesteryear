import { addDays, diffDays } from './dates';
import type {
  Candidate,
  ItemKey,
  LocalDate,
  RecallConfig,
  RecallItemState,
  RecallResponse,
  YesteryearState,
} from './types';

/**
 * Recall mode (§8.3): no memory target, no simulated one. The objective
 * is coverage without repetition fatigue — a hard cooldown, weighted
 * sampling, and a deliberate slice of pure randomness. Responses adjust
 * preference, never "memory strength". Nothing is removed without an
 * explicit retire.
 */

function recallState(state: YesteryearState, key: ItemKey): RecallItemState | null {
  const item = state.items[key];
  return item?.mode === 'recall' ? item : null;
}

function ensureRecallState(state: YesteryearState, key: ItemKey): RecallItemState {
  const existing = recallState(state, key);
  if (existing) return existing;
  const fresh: RecallItemState = {
    mode: 'recall',
    lastSurfaced: null,
    nextEligible: null,
    surfaceCount: 0,
    lastResponse: null,
    group: null,
    retired: false,
  };
  state.items[key] = fresh;
  return fresh;
}

/** Eligible = not retired and past its cooldown. Overdue keeps its place
 * in the pool and is ranked normally — a missed week is never a backlog
 * dump (§11). */
export function eligibleRecall(
  candidates: Candidate[],
  state: YesteryearState,
  today: LocalDate,
): Candidate[] {
  return candidates.filter((c) => {
    const item = recallState(state, c.key);
    if (!item) return true; // never surfaced
    if (item.retired) return false;
    return item.nextEligible === null || item.nextEligible <= today;
  });
}

function tagWeight(candidate: Candidate, config: RecallConfig): number {
  let weight = 1;
  for (const tag of candidate.tags) {
    const w = config.tagWeights[tag];
    if (w !== undefined && w > weight) weight = w;
  }
  return weight;
}

function recencyFactor(
  candidate: Candidate,
  state: YesteryearState,
  today: LocalDate,
  config: RecallConfig,
): number {
  const item = recallState(state, candidate.key);
  if (!item?.lastSurfaced) return 1.5; // never surfaced: gently favored
  const since = diffDays(today, item.lastSurfaced);
  return Math.max(0.25, Math.min(2, since / Math.max(1, config.cooldownDays)));
}

function drawWeighted(
  pool: { candidate: Candidate; weight: number }[],
  rng: () => number,
): Candidate | null {
  const total = pool.reduce((sum, p) => sum + p.weight, 0);
  if (total <= 0 || pool.length === 0) return null;
  let r = rng() * total;
  for (let i = 0; i < pool.length; i += 1) {
    r -= pool[i]!.weight;
    if (r <= 0) {
      const [picked] = pool.splice(i, 1);
      return picked!.candidate;
    }
  }
  const [last] = pool.splice(pool.length - 1, 1);
  return last?.candidate ?? null;
}

/**
 * Fill up to `slots` from the eligible pool: a randomShare portion drawn
 * uniformly at random regardless of weight (§8.3 — surprise is a
 * documented source of insight), the rest weighted by tag weight and
 * time-since-surfaced.
 */
export function sampleRecall(
  eligible: Candidate[],
  state: YesteryearState,
  config: RecallConfig,
  slots: number,
  today: LocalDate,
  rng: () => number,
): Candidate[] {
  if (slots <= 0 || eligible.length === 0) return [];
  const picked: Candidate[] = [];
  const uniformSlots = Math.round(slots * config.randomShare);

  const uniformPool = eligible.map((candidate) => ({ candidate, weight: 1 }));
  while (picked.length < uniformSlots && uniformPool.length > 0) {
    const c = drawWeighted(uniformPool, rng);
    if (c) picked.push(c);
  }

  const chosen = new Set(picked.map((c) => c.key));
  const weightedPool = eligible
    .filter((c) => !chosen.has(c.key))
    .map((candidate) => ({
      candidate,
      weight: tagWeight(candidate, config) * recencyFactor(candidate, state, today, config),
    }));
  while (picked.length < slots && weightedPool.length > 0) {
    const c = drawWeighted(weightedPool, rng);
    if (c) picked.push(c);
  }
  return picked;
}

/**
 * Record a surfacing. The normal cooldown starts immediately, which is
 * exactly what makes silence a valid response: no reaction means the
 * standard interval advance (§8.1).
 */
export function markRecallSurfaced(
  state: YesteryearState,
  key: ItemKey,
  group: string | null,
  today: LocalDate,
  config: RecallConfig,
): void {
  const item = ensureRecallState(state, key);
  item.lastSurfaced = today;
  item.nextEligible = addDays(today, config.cooldownDays);
  item.surfaceCount += 1;
  item.lastResponse = null;
  if (group) {
    item.group = group;
    state.groupLastSurfaced[group] = today;
  }
}

/** Apply an explicit response from the previous note (§8.3 table). */
export function applyRecallResponse(
  state: YesteryearState,
  key: ItemKey,
  response: RecallResponse,
  config: RecallConfig,
): void {
  const item = ensureRecallState(state, key);
  item.lastResponse = response;
  switch (response) {
    case 'keep':
      break; // normal cooldown already set at surfacing
    case 'dismiss':
      if (item.lastSurfaced) {
        item.nextEligible = addDays(
          item.lastSurfaced,
          config.cooldownDays * config.dismissMultiplier,
        );
      }
      break;
    case 'retire':
      item.retired = true;
      item.nextEligible = null;
      break;
  }
}
