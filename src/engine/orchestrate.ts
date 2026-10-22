import { addDays, formatLocalDate, localDateFromIso, parseDailyNoteTitle } from './dates';
import type { PairingCandidate } from './pairing';
import { refineToBlock } from './granularity';
import { renderSection } from './markdown';
import { parseResponses } from './parseResponses';
import type { FullObject, ObjectSummary, Provider, PropertyValue, StructureDef } from './provider';
import { listNames, referencedTagNames, resolveSchema, type ResolvedSchema } from './resolve';
import { nearestUpcoming, removeNoteFromSets } from './studySets';
import { learnKey, objKey, parseKey, StateManager } from './state';
import { temporalCandidates, type DailyNoteRef, type PersonInput, type ProjectInput } from './temporal';
import { chooseDay, finalizeRun, prepareLearn, applyResponses, type CandidatePools } from './run';
import type { PersistedDoc, SaveResult, StateStore } from './provider';
import type {
  Candidate,
  LocalDate,
  SurfacedItem,
  YesteryearConfig,
} from './types';

/**
 * The I/O layer of a daily run: everything here talks only to the
 * Provider interface and the StateManager, so it runs identically
 * against Capacities and the fixtures. Enumeration is cheap (summaries),
 * full objects are fetched only where properties or blocks are actually
 * needed (§5.4).
 */

export interface RunReport {
  today: LocalDate;
  surfaced: SurfacedItem[];
  markdown: string | null;
  wrote: boolean;
  skipped: 'alreadyRanToday' | 'sectionAlreadyPresent' | null;
  warnings: string[];
}

/** date → daily note, parsed from titles; unparseable titles skipped. */
export async function buildDailyNoteMap(
  provider: Provider,
): Promise<Map<string, DailyNoteRef>> {
  const map = new Map<string, DailyNoteRef>();
  for await (const note of provider.listObjectsByStructure(provider.dailyNoteStructureId)) {
    const date = parseDailyNoteTitle(note.title);
    if (date) map.set(date, { id: note.id, title: note.title });
  }
  return map;
}

function dateOf(value: PropertyValue | undefined): LocalDate | null {
  if (value?.type !== 'date' || !value.start) return null;
  return localDateFromIso(value.start);
}

function labelsOf(value: PropertyValue | undefined): string[] {
  return value?.type === 'label' ? value.names : [];
}

/** Safety valve: fetching properties costs one GET per object (§5.4). */
const MAX_ENRICHED_OBJECTS = 500;

async function enrichAll(
  provider: Provider,
  ids: string[],
  warnings: string[],
  what: string,
): Promise<FullObject[]> {
  const out: FullObject[] = [];
  const capped = ids.slice(0, MAX_ENRICHED_OBJECTS);
  if (ids.length > capped.length) {
    warnings.push(
      `Only the first ${MAX_ENRICHED_OBJECTS} ${what} were checked this run ` +
        `(${ids.length} exist).`,
    );
  }
  for (const id of capped) {
    const obj = await provider.getObject(id);
    if (obj) out.push(obj);
  }
  return out;
}

function recallCandidate(
  id: string,
  title: string,
  tags: string[],
  group: string | null,
): Candidate {
  return {
    key: objKey(id),
    objectId: id,
    blockId: null,
    title,
    excerpt: null,
    source: 'recall',
    temporalReason: null,
    tags,
    group,
    targetDate: null,
  };
}

/**
 * Gather the day's candidate pools from the space. Missing mappings mean
 * the corresponding producer contributes nothing: silently (§4).
 */
