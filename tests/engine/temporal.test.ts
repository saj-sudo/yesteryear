import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/engine/config';
import type { DailyNoteRef, PersonInput, ProjectInput } from '../../src/engine/temporal';
import {
  anniversaryCandidates,
  birthdayCandidates,
  dailyNoteLookbacks,
  targetDateCandidates,
  temporalCandidates,
} from '../../src/engine/temporal';
import type { LocalDate } from '../../src/engine/types';
import { buildMinimalSpace } from '../../src/providers/fixture/minimalSpace';
import { buildStrangersSpace } from '../../src/providers/fixture/strangersSpace';

const TODAY = '2026-08-25' as LocalDate;
const cfg = defaultConfig().temporal;

function notesFrom(space: { dailyNotes: { date: string; id: string; title: string }[] }) {
  return new Map<string, DailyNoteRef>(
    space.dailyNotes.map((n) => [n.date, { id: n.id, title: n.title }]),
  );
}

describe('daily note lookbacks', () => {
  it('finds one year ago today in the minimal space — zero config needed', () => {
    const notes = notesFrom(buildMinimalSpace(TODAY));
    const hits = dailyNoteLookbacks(notes, TODAY, cfg);
    const yearBack = hits.find((h) => h.temporalReason?.kind === 'lookback'
      && h.temporalReason.daysAgo === 365);
    expect(yearBack).toBeDefined();
    expect(yearBack!.objectId).toBe('dn-2025-08-25');
  });

  it('skips lookbacks that land on days with no note', () => {
    const notes = new Map<string, DailyNoteRef>([
      ['2026-07-26', { id: 'dn-2026-07-26', title: 'Jul 26, 2026' }],
    ]);
    const hits = dailyNoteLookbacks(notes, TODAY, cfg);
    expect(hits).toHaveLength(1); // only the 30-day lookback exists
    expect(hits[0]!.temporalReason).toEqual({
      kind: 'lookback',
      daysAgo: 30,
      date: '2026-07-26',
    });
  });
});

describe('birthdays', () => {
  const space = buildStrangersSpace(TODAY);
  const persons: PersonInput[] = [
    { id: 'c-cordelia', title: 'Cordelia Marsh', birthday: '1992-08-28' },
    { id: 'c-ansel', title: 'Ansel Quist', birthday: '1975-10-04' },
    { id: 'c-wren', title: 'Wren Okafor', birthday: null },
  ];
  void space;

  it('surfaces birthdays inside the lead window and skips the rest', () => {
    const hits = birthdayCandidates(persons, TODAY, cfg);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.temporalReason).toEqual({
      kind: 'birthday',
      inDays: 3,
      name: 'Cordelia Marsh',
    });
  });

  it('a person with no birthday is silently skipped, never an error', () => {
    expect(() => birthdayCandidates(persons, TODAY, cfg)).not.toThrow();
  });

  it('counts a birthday today as in-window', () => {
    const hits = birthdayCandidates(
      [{ id: 'p', title: 'P', birthday: '1990-08-25' }],
      TODAY,
      cfg,
    );
    expect(hits[0]!.temporalReason).toMatchObject({ inDays: 0 });
  });
});

describe('anniversaries', () => {
  it('fires on whole years only, on the exact month-day', () => {
    const projects: ProjectInput[] = [
      { id: 'a', title: 'A', start: '2025-08-25', target: null, statusNames: [] },
      { id: 'b', title: 'B', start: '2025-08-24', target: null, statusNames: [] },
      { id: 'c', title: 'C', start: '2026-08-25', target: null, statusNames: [] },
    ];
    const hits = anniversaryCandidates(projects, TODAY);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.objectId).toBe('a');
    expect(hits[0]!.temporalReason).toEqual({ kind: 'anniversary', years: 1 });
  });
});

describe('target dates', () => {
  const projects: ProjectInput[] = [
    { id: 'due3', title: 'Due in 3', start: null, target: '2026-08-28', statusNames: ['Underway'] },
    { id: 'due5', title: 'Due in 5', start: null, target: '2026-08-30', statusNames: ['Underway'] },
    { id: 'dead', title: 'Abandoned', start: null, target: '2026-08-28', statusNames: ['Abandoned'] },
  ];

  it('fires at the configured marks for in-flight statuses only', () => {
    const hits = targetDateCandidates(projects, TODAY, cfg, ['Underway', 'Basecamp']);
    expect(hits.map((h) => h.objectId)).toEqual(['due3']);
  });

  it('with no active statuses configured, fires for nothing', () => {
    expect(targetDateCandidates(projects, TODAY, cfg, [])).toEqual([]);
  });
});

describe('temporalCandidates end to end', () => {
  it('works with everything absent except daily notes (minimal space)', () => {
    const hits = temporalCandidates({
      today: TODAY,
      config: cfg,
      activeStatusValues: [],
      notesByDate: notesFrom(buildMinimalSpace(TODAY)),
      persons: [],
      projects: [],
    });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.temporalReason?.kind === 'lookback')).toBe(true);
  });

  it('returns nothing when the producer is disabled', () => {
    const hits = temporalCandidates({
      today: TODAY,
      config: { ...cfg, enabled: false },
      activeStatusValues: [],
      notesByDate: notesFrom(buildMinimalSpace(TODAY)),
      persons: [],
      projects: [],
    });
    expect(hits).toEqual([]);
  });
});
