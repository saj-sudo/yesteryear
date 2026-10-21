import { useEffect, useState } from 'preact/hooks';
import { formatLocalDate, parseDailyNoteTitle } from '../../engine/dates';
import type { ObjectSummary, Provider, StructureDef } from '../../engine/provider';
import type { StudySetNote } from '../../engine/types';

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
      </div>

      {shown.length > 0 && (
        <>
          <div class="finder-bar">
            <span class="fineprint">
              {shown.length} shown{shown.length >= SEARCH_LIMIT ? ' (narrow it down for more)' : ''}
            </span>
            <button type="button" class="subtle" onClick={toggleAllShown}>
              {allShownPicked ? 'Unpick all shown' : 'Pick all shown'}
            </button>
          </div>
          <ul class="finder-results">
            {shown.map((note) => (
              <li key={note.id}>
                <label class="finder-row">
                  <input
                    type="checkbox"
                    checked={pickedIds.has(note.id)}
                    onChange={(e) => toggle(note, (e.target as HTMLInputElement).checked)}
                  />
                  <span class="finder-title">{noteLabel(note.title)}</span>
                  {typeTitle.get(note.structureId) && (
                    <span class="chip">{typeTitle.get(note.structureId)}</span>
                  )}
                </label>
              </li>
            ))}
          </ul>
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
