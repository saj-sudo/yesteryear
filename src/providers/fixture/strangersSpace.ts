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
    title: 'Switchbacks are honest',
    blocks: [
      ['TextBlock', 'The trail that zigzags looks slower than the scramble straight up, but it is the one you can still walk in year three. Most shortcuts are loans against your knees.'],
      ['QuoteBlock', 'The mountain does not care how fast you climb it. It cares whether you come back.'],
    ],
  },
  {
    title: 'On unread letters',
    blocks: [
      ['TextBlock', 'A letter you have not answered is not a debt, it is a held note in a long chord. Cordelia waited four months to reply and her answer was better for the waiting.'],
      ['TextBlock', 'Reply when the reply is ready.'],
    ],
  },
  {
    title: 'The basecamp ledger',
    blocks: [
      ['TextBlock', 'Counted the tins again: we always overpack fear and underpack patience. Next season, fewer contingencies and more mornings with nothing planned.'],
      ['QuoteBlock', 'Every expedition fails at the pace of its most anxious member.'],
      ['TextBlock', 'Tin count: 47.'],
    ],
  },
  {
    title: 'Fog instruments',
    blocks: [
      ['TextBlock', 'In fog you navigate by instruments you calibrated on clear days. Journals are the same: write down what you believe while you can still see, and trust it when you cannot.'],
    ],
  },
  {
    title: 'Wintering',
    blocks: [
      ['TextBlock', 'The expedition that winters over is not paused; it is doing the slow work that summits require. Roots do their growing in the dark half of the year.'],
      ['QuoteBlock', 'A season of no visible progress is still a season.'],
    ],
  },
  {
    title: 'Rope teams',
    blocks: [
      ['TextBlock', 'Tied to Ansel on the glacier I finally understood: the rope is not there because you expect to fall, it is there so you can look up more often.'],
      ['TextBlock', 'Short rope, long trust.'],
    ],
  },
  {
    title: 'The cartographer bias',
    blocks: [
      ['TextBlock', 'Maps flatter the mapped. The valleys I have named feel more real than the ones I have only crossed, which is exactly backwards, and worth remembering when I reread old plans.'],
    ],
  },
  {
    title: 'Postage stamps as promises',
    blocks: [
      ['TextBlock', 'Bought a sheet of stamps and it changed how I write: a letter that costs something to send gets written to be worth sending. Friction is a kind of editor.'],
      ['QuoteBlock', 'Cheap sending makes for expensive reading.'],
    ],
  },
];

const DAILY_LINES = [
  'Walked the ridge line before breakfast; the valley fog burned off by nine.',
  'Cordelia’s letter arrived, twelve pages, mostly about the lighthouse.',
  'Mended the tent seam. Small repairs while the weather holds.',
  'Read two chapters of the glacier survey and argued with the margins.',
  'Ansel says the pass will clear early this year. I doubt it, and hope.',
  'Sorted the seed tins for the north terrace. Planted nothing yet.',
  'Long letter to Wren about whether ambition keeps or spoils.',
  'The barometer fell all afternoon. Batten down, brew tea.',
  'Sketched the cirque from the eastern moraine. Charcoal smudged in the wind.',
  'Counted strides on the lake loop: 4,180. The lake does not count back.',
  'A day of nothing planned, exactly as planned.',
  'Re-read last spring’s journal. Past me was worried about all the wrong ridges.',
];

const QUOTES = [
  'Slow is smooth, smooth is far.',
  'You do not conquer a mountain; you negotiate with it and keep the minutes.',
  'Write to your future self as kindly as you would to a friend abroad.',
  'The pack is always lighter after you decide what it is for.',
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
    't-keeper': fieldNoteIds.filter((_, i) => i % 3 === 0).concat(['x-tern']),
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
