import { addDays, diffDays, monthDayOf, yearOf } from '../../engine/dates';
import type { LocalDate } from '../../engine/types';
import type { FullObject, PropertyValue } from '../../engine/provider';
import { generateDailyNotes, pick } from './generate';
import type { FixtureSpace, FixtureObject } from './types';

/**
 * The "stranger's space" (spec §12): a synthetic space whose type names,
 * property names, tag names, and status values are entirely invented and
 * deliberately unlike the reference config in spec §16. It is the primary
 * regression guard for the no-hardcoded-schema rule, and the demo dataset.
 *
 * Everything here is fiction. No real space data, even redacted, may ever
 * be added.
 */

const date = (start: string): PropertyValue => ({ type: 'date', start, end: null });
const label = (...names: string[]): PropertyValue => ({ type: 'label', names });

const FIELD_NOTE_BODIES: { title: string; blocks: [string, string][] }[] = [
  {
    title: 'East switchbacks',
    blocks: [
      ['TextBlock', 'The switchback trail up the east side took 40 minutes longer than the scramble, but nobody needed a rest stop. Use it for groups carrying full packs.'],
      ['QuoteBlock', 'Ansel: "Mark the scramble as dry weather only."'],
    ],
  },
  {
    title: 'Letters owed',
    blocks: [
      ['TextBlock', 'Still owe Cordelia a reply about the lighthouse survey. She asked for the tide tables from March.'],
      ['TextBlock', 'Send the tables first and the long letter after.'],
    ],
  },
  {
    title: 'The basecamp ledger',
    blocks: [
      ['TextBlock', 'Counted the tins again. 47 left, twelve more than we used last season. Order fewer next year.'],
      ['QuoteBlock', 'Wren: "Cut the spare stove fuel by a third."'],
      ['TextBlock', 'Tin count: 47.'],
    ],
  },
  {
    title: 'Fog instruments',
    blocks: [
      ['TextBlock', 'Calibrated the altimeter at the hut on a clear morning: 2,140 m. On foggy days, trust that reading over the map.'],
    ],
  },
  {
    title: 'Wintering',
    blocks: [
      ['TextBlock', 'Plan for the winter months: inventory in December, sledge repairs in January, the survey write-up in February.'],
      ['QuoteBlock', 'Nobody goes up the pass until the snow report is in.'],
    ],
  },
  {
    title: 'Rope teams',
    blocks: [
      ['TextBlock', 'Ansel and I roped up for the glacier crossing. Two crevasses near the second marker, both bridged with old snow.'],
      ['TextBlock', 'Next time: a shorter rope, and probe every ten steps.'],
    ],
  },
  {
    title: 'Map corrections',
    blocks: [
      ['TextBlock', 'The survey map puts the north tarn about 300 m too far west. Marked it on the office copy and wrote to the survey office.'],
    ],
  },
  {
    title: 'Post days',
    blocks: [
      ['TextBlock', 'Post goes down the valley on Tuesdays and Fridays, so a letter written on a Wednesday waits two days.'],
      ['QuoteBlock', 'Buy a full sheet of stamps next time in town.'],
    ],
  },
];

const DAILY_LINES = [
  'Walked the ridge line before breakfast. The valley fog was gone by nine.',
  'Letter from Cordelia, twelve pages, mostly about the lighthouse.',
  'Mended the tent seam with the waxed thread.',
  'Read two chapters of the glacier survey and made notes in the margins.',
  'Ansel thinks the pass will clear early this year.',
  'Sorted the seed tins for the north terrace. Nothing planted yet.',
  'Long letter to Wren about the summer schedule.',
  'The barometer fell all afternoon. Brought the gear in.',
  'Sketched the cirque from the eastern moraine in charcoal.',
  'Counted strides on the lake loop: 4,180.',
  'No plans today. Read by the stove.',
  'Re-read last spring’s journal. Most of what worried me then never happened.',
];

const QUOTES = [
  'Ansel: "Leave the hut by six or not at all."',
  'Cordelia: "Send the tide tables when you can."',
  'Note to self: check the stove fuel before every trip.',
  'Wren: "Pack the heavy things close to your back."',
];

