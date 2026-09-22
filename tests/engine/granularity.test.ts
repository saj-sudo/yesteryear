import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/engine/config';
import {
  pruneStaleBlockState,
  qualifyingBlocks,
  refineToBlock,
} from '../../src/engine/granularity';
import type { FullObject } from '../../src/engine/provider';
import { blockKey, emptyState, objKey } from '../../src/engine/state';
import type { Candidate } from '../../src/engine/types';


const longText = (label: string): string =>
  `${label}: a sentence comfortably longer than the forty character minimum.`;

const object: FullObject = {
  id: 'o1',
  structureId: 'st-fieldnote',
  title: 'Switchbacks are honest',
  properties: {},
  blocks: [
    { id: 'b1', type: 'TextBlock', text: longText('first paragraph') },
    { id: 'b2', type: 'QuoteBlock', text: longText('the quote') },
    { id: 'b3', type: 'TextBlock', text: 'too short' },
    { id: 'b4', type: 'CodeBlock', text: longText('const code') },
  ],
};

const blockCfg = {
  ...defaultConfig().granularity,
  mode: 'block' as const,
  blockTypes: ['TextBlock', 'QuoteBlock'],
};

function cand(): Candidate {
  return {
    key: objKey('o1'),
    objectId: 'o1',
    blockId: null,
    title: object.title,
    excerpt: null,
    source: 'recall',
    temporalReason: null,
    tags: [],
    group: null,
    targetDate: null,
  };
}

describe('qualifyingBlocks', () => {
  it('filters by configured block types and minimum length', () => {
    expect(qualifyingBlocks(object, blockCfg).map((b) => b.id)).toEqual(['b1', 'b2']);
  });

  it('with no block types configured, any long-enough block qualifies', () => {
    const cfg = { ...blockCfg, blockTypes: [] };
    expect(qualifyingBlocks(object, cfg).map((b) => b.id)).toEqual(['b1', 'b2', 'b4']);
  });
});

describe('refineToBlock', () => {
  it('object mode passes the candidate through untouched', () => {
    const c = cand();
    expect(refineToBlock(c, object, defaultConfig().granularity, emptyState('now'))).toBe(c);
  });

  it('block mode surfaces a specific block with its own state key', () => {
    const refined = refineToBlock(cand(), object, blockCfg, emptyState('now'))!;
    expect(refined.key).toBe(blockKey('o1', 'b1'));
    expect(refined.blockId).toBe('b1');
    expect(refined.excerpt).toContain('first paragraph');
  });

  it('prefers the block least recently surfaced', () => {
    const state = emptyState('now');
    state.items[blockKey('o1', 'b1')] = {
      mode: 'recall', lastSurfaced: '2026-08-01', nextEligible: null,
      surfaceCount: 1, lastResponse: null, group: null, retired: false,
    };
    state.items[blockKey('o1', 'b2')] = {
      mode: 'recall', lastSurfaced: '2026-05-01', nextEligible: null,
      surfaceCount: 1, lastResponse: null, group: null, retired: false,
    };
    // Both surfaced before → the older one (b2) wins.
    expect(refineToBlock(cand(), object, blockCfg, state)!.blockId).toBe('b2');
  });

  it('falls back to the whole object when no block qualifies', () => {
    const shortOnly: FullObject = { ...object, blocks: [object.blocks[2]!] };
    const c = cand();
    expect(refineToBlock(c, shortOnly, blockCfg, emptyState('now'))).toBe(c);
    expect(
      refineToBlock(c, shortOnly, { ...blockCfg, fallbackToObject: false }, emptyState('now')),
    ).toBeNull();
  });

  it('drops state for edited-away blocks silently', () => {
    const state = emptyState('now');
    state.items[blockKey('o1', 'deleted-block')] = {
      mode: 'recall', lastSurfaced: '2026-08-01', nextEligible: null,
      surfaceCount: 1, lastResponse: null, group: null, retired: false,
    };
    state.items[blockKey('other-object', 'b9')] = {
      mode: 'recall', lastSurfaced: '2026-08-01', nextEligible: null,
      surfaceCount: 1, lastResponse: null, group: null, retired: false,
    };
    pruneStaleBlockState(state, object);
    expect(state.items[blockKey('o1', 'deleted-block')]).toBeUndefined();
    // Other objects' block state is untouched.
    expect(state.items[blockKey('other-object', 'b9')]).toBeDefined();
  });
});
