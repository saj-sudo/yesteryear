import { describe, expect, it } from 'vitest';
import { defaultConfig, normalizeConfig } from '../../src/engine/config';
import {
  addStudySet,
  duplicateStudySet,
  nearestUpcoming,
  nextStudySetId,
  normalizeStudySets,
  removeStudySet,
  studySetStatus,
  updateStudySet,
} from '../../src/engine/studySets';
import type { LocalDate, StudySet } from '../../src/engine/types';

const TODAY = '2026-08-25' as LocalDate;
const d = (value: string): LocalDate => value as LocalDate;

function set(overrides: Partial<StudySet> = {}): StudySet {
  return {
    id: 'set-1',
    name: 'Practical exam',
    targetDate: d('2026-10-01'),
    tags: [],
    types: [],
    notes: [],
    ...overrides,
  };
}

describe('nearestUpcoming', () => {
  it('picks the earliest date that has not passed', () => {
    expect(nearestUpcoming([d('2026-12-01'), d('2026-10-01'), d('2026-08-01')], TODAY)).toBe(
      '2026-10-01',
    );
  });

  it('counts today as upcoming', () => {
    expect(nearestUpcoming([d('2026-08-25'), d('2026-09-30')], TODAY)).toBe('2026-08-25');
  });

  it('returns null when every date has passed or there are none', () => {
    expect(nearestUpcoming([d('2026-08-24')], TODAY)).toBeNull();
    expect(nearestUpcoming([], TODAY)).toBeNull();
  });
});

describe('studySetStatus', () => {
  it('reports upcoming, today and passed with the day count', () => {
    expect(studySetStatus(set({ targetDate: d('2026-09-04') }), TODAY)).toEqual({
      status: 'upcoming',
      days: 10,
    });
    expect(studySetStatus(set({ targetDate: TODAY }), TODAY)).toEqual({ status: 'today', days: 0 });
    expect(studySetStatus(set({ targetDate: d('2026-08-20') }), TODAY)).toEqual({
      status: 'passed',
      days: -5,
    });
  });
});

describe('normalizeStudySets', () => {
  it('drops sets without a usable date and fills in the rest', () => {
    const result = normalizeStudySets([
      { id: 'a', name: '  Midterm ', targetDate: '2026-10-01', tags: ['exam', 'exam', ' '], notes: [] },
      { id: 'b', name: 'No date' },
      { id: 'c', targetDate: 'next week' },
      'nonsense',
      { targetDate: '2026-11-02', types: ['Field Note', 'Field Note'] },
    ]);
    expect(result.map((s) => s.id)).toEqual(['a', 'set-2']);
    expect(result[0]).toMatchObject({ name: 'Midterm', tags: ['exam'], types: [], notes: [] });
    expect(result[1]).toMatchObject({ name: 'Study set', types: ['Field Note'] });
  });

  it('keeps ids unique and removes duplicate notes', () => {
    const result = normalizeStudySets([
      { id: 'x', targetDate: '2026-10-01', notes: [{ id: 'n1', title: 'One' }, { id: 'n1', title: 'Again' }, { id: '' }] },
      { id: 'x', targetDate: '2026-10-02' },
    ]);
    expect(result.map((s) => s.id)).toEqual(['x', 'x-2']);
    expect(result[0]!.notes).toEqual([{ id: 'n1', title: 'One' }]);
  });

  it('survives a round trip through the config', () => {
    const config = defaultConfig();
    config.learn.sets = [set({ tags: ['exam'], notes: [{ id: 'n1', title: 'Note one' }] })];
    const again = normalizeConfig(JSON.parse(JSON.stringify(config)));
    expect(again.learn.sets).toEqual(config.learn.sets);
  });

  it('gives an old config with no sets an empty list', () => {
    const old = JSON.parse(JSON.stringify(defaultConfig())) as { learn: Record<string, unknown> };
    delete old.learn['sets'];
    expect(normalizeConfig(old).learn.sets).toEqual([]);
  });
});

describe('editing sets', () => {
  it('adds a set with a fresh id and cleans its fields', () => {
    const learn = defaultConfig().learn;
    const added = addStudySet(learn, {
      name: ' Spanish B1 ',
      targetDate: d('2027-03-14'),
      tags: ['spanish', 'spanish'],
      types: [],
      notes: [],
    });
    expect(added.id).toBe('set-1');
    expect(added.name).toBe('Spanish B1');
    expect(added.tags).toEqual(['spanish']);
    expect(learn.sets).toHaveLength(1);
  });

  it('rejects a set without a valid date', () => {
    const learn = defaultConfig().learn;
    expect(() =>
      addStudySet(learn, { name: 'x', targetDate: 'soon' as LocalDate, tags: [], types: [], notes: [] }),
    ).toThrow(/valid target date/);
  });

  it('never reuses an id after a set is removed', () => {
    const learn = defaultConfig().learn;
    learn.sets = [set({ id: 'set-1' }), set({ id: 'set-2' }), set({ id: 'set-3' })];
    removeStudySet(learn, 'set-2');
    expect(nextStudySetId(learn.sets)).toBe('set-4');
  });

  it('moves a date in place and ignores an invalid one', () => {
    const learn = defaultConfig().learn;
    learn.sets = [set()];
    updateStudySet(learn, 'set-1', { targetDate: d('2027-01-15') });
    expect(learn.sets[0]!.targetDate).toBe('2027-01-15');
    updateStudySet(learn, 'set-1', { targetDate: 'whenever' as LocalDate });
    expect(learn.sets[0]!.targetDate).toBe('2027-01-15');
    updateStudySet(learn, 'missing', { name: 'x' });
    expect(learn.sets).toHaveLength(1);
  });

  it('duplicates a set for a second exam without touching the first', () => {
    const learn = defaultConfig().learn;
    learn.sets = [set({ tags: ['exam'], notes: [{ id: 'n1', title: 'One' }] })];
    const copy = duplicateStudySet(learn, 'set-1', { targetDate: d('2027-06-01') });
    expect(copy).toMatchObject({
      id: 'set-2',
      name: 'Practical exam (copy)',
      targetDate: '2027-06-01',
      tags: ['exam'],
      notes: [{ id: 'n1', title: 'One' }],
    });
    copy!.notes.push({ id: 'n2', title: 'Two' });
    expect(learn.sets[0]!.notes).toHaveLength(1);
    expect(learn.sets[0]!.targetDate).toBe('2026-10-01');
  });
});
