import { addDays, diffDays, monthDayOf, yearOf } from '../../engine/dates';
import type { LocalDate } from '../../engine/types';
import { kitchenDay } from './dailyContent';
import { generateDailyNotes } from './generate';
import type { FixtureSpace } from './types';

/**
 * The minimal space (spec §12): no custom types and no tags, only the
 * basic structures every Capacities space has. Daily-note lookback must work
 * here with zero configuration; everything else is silently skipped.
 */

export function buildMinimalSpace(today: LocalDate): FixtureSpace {
  const guaranteed: number[] = [30, 365];
  for (const n of [1, 2]) {
    const sameDay = `${yearOf(today) - n}-${monthDayOf(today)}` as LocalDate;
    guaranteed.push(diffDays(today, sameDay));
  }
  const featured = new Set<string>(guaranteed.map((n) => addDays(today, -n)));
  const dayText = kitchenDay(0x7ab1e);
  return {
    spaceId: 'fixture-minimal',
    title: 'Kitchen Table Notes',
    structures: [
      { id: 'RootDailyNote', title: 'Daily Note', pluralName: 'Daily Notes', properties: [] },
      { id: 'RootPage', title: 'Page', pluralName: 'Pages', properties: [] },
      { id: 'RootTag', title: 'Tag', pluralName: 'Tags', properties: [] },
    ],
    tags: [],
    objects: [],
    tagAssignments: {},
    dailyNotes: generateDailyNotes({
      today,
      spanDays: 760,
      density: 0.2,
      guaranteedOffsets: guaranteed,
      seed: 0x5eed,
      bodyFor: (date, rng) => dayText({ date, featured: featured.has(date) }, rng),
    }),
  };
}
