import { useEffect, useRef, useState } from 'preact/hooks';
import { formatLocalDate, parseDailyNoteTitle } from '../../engine/dates';
import type { ObjectSummary, Provider, StructureDef } from '../../engine/provider';
import type { StudySetNote } from '../../engine/types';
import { pickRange, tapRange } from './pickRange';

const SEARCH_LIMIT = 30;
const BROWSE_LIMIT = 60;
const TYPING_PAUSE_MS = 300;

/** Daily note titles read better as dates. */
export function noteLabel(title: string): string {
  const day = parseDailyNoteTitle(title);
  if (day) return formatLocalDate(day);
  return title.length > 0 ? title : '(untitled)';
}

/**
 * Pick notes for a study set: search the space, or choose a type and
 * browse it, then tick as many as you like. The picked notes stay listed
 * underneath so a search for something else cannot lose them.
 */
export function NoteFinder(props: {
  provider: Provider;
  /** Types offered as a filter. */
  types: StructureDef[];
  picked: StudySetNote[];
  onChange: (next: StudySetNote[]) => void;
}) {
  const { provider, types, picked, onChange } = props;
  const [query, setQuery] = useState('');
  const [typeId, setTypeId] = useState('');
  const [results, setResults] = useState<ObjectSummary[] | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  /** "Pick a range" mode: tap the first note, then the last. */
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeStart, setRangeStart] = useState<number | null>(null);
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(
    null,
  );
  const listRef = useRef<HTMLUListElement>(null);
  /** Row last picked or unpicked: where a shift-click range starts. */
  const anchor = useRef<number | null>(null);
  const shiftHeld = useRef(false);
  const suppressClick = useRef(false);
  const drag = useRef<{
    start: number;
    on: boolean;
    base: StudySetNote[];
    x: number;
    y: number;
    active: boolean;
  } | null>(null);

  useEffect(() => {
    const text = query.trim();
    if (text === '' && typeId === '') {
      setResults(null);
      setStatus('idle');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    const timer = setTimeout(
      () => {
        void (async () => {
          try {
            let found: ObjectSummary[] = [];
            if (text !== '') {
              found = await provider.searchObjects(text, {
                limit: SEARCH_LIMIT,
                ...(typeId !== '' ? { structureId: typeId } : {}),
              });
            } else {
              for await (const summary of provider.listObjectsByStructure(typeId)) {
                found.push(summary);
                if (found.length >= BROWSE_LIMIT) break;
              }
            }
            if (cancelled) return;
            anchor.current = null;
            setRangeMode(false);
            setRangeStart(null);
            setResults(found);
            setStatus('idle');
          } catch {
            if (!cancelled) setStatus('error');
          }
        })();
      },
      text === '' ? 0 : TYPING_PAUSE_MS,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [provider, query, typeId]);

  const pickedIds = new Set(picked.map((n) => n.id));
  const typeTitle = new Map(types.map((t) => [t.id, t.title]));
  const shown = results ?? [];
  const allShownPicked = shown.length > 0 && shown.every((r) => pickedIds.has(r.id));

  const toggle = (note: ObjectSummary, on: boolean): void => {
    if (on) {
      if (!pickedIds.has(note.id)) onChange([...picked, { id: note.id, title: note.title }]);
    } else {
      onChange(picked.filter((n) => n.id !== note.id));
    }
  };

  const toggleRange = (): void => {
    setRangeMode((on) => !on);
    setRangeStart(null);
  };

  /** A tap on a row while picking a range. */
  const onRangeTap = (index: number): void => {
    const step = tapRange(rangeStart, index, picked, shown);
    setRangeStart(step.start);
    if (step.start === null) {
      onChange(step.picked);
      setRangeMode(false);
      anchor.current = index;
    }
  };

  const toggleAllShown = (): void => {
    if (allShownPicked) {
      const drop = new Set(shown.map((r) => r.id));
      onChange(picked.filter((n) => !drop.has(n.id)));
    } else {
      onChange([
        ...picked,
        ...shown
          .filter((r) => !pickedIds.has(r.id))
          .map((r) => ({ id: r.id, title: r.title })),
      ]);
    }
  };

  const rowOf = (el: EventTarget | null): number => {
    const list = listRef.current;
    const li = el instanceof Element ? el.closest('li') : null;
    return list && li ? [...list.children].indexOf(li) : -1;
  };

  /** The row under a vertical pointer position (the first or last past the ends). */
  const rowAt = (clientY: number): number => {
    const rows = [...(listRef.current?.children ?? [])];
    let found = 0;
    rows.forEach((row, i) => {
      if (clientY >= row.getBoundingClientRect().top) found = i;
    });
    return found;
  };

  /* Drag across rows to pick (or unpick) all of them, with a box as feedback.
     Mouse and pen only: on a touch screen a drag scrolls the list. */
  const onPointerDown = (e: PointerEvent): void => {
    suppressClick.current = false;
    if (rangeMode || e.pointerType === 'touch' || e.button !== 0) return;
    const index = rowOf(e.target);
    const note = shown[index];
    if (!note) return;
    drag.current = {
      start: index,
      on: !pickedIds.has(note.id),
      base: picked,
      x: e.clientX,
      y: e.clientY,
      active: false,
    };
  };

  const onPointerMove = (e: PointerEvent): void => {
    const d = drag.current;
    const list = listRef.current;
    if (!d || !list) return;
    if (!d.active) {
      if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) < 6) return;
      d.active = true;
      list.setPointerCapture(e.pointerId);
      window.getSelection()?.removeAllRanges();
    }
    const edge = list.getBoundingClientRect();
    if (e.clientY < edge.top + 24) list.scrollTop -= 14;
    else if (e.clientY > edge.bottom - 24) list.scrollTop += 14;
    const index = rowAt(e.clientY);
    onChange(pickRange(d.base, shown, d.start, index, d.on));
    const frame = list.parentElement?.getBoundingClientRect();
    if (frame) {
      setBox({
        left: Math.min(d.x, e.clientX) - frame.left,
        top: Math.min(d.y, e.clientY) - frame.top,
        width: Math.abs(e.clientX - d.x),
        height: Math.abs(e.clientY - d.y),
      });
    }
    e.preventDefault();
  };

  const endDrag = (): void => {
    const d = drag.current;
    drag.current = null;
    setBox(null);
    if (d?.active) {
      suppressClick.current = true; // the release would otherwise toggle a row
      anchor.current = d.start;
    }
  };

  /* Keyboard: arrows move between rows, shift with arrows picks as you go,
     and Ctrl or Cmd with A picks everything shown. */
  const onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return;
    const index = rowOf(target);
    if (index < 0) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      onChange(pickRange(picked, shown, 0, shown.length - 1, true));
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const next = Math.max(0, Math.min(shown.length - 1, index + (e.key === 'ArrowDown' ? 1 : -1)));
    if (e.shiftKey) {
      onChange(pickRange(picked, shown, index, next, true));
      anchor.current = next;
    }
    const field = listRef.current?.children[next]?.querySelector('input');
    field?.focus();
  };

  return (
    <div class="finder">
      <div class="finder-controls">
        <label class="field">
          <span>Search your notes</span>
          <input
            type="text"
            value={query}
            placeholder="a word from the title or the note"
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          <span>Only this type</span>
          <select
            value={typeId}
            onChange={(e) => setTypeId((e.target as HTMLSelectElement).value)}
          >
            <option value="">Any type</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div aria-live="polite">
        {status === 'loading' && <p class="fineprint">Searching…</p>}
        {status === 'error' && (
          <p class="fineprint">The search did not finish. Try again in a moment.</p>
        )}
        {status === 'idle' && results === null && (
          <p class="fineprint">
            Type a word to search, or choose a type to browse its notes.
          </p>
        )}
        {status === 'idle' && results !== null && results.length === 0 && (
          <p class="fineprint">No notes found.</p>
        )}
        {rangeMode && (
          <p class="fineprint range-status">
            {rangeStart === null
              ? 'Tap the first note of the range.'
              : `Tap the last note of the range. It starts at ${noteLabel(shown[rangeStart]?.title ?? '')}.`}
          </p>
        )}
      </div>

      {shown.length > 0 && (
        <>
          <div class="finder-bar">
            <span class="fineprint">
              {shown.length} shown{shown.length >= SEARCH_LIMIT ? ' (narrow it down for more)' : ''}
            </span>
            <span class="finder-actions">
              <button
                type="button"
                class="subtle"
                aria-pressed={rangeMode}
                onClick={toggleRange}
              >
                Pick a range
              </button>
              <button type="button" class="subtle" onClick={toggleAllShown}>
                {allShownPicked ? 'Unpick all shown' : 'Pick all shown'}
              </button>
            </span>
          </div>
          <div class="finder-box">
            <ul
              ref={listRef}
              class="finder-results"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onClickCapture={(e) => {
                if (!suppressClick.current) return;
                suppressClick.current = false;
                e.preventDefault();
                e.stopPropagation();
              }}
              onKeyDown={onKeyDown}
            >
              {shown.map((note, i) => (
                <li key={note.id} class={rangeStart === i ? 'range-start' : ''}>
                  <label class="finder-row">
                    <input
                      type="checkbox"
                      checked={pickedIds.has(note.id)}
                      onClick={(e) => {
                        shiftHeld.current = e.shiftKey;
                      }}
                      onChange={(e) => {
                        const on = (e.target as HTMLInputElement).checked;
                        if (rangeMode) {
                          // The tap marks a range end, so the box itself stays as it was.
                          (e.target as HTMLInputElement).checked = pickedIds.has(note.id);
                          onRangeTap(i);
                          return;
                        }
                        if (shiftHeld.current && anchor.current !== null) {
                          onChange(pickRange(picked, shown, anchor.current, i, on));
                        } else {
                          toggle(note, on);
                        }
                        anchor.current = i;
                        shiftHeld.current = false;
                      }}
                    />
                    <span class="finder-title">{noteLabel(note.title)}</span>
                    {typeTitle.get(note.structureId) && (
                      <span class="chip">{typeTitle.get(note.structureId)}</span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
            {box && (
              <div
                class="finder-marquee"
                aria-hidden="true"
                style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
              />
            )}
          </div>
          <p class="fineprint finder-hint">
            On a computer: shift-click picks a range, dragging across rows picks several, the arrow
            keys move between rows (with shift they pick as they go), and Ctrl or Cmd with A picks
            everything shown.
          </p>
        </>
      )}

      {picked.length > 0 && (
        <div class="finder-picked">
          <div class="finder-bar">
            <strong>
              Picked ({picked.length})
            </strong>
            <button type="button" class="subtle" onClick={() => onChange([])}>
              Remove all
            </button>
          </div>
          <ul class="finder-results">
            {picked.map((note) => (
              <li key={note.id} class="finder-row">
                <span class="finder-title">{noteLabel(note.title)}</span>
                <button
                  type="button"
                  class="subtle"
                  aria-label={`Remove ${noteLabel(note.title)}`}
                  onClick={() => onChange(picked.filter((n) => n.id !== note.id))}
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
