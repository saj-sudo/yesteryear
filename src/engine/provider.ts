import type { LocalDate, YesteryearConfig, YesteryearState } from './types';

/**
 * The engine's only view of the outside world. One implementation wraps
 * the Capacities API; another serves synthetic fixtures for the demo and
 * the tests. Nothing in src/engine may import anything else that does I/O.
 *
 * The shapes here are deliberately simpler than the API's: the adapter
 * flattens rich blocks and property payloads into what scheduling and
 * display actually need.
 */

export interface PropertyDef {
  id: string;
  name: string;
  /** API property type: 'date', 'label', 'text', 'entity', … */
  type: string;
  writable: boolean;
  /** For label properties: the value names this space actually uses. */
  labelNames: string[];
}

export interface StructureDef {
  id: string;
  title: string;
  pluralName: string;
  properties: PropertyDef[];
}

export interface TagDef {
  id: string;
  name: string;
}

export interface ObjectSummary {
  id: string;
  structureId: string;
  title: string;
}

/** Simplified property value, keyed by property id on FullObject. */
export type PropertyValue =
  | { type: 'date'; start: string | null; end: string | null }
  | { type: 'label'; names: string[] }
  | { type: 'text'; value: string | null }
  | { type: 'number'; value: number | null }
  | { type: 'other' };

/** A block flattened out of the API's recursive tree. */
export interface SimpleBlock {
  id: string;
  /**
   * Derived display type: 'TextBlock', 'QuoteBlock' (a text block with a
   * quote layout), 'CodeBlock', 'MathBlock', … These come from the API's
   * block model, not from user schema.
   */
  type: string;
  text: string;
}

export interface FullObject {
  id: string;
  structureId: string;
  title: string;
  properties: Record<string, PropertyValue>;
  blocks: SimpleBlock[];
}

export interface SpaceInfo {
  spaceId: string;
  title: string;
}

export interface Provider {
  /** Structure id of daily notes; supplied by the adapter (RootDailyNote). */
  readonly dailyNoteStructureId: string;

  spaceInfo(): Promise<SpaceInfo>;
  listStructures(): Promise<StructureDef[]>;
  listTags(): Promise<TagDef[]>;

  listObjectsByStructure(structureId: string): AsyncIterable<ObjectSummary>;
  listObjectsByTag(tagId: string): AsyncIterable<ObjectSummary>;

  /** Full object, or null when it no longer exists (drives §11 pruning). */
  getObject(id: string): Promise<FullObject | null>;
  getObjectMarkdown(id: string): Promise<string | null>;

  /**
   * Append markdown to the daily note for the given date, creating the
   * note when it does not exist yet.
   */
  appendToDailyNote(date: LocalDate, markdown: string): Promise<void>;

  /** URL that opens the object in the user's own app. */
  deepLink(objectId: string): string;
}

/**
 * The document persisted in the user's space: config travels with state
 * (§6) so settings sync across devices along with history.
 */
export interface PersistedDoc {
  version: 1;
  config: YesteryearConfig;
  state: YesteryearState;
}

export type SaveConflict = {
  conflict: { remote: PersistedDoc; remoteUpdatedAt: string };
};
export type SaveResult = 'ok' | SaveConflict;

/**
 * Where resurfacing history lives (§10): an object in the user's own
 * space for the real provider, memory for fixtures. `load()` returning
 * null is a valid first run, never an error. Saves write the whole
 * document; a save whose `expectedUpdatedAt` no longer matches the
 * remote returns the fresh remote instead of overwriting (§10.3).
 */
export interface StateStore {
  load(): Promise<{ doc: PersistedDoc; remoteUpdatedAt: string } | null>;
  save(doc: PersistedDoc, expectedUpdatedAt: string | null): Promise<SaveResult>;
}
