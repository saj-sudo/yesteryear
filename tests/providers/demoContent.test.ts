import { describe, expect, it } from 'vitest';
import { addDays, monthDayOf, yearOf } from '../../src/engine/dates';
import type { LocalDate } from '../../src/engine/types';
import { buildMinimalSpace } from '../../src/providers/fixture/minimalSpace';
import { buildStrangersSpace } from '../../src/providers/fixture/strangersSpace';

// The demo spaces are what people see first, so their notes have to read
// like a real person's: varied, and not the same sentence on every other
// day. A pool of a dozen lines drawn at random repeated each one dozens of
// times across three years and showed up twice on one On This Day page.

const TODAY = '2026-10-22' as LocalDate;

/** The spaces, and how many years back each one promises a note on today's date. */
const spaces = {
  'the field office space': buildStrangersSpace(TODAY),
  'the kitchen table space': buildMinimalSpace(TODAY),
};
const YEARS_BACK: Record<string, number[]> = {
  'the field office space': [1, 2, 3],
  'the kitchen table space': [1, 2],
};

/** The text lines of a daily note, without markdown markers or headings. */
function linesOf(markdown: string): string[] {
  return markdown
    .split('\n')
    .map((l) => l.replace(/^(\s*- (\[[ x]\] )?|> |## )/, '').trim())
    .filter((l) => l !== '' && l !== 'Morning' && l !== 'Evening');
}

describe.each(Object.entries(spaces))('daily notes in %s', (_name, space) => {
  const notes = space.dailyNotes;
  const lines = notes.flatMap((n) => linesOf(n.markdown));
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);

  it('has a few hundred varied lines, not a dozen', () => {
    expect(counts.size).toBeGreaterThanOrEqual(100);
  });

  it('never leans on one line', () => {
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(12);
  });

  it('uses more than one shape of entry', () => {
    const shapes = new Set<string>();
    for (const { markdown } of notes) {
      if (markdown.includes('## Morning')) shapes.add('headed');
      else if (/- \[[ x]\] /.test(markdown)) shapes.add('tasks');
      else if (markdown.startsWith('- ')) shapes.add('bullets');
      else shapes.add('prose');
      if (markdown.includes('\n> ')) shapes.add('quote');
    }
    expect(shapes).toEqual(new Set(['headed', 'tasks', 'bullets', 'prose', 'quote']));
  });

  it('writes a different entry on the same day of each year', () => {
    const years = YEARS_BACK[_name]!;
    const sameDay = years.map((n) => {
      const note = notes.find((x) => x.date === `${yearOf(TODAY) - n}-${monthDayOf(TODAY)}`);
      expect(note, `a note ${n} years ago today`).toBeDefined();
      return note!.markdown;
    });
    expect(new Set(sameDay).size).toBe(sameDay.length);
  });

  it('is the same every time it is built', () => {
    const again = space.title === 'Fernweh Field Office' ? buildStrangersSpace(TODAY) : buildMinimalSpace(TODAY);
    expect(again.dailyNotes.map((n) => n.markdown)).toEqual(notes.map((n) => n.markdown));
  });

  it('keeps every guaranteed lookback day', () => {
    for (const offset of [30, 365]) {
      expect(notes.some((n) => n.date === addDays(TODAY, -offset))).toBe(true);
    }
  });
});

describe('the field office notes', () => {
  const notes = spaces['the field office space'].objects.filter((o) => o.structureId === 'st-fieldnote');

  it('has a range of notes, each with a body to resurface', () => {
    expect(notes.length).toBeGreaterThanOrEqual(20);
    for (const note of notes) {
      expect(note.blocks.length, note.title).toBeGreaterThanOrEqual(1);
      expect(note.markdown, note.title).not.toBe('');
    }
    expect(new Set(notes.map((n) => n.title)).size).toBe(notes.length);
  });

  it('keeps the original notes and their ids', () => {
    expect(notes.find((n) => n.id === 'fn-1')?.title).toBe('East switchbacks');
    expect(notes.find((n) => n.id === 'fn-8')?.title).toBe('Post days');
  });
});
