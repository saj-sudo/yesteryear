import { describe, expect, it } from 'vitest';
import {
  addDays,
  diffDays,
  formatLocalDate,
  isLocalDate,
  localDateFromIso,
  nextOccurrence,
  parseDailyNoteTitle,
  todayInZone,
} from '../../src/engine/dates';

describe('todayInZone', () => {
  // 2026-08-25 01:30 UTC: still the 24th in Los Angeles, already the 25th in Tokyo.
  const now = new Date('2026-08-25T01:30:00Z');

  it('resolves the local date, not the UTC date', () => {
    expect(todayInZone(now, 'America/Los_Angeles')).toBe('2026-08-24');
    expect(todayInZone(now, 'Asia/Tokyo')).toBe('2026-08-25');
  });

  it('an early-morning local run resolves to the local day (§11)', () => {
    // 06:30 in Berlin on the 25th is 04:30 UTC.
    const early = new Date('2026-08-25T04:30:00Z');
    expect(todayInZone(early, 'Europe/Berlin')).toBe('2026-08-25');
  });
});

describe('day math', () => {
  it('adds and diffs across month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-01-10', '2025-12-31')).toBe(10);
    expect(diffDays('2025-12-31', '2026-01-10')).toBe(-10);
  });

  it('handles leap years', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(diffDays('2025-02-28', '2024-02-28')).toBe(366);
  });

  it('validates dates', () => {
    expect(isLocalDate('2026-08-25')).toBe(true);
    expect(isLocalDate('2026-02-30')).toBe(false);
    expect(isLocalDate('2026-13-01')).toBe(false);
    expect(isLocalDate('not a date')).toBe(false);
  });
});

describe('nextOccurrence', () => {
  it('finds this year when still ahead, next year when passed', () => {
    expect(nextOccurrence('11-01', '2026-08-25')).toEqual({
      date: '2026-11-01',
      inDays: 68,
    });
    expect(nextOccurrence('03-15', '2026-08-25').date).toBe('2027-03-15');
  });

  it('counts today as zero days away', () => {
    expect(nextOccurrence('08-25', '2026-08-25').inDays).toBe(0);
  });

  it('maps Feb 29 to Feb 28 in non-leap years', () => {
    expect(nextOccurrence('02-29', '2026-01-01').date).toBe('2026-02-28');
    expect(nextOccurrence('02-29', '2028-01-01').date).toBe('2028-02-29');
  });
});

describe('parseDailyNoteTitle', () => {
  it('parses the real API title format: ISO datetime at UTC midnight', () => {
    // Verified against a live space — this is what listings actually return.
    expect(parseDailyNoteTitle('2026-04-23T00:00:00.000Z')).toBe('2026-04-23');
    expect(parseDailyNoteTitle('2026-08-23T00:00:00Z')).toBe('2026-08-23');
    expect(parseDailyNoteTitle('2026-08-23T00:00:00+02:00')).toBe('2026-08-23');
  });

  it('parses the app display format', () => {
    expect(parseDailyNoteTitle('Aug 27, 2025')).toBe('2025-08-27');
  });

  it('skips hand-titled daily notes like "Weekdays" (seen in a real space)', () => {
    expect(parseDailyNoteTitle('Weekdays')).toBeNull();
  });

  it('parses locale-varied formats', () => {
    expect(parseDailyNoteTitle('August 27, 2025')).toBe('2025-08-27');
    expect(parseDailyNoteTitle('27 Aug 2025')).toBe('2025-08-27');
    expect(parseDailyNoteTitle('27. August 2025')).toBe('2025-08-27');
    expect(parseDailyNoteTitle('27.08.2025')).toBe('2025-08-27');
    expect(parseDailyNoteTitle('2025-08-27')).toBe('2025-08-27');
    expect(parseDailyNoteTitle('Sept 3, 2025')).toBe('2025-09-03');
    expect(parseDailyNoteTitle('  Aug 27, 2025  ')).toBe('2025-08-27');
  });

  it('returns null for unparseable or ambiguous titles instead of failing (§8.2)', () => {
    expect(parseDailyNoteTitle('My grand plans')).toBeNull();
    expect(parseDailyNoteTitle('03/04/2025')).toBeNull(); // DMY/MDY ambiguous
    expect(parseDailyNoteTitle('Feb 30, 2025')).toBeNull();
    expect(parseDailyNoteTitle('')).toBeNull();
  });
});

describe('formatLocalDate', () => {
  it('round-trips with parsing', () => {
    expect(formatLocalDate('2026-08-23')).toBe('Aug 23, 2026');
    expect(parseDailyNoteTitle(formatLocalDate('2026-01-05'))).toBe('2026-01-05');
  });
});

describe('localDateFromIso', () => {
  it('extracts the date part from ISO strings', () => {
    expect(localDateFromIso('2026-11-01')).toBe('2026-11-01');
    expect(localDateFromIso('2026-11-01T09:00:00Z')).toBe('2026-11-01');
  });

  it('rejects non-ISO values', () => {
    expect(localDateFromIso('Nov 1, 2026')).toBeNull();
    expect(localDateFromIso('2026-13-01')).toBeNull();
  });
});
