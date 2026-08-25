import { useEffect, useState } from 'preact/hooks';
import { formatLocalDate, parseDailyNoteTitle } from '../../engine/dates';
import { parseKey } from '../../engine/state';
import type { ItemKey, ItemState } from '../../engine/types';
import type { AppData } from '../App';

/** Shared machinery for the Recall and Learn schedule views. */

export const SHOW_MAX = 40;

export interface Row {
  key: ItemKey;
  objectId: string;
  blockId: string | null;
  item: ItemState;
  when: string | null;
}

export function rowsOf(
  items: Record<ItemKey, ItemState>,
  pick: (item: ItemState) => string | null,
  filter: (item: ItemState) => boolean,
  ascending: boolean,
): Row[] {
  const rows: Row[] = [];
  for (const [key, item] of Object.entries(items)) {
    if (!filter(item)) continue;
    const parsed = parseKey(key);
    if (!parsed) continue;
    rows.push({
      key,
      objectId: parsed.objectId,
      blockId: parsed.blockId,
      item,
      when: pick(item),
    });
  }
  rows.sort((a, b) => {
    const cmp = (a.when ?? '9999').localeCompare(b.when ?? '9999');
    return ascending ? cmp : -cmp;
  });
  return rows.slice(0, SHOW_MAX);
}

/** Resolve display titles for the visible rows, a handful at a time. */
export function useTitles(data: AppData, rows: Row[]): Record<string, string> {
  const [titles, setTitles] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const wanted = [...new Set(rows.map((r) => r.objectId))]
      .filter((id) => titles[id] === undefined)
      .slice(0, 60);
    if (wanted.length === 0) return;
    void (async () => {
      const found: Record<string, string> = {};
      for (const id of wanted) {
        const obj = await data.session.provider.getObject(id);
        found[id] = obj?.title ?? '(deleted)';
        if (cancelled) return;
      }
      setTitles((prev) => ({ ...prev, ...found }));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);
  return titles;
}

export function displayTitle(
  titles: Record<string, string>,
  row: Row,
): string {
  const raw = titles[row.objectId] ?? '…';
  const parsed = parseDailyNoteTitle(raw);
  const base = parsed ? formatLocalDate(parsed) : raw;
  return row.blockId ? `${base} · one block` : base;
}
