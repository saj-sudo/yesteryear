import { addDays, diffDays, monthDayOf, yearOf } from '../../engine/dates';
import type { LocalDate } from '../../engine/types';
import type { FullObject, PropertyValue } from '../../engine/provider';
import { fieldOfficeDay } from './dailyContent';
import { generateDailyNotes } from './generate';
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
  {
    title: 'Hut stove maintenance',
    blocks: [
      ['TextBlock', 'Strip the flue once a month in winter and once in spring. The soot comes off in sheets if you tap the pipe first with a wooden spoon.'],
      ['TextBlock', 'The door gasket is due. The old one has gone hard and the draught whistles. Order the 12 mm rope; the 10 mm one is too thin.'],
      ['QuoteBlock', 'Ansel: "A clean flue is half the fuel bill."'],
    ],
  },
  {
    title: 'Survey call with the office, Tuesday',
    blocks: [
      ['TextBlock', 'Present: Wren, Ansel, two people from the survey office, me. Forty minutes, mostly about the north tarn correction.'],
      ['TextBlock', 'Decided: they will reissue the north sheet in spring. I send the corrected coordinates by the end of the month.'],
      ['TextBlock', 'Open question: who pays for the reprint. Nobody wanted to answer.'],
      ['TextBlock', 'Next: confirm the three place name spellings with Cordelia.'],
    ],
  },
  {
    title: 'Packing list, glacier week',
    blocks: [
      ['TextBlock', 'Rope, 40 m and 30 m. Probe, two pickets, crampons, spare straps. Check the straps before leaving the hut.'],
      ['TextBlock', 'Food for six days plus a day in reserve: oats, lentils, cheese, tinned fish, chocolate. Stove fuel: 450 ml per person.'],
      ['TextBlock', 'Paper maps in a dry bag, the radio, a spare battery, the logbook and two pencils.'],
    ],
  },
  {
    title: 'Altimeters, a comparison',
    blocks: [
      ['TextBlock', 'The brass altimeter drifts about 30 m over a week of weather. The digital one drifts less but dies in the cold unless it sleeps in my jacket.'],
      ['TextBlock', 'Calibrate both at the hut door on a clear morning and write the offset on a strip of tape.'],
      ['QuoteBlock', 'Wren: "Which one do you trust?" Both, at different times of day.'],
    ],
  },
  {
    title: 'Book notes: The Cartographer’s Apprentice',
    blocks: [
      ['TextBlock', 'A novel about a boy who inherits a map shop and learns to read what mapmakers leave out. The best chapters are about erasing a river that no longer exists.'],
      ['TextBlock', 'Passage worth keeping, chapter 9: the apprentice colours the sea last, because water is the only thing on the map that nobody argues about.'],
      ['TextBlock', 'Would give it to Wren. She likes books where the work is described accurately.'],
    ],
  },
  {
    title: 'Lighthouse survey: tide table questions',
    blocks: [
      ['TextBlock', 'Cordelia’s tables run six minutes later than mine at low water. Candidate explanations: her clock, the harbour gauge, or the datum we each used.'],
      ['TextBlock', 'Ask her which datum. Compare three consecutive days before arguing.'],
      ['TextBlock', 'If the gap holds, the correction table needs a footnote.'],
    ],
  },
  {
    title: 'Sourdough at altitude',
    blocks: [
      ['TextBlock', 'First loaf: crust fine, middle raw. The oven runs cold and the dough rises too fast at 2,100 m.'],
      ['TextBlock', 'Second loaf: half the starter, a long cold rise overnight in the porch, 40 minutes at the highest setting. Better.'],
      ['TextBlock', 'Keep the starter by the stove in winter. It sulks in the cold.'],
    ],
  },
  {
    title: 'Spring order, supplier list',
    blocks: [
      ['TextBlock', 'Fuel: 200 litres, delivered to the road end. Ask for the early slot before the pass opens.'],
      ['TextBlock', 'Tins: fewer than last year. We counted 47 left over.'],
      ['TextBlock', 'Rope, a new tarp, six D batteries, wax for the skis and a replacement kettle.'],
      ['TextBlock', 'Payment on delivery. The supplier does not take cheques.'],
    ],
  },
  {
    title: 'Ideas for the winter write-up',
    blocks: [
      ['TextBlock', 'Open with the glacier readings, since they have the cleanest numbers. Put the weather diary in an appendix.'],
      ['TextBlock', 'Maybe a short chapter on how the hut’s own measurements changed over twenty years. People like seeing a long record.'],
      ['TextBlock', 'Wren wants shorter chapters and more figures. Start with the figures and write around them.'],
    ],
  },
  {
    title: 'Route options for the north tarn',
    blocks: [
      ['TextBlock', 'West route: shortest, about 3 hours, loose scree for the last 400 m. East route: 4.5 hours, solid ground, one stream crossing.'],
      ['TextBlock', 'Option three, over the saddle: 5 hours, best views, only in dry weather.'],
      ['TextBlock', 'Default to the east route for groups. Take the west route when alone and the scree is frozen.'],
    ],
  },
  {
    title: 'Sledge repair checklist',
    blocks: [
      ['TextBlock', 'Runners: check for splits and re-screw the brass strip every autumn. Lashings: replace any that look frayed.'],
      ['TextBlock', 'Bag: wax it again. Handle: tighten the bolt before the first loaded run.'],
      ['QuoteBlock', 'Wren: "If it creaks, it will fail on the steep part."'],
    ],
  },
  {
    title: 'What Cordelia’s letters keep coming back to',
    blocks: [
      ['TextBlock', 'The lighthouse, always. Then her sister’s garden, the neighbour’s dog, and whether I am eating well.'],
      ['TextBlock', 'She writes in the same blue ink and signs off with a different phrase each time. Collect the phrases.'],
      ['TextBlock', 'Reply soon. It has been five weeks.'],
    ],
  },
  {
    title: 'Weather rules of thumb',
    blocks: [
      ['TextBlock', 'Barometer falling more than 3 hPa in three hours means bring the gear in. A ring around the moon usually means rain within a day.'],
      ['TextBlock', 'Wind backing from west to south-west is the one to watch. Ansel says the pass tells you before the radio does.'],
      ['TextBlock', 'Cloud on the peaks in the morning that burns off by ten is usually harmless.'],
    ],
  },
  {
    title: 'Questions for the survey office',
    blocks: [
      ['TextBlock', 'Is the datum on the north sheet the old one or the new one? Who owns the benchmark on the lake road?'],
      ['TextBlock', 'Can we get a digital copy of the 1998 sheet? Ours has a coffee ring on the tarn.'],
      ['TextBlock', 'What is the spelling of the third place name: Haverdale or Havardale?'],
    ],
  },
  {
    title: 'Trip debrief: Tern Ridge, first push',
    blocks: [
      ['TextBlock', 'Reached the second marker in six hours, an hour slower than planned. The snow bridge near the marker held, which was luck.'],
      ['TextBlock', 'What worked: the shorter rope, the early start, the stove in the tent. What needs work: talking to each other when the wind is loud.'],
      ['TextBlock', 'For the next push: probe every ten steps, carry the spare radio, leave an hour earlier.'],
    ],
  },
  {
    title: 'Seed tins, north terrace plan',
    blocks: [
      ['TextBlock', 'Beans along the south fence, kale in the two raised beds, peas by the door where the wind drops. Potatoes in the lower plot if the frost holds off.'],
      ['TextBlock', 'Label every tin with the year and the bed. Last year’s mystery tin turned out to be coriander.'],
      ['TextBlock', 'Start the beans indoors in April. The terrace is too cold before May.'],
    ],
  },
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
  const featured = new Set<string>(guaranteed.map((n) => addDays(today, -n)));
  const dayText = fieldOfficeDay(0xf1e1d);
  const dailyNotes = generateDailyNotes({
    today,
    spanDays: 1130,
    density: 0.38,
    guaranteedOffsets: guaranteed,
    seed: 0xca11,
    bodyFor: (date, noteRng) => dayText({ date, featured: featured.has(date) }, noteRng),
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
