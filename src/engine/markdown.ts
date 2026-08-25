import type { SurfacedItem, TemporalReason } from './types';

/**
 * Rendering the Resurfaced section (§8.5). Zero items renders nothing at
 * all — an empty heading is clutter, not information. Copy never guilts:
 * no counts of what was skipped, no overdue language.
 */

export function labelForReason(reason: TemporalReason): string {
  switch (reason.kind) {
    case 'lookback': {
      if (reason.daysAgo % 365 === 0) {
        const years = reason.daysAgo / 365;
        return years === 1 ? 'From 1 year ago' : `From ${years} years ago`;
      }
      return `From ${reason.daysAgo} days ago`;
    }
    case 'birthday':
      return reason.inDays === 0 ? 'Birthday today' : `Birthday in ${reason.inDays} day${reason.inDays === 1 ? '' : 's'}`;
    case 'anniversary':
      return `Started ${reason.years} year${reason.years === 1 ? '' : 's'} ago today`;
    case 'targetDate':
      return reason.inDays === 0 ? 'Due today' : `Due in ${reason.inDays} day${reason.inDays === 1 ? '' : 's'}`;
  }
}

const EXCERPT_MAX = 200;

function excerptOf(item: SurfacedItem): string | null {
  if (!item.excerpt) return null;
  const flat = item.excerpt.replace(/\s+/g, ' ').trim();
  return flat.length > EXCERPT_MAX ? `${flat.slice(0, EXCERPT_MAX - 1)}…` : flat;
}

export const RECALL_MARKERS = '`keep` · `dismiss` · `retire`';
export const LEARN_MARKERS = '`got it` · `missed it`';

/**
 * Render the section, or null when there is nothing to say. The heading
 * is the idempotency marker (§11): a note already containing it is not
 * written again that day.
 */
export function renderSection(heading: string, items: SurfacedItem[]): string | null {
  if (items.length === 0) return null;
  const lines: string[] = [`## ${heading}`, ''];
  for (const item of items) {
    const excerpt = excerptOf(item);
    let line = `- [ ] **${item.label}:** [[${item.title}]]`;
    if (excerpt) line += ` — “${excerpt}”`;
    lines.push(line);
    lines.push(`      ${item.source === 'learn' ? LEARN_MARKERS : RECALL_MARKERS}`);
  }
  return lines.join('\n');
}
