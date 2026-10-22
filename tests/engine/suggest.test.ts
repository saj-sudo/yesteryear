import { describe, expect, it } from 'vitest';
import { defaultConfig, normalizeConfig } from '../../src/engine/config';
import type { PropertyDef, StructureDef } from '../../src/engine/provider';
import { resolveSchema } from '../../src/engine/resolve';
import { applySuggestion, inFlightStatuses, suggestMapping } from '../../src/engine/suggest';
import type { LocalDate } from '../../src/engine/types';
import { isBasicStructure } from '../../src/providers/capacities/constants';
import { buildMinimalSpace } from '../../src/providers/fixture/minimalSpace';
import { buildStrangersSpace } from '../../src/providers/fixture/strangersSpace';

const TODAY = '2026-08-25' as LocalDate;

const date = (name: string): PropertyDef => ({ id: `d-${name}`, name, type: 'date', writable: true, labelNames: [] });
const label = (name: string, labelNames: string[]): PropertyDef => ({
  id: `l-${name}`,
  name,
  type: 'label',
  writable: true,
  labelNames,
});
const type = (title: string, properties: PropertyDef[]): StructureDef => ({
  id: `st-${title}`,
  title,
  pluralName: `${title}s`,
  properties,
});

/** The shape of Capacities' own Project and Person types, rebuilt from the API's property list. */
const STANDARD: StructureDef[] = [
  type('Project', [
    date('Start Date'),
    date('Target Completion'),
    label('Status', ['Planned', 'Active', 'On Hold', 'Completed', 'Archived']),
    label('Priority', ['High', 'Medium', 'Low']),
  ]),
  type('Person', [date('Date Met'), date('Birthday'), date('Last Contact'), label('Category', ['Friend', 'Family'])]),
];

const customOf = (structures: StructureDef[]): StructureDef[] => structures.filter((s) => !isBasicStructure(s.id));

describe('suggestMapping on the standard Capacities types', () => {
  const suggestion = suggestMapping(STANDARD, [], defaultConfig())!;

  it('recognises the Project type, its dates and its status by name', () => {
    const project = suggestion.types.find((t) => t.role === 'project')!;
    expect(project).toEqual({
      role: 'project',
      type: 'Project',
      guess: false,
      properties: { projectStart: 'Start Date', projectTarget: 'Target Completion', projectStatus: 'Status' },
    });
  });

  it('picks the birthday, not the other dates on a Person', () => {
    const person = suggestion.types.find((t) => t.role === 'person')!;
    expect(person.type).toBe('Person');
    expect(person.guess).toBe(false);
    expect(person.properties).toEqual({ personBirthday: 'Birthday' });
  });

  it('counts planned and active as in flight, and leaves out on hold, completed and archived', () => {
    expect(suggestion.activeStatusValues).toEqual(['Planned', 'Active']);
  });

  it('resolves cleanly once applied', () => {
    const config = applySuggestion(defaultConfig(), suggestion);
    expect(resolveSchema(config, STANDARD, []).warnings).toEqual([]);
  });
});

describe('suggestMapping on the stranger space, which is unlike any real one', () => {
  const space = buildStrangersSpace(TODAY);
  const structures = customOf(space.structures);
  const suggestion = suggestMapping(structures, space.tags, defaultConfig())!;

  it('guesses the expedition type from its two dates and its phase, and says it is a guess', () => {
    const project = suggestion.types.find((t) => t.role === 'project')!;
    expect(project.type).toBe('Expedition');
    expect(project.guess).toBe(true);
    expect(project.properties).toEqual({ projectStart: 'Set Off', projectTarget: 'Summit Day', projectStatus: 'Phase' });
  });

  it('finds the birthday on a type that is not called Person, and says it is a guess', () => {
    const person = suggestion.types.find((t) => t.role === 'person')!;
    expect(person).toMatchObject({ type: 'Correspondent', guess: true, properties: { personBirthday: 'Born On' } });
  });

  it('leaves out finished and abandoned expeditions', () => {
    expect(suggestion.activeStatusValues).toEqual(['Scouting', 'Underway', 'Basecamp']);
  });

  it('suggests the tag that already says keep, and not the others', () => {
    expect(suggestion.recallTags).toEqual(['keeper']);
  });

  it('resolves cleanly once applied, against the same space', () => {
    const config = applySuggestion(defaultConfig(), suggestion);
    expect(resolveSchema(config, space.structures, space.tags).warnings).toEqual([]);
  });
});

describe('suggestMapping on a space with nothing to suggest', () => {
  it('says nothing for the nearly empty space', () => {
    const space = buildMinimalSpace(TODAY);
    expect(suggestMapping(customOf(space.structures), space.tags, defaultConfig())).toBeNull();
  });

  it('does not mistake a type with a single unnamed date for projects', () => {
    const meeting = type('Meeting', [date('When'), label('Kind', ['Standup', 'Review'])]);
    expect(suggestMapping([meeting], [], defaultConfig())).toBeNull();
  });
});

describe('suggestMapping respects what is already mapped', () => {
  it('leaves a mapped role alone and suggests only the rest', () => {
    const config = normalizeConfig({ types: { project: 'Project' }, properties: { projectStart: 'Start Date' } });
    const suggestion = suggestMapping(STANDARD, [], config)!;
    expect(suggestion.types.map((t) => t.role)).toEqual(['person']);
    const applied = applySuggestion(config, suggestion);
    expect(applied.types.project).toBe('Project');
    expect(applied.properties.projectStart).toBe('Start Date');
    expect(applied.properties.personBirthday).toBe('Birthday');
  });

  it('is null once everything it would suggest is mapped', () => {
    const config = applySuggestion(defaultConfig(), suggestMapping(STANDARD, [], defaultConfig())!);
    expect(suggestMapping(STANDARD, [], config)).toBeNull();
  });
});

describe('inFlightStatuses', () => {
  it('drops done-like and paused-like values, whatever the case or spacing', () => {
    expect(inFlightStatuses(['Not Started', 'In Progress', 'ON HOLD', 'Done', 'cancelled', 'Someday'])).toEqual([
      'Not Started',
      'In Progress',
    ]);
  });
});
