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
