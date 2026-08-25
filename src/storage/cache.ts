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

