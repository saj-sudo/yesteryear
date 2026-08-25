import type {
  FullObject,
  StructureDef,
  TagDef,
} from '../../engine/provider';

/**
 * A synthetic space definition. Fixtures are always invented (spec §12) —
 * never derived from a real export — and double as the demo dataset and
 * the test double.
 */
export interface FixtureSpace {
  spaceId: string;
  title: string;
  /** Includes basic structures (daily notes, pages, tags) plus custom types. */
  structures: StructureDef[];
  tags: TagDef[];
  /** Static objects (everything except daily notes). */
  objects: FixtureObject[];
  /** tagId → object ids carrying that tag. */
  tagAssignments: Record<string, string[]>;
  /** Daily notes, one per date the space "wrote something". */
  dailyNotes: { date: string; id: string; title: string; markdown: string }[];
}

export interface FixtureObject extends FullObject {
  markdown: string;
}
