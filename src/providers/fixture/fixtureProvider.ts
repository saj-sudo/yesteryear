import type {
  FullObject,
  ObjectSummary,
  PersistedDoc,
  Provider,
  SaveResult,
  SearchOptions,
  StateStore,
  StructureDef,
  TagDef,
} from '../../engine/provider';
import type { LocalDate } from '../../engine/types';
import { dailyNoteTitle } from './generate';
import type { FixtureSpace } from './types';

/**
 * In-memory Provider + StateStore over a FixtureSpace. Serves two roles:
 * the "Try the demo" mode in the app (no account, no writes leave the
 * tab) and the test double for the engine's orchestration tests.
 */
export class FixtureProvider implements Provider, StateStore {
  readonly dailyNoteStructureId = 'RootDailyNote';

  private readonly space: FixtureSpace;
  /** Daily-note markdown by date, mutable so appends are observable. */
  private readonly dailyBodies = new Map<string, string>();
  private readonly dailyByDate = new Map<string, { id: string; title: string }>();
  private state: { doc: PersistedDoc; updatedAt: string } | null = null;
  /** Test hook: when set, the next save throws after this many steps. */
  failNextSave = false;

  constructor(space: FixtureSpace) {
    this.space = space;
    for (const note of space.dailyNotes) {
      this.dailyBodies.set(note.date, note.markdown);
      this.dailyByDate.set(note.date, { id: note.id, title: note.title });
    }
  }

  /* ---------------- Provider ---------------- */

  spaceInfo(): Promise<{ spaceId: string; title: string }> {
    return Promise.resolve({ spaceId: this.space.spaceId, title: this.space.title });
  }

  listStructures(): Promise<StructureDef[]> {
    return Promise.resolve(this.space.structures);
  }

  listTags(): Promise<TagDef[]> {
    return Promise.resolve(this.space.tags);
  }

  async *listObjectsByStructure(structureId: string): AsyncIterable<ObjectSummary> {
    if (structureId === this.dailyNoteStructureId) {
      for (const [date, note] of this.dailyByDate) {
        void date;
        yield { id: note.id, structureId, title: note.title };
      }
      return;
    }
    for (const o of this.space.objects) {
      if (o.structureId === structureId) {
        yield { id: o.id, structureId, title: o.title };
      }
    }
  }

  async *listObjectsByTag(tagId: string): AsyncIterable<ObjectSummary> {
    const ids = this.space.tagAssignments[tagId] ?? [];
    for (const id of ids) {
      const o = this.space.objects.find((x) => x.id === id);
      if (o) yield { id: o.id, structureId: o.structureId, title: o.title };
    }
  }

  /** Every word of the phrase must appear in the title or the body. */
  searchObjects(query: string, options: SearchOptions = {}): Promise<ObjectSummary[]> {
    const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) return Promise.resolve([]);
    const limit = options.limit ?? 30;
    const matches = (title: string, body: string): boolean => {
      const haystack = `${title}\n${body}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    };
    const hits: ObjectSummary[] = [];
    const wanted = (structureId: string): boolean =>
      options.structureId === undefined || options.structureId === structureId;
    for (const o of this.space.objects) {
      if (wanted(o.structureId) && matches(o.title, o.markdown)) {
        hits.push({ id: o.id, structureId: o.structureId, title: o.title });
      }
    }
    if (wanted(this.dailyNoteStructureId)) {
      for (const [date, note] of this.dailyByDate) {
        if (matches(note.title, this.dailyBodies.get(date) ?? '')) {
          hits.push({ id: note.id, structureId: this.dailyNoteStructureId, title: note.title });
        }
      }
    }
    return Promise.resolve(hits.slice(0, limit));
  }

  getObject(id: string): Promise<FullObject | null> {
    const o = this.space.objects.find((x) => x.id === id);
    if (o) {
      const { markdown, ...full } = o;
      void markdown;
      return Promise.resolve(full);
    }
    for (const [date, note] of this.dailyByDate) {
      if (note.id === id) {
        return Promise.resolve({
          id,
          structureId: this.dailyNoteStructureId,
          title: note.title,
          properties: {},
          blocks: [
            { id: `${id}-body`, type: 'TextBlock', text: this.dailyBodies.get(date) ?? '' },
          ],
        });
      }
    }
    return Promise.resolve(null);
  }

  getObjectMarkdown(id: string): Promise<string | null> {
    const o = this.space.objects.find((x) => x.id === id);
    if (o) return Promise.resolve(o.markdown);
    for (const [date, note] of this.dailyByDate) {
      if (note.id === id) return Promise.resolve(this.dailyBodies.get(date) ?? '');
    }
    return Promise.resolve(null);
  }

  appendToDailyNote(date: LocalDate, markdown: string): Promise<void> {
    if (!this.dailyByDate.has(date)) {
      // Created lazily, like the real API (V6).
      this.dailyByDate.set(date, { id: `dn-${date}`, title: dailyNoteTitle(date) });
      this.dailyBodies.set(date, '');
    }
    const existing = this.dailyBodies.get(date) ?? '';
    this.dailyBodies.set(date, existing === '' ? markdown : `${existing}\n\n${markdown}`);
    return Promise.resolve();
  }

  deepLink(objectId: string): string {
    return `https://app.capacities.io/${this.space.spaceId}/${objectId}`;
  }

  /* ---------------- StateStore ---------------- */

  load(): Promise<{ doc: PersistedDoc; remoteUpdatedAt: string } | null> {
    if (!this.state) return Promise.resolve(null);
    return Promise.resolve({
      doc: structuredClone(this.state.doc),
      remoteUpdatedAt: this.state.updatedAt,
    });
  }

  save(doc: PersistedDoc, expectedUpdatedAt: string | null): Promise<SaveResult> {
    if (this.failNextSave) {
      this.failNextSave = false;
      return Promise.reject(new Error('fixture: simulated write failure'));
    }
    const current = this.state?.updatedAt ?? null;
    if (current !== expectedUpdatedAt && this.state) {
      return Promise.resolve({
        conflict: {
          remote: structuredClone(this.state.doc),
          remoteUpdatedAt: this.state.updatedAt,
        },
      });
    }
    this.state = { doc: structuredClone(doc), updatedAt: doc.state.updatedAt };
    return Promise.resolve('ok');
  }

  /* ---------------- test helpers ---------------- */

  /** Markdown of the daily note for a date (test/demo inspection). */
  dailyNoteBody(date: LocalDate): string | null {
    return this.dailyBodies.get(date) ?? null;
  }

  /** Replace a daily note's body: simulates the user editing it. */
  setDailyNoteBody(date: LocalDate, markdown: string): void {
    if (!this.dailyByDate.has(date)) {
      this.dailyByDate.set(date, { id: `dn-${date}`, title: dailyNoteTitle(date) });
    }
    this.dailyBodies.set(date, markdown);
  }

  dailyNoteIdForDate(date: LocalDate): string | null {
    return this.dailyByDate.get(date)?.id ?? null;
  }
}
