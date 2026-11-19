import { applyLearnResponse } from './learn';
import { applyRecallResponse } from './recall';
import type {
  ItemKey,
  ItemResponse,
  ItemState,
  TemporalReason,
  YesteryearConfig,
  YesteryearState,
} from './types';

/**
 * Responding from the app, and taking a response back.
 *
 * A response only ever changes the one entry in `state.items` for its key
 * (see `applyRecallResponse` and `applyLearnResponse`), and a recall
 * response can create that entry. So a copy of the entry taken before the
 * response, or the fact that there was none, is all that undo needs.
 */

/** What the entry for `key` looked like, or `null` when there was none. */
export type ItemSnapshot = ItemState | null;

export function snapshotItem(state: YesteryearState, key: ItemKey): ItemSnapshot {
  const item = state.items[key];
  if (!item) return null;
  return item.mode === 'learn' && item.setIds
    ? { ...item, setIds: [...item.setIds] }
    : { ...item };
}

/** Apply a response and return the snapshot that `undoResponse` takes. */
export function applyResponse(
  state: YesteryearState,
  key: ItemKey,
  response: ItemResponse,
  config: YesteryearConfig,
): ItemSnapshot {
  const before = snapshotItem(state, key);
  if (response === 'gotIt' || response === 'notYet') {
    applyLearnResponse(state, key, response, config.learn);
  } else {
    applyRecallResponse(state, key, response, config.recall);
  }
  return before;
}

/** Put the entry for `key` back to how `before` recorded it. */
export function undoResponse(state: YesteryearState, key: ItemKey, before: ItemSnapshot): void {
  if (before === null) {
    delete state.items[key];
    return;
  }
  state.items[key] =
    before.mode === 'learn' && before.setIds
      ? { ...before, setIds: [...before.setIds] }
      : { ...before };
}

/**
 * The age to show as a headline, when the item has a date basis that lies
 * in the past: "3 years ago", "45 days ago". Null for everything else, so
 * a view never shows an age it cannot back.
 */
export function ageOf(reason: TemporalReason | null | undefined): string | null {
  if (!reason) return null;
  if (reason.kind === 'lookback') {
    if (reason.daysAgo % 365 === 0) {
      const years = reason.daysAgo / 365;
      return years === 1 ? '1 year ago' : `${years} years ago`;
    }
    return reason.daysAgo === 1 ? '1 day ago' : `${reason.daysAgo} days ago`;
  }
  if (reason.kind === 'anniversary') {
    return reason.years === 1 ? '1 year ago today' : `${reason.years} years ago today`;
  }
  return null;
}