export function buildStrangersSpace(today: LocalDate): FixtureSpace {
  /* ---- schema: invented, and unlike any real space ---- */
  const structures: FixtureSpace['structures'] = [
    {
      id: 'RootDailyNote',
      title: 'Daily Note',
      pluralName: 'Daily Notes',
      properties: [],
    },
    { id: 'RootPage', title: 'Page', pluralName: 'Pages', properties: [] },
    { id: 'RootTag', title: 'Tag', pluralName: 'Tags', properties: [] },
    {
      id: 'st-expedition',
      title: 'Expedition',
      pluralName: 'Expeditions',
      properties: [
        {
          id: 'p-phase',
          name: 'Phase',
          type: 'label',
          writable: true,
          labelNames: ['Scouting', 'Underway', 'Basecamp', 'Summited', 'Abandoned'],
        },
        { id: 'p-setoff', name: 'Set Off', type: 'date', writable: true, labelNames: [] },
        { id: 'p-summit', name: 'Summit Day', type: 'date', writable: true, labelNames: [] },
      ],
    },
    {
      id: 'st-correspondent',
      title: 'Correspondent',
      pluralName: 'Correspondents',
      properties: [
        {
          id: 'p-circle',
          name: 'Circle',
          type: 'label',
          writable: true,
          labelNames: ['Penpal', 'Guide', 'Editor', 'Kin'],
        },
        { id: 'p-born', name: 'Born On', type: 'date', writable: true, labelNames: [] },
        { id: 'p-firstletter', name: 'First Letter', type: 'date', writable: true, labelNames: [] },
      ],
    },
    {
      id: 'st-fieldnote',
      title: 'Field Note',
      pluralName: 'Field Notes',
      properties: [],
    },
  ];

  const tags: FixtureSpace['tags'] = [
    { id: 't-spark', name: 'spark' },
    { id: 't-keeper', name: 'keeper' },
    { id: 't-thread', name: 'thread' },
    { id: 't-ember', name: 'ember' },
  ];

  /* ---- objects with dates placed relative to today ---- */
  const yearsAgo = (n: number, base: LocalDate): string =>
    `${yearOf(base) - n}-${monthDayOf(base)}`;

  const objects: FixtureObject[] = [];
  const obj = (
    o: Omit<FullObject, 'blocks'> & Partial<Pick<FullObject, 'blocks'>>,
    markdown = '',
  ): void => {
    objects.push({ blocks: [], markdown, ...o });
  };

  // Expeditions: an anniversary, an approaching target, an inactive decoy.
  obj({
    id: 'x-tern',
    structureId: 'st-expedition',
    title: 'Tern Ridge Traverse',
    properties: {
      'p-phase': label('Underway'),
      'p-setoff': date(yearsAgo(1, today)), // set off exactly one year ago today
      'p-summit': date(addDays(today, 5)), // summit day approaching
    },
  });
  obj({
    id: 'x-larkspur',
    structureId: 'st-expedition',
    title: 'Larkspur Col Survey',
    properties: {
      'p-phase': label('Basecamp'),
      'p-setoff': date(yearsAgo(2, addDays(today, -40))),
      'p-summit': date(addDays(today, 45)),
    },
  });
  obj({
    id: 'x-abandoned',
    structureId: 'st-expedition',
    title: 'Old Smokehouse Restoration',
    properties: {
      'p-phase': label('Abandoned'),
      'p-summit': date(addDays(today, 2)), // near target, but inactive: must not surface
    },
  });

  // Correspondents: one birthday inside the default 7-day lead, one outside.
  obj({
    id: 'c-cordelia',
    structureId: 'st-correspondent',
    title: 'Cordelia Marsh',
    properties: {
      'p-circle': label('Penpal'),
      'p-born': date(yearsAgo(34, addDays(today, 3))),
      'p-firstletter': date(yearsAgo(6, addDays(today, -100))),
    },
  });
  obj({
    id: 'c-ansel',
    structureId: 'st-correspondent',
    title: 'Ansel Quist',
    properties: {
      'p-circle': label('Guide'),
      'p-born': date(yearsAgo(51, addDays(today, 40))),
    },
  });
  obj({
    id: 'c-wren',
    structureId: 'st-correspondent',
    title: 'Wren Okafor',
    properties: { 'p-circle': label('Editor') }, // no birthday: silently skipped
  });

  // Field notes, some with blocks (incl. short ones under min length).
  FIELD_NOTE_BODIES.forEach((body, i) => {
    obj(
      {
        id: `fn-${i + 1}`,
        structureId: 'st-fieldnote',
        title: body.title,
        properties: {},
        blocks: body.blocks.map(([type, text], j) => ({
          id: `fn-${i + 1}-b${j + 1}`,
          type,
          text,
        })),
      },
      body.blocks.map(([, text]) => text).join('\n\n'),
    );
  });

  /* ---- tag assignments ---- */
  const fieldNoteIds = objects
    .filter((o) => o.structureId === 'st-fieldnote')
    .map((o) => o.id);
  const tagAssignments: Record<string, string[]> = {
    't-spark': fieldNoteIds.filter((_, i) => i % 2 === 0),
    't-keeper': fieldNoteIds.filter((_, i) => i % 3 === 0).concat(['x-tern', 'x-larkspur']),
    't-thread': fieldNoteIds.filter((_, i) => i % 2 === 1),
    't-ember': [fieldNoteIds[1]!, 'c-cordelia'],
  };

  /* ---- daily notes: guarantee lookbacks and on-this-day years ---- */
  const guaranteed: number[] = [30, 90, 365];
  for (const n of [1, 2, 3]) {
    guaranteed.push(diffDays(today, yearsAgo(n, today) as LocalDate));
  }
  const dailyNotes = generateDailyNotes({
    today,
    spanDays: 1130,
    density: 0.38,
    guaranteedOffsets: guaranteed,
    seed: 0xca11,
    bodyFor: (_d, noteRng) => {
      const first = pick(noteRng, DAILY_LINES);
      let second = pick(noteRng, DAILY_LINES);
      while (second === first) second = pick(noteRng, DAILY_LINES);
      const parts = [`- ${first}`, `- ${second}`];
      if (noteRng() < 0.3) parts.push(`\n> ${pick(noteRng, QUOTES)}`);
      return parts.join('\n');
    },
  });

  return {
    spaceId: 'fixture-strangers',
    title: 'Fernweh Field Office',
    structures,
    tags,
    objects,
    tagAssignments,
    dailyNotes,
  };
}