export async function gatherPools(
  provider: Provider,
  config: YesteryearConfig,
  resolved: ResolvedSchema,
  notesByDate: ReadonlyMap<string, DailyNoteRef>,
  today: LocalDate,
  warnings: string[],
): Promise<CandidatePools> {
  /* ---- temporal inputs ---- */
  let persons: PersonInput[] = [];
  const personType = resolved.types.person;
  const birthdayProp = resolved.properties.personBirthday;
  if (config.temporal.enabled && personType && birthdayProp) {
    const ids: string[] = [];
    for await (const s of provider.listObjectsByStructure(personType.structure.id)) {
      ids.push(s.id);
    }
    persons = (await enrichAll(provider, ids, warnings, 'people')).map((o) => ({
      id: o.id,
      title: o.title,
      birthday: dateOf(o.properties[birthdayProp.property.id]),
    }));
  }

  let projects: ProjectInput[] = [];
  const projectType = resolved.types.project;
  const startProp = resolved.properties.projectStart;
  const targetProp = resolved.properties.projectTarget;
  const statusProp = resolved.properties.projectStatus;
  if (config.temporal.enabled && projectType && (startProp || targetProp)) {
    const ids: string[] = [];
    for await (const s of provider.listObjectsByStructure(projectType.structure.id)) {
      ids.push(s.id);
    }
    projects = (await enrichAll(provider, ids, warnings, 'projects')).map((o) => ({
      id: o.id,
      title: o.title,
      start: startProp ? dateOf(o.properties[startProp.property.id]) : null,
      target: targetProp ? dateOf(o.properties[targetProp.property.id]) : null,
      statusNames: statusProp ? labelsOf(o.properties[statusProp.property.id]) : [],
    }));
  }

  const temporal = temporalCandidates({
    today,
    config: config.temporal,
    activeStatusValues: config.activeStatusValues,
    notesByDate,
    persons,
    projects,
  });

  /* ---- tag sweeps: recall tags, learn tags, rotation groups ---- */
  const rotationTagGroups =
    config.rotation.enabled && config.rotation.groupBy === 'tag'
      ? config.rotation.groups
      : [];
  const objectTags = await sweepTags(
    provider,
    resolved.tagIds,
    new Set([...config.recall.tags, ...learnTagNames(config), ...rotationTagGroups]),
  );

  const groupOf = (tags: Set<string>): string | null =>
    rotationTagGroups.find((g) => tags.has(g)) ?? null;

  /* ---- learn assignments ---- */
  const learn = await gatherLearn(provider, config, objectTags, groupOf, today, warnings);

  /* ---- recall pool ---- */
  const learning = new Set(learn.map((c) => c.objectId));
  const recall: Candidate[] = [];
  for (const [id, entry] of objectTags) {
    const inRecallTags = config.recall.tags.some((t) => entry.tags.has(t));
    if (inRecallTags && !learning.has(id)) {
      recall.push(recallCandidate(id, entry.title, [...entry.tags], groupOf(entry.tags)));
    }
  }

  return { temporal, recall, learn };
}

export type ObjectTags = Map<string, { title: string; tags: Set<string> }>;

/** Every tag name Learn needs swept: date-property tags and the tags of study sets. */
function learnTagNames(config: YesteryearConfig): string[] {
  return [...config.learn.assignByTag, ...config.learn.sets.flatMap((s) => s.tags)];
}

/** Object id → title and the tag names (from `names`) it carries. */
async function sweepTags(
  provider: Provider,
  tagIds: Readonly<Record<string, string>>,
  names: Iterable<string>,
): Promise<ObjectTags> {
  const objectTags: ObjectTags = new Map();
  for (const name of new Set(names)) {
    const tagId = tagIds[name];
    if (!tagId) continue; // unresolved tag: already warned by resolveSchema
    for await (const s of provider.listObjectsByTag(tagId)) {
      const entry = objectTags.get(s.id) ?? { title: s.title, tags: new Set<string>() };
      entry.tags.add(name);
      objectTags.set(s.id, entry);
    }
  }
  return objectTags;
}

/**
 * The notes that study toward a date today, with the date each one aims
 * at. Shared by the daily run and by syncLearn.
 */
