import type { PropertyDef, StructureDef, TagDef } from './provider';
import type { PropertyRole, TypeRole, YesteryearConfig } from './types';

/**
 * Suggested mappings. Yesteryear starts with nothing mapped, so a space with
 * a standard Capacities Project type or a Person type with a birthday would
 * get no anniversaries or birthday reminders until someone found the right
 * dropdowns. This reads the space's own types, properties and tags and says
 * what each one probably is, in the words Capacities uses.
 *
 * It only suggests. Nothing is applied until the person says so, and a role
 * that is already mapped is never touched. Pure: names in, names out.
 */

export interface SuggestedType {
  role: TypeRole;
  /** The type's title in the space. */
  type: string;
  /** True when only the shape (not the name) pointed at it. */
  guess: boolean;
  /** Properties found on it, by role. */
  properties: Partial<Record<PropertyRole, string>>;
}

export interface Suggestion {
  types: SuggestedType[];
  /** Status labels that mean a project is still in flight. */
  activeStatusValues: string[];
  /** Tags whose names already say "bring this back". */
  recallTags: string[];
}

/** Lowercase letters and digits only, so "Start Date", "start_date" and "startDate" agree. */
export function norm(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const PROJECT_TYPES = ['project', 'projects', 'initiative', 'initiatives', 'epic', 'campaign', 'workitem'];
const PERSON_TYPES = ['person', 'people', 'contact', 'contacts', 'friend', 'friends', 'family', 'colleague', 'colleagues'];
const NOTE_TYPES = ['note', 'notes', 'atomicnote', 'zettel', 'permanentnote', 'fleetingnote', 'idea', 'ideas', 'insight', 'insights'];

const START_PROPS = ['startdate', 'start', 'begins', 'begin', 'kickoff', 'started', 'startson', 'from'];
const TARGET_PROPS = [
  'targetcompletion',
  'targetdate',
  'target',
  'duedate',
  'due',
  'deadline',
  'enddate',
  'end',
  'completiondate',
  'completion',
  'finishby',
  'finish',
  'bywhen',
  'launchdate',
  'launch',
];
const STATUS_PROPS = ['status', 'state', 'stage', 'phase', 'progress'];
const BIRTHDAY_PROPS = ['birthday', 'birthdate', 'dateofbirth', 'born', 'bornon', 'bday', 'dob'];

const DONE_LIKE = ['completed', 'complete', 'done', 'archived', 'cancelled', 'canceled', 'closed', 'finished', 'shipped', 'abandoned', 'dropped', 'summited', 'achieved'];
const PAUSED_LIKE = ['onhold', 'paused', 'someday', 'maybe', 'backlog', 'waiting', 'blocked'];
const RECALL_TAGS = ['resurface', 'resurfaceme', 'revisit', 'recall', 'remember', 'evergreen', 'keeper'];

/** The first property whose name is in `names`, trying `names` in order. */
function pick(properties: PropertyDef[], type: string, names: string[], taken: Set<string>): PropertyDef | undefined {
  const pool = properties.filter((p) => p.type === type && !taken.has(p.id));
  for (const name of names) {
    const found = pool.find((p) => norm(p.name) === name);
    if (found) return found;
  }
  return undefined;
}

interface ProjectShape {
  start?: PropertyDef;
  target?: PropertyDef;
  status?: PropertyDef;
  /** The dates were taken by their order on the type, not recognised by name. */
  positional: boolean;
  score: number;
}

function projectShape(structure: StructureDef): ProjectShape {
  const taken = new Set<string>();
  const target = pick(structure.properties, 'date', TARGET_PROPS, taken);
  if (target) taken.add(target.id);
  const start = pick(structure.properties, 'date', START_PROPS, taken);
  if (start) taken.add(start.id);
  const status = pick(structure.properties, 'label', STATUS_PROPS, new Set());
  // Two dates and a status, but names we do not know: the first date is the
  // start and the second the end, which is how Capacities types are usually laid out.
  const dates = structure.properties.filter((p) => p.type === 'date');
  const positional = !start && !target && status !== undefined && dates.length >= 2;
  const first = dates[0];
  const second = dates[1];
  const named = PROJECT_TYPES.indexOf(norm(structure.title));
  const nameScore = named === 0 || named === 1 ? 10 : named > 1 ? 6 : 0;
  const realStart = positional ? first : start;
  const realTarget = positional ? second : target;
  return {
    ...(realStart ? { start: realStart } : {}),
    ...(realTarget ? { target: realTarget } : {}),
    ...(status ? { status } : {}),
    positional,
    score: nameScore + (realTarget ? 3 : 0) + (realStart ? 2 : 0) + (status ? 2 : 0),
  };
}

/** A type needs a date to be worth mapping as projects, whatever it is called. */
function hasProjectDate(shape: ProjectShape): boolean {
  return shape.target !== undefined || shape.start !== undefined;
}

function suggestProject(structures: StructureDef[]): SuggestedType | null {
  let best: { structure: StructureDef; shape: ProjectShape } | null = null;
  for (const structure of structures) {
    const shape = projectShape(structure);
    if (!hasProjectDate(shape) || shape.score < 5) continue;
    if (!best || shape.score > best.shape.score || (shape.score === best.shape.score && structure.title < best.structure.title)) {
      best = { structure, shape };
    }
  }
  if (!best) return null;
  const { structure, shape } = best;
  const properties: Partial<Record<PropertyRole, string>> = {};
  if (shape.start) properties.projectStart = shape.start.name;
  if (shape.target) properties.projectTarget = shape.target.name;
  if (shape.status) properties.projectStatus = shape.status.name;
  return {
    role: 'project',
    type: structure.title,
    guess: shape.positional || PROJECT_TYPES.indexOf(norm(structure.title)) < 0,
    properties,
  };
}

function suggestPerson(structures: StructureDef[], exclude: string | undefined): SuggestedType | null {
  const candidates: { structure: StructureDef; birthday: PropertyDef; named: boolean }[] = [];
  for (const structure of structures) {
    if (structure.title === exclude) continue;
    const birthday = pick(structure.properties, 'date', BIRTHDAY_PROPS, new Set());
    if (!birthday) continue; // without a birthday there is nothing to remind
    candidates.push({ structure, birthday, named: PERSON_TYPES.includes(norm(structure.title)) });
  }
  candidates.sort((a, b) => Number(b.named) - Number(a.named) || (a.structure.title < b.structure.title ? -1 : 1));
  const best = candidates[0];
  if (!best) return null;
  return {
    role: 'person',
    type: best.structure.title,
    guess: !best.named,
    properties: { personBirthday: best.birthday.name },
  };
}

function suggestNote(structures: StructureDef[], taken: string[]): SuggestedType | null {
  const found = structures
    .filter((s) => !taken.includes(s.title) && NOTE_TYPES.includes(norm(s.title)))
    .sort((a, b) => NOTE_TYPES.indexOf(norm(a.title)) - NOTE_TYPES.indexOf(norm(b.title)))[0];
  return found ? { role: 'note', type: found.title, guess: false, properties: {} } : null;
}

/** Which of a status property's values mean the work is still going. */
export function inFlightStatuses(labelNames: string[]): string[] {
  return labelNames.filter((name) => {
    const key = norm(name);
    return !DONE_LIKE.includes(key) && !PAUSED_LIKE.includes(key);
  });
}

/**
 * What the space suggests, leaving out every role `config` already maps.
 * `structures` are the space's own types (no daily notes, pages or tags).
 */
export function suggestMapping(
  structures: StructureDef[],
  tags: TagDef[],
  config: YesteryearConfig,
): Suggestion | null {
  const types: SuggestedType[] = [];
  const project = config.types.project === undefined ? suggestProject(structures) : null;
  if (project) types.push(project);
  const person = config.types.person === undefined ? suggestPerson(structures, project?.type) : null;
  if (person) types.push(person);
  const note =
    config.types.note === undefined
      ? suggestNote(structures, [project?.type, person?.type].filter((t): t is string => t !== undefined))
      : null;
  if (note) types.push(note);

  const statusName = project?.properties.projectStatus;
  const statusProperty = statusName
    ? structures.find((s) => s.title === project!.type)?.properties.find((p) => p.name === statusName)
    : undefined;
  const activeStatusValues =
    statusProperty && config.activeStatusValues.length === 0 ? inFlightStatuses(statusProperty.labelNames) : [];

  const recallTags =
    config.recall.tags.length === 0
      ? tags.filter((t) => RECALL_TAGS.includes(norm(t.name))).map((t) => t.name)
      : [];

  if (types.length === 0 && recallTags.length === 0) return null;
  return { types, activeStatusValues, recallTags };
}

/** The config with the suggestion filled in. Never overwrites a role that is already mapped. */
export function applySuggestion(config: YesteryearConfig, suggestion: Suggestion): YesteryearConfig {
  const next = structuredClone(config);
  for (const t of suggestion.types) {
    if (next.types[t.role] === undefined) next.types[t.role] = t.type;
    for (const [role, name] of Object.entries(t.properties) as [PropertyRole, string][]) {
      if (next.properties[role] === undefined) next.properties[role] = name;
    }
  }
  if (next.activeStatusValues.length === 0) next.activeStatusValues = [...suggestion.activeStatusValues];
  if (next.recall.tags.length === 0) next.recall.tags = [...suggestion.recallTags];
  return next;
}

/** A stable fingerprint, so a skipped suggestion stays skipped until the space offers something different. */
export function suggestionKey(suggestion: Suggestion): string {
  return JSON.stringify([
    suggestion.types.map((t) => [t.role, t.type, t.properties]),
    suggestion.activeStatusValues,
    suggestion.recallTags,
  ]);
}

/** Only the parts of a suggestion the person ticked. */
export function pickSuggestion(
  suggestion: Suggestion,
  roles: ReadonlySet<TypeRole>,
  withTags: boolean,
): Suggestion {
  return {
    types: suggestion.types.filter((t) => roles.has(t.role)),
    activeStatusValues: roles.has('project') ? suggestion.activeStatusValues : [],
    recallTags: withTags ? suggestion.recallTags : [],
  };
}
