import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { formatLocalDate, parseDailyNoteTitle } from '../../engine/dates';
import { parseKey } from '../../engine/state';
import type { ItemKey, ItemState } from '../../engine/types';
import type { AppData } from '../App';

/**
 * The queue (§9.1): what is scheduled next, what surfaced recently, what
 * has been retired — and it is editable, because seeing the schedule is
 * what makes people trust it. No counts of anything "overdue", ever:
 * an untouched queue is a normal state.
 */

const SHOW_MAX = 40;

interface Row {
  key: ItemKey;
  objectId: string;
  blockId: string | null;
  item: ItemState;
  when: string | null; // nextEligible / nextDue / lastSurfaced depending on section
}

function rowsOf(
  items: Record<ItemKey, ItemState>,
  pick: (item: ItemState) => string | null,
  filter: (item: ItemState) => boolean,
  ascending: boolean,
): Row[] {
  const rows: Row[] = [];
  for (const [key, item] of Object.entries(items)) {
    if (!filter(item)) continue;
    const parsed = parseKey(key);
    if (!parsed) continue;
    rows.push({ key, objectId: parsed.objectId, blockId: parsed.blockId, item, when: pick(item) });
  }
  rows.sort((a, b) => {
    const cmp = (a.when ?? '9999').localeCompare(b.when ?? '9999');
    return ascending ? cmp : -cmp;
  });
  return rows.slice(0, SHOW_MAX);
}

export function Queue({ data }: { data: AppData }) {
  const [, setTick] = useState(0);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const state = data.manager.current.state;

  const upcoming = useMemo(
    () =>
      rowsOf(
        state.items,
        (i) => (i.mode === 'learn' ? i.nextDue : i.nextEligible),
        (i) => (i.mode === 'learn' ? i.nextDue !== null : !i.retired && i.nextEligible !== null),
        true,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.items, state.updatedAt],
  );
  const recent = useMemo(
    () =>
      rowsOf(
        state.items,
        (i) => i.lastSurfaced,
        (i) => i.lastSurfaced !== null && !(i.mode === 'recall' && i.retired),
        false,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.items, state.updatedAt],
  );
  const retired = useMemo(
    () =>
      rowsOf(
        state.items,
        (i) => i.lastSurfaced,
        (i) => i.mode === 'recall' && i.retired,
        false,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.items, state.updatedAt],
  );

  // Resolve titles for the visible rows, a handful at a time.
  useEffect(() => {
    let cancelled = false;
    const wanted = [...new Set([...upcoming, ...recent, ...retired].map((r) => r.objectId))]
      .filter((id) => titles[id] === undefined)
      .slice(0, 60);
    if (wanted.length === 0) return;
    void (async () => {
      const found: Record<string, string> = {};
      for (const id of wanted) {
        const obj = await data.session.provider.getObject(id);
        found[id] = obj?.title ?? '(deleted)';
        if (cancelled) return;
      }
      setTitles((prev) => ({ ...prev, ...found }));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcoming, recent, retired]);

  const change = (fn: (items: Record<ItemKey, ItemState>) => void): void => {
    data.manager.mutate((doc) => fn(doc.state.items));
    setTick((t) => t + 1);
    data.manager.flush().catch(() => {
      setSaveError('Saving the change failed — it will retry on the next run.');
    });
  };

  const bringForward = (key: ItemKey) => () =>
    change((items) => {
      const item = items[key];
      if (item?.mode === 'recall') item.nextEligible = data.today;
      if (item?.mode === 'learn') item.nextDue = data.today;
    });
  const retire = (key: ItemKey) => () =>
    change((items) => {
      const item = items[key];
      if (item?.mode === 'recall') {
        item.retired = true;
        item.lastResponse = 'retire';
      }
    });
  const restore = (key: ItemKey) => () =>
    change((items) => {
      const item = items[key];
      if (item?.mode === 'recall') {
        item.retired = false;
        item.lastResponse = null;
      }
    });
  const reset = (key: ItemKey) => () =>
    change((items) => {
      delete items[key];
    });

  const title = (row: Row): string => {
    const raw = titles[row.objectId] ?? row.objectId;
    // Daily-note titles arrive as ISO datetimes; show the human form.
    const parsed = parseDailyNoteTitle(raw);
    const base = parsed ? formatLocalDate(parsed) : raw;
    return row.blockId ? `${base} · one block` : base;
  };

  const section = (
    name: string,
    rows: Row[],
    empty: string,
    actions: (row: Row) => JSX.Element,
  ) => (
    <section class="queue-section">
      <h3>{name}</h3>
      {rows.length === 0 ? (
        <p class="empty-note">{empty}</p>
      ) : (
        <ul class="queue-list">
          {rows.map((row) => (
            <li key={row.key}>
              <span class="queue-title">{title(row)}</span>
              <span class="queue-when">{row.when ?? ''}</span>
              <span class="queue-mode">{row.item.mode}</span>
              <span class="queue-actions">{actions(row)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <section class="queue">
      <h2>Queue</h2>
      {saveError && <div class="notice">{saveError}</div>}
      {section(
        'Scheduled next',
        upcoming,
        'Nothing scheduled yet — the queue fills as items surface.',
        (row) => (
          <>
            <button class="subtle" onClick={bringForward(row.key)}>bring forward</button>
            {row.item.mode === 'recall' && (
              <button class="subtle" onClick={retire(row.key)}>retire</button>
            )}
            <button class="subtle" onClick={reset(row.key)}>reset</button>
          </>
        ),
      )}
      {section(
        'Recently surfaced',
        recent,
        'Nothing has surfaced yet.',
        (row) => (
          <>
            {row.item.mode === 'recall' && (
              <button class="subtle" onClick={retire(row.key)}>retire</button>
            )}
          </>
        ),
      )}
      {section('Retired', retired, 'Nothing retired.', (row) => (
        <button class="subtle" onClick={restore(row.key)}>restore</button>
      ))}
    </section>
  );
}