async function gatherLearn(
  provider: Provider,
  config: YesteryearConfig,
  objectTags: ObjectTags,
  groupOf: (tags: Set<string>) => string | null,
  today: LocalDate,
  warnings: string[],
): Promise<Candidate[]> {
  // Every way a note can enter Learn contributes a date for it: a date
  // property (tag or type assignments) and study sets (tag, type or a
  // note picked by hand). A note claimed by several studies toward the
  // nearest date that has not passed.
  const learn: Candidate[] = [];
  if (config.learn.enabled) {
    const claims = new Map<string, { title: string; dates: LocalDate[] }>();
    const claim = (id: string, title: string, date: LocalDate): void => {
      const entry = claims.get(id) ?? { title, dates: [] };
      entry.dates.push(date);
      claims.set(id, entry);
    };

    // Type names resolve directly against the space's structure list, so
    // any type can be used, not only the mapped roles.
    let structures: StructureDef[] | null = null;
    const membersOfType = async (
      typeName: string,
      missing: (known: StructureDef[]) => string,
    ): Promise<ObjectSummary[]> => {
      structures ??= await provider.listStructures();
      const structure = structures.find(
        (s) => s.title.trim().toLowerCase() === typeName.trim().toLowerCase(),
      );
      if (!structure) {
        warnings.push(missing(structures));
        return [];
      }
      const found: ObjectSummary[] = [];
      for await (const s of provider.listObjectsByStructure(structure.id)) found.push(s);
      return found;
    };

    /* date property: tag and type assignments */
    const byProperty = new Map<string, string>();
    for (const [id, v] of objectTags) {
      if (config.learn.assignByTag.some((t) => v.tags.has(t))) byProperty.set(id, v.title);
    }
    for (const typeName of config.learn.assignByType) {
      const found = await membersOfType(
        typeName,
        () => `Learn type "${typeName}" is not in this space and was skipped.`,
      );
      for (const s of found) byProperty.set(s.id, s.title);
    }
    if (byProperty.size > 0) {
      // Resolving each note's date needs the full object.
      const enriched = await enrichAll(provider, [...byProperty.keys()], warnings, 'learn items');
      for (const obj of enriched) {
        const date = await resolveTargetDate(provider, obj, config);
        if (date) claim(obj.id, obj.title, date);
        // Without a date the note stays in Recall (§8.3).
      }
    }

    /* study sets: one date for the whole set; nothing to enrich */
    for (const set of config.learn.sets) {
      if (set.targetDate < today) continue; // finished: its notes were released
      for (const [id, v] of objectTags) {
        if (set.tags.some((t) => v.tags.has(t))) claim(id, v.title, set.targetDate);
      }
      for (const typeName of set.types) {
        const found = await membersOfType(
          typeName,
          (known) =>
            `Study set "${set.name}" uses the type "${typeName}", which is not in ` +
            `this space. The space contains: ${listNames(known)}.`,
        );
        for (const s of found) claim(s.id, s.title, set.targetDate);
      }
      // Notes picked by hand come last, so a live title from a tag or
      // type listing wins over the title saved when they were picked.
      for (const note of set.notes) claim(note.id, note.title, set.targetDate);
    }

    for (const [id, entry] of claims) {
      const targetDate = nearestUpcoming(entry.dates, today);
      if (!targetDate) continue;
      const tags = objectTags.get(id)?.tags ?? new Set<string>();
      learn.push({
        key: learnKey(objKey(id)),
        objectId: id,
        blockId: null,
        title: entry.title,
        excerpt: null,
        source: 'learn',
        temporalReason: null,
        tags: [...tags],
        group: groupOf(tags),
        targetDate,
        byRule: true,
      });
    }
  }
  return learn;
}

const structureCache = new WeakMap<Provider, Map<string, Map<string, string>>>();

