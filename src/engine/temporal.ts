import { addDays, diffDays, monthDayOf, nextOccurrence, yearOf } from './dates';
import type { Candidate, LocalDate, TemporalConfig } from './types';

/**
 * The temporal producer (§8.2): pure date math, no persistent state.
 * Callers gather the inputs (the orchestrator handles fetching/caching);
 * these functions only decide what today should surface.
 *
 * Daily-note lookback works on every space with zero configuration and
 * must keep working when every other input is empty.
 */

export interface DailyNoteRef {
  id: string;
  title: string;
}

export interface PersonInput {
  id: string;
  title: string;
  birthday: LocalDate | null;
}

export interface ProjectInput {
  id: string;
  title: string;
  start: LocalDate | null;
  target: LocalDate | null;
  statusNames: string[];
}

function candidate(
  base: Pick<Candidate, 'objectId' | 'title' | 'temporalReason'>,
): Candidate {
  return {
    key: `obj:${base.objectId}`,
    blockId: null,
    excerpt: null,
    source: 'temporal',
    tags: [],
    group: null,
    targetDate: null,
    ...base,
  };
}

/** Daily notes from each configured lookback ("From 90 days ago"). */
export function dailyNoteLookbacks(
  notesByDate: ReadonlyMap<string, DailyNoteRef>,
  today: LocalDate,
  config: TemporalConfig,
): Candidate[] {
  const out: Candidate[] = [];
  for (const daysAgo of config.lookbackDays) {
    const date = addDays(today, -daysAgo);
    const note = notesByDate.get(date);
    if (note) {
      out.push(
        candidate({
          objectId: note.id,
          title: note.title,
          temporalReason: { kind: 'lookback', daysAgo, date },
        }),
      );
    }
  }
  return out;
}

/** Birthdays within the lead window, today included. */
export function birthdayCandidates(
  persons: PersonInput[],
  today: LocalDate,
  config: TemporalConfig,
): Candidate[] {
  const out: Candidate[] = [];
  for (const person of persons) {
    if (!person.birthday) continue; // absent mapping or value: silently skipped
    const { inDays } = nextOccurrence(monthDayOf(person.birthday), today);
    if (inDays <= config.birthdayLeadDays) {
      out.push(
        candidate({
          objectId: person.id,
          title: person.title,
          temporalReason: { kind: 'birthday', inDays, name: person.title },
        }),
      );
    }
  }
  return out;
}

/** Start-date anniversaries: the project set off N whole years ago today. */
export function anniversaryCandidates(
  projects: ProjectInput[],
  today: LocalDate,
): Candidate[] {
  const out: Candidate[] = [];
  for (const project of projects) {
    if (!project.start) continue;
    const years = yearOf(today) - yearOf(project.start);
    if (years >= 1 && monthDayOf(project.start) === monthDayOf(today)) {
      out.push(
        candidate({
          objectId: project.id,
          title: project.title,
          temporalReason: { kind: 'anniversary', years },
        }),
      );
    }
  }
  return out;
}

/**
 * Target dates at exactly the configured marks (default 7, 3, 1 days
 * out), only for projects whose status is in activeStatusValues. With no
 * configured active statuses, no project counts as in-flight — target
 * reminders are opt-in by definition (§8.2).
 */
export function targetDateCandidates(
  projects: ProjectInput[],
  today: LocalDate,
  config: TemporalConfig,
  activeStatusValues: string[],
): Candidate[] {
  if (activeStatusValues.length === 0) return [];
  const active = new Set(activeStatusValues.map((s) => s.toLowerCase()));
  const marks = new Set(config.targetDateLeadDays);
  const out: Candidate[] = [];
  for (const project of projects) {
    if (!project.target) continue;
    if (!project.statusNames.some((s) => active.has(s.toLowerCase()))) continue;
    const inDays = diffDays(project.target, today);
    if (marks.has(inDays)) {
      out.push(
        candidate({
          objectId: project.id,
          title: project.title,
          temporalReason: { kind: 'targetDate', inDays },
        }),
      );
    }
  }
  return out;
}

/** All temporal candidates for the day, in one pass. */
export function temporalCandidates(input: {
  today: LocalDate;
  config: TemporalConfig;
  activeStatusValues: string[];
  notesByDate: ReadonlyMap<string, DailyNoteRef>;
  persons: PersonInput[];
  projects: ProjectInput[];
}): Candidate[] {
  if (!input.config.enabled) return [];
  return [
    ...dailyNoteLookbacks(input.notesByDate, input.today, input.config),
    ...birthdayCandidates(input.persons, input.today, input.config),
    ...anniversaryCandidates(input.projects, input.today),
    ...targetDateCandidates(
      input.projects,
      input.today,
      input.config,
      input.activeStatusValues,
    ),
  ];
}
