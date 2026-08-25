import type { PropertyDef, StructureDef, TagDef } from './provider';
import type { PropertyRole, TypeRole, YesteryearConfig } from './types';

/**
 * The single choke point where the user's config (human-readable names)
 * is resolved against what the space actually contains (spec §4). No IDs
 * exist anywhere upstream of this module.
 *
 * A missing mapping is a warning, not a failure: `run` skips the affected
 * feature (§11), the settings UI shows the message, and `strict` callers
 * can throw. Every message names what was missing AND lists what exists.
 */

export interface ResolvedType {
  role: TypeRole;
  structure: StructureDef;
}

export interface ResolvedProperty {
  role: PropertyRole;
  structureId: string;
  property: PropertyDef;
}

export interface ResolvedSchema {
  /** Role → structure, for roles whose configured name resolved. */
  types: Partial<Record<TypeRole, ResolvedType>>;
  properties: Partial<Record<PropertyRole, ResolvedProperty>>;
  /** Tag name → tag id for every tag name the config references. */
  tagIds: Record<string, string>;
  /** Readable messages for every mapping that failed to resolve. */
  warnings: string[];
}

const PROPERTY_HOME: Record<PropertyRole, TypeRole> = {
  projectStart: 'project',
  projectTarget: 'project',
  projectStatus: 'project',
  personBirthday: 'person',
};

function listNames(items: { name?: string; title?: string }[]): string {
  const names = items.map((s) => `"${s.title ?? s.name}"`);
  return names.length > 0 ? names.join(', ') : '(none)';
}

function findByName<T extends { name: string } | { title: string }>(
  items: T[],
  wanted: string,
): T | undefined {
  const norm = wanted.trim().toLowerCase();
  return items.find((item) => {
    const name = 'title' in item ? item.title : item.name;
    return name.trim().toLowerCase() === norm;
  });
}

/** Every tag name the config references, deduplicated. */
export function referencedTagNames(config: YesteryearConfig): string[] {
  const names = new Set<string>([
    ...config.recall.tags,
    ...config.learn.assignByTag,
    ...Object.keys(config.recall.tagWeights),
  ]);
  if (config.rotation.enabled && config.rotation.groupBy === 'tag') {
    for (const g of config.rotation.groups) names.add(g);
  }
  return [...names];
}

export function resolveSchema(
  config: YesteryearConfig,
  structures: StructureDef[],
  tags: TagDef[],
): ResolvedSchema {
  const warnings: string[] = [];
  const types: ResolvedSchema['types'] = {};
  const properties: ResolvedSchema['properties'] = {};
  const tagIds: Record<string, string> = {};

  for (const [role, name] of Object.entries(config.types) as [TypeRole, string][]) {
    const structure = findByName(structures, name);
    if (structure) {
      types[role] = { role, structure };
    } else {
      warnings.push(
        `Object type "${name}" (configured as ${role}) is not in this space. ` +
          `The space contains: ${listNames(structures)}.`,
      );
    }
  }

  for (const [role, name] of Object.entries(config.properties) as [
    PropertyRole,
    string,
  ][]) {
    const homeRole = PROPERTY_HOME[role];
    const home = types[homeRole];
    if (!home) {
      const configuredType = config.types[homeRole];
      if (configuredType !== undefined) continue; // type warning already covers it
      warnings.push(
        `Property "${name}" (configured as ${role}) needs a ${homeRole} type ` +
          `mapping first, and none is configured.`,
      );
      continue;
    }
    const property = findByName(home.structure.properties, name);
    if (property) {
      properties[role] = { role, structureId: home.structure.id, property };
    } else {
      warnings.push(
        `Property "${name}" (configured as ${role}) is not on the ` +
          `"${home.structure.title}" type. Its properties are: ` +
          `${listNames(home.structure.properties)}.`,
      );
    }
  }

  for (const name of referencedTagNames(config)) {
    const tag = findByName(tags, name);
    if (tag) {
      tagIds[name] = tag.id;
    } else {
      warnings.push(
        `Tag "${name}" is not in this space. Its tags are: ${listNames(tags)}.`,
      );
    }
  }

  return { types, properties, tagIds, warnings };
}
