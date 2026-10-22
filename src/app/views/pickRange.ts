import type { StudySetNote } from '../../engine/types';

export interface Pickable {
  id: string;
  title: string;
}

/**
 * Switch rows `from` to `to` (either order) of a result list on or off
 * and keep everything else that was already picked. Behind shift-click,
 * dragging across rows and the keyboard shortcuts of the note picker.
 */
export function pickRange(
  picked: readonly StudySetNote[],
  shown: readonly Pickable[],
  from: number,
  to: number,
  on: boolean,
): StudySetNote[] {
  const lo = Math.max(0, Math.min(from, to));
  const hi = Math.min(shown.length - 1, Math.max(from, to));
  const byId = new Map(picked.map((n) => [n.id, n]));
  for (let i = lo; i <= hi; i += 1) {
    const row = shown[i];
    if (!row) continue;
    if (on) {
      if (!byId.has(row.id)) byId.set(row.id, { id: row.id, title: row.title });
    } else {
      byId.delete(row.id);
    }
  }
  return [...byId.values()];
}

export interface RangeTap {
  /** Row where the range starts, or null once it is closed. */
  start: number | null;
  picked: StudySetNote[];
}

/**
 * One tap in "pick a range" mode, for screens where a drag scrolls the
 * list. The first tap marks where the range starts. The second tap closes
 * it: every row from the first to the second is picked, or unpicked when
 * they were all picked already, so a second pass can undo the first.
 */
export function tapRange(
  start: number | null,
  index: number,
  picked: readonly StudySetNote[],
  shown: readonly Pickable[],
): RangeTap {
  if (start === null) return { start: index, picked: [...picked] };
  const lo = Math.max(0, Math.min(start, index));
  const hi = Math.min(shown.length - 1, Math.max(start, index));
  const have = new Set(picked.map((n) => n.id));
  let allPicked = hi >= lo;
  for (let i = lo; i <= hi; i += 1) if (!have.has(shown[i]!.id)) allPicked = false;
  return { start: null, picked: pickRange(picked, shown, start, index, !allPicked) };
}