/** Property name → id for a structure, cached per provider. */
async function propertyIdByName(
  provider: Provider,
  structureId: string,
  propertyName: string,
): Promise<string | null> {
  let byStructure = structureCache.get(provider);
  if (!byStructure) {
    byStructure = new Map();
    for (const s of await provider.listStructures()) {
      byStructure.set(
        s.id,
        new Map(s.properties.map((p) => [p.name.toLowerCase(), p.id])),
      );
    }
    structureCache.set(provider, byStructure);
  }
  return byStructure.get(structureId)?.get(propertyName.toLowerCase()) ?? null;
}

async function resolveTargetDate(
  provider: Provider,
  obj: FullObject,
  config: YesteryearConfig,
): Promise<LocalDate | null> {
  if (!config.learn.targetDateProperty) return null;
  const propId = await propertyIdByName(
    provider,
    obj.structureId,
    config.learn.targetDateProperty,
  );
  if (!propId) return null;
  return dateOf(obj.properties[propId]);
}

/* ------------------------------------------------------------------ */

/**
 * The serendipity pool (Today view): every daily note plus everything
 * carrying a configured tag. Summaries only: nothing is enriched until
 * a drawn pairing is actually displayed.
 */
export async function gatherPairingPool(
  provider: Provider,
  config: YesteryearConfig,
  notesByDate: ReadonlyMap<string, DailyNoteRef>,
): Promise<PairingCandidate[]> {
  const pool: PairingCandidate[] = [];
  for (const [date, note] of notesByDate) {
    pool.push({
      key: objKey(note.id),
      objectId: note.id,
      title: formatLocalDate(date as LocalDate),
      structureId: provider.dailyNoteStructureId,
      tags: [],
      date: date as LocalDate,
    });
  }

  const wanted = new Set(referencedTagNames(config));
  if (wanted.size > 0) {
    const tags = await provider.listTags();
    const byObject = new Map<string, PairingCandidate>();
    for (const tag of tags) {
      if (!wanted.has(tag.name)) continue;
      for await (const summary of provider.listObjectsByTag(tag.id)) {
        const existing = byObject.get(summary.id);
        if (existing) {
          existing.tags.push(tag.name);
        } else {
          byObject.set(summary.id, {
            key: objKey(summary.id),
            objectId: summary.id,
            title: summary.title,
            structureId: summary.structureId,
            tags: [tag.name],
            date: null,
          });
        }
      }
    }
    pool.push(...byObject.values());
  }
  return pool;
}

interface DayComputation {
  chosen: Candidate[];
  responsesApplied: boolean;
}

