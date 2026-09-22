import {
  CapacitiesApiError,
  CapacitiesClient,
  type ApiBlock,
  type ApiToken,
  type GetObjectResponse,
} from '@capacities/api';
import type {
  FullObject,
  ObjectSummary,
  PropertyValue,
  Provider,
  SimpleBlock,
  SpaceInfo,
  StructureDef,
  TagDef,
} from '../../engine/provider';
import type { LocalDate } from '../../engine/types';
import { APP_BASE, DAILY_NOTE_STRUCTURE_ID, TAG_STRUCTURE_ID } from './constants';
import { withBackoff } from './rateLimit';

/**
 * The one place the engine's Provider interface meets the Capacities SDK.
 * Everything is read-only except appendToDailyNote (and the state store,
 * which lives in stateStore.ts). All calls go through rate-limit backoff.
 */
export class CapacitiesAdapter implements Provider {
  readonly dailyNoteStructureId = DAILY_NOTE_STRUCTURE_ID;

  private readonly client: CapacitiesClient;
  private cachedSpaceId: string | null = null;

  constructor(client: CapacitiesClient) {
    this.client = client;
  }

  async spaceInfo(): Promise<SpaceInfo> {
    const space = await withBackoff(() => this.client.space.get());
    this.cachedSpaceId = space.id;
    return { spaceId: space.id, title: space.title };
  }

  async listStructures(): Promise<StructureDef[]> {
    const res = await withBackoff(() => this.client.space.structures());
    return res.structures.map((s) => ({
      id: s.id,
      title: s.title,
      pluralName: s.pluralName,
      properties: s.propertyDefinitions.map((p) => ({
        id: p.id,
        name: p.name,
        type: p.type,
        writable: p.writable,
        labelNames: (p.labelSet ?? []).map((l) => l.name),
      })),
    }));
  }

  async listTags(): Promise<TagDef[]> {
    const tags: TagDef[] = [];
    for await (const summary of this.listObjectsByStructure(TAG_STRUCTURE_ID)) {
      tags.push({ id: summary.id, name: summary.title });
    }
    return tags;
  }

  async *listObjectsByStructure(structureId: string): AsyncIterable<ObjectSummary> {
    let cursor: string | undefined;
    do {
      const page = await withBackoff(() =>
        this.client.objects.structure({
          structureId,
          pageSize: 100,
          ...(cursor ? { cursor } : {}),
        }),
      );
      yield* page.results;
      cursor = page.hasMore && page.nextCursor ? page.nextCursor : undefined;
    } while (cursor);
  }

  async *listObjectsByTag(tagId: string): AsyncIterable<ObjectSummary> {
    let cursor: string | undefined;
    do {
      const page = await withBackoff(() =>
        this.client.objects.tag({
          tagId,
          pageSize: 100,
          ...(cursor ? { cursor } : {}),
        }),
      );
      yield* page.results;
      cursor = page.hasMore && page.nextCursor ? page.nextCursor : undefined;
    } while (cursor);
  }

  async getObject(id: string): Promise<FullObject | null> {
    let res: GetObjectResponse;
    try {
      res = await withBackoff(() => this.client.object.get({ id }));
    } catch (err) {
      if (err instanceof CapacitiesApiError && err.code === 'cap_not_found') {
        return null; // deleted objects are pruned, never an error (§11)
      }
      throw err;
    }
    return {
      id: res.id,
      structureId: res.structureId,
      title: titleOf(res),
      properties: simplifyProperties(res.properties),
      blocks: flattenBlocks(res.blocks ?? {}),
    };
  }

  async getObjectMarkdown(id: string): Promise<string | null> {
    try {
      const res = await withBackoff(() => this.client.object.markdown.get({ id }));
      return res.markdown;
    } catch (err) {
      if (err instanceof CapacitiesApiError && err.code === 'cap_not_found') {
        return null;
      }
      throw err;
    }
  }

  async appendToDailyNote(date: LocalDate, markdown: string): Promise<void> {
    // Creates the note when absent (V6); no timestamp prefix — the section
    // heading is the marker. The endpoint returns when the append is
    // queued, not when the note is saved, so never read the note back to
    // confirm: it can still show the pre-append body.
    await withBackoff(() =>
      this.client.blocks.dailyNote.append({ date, markdown, noTimeStamp: true }),
    );
  }

  deepLink(objectId: string): string {
    return this.cachedSpaceId
      ? `${APP_BASE}/${this.cachedSpaceId}/${objectId}`
      : `${APP_BASE}`;
  }
}

/* ------------------------------------------------------------------ */

function titleOf(res: GetObjectResponse): string {
  for (const value of Object.values(res.properties)) {
    if (value.type === 'title') return value.title.value ?? '';
  }
  return '';
}

function simplifyProperties(
  properties: GetObjectResponse['properties'],
): Record<string, PropertyValue> {
  const out: Record<string, PropertyValue> = {};
  for (const [propId, value] of Object.entries(properties)) {
    switch (value.type) {
      case 'date':
        out[propId] = {
          type: 'date',
          start: value.date.start,
          end: value.date.end,
        };
        break;
      case 'label':
        out[propId] = { type: 'label', names: value.label.map((l) => l.name) };
        break;
      case 'text':
        out[propId] = { type: 'text', value: value.text.value };
        break;
      case 'title':
        out[propId] = { type: 'text', value: value.title.value };
        break;
      case 'number':
        out[propId] = { type: 'number', value: value.number.value };
        break;
      default:
        out[propId] = { type: 'other' };
    }
  }
  return out;
}

function tokensToText(tokens: ApiToken[]): string {
  return tokens.map((t) => t.text).join('');
}

/**
 * Flatten the API's recursive block trees into schedulable units. Quote
 * layout and headings are surfaced as distinct display types so the
 * granularity filter can target them; these names come from the API's
 * block model, not user schema.
 */
export function flattenBlocks(blocks: Record<string, ApiBlock[]>): SimpleBlock[] {
  const out: SimpleBlock[] = [];
  const visit = (block: ApiBlock): void => {
    switch (block.type) {
      case 'TextBlock': {
        const text = tokensToText(block.tokens).trim();
        if (text.length > 0) {
          out.push({
            id: block.id,
            type: block.quote ? 'QuoteBlock' : 'TextBlock',
            text,
          });
        }
        for (const child of block.blocks) visit(child);
        break;
      }
      case 'GroupBlock':
        for (const child of block.blocks) visit(child);
        break;
      case 'GridBlock':
        for (const column of block.columns) for (const child of column) visit(child);
        break;
      case 'CodeBlock':
        if (block.text.trim()) out.push({ id: block.id, type: 'CodeBlock', text: block.text });
        break;
      case 'MathBlock':
        if (block.text.trim()) out.push({ id: block.id, type: 'MathBlock', text: block.text });
        break;
      default:
        break; // entity embeds, dividers, media: not resurfaceable text
    }
  };
  for (const tree of Object.values(blocks)) for (const block of tree) visit(block);
  return out;
}
