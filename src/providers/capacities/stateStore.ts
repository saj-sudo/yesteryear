import type { CapacitiesClient } from '@capacities/api';
import { normalizeDoc } from '../../engine/state';
import type { PersistedDoc, SaveResult, StateStore } from '../../engine/provider';
import { PAGE_STRUCTURE_ID } from './constants';
import { withBackoff } from './rateLimit';

/**
 * The "Yesteryear State" object in the user's own space (§10.1): one
 * page holding the whole document as a fenced JSON block, PATCHed whole
 * on every save. The user can open, inspect, or delete it in their own
 * app at any time — it is their data.
 *
 * Concurrency (§10.3): the API is last-write-wins, so save() re-reads
 * the object first and reports a conflict when its updatedAt moved,
 * letting StateManager replay pending changes instead of overwriting.
 */

export const STATE_OBJECT_TITLE = 'Yesteryear State';

const PREAMBLE =
  'This page stores your Yesteryear settings and resurfacing history. ' +
  'Yesteryear keeps it up to date automatically — editing it by hand may ' +
  'lose scheduling history, and deleting it starts Yesteryear fresh.';

export function docToMarkdown(doc: PersistedDoc): string {
  return `# ${STATE_OBJECT_TITLE}\n\n${PREAMBLE}\n\n\`\`\`json\n${JSON.stringify(
    doc,
    null,
    2,
  )}\n\`\`\`\n`;
}

/**
 * Pull the JSON document back out of the page markdown. Forgiving: any
 * fenced json block that parses wins; a mangled page returns null and is
 * treated as a first run rather than an error.
 */
export function docFromMarkdown(markdown: string, nowIso: string): PersistedDoc | null {
  const fences = markdown.matchAll(/```(?:json)?\s*\n([\s\S]*?)\n\s*```/g);
  for (const fence of fences) {
    try {
      const parsed: unknown = JSON.parse(fence[1]!);
      if (typeof parsed === 'object' && parsed !== null) {
        return normalizeDoc(parsed, nowIso);
      }
    } catch {
      // try the next fence
    }
  }
  return null;
}

const idCacheKey = (spaceId: string): string =>
  `yesteryear.stateObjectId.${spaceId}`;

export class CapacitiesStateStore implements StateStore {
  private readonly client: CapacitiesClient;
  private readonly spaceId: string;
  private readonly nowIso: () => string;
  private objectId: string | null = null;

  constructor(client: CapacitiesClient, spaceId: string, nowIso: () => string) {
    this.client = client;
    this.spaceId = spaceId;
    this.nowIso = nowIso;
    try {
      this.objectId = localStorage.getItem(idCacheKey(spaceId));
    } catch {
      this.objectId = null;
    }
  }

  private rememberId(id: string): void {
    this.objectId = id;
    try {
      localStorage.setItem(idCacheKey(this.spaceId), id);
    } catch {
      // cache only
    }
  }

  /** Find the state object by exact title; null when it does not exist. */
  private async findObjectId(): Promise<string | null> {
    if (this.objectId) return this.objectId;
    const res = await withBackoff(() =>
      this.client.objects.search({ query: STATE_OBJECT_TITLE }),
    );
    const hit = res.results.find((r) => r.title === STATE_OBJECT_TITLE);
    if (hit) this.rememberId(hit.id);
    return hit?.id ?? null;
  }

  private async read(): Promise<{ doc: PersistedDoc; remoteUpdatedAt: string } | null> {
    const id = await this.findObjectId();
    if (!id) return null;
    let markdown: string;
    try {
      const res = await withBackoff(() => this.client.object.markdown.get({ id }));
      markdown = res.markdown;
    } catch {
      // The cached id may point at a deleted object: forget it and retry
      // discovery once.
      this.objectId = null;
      const rediscovered = await this.findObjectId();
      if (!rediscovered) return null;
      const res = await withBackoff(() =>
        this.client.object.markdown.get({ id: rediscovered }),
      );
      markdown = res.markdown;
    }
    const doc = docFromMarkdown(markdown, this.nowIso());
    if (!doc) return null; // mangled page → valid first run, never an error
    return { doc, remoteUpdatedAt: doc.state.updatedAt };
  }

  async load(): Promise<{ doc: PersistedDoc; remoteUpdatedAt: string } | null> {
    return this.read();
  }

  async save(doc: PersistedDoc, expectedUpdatedAt: string | null): Promise<SaveResult> {
    // Read-before-write: if the remote moved since load, report it.
    const remote = await this.read();
    const remoteUpdatedAt = remote?.remoteUpdatedAt ?? null;
    if (remote && remoteUpdatedAt !== expectedUpdatedAt) {
      return { conflict: { remote: remote.doc, remoteUpdatedAt: remoteUpdatedAt! } };
    }

    const markdown = docToMarkdown(doc);
    if (this.objectId) {
      await withBackoff(() =>
        this.client.object.markdown.update({ id: this.objectId!, markdown }),
      );
    } else {
      const created = await withBackoff(() =>
        this.client.object.markdown.create({ structureId: PAGE_STRUCTURE_ID, markdown }),
      );
      this.rememberId(created.id);
    }
    return 'ok';
  }
}
