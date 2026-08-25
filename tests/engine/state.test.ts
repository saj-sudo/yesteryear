import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/engine/config';
import {
  blockKey,
  emptyDoc,
  exportDoc,
  importDoc,
  learnKey,
  normalizeDoc,
  objKey,
  parseKey,
  pruneMissing,
} from '../../src/engine/state';

const NOW = '2026-08-25T09:00:00Z';

describe('item keys', () => {
  it('round-trips object, block, and learn keys', () => {
    expect(parseKey(objKey('o1'))).toEqual({ objectId: 'o1', blockId: null, learn: false });
    expect(parseKey(blockKey('o1', 'b2'))).toEqual({
      objectId: 'o1',
      blockId: 'b2',
      learn: false,
    });
    expect(parseKey(learnKey(objKey('o1')))).toEqual({
      objectId: 'o1',
      blockId: null,
      learn: true,
    });
    expect(parseKey(learnKey(blockKey('o1', 'b2')))).toEqual({
      objectId: 'o1',
      blockId: 'b2',
      learn: true,
    });
  });

  it('rejects malformed keys', () => {
    expect(parseKey('garbage')).toBeNull();
    expect(parseKey('blk:no-slash')).toBeNull();
  });
});

describe('normalizeDoc / import / export', () => {
  it('round-trips a document through export and import', () => {
    const doc = emptyDoc(defaultConfig(), NOW);
    doc.state.items[objKey('o1')] = {
      mode: 'recall',
      lastSurfaced: '2026-08-10',
      nextEligible: '2026-09-24',
      surfaceCount: 3,
      lastResponse: 'keep',
      group: 'Health',
      retired: false,
    };
    doc.state.lastRunDate = '2026-08-25';
    const round = importDoc(exportDoc(doc), NOW);
    expect(round).toEqual(doc);
  });

  it('drops unrecognizable items instead of crashing', () => {
    const doc = normalizeDoc(
      {
        state: {
          items: {
            'obj:good': { mode: 'recall' },
            'bad key': { mode: 'recall' },
            'obj:badshape': 42,
            'obj:learn-no-target': { mode: 'learn' },
          },
        },
      },
      NOW,
    );
    expect(Object.keys(doc.state.items)).toEqual(['obj:good']);
    expect(doc.state.items['obj:good']).toMatchObject({
      mode: 'recall',
      surfaceCount: 0,
      retired: false,
    });
  });

  it('treats garbage input as a valid empty document (first run)', () => {
    const doc = normalizeDoc('not even an object', NOW);
    expect(doc.state.items).toEqual({});
    expect(doc.state.lastRunDate).toBeNull();
    expect(doc.config).toEqual(defaultConfig());
  });
});

describe('pruneMissing', () => {
  it('removes entries for deleted objects, block entries included', () => {
    const doc = emptyDoc(defaultConfig(), NOW);
    doc.state.items[objKey('alive')] = {
      mode: 'recall', lastSurfaced: null, nextEligible: null,
      surfaceCount: 0, lastResponse: null, group: null, retired: false,
    };
    doc.state.items[blockKey('gone', 'b1')] = {
      mode: 'recall', lastSurfaced: null, nextEligible: null,
      surfaceCount: 0, lastResponse: null, group: null, retired: false,
    };
    doc.state.items[learnKey(objKey('gone'))] = {
      mode: 'learn', targetDate: '2026-11-01', lastSurfaced: null,
      nextDue: null, surfaceCount: 0, lastResponse: null,
    };
    pruneMissing(doc.state, (id) => id === 'alive');
    expect(Object.keys(doc.state.items)).toEqual([objKey('alive')]);
  });
});
