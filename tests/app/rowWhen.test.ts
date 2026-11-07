import { describe, expect, it } from 'vitest';
import { rowWhen } from '../../src/app/views/scheduleShared';

describe('rowWhen', () => {
  it('shows a row date the way people read it', () => {
    expect(rowWhen({ when: '2026-12-22' })).toBe('Dec 22, 2026');
    expect(rowWhen({ when: '2027-01-05' })).toBe('Jan 5, 2027');
  });

  it('shows nothing for a row with no date', () => {
    expect(rowWhen({ when: null })).toBe('');
  });
});