async function computeDay(
  provider: Provider,
  manager: StateManager,
  notesByDate: Map<string, DailyNoteRef>,
  today: LocalDate,
  rng: () => number,
  warnings: string[],
): Promise<DayComputation> {
  const config = manager.current.config;

  const [structures, tags] = await Promise.all([
    provider.listStructures(),
    provider.listTags(),
  ]);
  const resolved = resolveSchema(config, structures, tags);
  warnings.push(...resolved.warnings);

  // Yesterday's responses first (§8.6).
  const yesterday = addDays(today, -1);
  const yesterdayNote = notesByDate.get(yesterday);
  let responsesApplied = false;
  if (yesterdayNote && manager.current.state.lastRunItems.length > 0) {
    const md = await provider.getObjectMarkdown(yesterdayNote.id);
    const responses = parseResponses(
      md,
      config.surfaces.dailyNote.heading,
      manager.current.state.lastRunItems,
    );
    if (responses.length > 0) {
      manager.mutate((doc) => applyResponses(doc.state, responses, doc.config));
      responsesApplied = true;
    }
  }

  const pools = await gatherPools(provider, config, resolved, notesByDate, today, warnings);

  // Learn items flagged per-item in the UI (§8.3's third assignment
  // path) live only in state: no tag, type or set sweep will find them,
  // so fold the due ones into the pool here. Notes a rule selected are
  // left out: when no rule selects them any more they leave Learn.
  if (config.learn.enabled) {
    const poolKeys = new Set(pools.learn.map((c) => c.key));
    for (const [key, item] of Object.entries(manager.current.state.items)) {
      if (item.mode !== 'learn' || item.byRule || poolKeys.has(key)) continue;
      if (!item.nextDue || item.nextDue > today) continue;
      const parsed = parseKey(key);
      if (!parsed) continue;
      const obj = await provider.getObject(parsed.objectId);
      if (!obj) {
        manager.mutate((doc) => {
          delete doc.state.items[key]; // deleted object: pruned silently (§11)
        });
        continue;
      }
      pools.learn.push({
        key,
        objectId: obj.id,
        blockId: parsed.blockId,
        title: obj.title,
        excerpt: null,
        source: 'learn',
        temporalReason: null,
        tags: [],
        group: null,
        targetDate: item.targetDate,
      });
    }
  }

  // Prune state entries for objects that vanished from every pool we can
  // see; full pruning happens opportunistically when a fetch 404s.
  manager.mutate((doc) => prepareLearn(doc.state, doc.config, today, pools.learn));

  let chosen = chooseDay({
    state: manager.current.state,
    config,
    today,
    pools,
    rng,
  });

  // Notes picked by hand for a study set were never listed from the
  // space, so confirm the ones surfacing today still exist and show
  // their current titles. A deleted note drops out and its state goes.
  const handPicked = new Set(config.learn.sets.flatMap((s) => s.notes.map((n) => n.id)));
  if (handPicked.size > 0) {
    const checked: Candidate[] = [];
    for (const candidate of chosen) {
      if (candidate.source !== 'learn' || !handPicked.has(candidate.objectId)) {
        checked.push(candidate);
        continue;
      }
      const obj = await provider.getObject(candidate.objectId);
      if (!obj) {
        manager.mutate((doc) => {
          delete doc.state.items[candidate.key]; // deleted note: pruned silently (§11)
          // And out of its sets, or the next sync would pick it up again.
          removeNoteFromSets(doc.config.learn, candidate.objectId);
        });
        continue;
      }
      checked.push({ ...candidate, title: obj.title });
    }
    chosen = checked;
  }

  // Block granularity refinement for the handful actually surfacing.
  if (config.granularity.mode === 'block') {
    const refined: Candidate[] = [];
    for (const candidate of chosen) {
      if (candidate.source !== 'recall' || candidate.temporalReason) {
        refined.push(candidate);
        continue;
      }
      const obj = await provider.getObject(candidate.objectId);
      if (!obj) {
        // Deleted since listing: drop from state, never an error (§11).
        manager.mutate((doc) => {
          for (const key of Object.keys(doc.state.items)) {
            if (parseKey(key)?.objectId === candidate.objectId) {
              delete doc.state.items[key];
            }
          }
        });
        continue;
      }
      let result: Candidate | null = candidate;
      manager.mutate((doc) => {
        result = refineToBlock(candidate, obj, doc.config.granularity, doc.state);
      });
      if (result) refined.push(result);
    }
    chosen = refined;
  }

  return { chosen, responsesApplied };
}

/**
 * The daily run (§9.2 lazy write): compute today's allocation, update
 * state, and append the section to today's daily note: at most once
 * per local day, with the heading as the cross-device guard.
 */
