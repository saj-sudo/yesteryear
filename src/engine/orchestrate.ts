import { addDays, formatLocalDate, localDateFromIso, parseDailyNoteTitle } from './dates';
import type { PairingCandidate } from './pairing';
import { refineToBlock } from './granularity';
import { renderSection } from './markdown';
import { parseResponses } from './parseResponses';
import type { FullObject, Provider, PropertyValue } from './provider';
import { referencedTagNames, resolveSchema, type ResolvedSchema } from './resolve';
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
 * The I/O layer of a daily run — everything here talks only to the
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
 * the corresponding producer contributes nothing — silently (§4).
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
  const objectTags = new Map<string, { title: string; tags: Set<string> }>();
  const sweep = async (tagName: string): Promise<void> => {
    const tagId = resolved.tagIds[tagName];
    if (!tagId) return; // unresolved tag: already warned by resolveSchema
    for await (const s of provider.listObjectsByTag(tagId)) {
      const entry = objectTags.get(s.id) ?? { title: s.title, tags: new Set() };
      entry.tags.add(tagName);
      objectTags.set(s.id, entry);
    }
  };
  const sweepNames = new Set([
    ...config.recall.tags,
    ...config.learn.assignByTag,
    ...rotationTagGroups,
  ]);
  for (const name of sweepNames) await sweep(name);

  const groupOf = (tags: Set<string>): string | null =>
    rotationTagGroups.find((g) => tags.has(g)) ?? null;

  /* ---- learn assignments ---- */
  const learn: Candidate[] = [];
  const learnIds = new Set<string>();
  if (config.learn.enabled) {
    const byTag = [...objectTags.entries()].filter(([, v]) =>
      config.learn.assignByTag.some((t) => v.tags.has(t)),
    );
    // assignByType names arbitrary types, not just mapped roles, so it
    // resolves directly against the space's structure list.
    const typeIds: { id: string; title: string }[] = [];
    if (config.learn.assignByType.length > 0) {
      const structures = await provider.listStructures();
      for (const typeName of config.learn.assignByType) {
        const structure = structures.find(
          (s) => s.title.trim().toLowerCase() === typeName.trim().toLowerCase(),
        );
        if (!structure) {
          warnings.push(
            `Learn type "${typeName}" is not in this space and was skipped.`,
          );
          continue;
        }
        for await (const s of provider.listObjectsByStructure(structure.id)) {
          typeIds.push({ id: s.id, title: s.title });
        }
      }
    }
    const candidates = [
      ...byTag.map(([id, v]) => ({ id, title: v.title })),
      ...typeIds,
    ].filter((c) => {
      if (learnIds.has(c.id)) return false;
      learnIds.add(c.id);
      return true;
    });

    // Resolving each item's target date needs the full object.
    const enriched = await enrichAll(
      provider,
      candidates.map((c) => c.id),
      warnings,
      'learn items',
    );
    for (const obj of enriched) {
      const targetDate = await resolveTargetDate(provider, obj, config);
      const tags = objectTags.get(obj.id)?.tags ?? new Set<string>();
      if (targetDate) {
        learn.push({
          key: learnKey(objKey(obj.id)),
          objectId: obj.id,
          blockId: null,
          title: obj.title,
          excerpt: null,
          source: 'learn',
          temporalReason: null,
          tags: [...tags],
          group: groupOf(tags),
          targetDate,
        });
      }
      // Without a target date the item falls back to Recall (§8.3):
      // it stays in the recall pool below.
    }
  }

  /* ---- recall pool ---- */
  const recall: Candidate[] = [];
  for (const [id, entry] of objectTags) {
    const inRecallTags = config.recall.tags.some((t) => entry.tags.has(t));
    const learnAssigned = learnIds.has(id) && learn.some((l) => l.objectId === id);
    if (inRecallTags && !learnAssigned) {
      recall.push(recallCandidate(id, entry.title, [...entry.tags], groupOf(entry.tags)));
    }
  }

  return { temporal, recall, learn };
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
 * carrying a configured tag. Summaries only — nothing is enriched until
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
 * state, and append the section to today's daily note — at most once
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
