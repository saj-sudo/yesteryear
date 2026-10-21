import { diffDays, isLocalDate } from './dates';
import type { LearnConfig, LocalDate, StudySet, StudySetNote } from './types';

/**
 * Study sets: a name, one date and a selection of notes (tags, types and
 * notes picked one by one). Everything here is pure; the orchestrator
 * resolves a set's selection against the space and asks this module
 * which date applies to each note.
 */

/**
 * The date a note studies toward when several sets (or a date property)
 * claim it: the nearest one that has not passed. Material shared by two
 * exams therefore follows the first, then the second.
 */
export function nearestUpcoming(
  dates: readonly LocalDate[],
  today: LocalDate,
): LocalDate | null {
  let best: LocalDate | null = null;
  for (const date of dates) {
    if (date < today) continue;
    if (best === null || date < best) best = date;
  }
  return best;
}

export type StudySetStatus = 'upcoming' | 'today' | 'passed';

/** Where a set stands relative to today; `days` is negative once passed. */
export function studySetStatus(
  set: StudySet,
  today: LocalDate,
): { status: StudySetStatus; days: number } {
  const days = diffDays(set.targetDate, today);
  return { status: days > 0 ? 'upcoming' : days === 0 ? 'today' : 'passed', days };
}

/** Next unused "set-N" id. Computed inside the mutation, so a replay stays unique. */
export function nextStudySetId(sets: readonly StudySet[]): string {
  const used = new Set(sets.map((s) => s.id));
  let n = sets.length + 1;
  while (used.has(`set-${n}`)) n += 1;
  return `set-${n}`;
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const v of value) {
    if (typeof v !== 'string') continue;
    const trimmed = v.trim();
    if (trimmed.length > 0) seen.add(trimmed);
  }
  return [...seen];
}

function cleanNotes(value: unknown): StudySetNote[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, StudySetNote>();
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e['id'] !== 'string' || e['id'].length === 0) continue;
    if (byId.has(e['id'])) continue;
    byId.set(e['id'], {
      id: e['id'],
      title: typeof e['title'] === 'string' ? e['title'] : '',
    });
  }
  return [...byId.values()];
}

/**
 * Accept any serialized list of sets and return valid ones. A set with
 * no usable date is dropped (a date is the whole point of a set); every
 * other field takes a default.
 */
export function normalizeStudySets(value: unknown): StudySet[] {
  if (!Array.isArray(value)) return [];
  const out: StudySet[] = [];
  const used = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const date = e['targetDate'];
    if (typeof date !== 'string' || !isLocalDate(date)) continue;
    let id = typeof e['id'] === 'string' && e['id'].length > 0 ? e['id'] : `set-${out.length + 1}`;
    while (used.has(id)) id = `${id}-2`;
    used.add(id);
    const name = typeof e['name'] === 'string' ? e['name'].trim() : '';
    out.push({
      id,
      name: name.length > 0 ? name : 'Study set',
      targetDate: date,
      tags: uniqueStrings(e['tags']),
      types: uniqueStrings(e['types']),
      notes: cleanNotes(e['notes']),
    });
  }
  return out;
}

export type StudySetDraft = Omit<StudySet, 'id'>;

/** Add a set and return it. */
export function addStudySet(learn: LearnConfig, draft: StudySetDraft): StudySet {
  const [clean] = normalizeStudySets([{ ...draft, id: nextStudySetId(learn.sets) }]);
  if (!clean) throw new Error('A study set needs a valid target date.');
  learn.sets.push(clean);
  return clean;
}

/** Change fields of a set. An invalid date is ignored; unknown ids do nothing. */
export function updateStudySet(
  learn: LearnConfig,
  id: string,
  patch: Partial<StudySetDraft>,
): void {
  const index = learn.sets.findIndex((s) => s.id === id);
  const current = learn.sets[index];
  if (!current) return;
  const [clean] = normalizeStudySets([{ ...current, ...patch }]);
  if (clean) learn.sets[index] = { ...clean, id };
}

export function removeStudySet(learn: LearnConfig, id: string): void {
  learn.sets = learn.sets.filter((s) => s.id !== id);
}

/**
 * A copy with the same notes, for a second exam on the same material.
 * The copy gets its own date; the original is untouched.
 */
export function duplicateStudySet(
  learn: LearnConfig,
  id: string,
  patch: Partial<StudySetDraft> = {},
): StudySet | null {
  const source = learn.sets.find((s) => s.id === id);
  if (!source) return null;
  const { id: sourceId, ...rest } = source;
  void sourceId;
  return addStudySet(learn, {
    ...rest,
    name: `${source.name} (copy)`,
    tags: [...source.tags],
    types: [...source.types],
    notes: source.notes.map((n) => ({ ...n })),
    ...patch,
  });
}
