import type { SurfacedItem } from '../../engine/types';

/**
 * Recall first: before Today shows a resurfaced note's text, it shows the
 * title and asks what you remember. Trying to recall it is what makes a
 * note stick (Roediger and Karpicke 2006); rereading it does much less.
 *
 * Only Recall and Review notes are asked about. A date-driven note (on this
 * day, a birthday, a target date) is shown straight away, since there is no
 * idea in it to recall. It is never a gate: one tap shows the note, with or
 * without an answer, and a note already answered today is shown as is.
 */
export function asksFirst(
  item: Pick<SurfacedItem, 'source'>,
  opts: { enabled: boolean; revealed: boolean; answered: boolean; hasText: boolean },
): boolean {
  if (!opts.enabled || opts.revealed || opts.answered || !opts.hasText) return false;
  return item.source === 'recall' || item.source === 'learn';
}