export async function runDaily(opts: {
  provider: Provider;
  manager: StateManager;
  today: LocalDate;
  rng: () => number;
  notesByDate?: Map<string, DailyNoteRef>;
}): Promise<RunReport> {
  const { provider, manager, today, rng } = opts;
  const warnings: string[] = [];
  const config = manager.current.config;
  const heading = config.surfaces.dailyNote.heading;

  // Fast idempotency path: one run per local day (§11).
  if (manager.current.state.lastRunDate === today) {
    return {
      today,
      surfaced: [],
      markdown: null,
      wrote: false,
      skipped: 'alreadyRanToday',
      warnings,
    };
  }

  const notesByDate = opts.notesByDate ?? (await buildDailyNoteMap(provider));
  const { chosen } = await computeDay(provider, manager, notesByDate, today, rng, warnings);

  let surfaced: SurfacedItem[] = [];
  manager.mutate((doc) => {
    surfaced = finalizeRun(doc.state, chosen, today, doc.config);
  });
  const markdown = renderSection(heading, surfaced);

  let wrote = false;
  let skipped: RunReport['skipped'] = null;
  if (config.surfaces.dailyNote.enabled && markdown) {
    // Cross-device idempotency: does today's note already carry the section?
    const todayNote = notesByDate.get(today);
    let alreadyThere = false;
    if (todayNote) {
      const existing = await provider.getObjectMarkdown(todayNote.id);
      alreadyThere =
        existing !== null &&
        new RegExp(`^#{1,6}\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'im').test(
          existing,
        );
    }
    if (alreadyThere) {
      skipped = 'sectionAlreadyPresent';
    } else {
      await provider.appendToDailyNote(today, markdown);
      wrote = true;
    }
  }

  await manager.flush();
  return { today, surfaced, markdown, wrote, skipped, warnings };
}

/**
 * Preview (§9.1): exactly what a run right now would surface, computed
 * on a throwaway copy of state. Reads only; writes nothing anywhere.
 */
export async function previewDaily(opts: {
  provider: Provider;
  manager: StateManager;
  today: LocalDate;
  rng: () => number;
  notesByDate?: Map<string, DailyNoteRef>;
}): Promise<{ surfaced: SurfacedItem[]; markdown: string | null; warnings: string[] }> {
  const { provider, today, rng } = opts;
  const warnings: string[] = [];
  const scratch = new ScratchStore(structuredClone(opts.manager.current));
  const manager = await StateManager.open(scratch, () => new Date(0).toISOString());
  const notesByDate = opts.notesByDate ?? (await buildDailyNoteMap(provider));
  const { chosen } = await computeDay(provider, manager, notesByDate, today, rng, warnings);
  let surfaced: SurfacedItem[] = [];
  manager.mutate((doc) => {
    surfaced = finalizeRun(doc.state, chosen, today, doc.config);
  });
  return {
    surfaced,
    markdown: renderSection(manager.current.config.surfaces.dailyNote.heading, surfaced),
    warnings,
  };
}

/**
 * Apply the current Learn selections now. The daily run does this too,
 * but only once a day, and after editing a study set the notes should
 * enter (or leave) Learn straight away. Reads the space, then writes one
 * state update; surfaces nothing.
 */
export async function syncLearn(opts: {
  provider: Provider;
  manager: StateManager;
  today: LocalDate;
}): Promise<{ warnings: string[] }> {
  const { provider, manager, today } = opts;
  const config = manager.current.config;
  const warnings: string[] = [];
  if (!config.learn.enabled) return { warnings };

  const [structures, tags] = await Promise.all([provider.listStructures(), provider.listTags()]);
  const resolved = resolveSchema(config, structures, tags);
  const objectTags = await sweepTags(provider, resolved.tagIds, learnTagNames(config));
  const candidates = await gatherLearn(provider, config, objectTags, () => null, today, warnings);
  manager.mutate((doc) => prepareLearn(doc.state, doc.config, today, candidates));
  await manager.flush();
  return { warnings };
}

/** In-memory store seeded with a document copy; used for previews. */
class ScratchStore implements StateStore {
  private doc: PersistedDoc;
  constructor(doc: PersistedDoc) {
    this.doc = doc;
  }
  load(): Promise<{ doc: PersistedDoc; remoteUpdatedAt: string } | null> {
    return Promise.resolve({ doc: this.doc, remoteUpdatedAt: this.doc.state.updatedAt });
  }
  save(doc: PersistedDoc): Promise<SaveResult> {
    this.doc = doc;
    return Promise.resolve('ok');
  }
}
