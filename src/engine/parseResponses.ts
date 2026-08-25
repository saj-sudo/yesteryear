import type { ItemResponse, ParsedResponse, YesteryearState } from './types';

/**
 * Reading responses back out of yesterday's note (§8.6). The parser is
 * forgiving by contract: unknown markers, edited text, reordered lines,
 * a deleted section, or hand-written prose in the middle all fall back
 * to "no response" (the safe default). It never throws.
 *
 * How responding works, matching what the section renders:
 *  - check the box (`- [x]`)            → keep (recall) / got it (learn)
 *  - strike a marker (~~dismiss~~ etc.) → that response
 * Striking wins over the checkbox; among struck markers the most
 * explicit wins (retire > dismiss > keep; missed it > got it).
 */

/** Slice the section under `## heading` (until the next #/## heading). */
export function extractSection(markdown: string, heading: string): string | null {
  const lines = markdown.split('\n');
  const headingRe = new RegExp(
    `^#{1,6}\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`,
    'i',
  );
  const start = lines.findIndex((line) => headingRe.test(line.trim()));
  if (start === -1) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,2}\s+/.test(line.trim()));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n');
}

function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim().toLowerCase();
}

interface LineInfo {
  checked: boolean;
  struck: string[];
  titles: string[];
}

function parseLines(section: string): LineInfo[] {
  const out: LineInfo[] = [];
  for (const raw of section.split('\n')) {
    const line = raw.trimEnd();
    const item = /^\s*[-*]\s*\[( |x|X)\]\s*(.*)$/.exec(line);
    if (item) {
      const rest = item[2]!;
      out.push({
        checked: item[1] !== ' ',
        struck: [...rest.matchAll(/~~\s*`?([^~`]+?)`?\s*~~/g)].map((m) =>
          m[1]!.trim().toLowerCase(),
        ),
        titles: [...rest.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]!),
      });
      continue;
    }
    // A continuation (marker line or hand-written text) attaches to the
    // previous item; strikes anywhere in it count.
    const last = out[out.length - 1];
    if (last) {
      for (const struck of line.matchAll(/~~\s*`?([^~`]+?)`?\s*~~/g)) {
        last.struck.push(struck[1]!.trim().toLowerCase());
      }
      for (const title of line.matchAll(/\[\[([^\]]+)\]\]/g)) {
        last.titles.push(title[1]!);
      }
    }
  }
  return out;
}

function responseFor(line: LineInfo, learn: boolean): ItemResponse | null {
  const struck = new Set(line.struck);
  if (learn) {
    if (struck.has('missed it') || struck.has('missedit')) return 'missedIt';
    if (struck.has('got it') || struck.has('gotit')) return 'gotIt';
    return line.checked ? 'gotIt' : null;
  }
  if (struck.has('retire')) return 'retire';
  if (struck.has('dismiss')) return 'dismiss';
  if (struck.has('keep')) return 'keep';
  return line.checked ? 'keep' : null;
}

/**
 * Match yesterday's note against what the run recorded surfacing
 * (state.lastRunItems). Lines are matched by [[title]], so reordering,
 * deleting, or interleaving hand-written notes cannot corrupt anything;
 * items whose line vanished simply get no response.
 */
export function parseResponses(
  markdown: string | null,
  heading: string,
  lastRunItems: YesteryearState['lastRunItems'],
): ParsedResponse[] {
  if (!markdown || lastRunItems.length === 0) return [];
  const section = extractSection(markdown, heading);
  if (section === null) return [];

  const byTitle = new Map<string, { key: string; learn: boolean }[]>();
  for (const item of lastRunItems) {
    const t = normalizeTitle(item.title);
    const bucket = byTitle.get(t) ?? [];
    bucket.push({ key: item.key, learn: item.learn });
    byTitle.set(t, bucket);
  }

  const responses: ParsedResponse[] = [];
  const claimed = new Set<string>();
  for (const line of parseLines(section)) {
    for (const title of line.titles) {
      const bucket = byTitle.get(normalizeTitle(title));
      const match = bucket?.find((b) => !claimed.has(b.key));
      if (!match) continue;
      claimed.add(match.key);
      const response = responseFor(line, match.learn);
      if (response) responses.push({ key: match.key, response });
      break;
    }
  }
  return responses;
}
