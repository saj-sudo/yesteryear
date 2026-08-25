import { describe, expect, it } from 'vitest';
import { renderSection } from '../../src/engine/markdown';
import { extractSection, parseResponses } from '../../src/engine/parseResponses';
import type { SurfacedItem, YesteryearState } from '../../src/engine/types';

const lastRun: YesteryearState['lastRunItems'] = [
  { key: 'obj:o1', title: 'Switchbacks are honest', learn: false },
  { key: 'obj:o2', title: 'Rope teams', learn: false },
  { key: 'obj:o3#learn', title: 'Fog instruments', learn: true },
];

const note = `Some morning writing of my own.

## Resurfaced

- [ ] **From 1 year ago:** [[Switchbacks are honest]]
      \`keep\` · ~~\`dismiss\`~~ · \`retire\`
- [x] **From your notes:** [[Rope teams]]
      \`keep\` · \`dismiss\` · \`retire\`
- [ ] **Review:** [[Fog instruments]]
      \`got it\` · ~~\`missed it\`~~

## Later

- [x] unrelated checked task [[Rope teams]]
`;

describe('extractSection', () => {
  it('slices exactly the heading’s section', () => {
    const section = extractSection(note, 'Resurfaced')!;
    expect(section).toContain('Switchbacks');
    expect(section).not.toContain('unrelated');
  });

  it('returns null when the section was deleted', () => {
    expect(extractSection('# A note\ncontent', 'Resurfaced')).toBeNull();
  });
});

describe('parseResponses', () => {
  it('reads strikes and checkboxes into responses', () => {
    expect(parseResponses(note, 'Resurfaced', lastRun)).toEqual([
      { key: 'obj:o1', response: 'dismiss' },
      { key: 'obj:o2', response: 'keep' },
      { key: 'obj:o3#learn', response: 'missedIt' },
    ]);
  });

  it('no section, no note, or no expected items → no responses, no crash', () => {
    expect(parseResponses(null, 'Resurfaced', lastRun)).toEqual([]);
    expect(parseResponses('just prose', 'Resurfaced', lastRun)).toEqual([]);
    expect(parseResponses(note, 'Resurfaced', [])).toEqual([]);
  });

  it('survives reordering, edits, and hand-written lines in the middle', () => {
    const edited = `## Resurfaced

- [ ] I rewrote this line but kept the link [[Rope teams]] and struck ~~\`retire\`~~
random hand-written thought in the middle
- [x] **edited label:** [[Switchbacks are honest]]
`;
    expect(parseResponses(edited, 'Resurfaced', lastRun)).toEqual([
      { key: 'obj:o2', response: 'retire' },
      { key: 'obj:o1', response: 'keep' },
    ]);
  });

  it('unknown markers and unmatched titles fall back to no response', () => {
    const weird = `## Resurfaced

- [ ] [[Switchbacks are honest]] ~~\`snooze\`~~
- [ ] [[Some Note Never Surfaced]] ~~\`retire\`~~
`;
    expect(parseResponses(weird, 'Resurfaced', lastRun)).toEqual([]);
  });

  it('never double-counts a title surfaced once', () => {
    const doubled = `## Resurfaced

- [x] [[Rope teams]]
- [ ] [[Rope teams]] ~~\`retire\`~~
`;
    expect(parseResponses(doubled, 'Resurfaced', lastRun)).toEqual([
      { key: 'obj:o2', response: 'keep' },
    ]);
  });

  it('round-trips what renderSection writes', () => {
    const items: SurfacedItem[] = [
      {
        key: 'obj:o1', objectId: 'o1', blockId: null, title: 'Switchbacks are honest',
        excerpt: null, source: 'temporal', label: 'From 1 year ago', group: null,
      },
      {
        key: 'obj:o3#learn', objectId: 'o3', blockId: null, title: 'Fog instruments',
        excerpt: 'In fog you navigate…', source: 'learn', label: 'Review', group: null,
      },
    ];
    const rendered = renderSection('Resurfaced', items)!;
    // Untouched section → no responses (silence is a valid response, §8.1).
    expect(parseResponses(rendered, 'Resurfaced', lastRun)).toEqual([]);
    // Striking in the rendered text works.
    const struck = rendered.replace('`missed it`', '~~`missed it`~~');
    expect(parseResponses(struck, 'Resurfaced', lastRun)).toEqual([
      { key: 'obj:o3#learn', response: 'missedIt' },
    ]);
  });
});
