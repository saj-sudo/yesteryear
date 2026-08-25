import { parseDailyNoteTitle } from '../engine/dates';
import type { Provider } from '../engine/provider';
import type { DailyNoteRef } from '../engine/temporal';

/**
 * Browser-storage cache (spec §10.1 secondary store): keeps the app fast
 * and readable offline. Everything here is disposable — the source of
 * truth is the user's space — so every read tolerates absence or
 * corruption by returning null.
 */

function key(spaceId: string, name: string): string {
  return `yesteryear.cache.${spaceId}.${name}`;
}

export function loadCached<T>(spaceId: string, name: string): T | null {
  try {
    const raw = localStorage.getItem(key(spaceId, name));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveCached(spaceId: string, name: string, value: unknown): void {
  try {
    localStorage.setItem(key(spaceId, name), JSON.stringify(value));
  } catch {
    // Storage full or unavailable: the cache is optional by design.
  }
}

export function clearSpaceCache(spaceId: string): void {
  try {
    const prefix = key(spaceId, '');
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k?.startsWith(prefix)) doomed.push(k);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    // nothing to clear
  }
}

export type DailyNoteMap = Record<string, DailyNoteRef>;

/**
 * Full daily-note map for the space: date → {id, title}. The listing is
 * summaries-only (cheap, paginated); unparseable titles are skipped per
 * §8.2. The API offers no delta, so refresh is a relist — the cached
 * copy exists for fast paint and offline reads, not to avoid the sweep.
 */
export async function refreshDailyNoteMap(provider: Provider): Promise<DailyNoteMap> {
  const map: DailyNoteMap = {};
  for await (const note of provider.listObjectsByStructure(
    provider.dailyNoteStructureId,
  )) {
    const date = parseDailyNoteTitle(note.title);
    if (date) map[date] = { id: note.id, title: note.title };
  }
  return map;
}
