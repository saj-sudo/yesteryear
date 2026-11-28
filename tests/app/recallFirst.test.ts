import { describe, expect, it } from 'vitest';
import { asksFirst } from '../../src/app/views/recallFirst';
import { defaultConfig, normalizeConfig } from '../../src/engine/config';

const open = { enabled: true, revealed: false, answered: false, hasText: true };

describe('asksFirst', () => {
  it('asks before showing a Recall or Review note', () => {
    expect(asksFirst({ source: 'recall' }, open)).toBe(true);
    expect(asksFirst({ source: 'learn' }, open)).toBe(true);
  });

  it('shows date-driven notes straight away', () => {
    expect(asksFirst({ source: 'temporal' }, open)).toBe(false);
  });

  it('never asks when off, once shown, once answered, or with no text', () => {
    expect(asksFirst({ source: 'recall' }, { ...open, enabled: false })).toBe(false);
    expect(asksFirst({ source: 'recall' }, { ...open, revealed: true })).toBe(false);
    expect(asksFirst({ source: 'recall' }, { ...open, answered: true })).toBe(false);
    expect(asksFirst({ source: 'recall' }, { ...open, hasText: false })).toBe(false);
  });
});

describe('recallFirst setting', () => {
  it('is off by default and survives a round trip', () => {
    expect(defaultConfig().surfaces.browser.recallFirst).toBe(false);
    const on = defaultConfig();
    on.surfaces.browser.recallFirst = true;
    expect(normalizeConfig(JSON.parse(JSON.stringify(on))).surfaces.browser.recallFirst).toBe(true);
    expect(normalizeConfig({ surfaces: { browser: { recallFirst: 'yes' } } }).surfaces.browser.recallFirst).toBe(false);
  });
});
