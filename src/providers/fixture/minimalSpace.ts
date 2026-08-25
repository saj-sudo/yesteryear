import { diffDays, monthDayOf, yearOf } from '../../engine/dates';
import type { LocalDate } from '../../engine/types';
import { generateDailyNotes, pick } from './generate';
import type { FixtureSpace } from './types';

/**
 * The minimal space (spec §12): no custom types, no tags — only the basic
 * structures every Capacities space has. Daily-note lookback must work
 * here with zero configuration; everything else is silently skipped.
 */

const LINES = [
  'Tried the new bakery on Alder Street. The rye is the real thing.',
  'Rain all day. Finished the puzzle with the missing corner piece.',
  'Called home. Dad is naming the chickens after composers now.',
  'Fixed the wobbling shelf. It only took eleven months of noticing it.',
  'Started re-reading the sea novel. It is better the second time.',
  'Long walk, no phone. The heron was back at the weir.',
];

export function buildMinimalSpace(today: LocalDate): FixtureSpace {
  const guaranteed: number[] = [30, 365];
  for (const n of [1, 2]) {
    const sameDay = `${yearOf(today) - n}-${monthDayOf(today)}` as LocalDate;
    guaranteed.push(diffDays(today, sameDay));
  }
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
      bodyFor: (_d, rng) => `- ${pick(rng, LINES)}`,
    }),
  };
}
