import { normalizeConfig } from './config';
import type { PersistedDoc, SaveResult, StateStore } from './provider';
import type {
  ItemKey,
  ItemState,
  YesteryearConfig,
  YesteryearState,
} from './types';

/**
 * State model helpers and the concurrency-guarded manager (§10).
 * State documents are always written whole; on conflict the pending
 * mutations replay onto the fresh remote copy instead of overwriting.
 */

/* ---------------- item keys ---------------- */

export function objKey(objectId: string): ItemKey {
  return `obj:${objectId}`;
}

export function blockKey(objectId: string, blockId: string): ItemKey {
  return `blk:${objectId}/${blockId}`;
}

export function learnKey(base: ItemKey): ItemKey {
  return `${base}#learn`;
}

export interface ParsedKey {
  objectId: string;
  blockId: string | null;
  learn: boolean;
}

export function parseKey(key: ItemKey): ParsedKey | null {
  const learn = key.endsWith('#learn');
  const bare = learn ? key.slice(0, -'#learn'.length) : key;
  if (bare.startsWith('obj:')) {
    return { objectId: bare.slice(4), blockId: null, learn };
  }
  if (bare.startsWith('blk:')) {
    const rest = bare.slice(4);
    const slash = rest.indexOf('/');
    if (slash > 0) {
      return { objectId: rest.slice(0, slash), blockId: rest.slice(slash + 1), learn };
    }
  }
  return null;
}

/* ---------------- documents ---------------- */

export function emptyState(nowIso: string): YesteryearState {
  return {
    version: 1,
    updatedAt: nowIso,
    items: {},
    groupLastSurfaced: {},
    lastRunDate: null,
    lastRunItems: [],
  };
}

export function emptyDoc(config: YesteryearConfig, nowIso: string): PersistedDoc {
  return { version: 1, config, state: emptyState(nowIso) };
}

/**
 * Accept any imported/parsed document and return a valid one. Config runs
 * through normalizeConfig; state items with unrecognizable keys or shapes
 * are dropped rather than crashing (§8.6 spirit: forgiving everywhere).
 */
export function normalizeDoc(input: unknown, nowIso: string): PersistedDoc {
  const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<
    string,
    unknown
  >;
  const config = normalizeConfig(raw['config']);
  const stateRaw = (
    typeof raw['state'] === 'object' && raw['state'] !== null ? raw['state'] : {}
  ) as Record<string, unknown>;

  const items: Record<ItemKey, ItemState> = {};
  const itemsRaw = (
    typeof stateRaw['items'] === 'object' && stateRaw['items'] !== null
      ? stateRaw['items']
      : {}
  ) as Record<string, unknown>;
  for (const [key, value] of Object.entries(itemsRaw)) {
    if (!parseKey(key) || typeof value !== 'object' || value === null) continue;
    const v = value as Record<string, unknown>;
    if (v['mode'] === 'recall') {
      items[key] = {
        mode: 'recall',
        lastSurfaced: typeof v['lastSurfaced'] === 'string' ? v['lastSurfaced'] : null,
        nextEligible: typeof v['nextEligible'] === 'string' ? v['nextEligible'] : null,
        surfaceCount: typeof v['surfaceCount'] === 'number' ? v['surfaceCount'] : 0,
        lastResponse:
          v['lastResponse'] === 'keep' ||
          v['lastResponse'] === 'dismiss' ||
          v['lastResponse'] === 'retire'
            ? v['lastResponse']
            : null,
        group: typeof v['group'] === 'string' ? v['group'] : null,
        retired: v['retired'] === true,
      };
    } else if (v['mode'] === 'learn' && typeof v['targetDate'] === 'string') {
      items[key] = {
        mode: 'learn',
        targetDate: v['targetDate'],
        lastSurfaced: typeof v['lastSurfaced'] === 'string' ? v['lastSurfaced'] : null,
        nextDue: typeof v['nextDue'] === 'string' ? v['nextDue'] : null,
        surfaceCount: typeof v['surfaceCount'] === 'number' ? v['surfaceCount'] : 0,
        lastResponse:
          v['lastResponse'] === 'gotIt' || v['lastResponse'] === 'missedIt'
            ? v['lastResponse']
            : null,
      };
    }
  }

  const groupLastSurfaced: Record<string, string> = {};
  const groupsRaw = (
    typeof stateRaw['groupLastSurfaced'] === 'object' &&
    stateRaw['groupLastSurfaced'] !== null
      ? stateRaw['groupLastSurfaced']
      : {}
  ) as Record<string, unknown>;
  for (const [group, date] of Object.entries(groupsRaw)) {
    if (typeof date === 'string') groupLastSurfaced[group] = date;
  }

  const lastRunItems: YesteryearState['lastRunItems'] = [];
  if (Array.isArray(stateRaw['lastRunItems'])) {
    for (const entry of stateRaw['lastRunItems'] as unknown[]) {
      if (typeof entry !== 'object' || entry === null) continue;
      const e = entry as Record<string, unknown>;
      if (typeof e['key'] === 'string' && typeof e['title'] === 'string' && parseKey(e['key'])) {
        lastRunItems.push({
          key: e['key'],
          title: e['title'],
          learn: e['learn'] === true,
        });
      }
    }
  }

  return {
    version: 1,
    config,
    state: {
      version: 1,
      updatedAt:
        typeof stateRaw['updatedAt'] === 'string' ? stateRaw['updatedAt'] : nowIso,
      items,
      groupLastSurfaced,
      lastRunDate:
        typeof stateRaw['lastRunDate'] === 'string' ? stateRaw['lastRunDate'] : null,
      lastRunItems,
    },
  };
}

