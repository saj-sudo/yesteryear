import { describe, expect, it } from 'vitest';
import { labelForReason, renderSection } from '../../src/engine/markdown';
import type { SurfacedItem } from '../../src/engine/types';

function item(overrides: Partial<SurfacedItem>): SurfacedItem {
  return {
    key: 'obj:o1',
    objectId: 'o1',
    blockId: null,
    title: 'Boring reliability over optimization',
    excerpt: null,
    source: 'recall',
    label: 'From your notes',
    group: null,
    ...overrides,
  };
}

describe('labelForReason', () => {
  it('speaks in years for year multiples, days otherwise', () => {
    expect(labelForReason({ kind: 'lookback', daysAgo: 365, date: '2025-08-25' })).toBe('From 1 year ago');
    expect(labelForReason({ kind: 'lookback', daysAgo: 730, date: '2024-08-25' })).toBe('From 2 years ago');
    expect(labelForReason({ kind: 'lookback', daysAgo: 90, date: '2026-05-27' })).toBe('From 90 days ago');
  });

  it('covers birthdays, anniversaries, targets', () => {
    expect(labelForReason({ kind: 'birthday', inDays: 3, name: 'Menal' })).toBe('Birthday in 3 days');
    expect(labelForReason({ kind: 'birthday', inDays: 0, name: 'Menal' })).toBe('Birthday today');
    expect(labelForReason({ kind: 'anniversary', years: 1 })).toBe('Started 1 year ago today');
    expect(labelForReason({ kind: 'targetDate', inDays: 1 })).toBe('Due in 1 day');
  });
});

describe('renderSection', () => {
  it('renders the §8.5 shape', () => {
    const md = renderSection('Resurfaced', [
      item({ label: 'From 1 year ago' }),
      item({
        key: 'obj:o2',
        objectId: 'o2',
        title: 'Menal',
        label: 'Birthday in 3 days',
        source: 'temporal',
      }),
    ]);
    expect(md).toContain('## Resurfaced');
    expect(md).toContain('- [ ] **From 1 year ago:** [[Boring reliability over optimization]]');
    expect(md).toContain('`keep` · `dismiss` · `retire`');
    expect(md).toContain('- [ ] **Birthday in 3 days:** [[Menal]]');
  });

  it('learn items get recall-free markers', () => {
    const md = renderSection('Resurfaced', [
      item({ source: 'learn', label: 'Review' }),
    ])!;
    expect(md).toContain('`got it` · `missed it`');
    expect(md).not.toContain('`retire`');
  });

  it('includes flattened, truncated excerpts for block items', () => {
    const md = renderSection('Resurfaced', [
      item({ excerpt: `  Long   line\nwith breaks ${'x'.repeat(300)}` }),
    ])!;
    expect(md).toContain('— “Long line with breaks');
    expect(md).toContain('…');
    expect(md).not.toContain('\nwith breaks');
  });

  it('zero candidates render nothing at all — no empty heading (§11)', () => {
    expect(renderSection('Resurfaced', [])).toBeNull();
  });

  it('never speaks in guilt', () => {
    const md = renderSection('Resurfaced', [item({})])!;
    for (const word of ['streak', 'missed', 'overdue', 'behind']) {
      expect(md.toLowerCase()).not.toContain(word);
    }
  });
});
