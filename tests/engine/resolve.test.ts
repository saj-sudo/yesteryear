import { describe, expect, it } from 'vitest';
import { normalizeConfig } from '../../src/engine/config';
import { resolveSchema } from '../../src/engine/resolve';
import type { LocalDate } from '../../src/engine/types';
import { buildStrangersSpace } from '../../src/providers/fixture/strangersSpace';

const TODAY = '2026-08-25' as LocalDate;
const space = buildStrangersSpace(TODAY);

describe('resolveSchema against the stranger space', () => {
  it('maps the stranger schema — nothing about it is assumed', () => {
    const config = normalizeConfig({
      types: { project: 'Expedition', person: 'Correspondent', note: 'Field Note' },
      properties: {
        projectStart: 'Set Off',
        projectTarget: 'Summit Day',
        projectStatus: 'Phase',
        personBirthday: 'Born On',
      },
      recall: { tags: ['spark', 'keeper'] },
    });
    const r = resolveSchema(config, space.structures, space.tags);
    expect(r.warnings).toEqual([]);
    expect(r.types.project?.structure.id).toBe('st-expedition');
    expect(r.types.person?.structure.id).toBe('st-correspondent');
    expect(r.properties.projectStart?.property.id).toBe('p-setoff');
    expect(r.properties.personBirthday?.property.id).toBe('p-born');
    expect(r.tagIds).toEqual({ 'spark': 't-spark', 'keeper': 't-keeper' });
  });

  it('maps the spec §16 reference config names onto a space that has none of them', () => {
    const config = normalizeConfig({
      types: { project: 'Project', person: 'Person' },
      properties: { projectStart: 'Start Date', personBirthday: 'Birthday' },
      recall: { tags: ['insight', 'win'] },
    });
    const r = resolveSchema(config, space.structures, space.tags);
    // Everything misses — and every miss is a readable warning, not a crash.
    // Property misses are folded into their type's warning (the type name
    // itself failed to resolve), so: 2 type + 2 tag warnings.
    expect(r.types).toEqual({});
    expect(r.properties).toEqual({});
    expect(r.tagIds).toEqual({});
    expect(r.warnings).toHaveLength(4);
  });

  it('names what was missing and lists what the space contains', () => {
    const config = normalizeConfig({ types: { project: 'Goal' } });
    const [warning] = resolveSchema(config, space.structures, space.tags).warnings;
    expect(warning).toContain('"Goal"');
    expect(warning).toContain('"Expedition"');
    expect(warning).toContain('"Correspondent"');
    expect(warning).toContain('"Daily Note"');
  });

  it('names the properties a type actually has when a property misses', () => {
    const config = normalizeConfig({
      types: { project: 'Expedition' },
      properties: { projectTarget: 'Deadline' },
    });
    const r = resolveSchema(config, space.structures, space.tags);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('"Deadline"');
    expect(r.warnings[0]).toContain('"Summit Day"');
    expect(r.warnings[0]).toContain('"Phase"');
  });

  it('lists space tags when a configured tag misses', () => {
    const config = normalizeConfig({ recall: { tags: ['insight'] } });
    const r = resolveSchema(config, space.structures, space.tags);
    expect(r.warnings[0]).toContain('"insight"');
    expect(r.warnings[0]).toContain('"spark"');
  });

  it('matches names case-insensitively with surrounding whitespace', () => {
    const config = normalizeConfig({ types: { project: '  expedition ' } });
    const r = resolveSchema(config, space.structures, space.tags);
    expect(r.warnings).toEqual([]);
    expect(r.types.project?.structure.id).toBe('st-expedition');
  });

  it('an empty config resolves with no warnings — none is always valid', () => {
    const r = resolveSchema(normalizeConfig({}), space.structures, space.tags);
    expect(r.warnings).toEqual([]);
  });
});