/** Drop state entries whose object no longer exists (§11). */
export function pruneMissing(
  state: YesteryearState,
  objectExists: (objectId: string) => boolean,
): void {
  for (const key of Object.keys(state.items)) {
    const parsed = parseKey(key);
    if (!parsed || !objectExists(parsed.objectId)) delete state.items[key];
  }
}

/* ---------------- export / import ---------------- */

export function exportDoc(doc: PersistedDoc): string {
  return JSON.stringify(doc, null, 2);
}

export function importDoc(json: string, nowIso: string): PersistedDoc {
  return normalizeDoc(JSON.parse(json), nowIso);
}

/* ---------------- concurrency-guarded manager ---------------- */

type Mutation = (doc: PersistedDoc) => void;

/**
 * Holds the working copy of the document, records every change as a
 * mutation, and saves with compare-and-reapply: when the remote moved
 * since load (another tab, another device), the pending mutations replay
 * onto the fresh remote document and the whole result is written again.
 * A failed write leaves the prior remote document intact by construction
 * (one whole-document PUT per attempt).
 */
export class StateManager {
  private store: StateStore;
  private nowIso: () => string;
  private doc: PersistedDoc;
  private remoteUpdatedAt: string | null = null;
  private pending: Mutation[] = [];
  private inFlight: Promise<void> | null = null;

  private constructor(store: StateStore, nowIso: () => string, doc: PersistedDoc) {
    this.store = store;
    this.nowIso = nowIso;
    this.doc = doc;
  }

  static async open(
    store: StateStore,
    nowIso: () => string,
    defaults?: YesteryearConfig,
  ): Promise<StateManager> {
    const loaded = await store.load();
    const manager = new StateManager(
      store,
      nowIso,
      loaded
        ? loaded.doc
        : emptyDoc(defaults ?? normalizeConfig(undefined), nowIso()),
    );
    manager.remoteUpdatedAt = loaded?.remoteUpdatedAt ?? null;
    return manager;
  }

  /** Current working copy. Treat as read-only; change via mutate(). */
  get current(): PersistedDoc {
    return this.doc;
  }

  /** Apply a change locally and queue it for the next flush. */
  mutate(change: Mutation): void {
    change(this.doc);
    this.pending.push(change);
  }

  /** True when there are unpersisted changes. */
  get dirty(): boolean {
    return this.pending.length > 0;
  }

  /**
   * Persist the working copy. On conflict: re-read, replay pending
   * mutations onto the fresh remote, retry (up to `maxAttempts`).
   * Throws only when every attempt conflicted or the write itself
   * failed — callers surface that visibly rather than dropping it (§11).
   *
   * Calls are serialized: several views flush fire-and-forget, and two
   * overlapping flushes would each read-then-write the same object under
   * last-write-wins. The store's read-before-write detects other clients,
   * not a second flush of our own.
   */
  async flush(maxAttempts = 3): Promise<void> {
    const run = (this.inFlight ?? Promise.resolve()).then(
      () => this.flushOnce(maxAttempts),
      () => this.flushOnce(maxAttempts),
    );
    this.inFlight = run.catch(() => undefined);
    return run;
  }

  private async flushOnce(maxAttempts: number): Promise<void> {
    if (this.pending.length === 0) return;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      this.doc.state.updatedAt = this.nowIso();
      const result: SaveResult = await this.store.save(this.doc, this.remoteUpdatedAt);
      if (result === 'ok') {
        this.remoteUpdatedAt = this.doc.state.updatedAt;
        this.pending = [];
        return;
      }
      // Conflict: take the fresh remote and replay our changes onto it.
      this.doc = result.conflict.remote;
      this.remoteUpdatedAt = result.conflict.remoteUpdatedAt;
      for (const change of this.pending) change(this.doc);
    }
    throw new Error(
      'Could not save: the state kept changing underneath (another tab or device?). ' +
        'The latest remote copy has been kept.',
    );
  }
}
