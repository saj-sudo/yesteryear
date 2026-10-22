import { useState } from 'preact/hooks';
import { formatLocalDate, isLocalDate, parseDailyNoteTitle } from '../../engine/dates';
import { listSetMembers, syncLearn, type SetMember } from '../../engine/orchestrate';
import type { PersistedDoc, StructureDef, TagDef } from '../../engine/provider';
import { addStudySet, removeStudySet, studySetStatus, updateStudySet } from '../../engine/studySets';
import type { LocalDate, StudySet, StudySetNote } from '../../engine/types';
import {
  DAILY_NOTE_STRUCTURE_ID,
  isBasicStructure,
  PAGE_STRUCTURE_ID,
} from '../../providers/capacities/constants';
import type { AppData } from '../App';
import { NoteFinder } from './NoteFinder';

interface Draft {
  /** The set being edited, or null for a new one. */
  id: string | null;
  name: string;
  date: string;
  tags: string[];
  types: string[];
  notes: StudySetNote[];
}

const blank = (): Draft => ({ id: null, name: '', date: '', tags: [], types: [], notes: [] });

const fromSet = (set: StudySet): Draft => ({
  id: set.id,
  name: set.name,
  date: set.targetDate,
  tags: [...set.tags],
  types: [...set.types],
  notes: set.notes.map((n) => ({ ...n })),
});

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

function selectionOf(set: StudySet): string {
  const parts: string[] = [];
  if (set.tags.length > 0) parts.push(`${plural(set.tags.length, 'tag')}: ${set.tags.join(', ')}`);
  if (set.types.length > 0) parts.push(`${plural(set.types.length, 'type')}: ${set.types.join(', ')}`);
  if (set.notes.length > 0) parts.push(`${plural(set.notes.length, 'note')} picked`);
  return parts.length > 0 ? parts.join(' · ') : 'Nothing selected yet';
}

function whenOf(set: StudySet, today: LocalDate): string {
  const { status, days } = studySetStatus(set, today);
  const date = formatLocalDate(set.targetDate);
  if (status === 'today') return `${date} · today`;
  if (status === 'passed') return `${date} · passed`;
  return `${date} · ${days}d away`;
}

/** How many notes a set's list shows before it says how many more there are. */
const NOTES_SHOWN = 100;

interface Viewing {
  id: string;
  members: SetMember[] | null;
  warnings: string[];
  failed: boolean;
}

const noteLabel = (title: string): string => {
  const date = parseDailyNoteTitle(title);
  return date ? formatLocalDate(date) : title;
};

const toggleIn = (list: string[], name: string, on: boolean): string[] =>
  on ? [...new Set([...list, name])] : list.filter((x) => x !== name);

/**
 * Study sets: groups of notes that share one date, like the notes for
 * an exam. A set picks its notes by tag, by type, or one by one, and
 * moving its date moves every note in it. After the date passes the
 * set stays, ready to be given a new date for the next exam.
 */
export function StudySets(props: {
  data: AppData;
  tags: TagDef[] | null;
  structures: StructureDef[] | null;
  /** Apply a change to the document, redraw and save it. */
  change: (fn: (doc: PersistedDoc) => void) => void;
  /** Redraw after state changed underneath. */
  refresh: () => void;
}) {
  const { data, tags, structures, change, refresh } = props;
  const [draft, setDraft] = useState<Draft | null>(null);
  const [redate, setRedate] = useState<{ id: string; value: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState<Viewing | null>(null);

  const today = data.today;
  const sets = [...data.manager.current.config.learn.sets].sort((a, b) => {
    const aPassed = a.targetDate < today ? 1 : 0;
    const bPassed = b.targetDate < today ? 1 : 0;
    return aPassed - bPassed || a.targetDate.localeCompare(b.targetDate) || a.id.localeCompare(b.id);
  });

  const customTypes = (structures ?? []).filter((s) => !isBasicStructure(s.id));
  const finderTypes = (structures ?? []).filter(
    (s) =>
      !isBasicStructure(s.id) || s.id === PAGE_STRUCTURE_ID || s.id === DAILY_NOTE_STRUCTURE_ID,
  );

  /** Put the new selections to work now, instead of at tomorrow's run. */
  const apply = async (done: string): Promise<void> => {
    setBusy(true);
    try {
      const { warnings } = await syncLearn({
        provider: data.session.provider,
        manager: data.manager,
        today,
      });
      setMessage(warnings.length > 0 ? `${done} ${warnings[0]}` : done);
    } catch {
      setMessage(
        `${done} The notes could not be updated just now, so they will update at the next daily run.`,
      );
    } finally {
      setBusy(false);
      refresh();
    }
  };

  /** Look up what a set holds right now. Only reads; nothing is saved. */
  const toggleNotes = async (set: StudySet): Promise<void> => {
    if (viewing?.id === set.id) {
      setViewing(null);
      return;
    }
    setViewing({ id: set.id, members: null, warnings: [], failed: false });
    try {
      const { members, warnings } = await listSetMembers(data.session.provider, set);
      setViewing((v) => (v?.id === set.id ? { id: set.id, members, warnings, failed: false } : v));
    } catch {
      setViewing((v) => (v?.id === set.id ? { id: set.id, members: [], warnings: [], failed: true } : v));
    }
  };

  const draftValid = draft !== null && draft.name.trim() !== '' && isLocalDate(draft.date);

  const save = async (): Promise<void> => {
    if (!draft || !draftValid) return;
    const d = draft;
    const name = d.name.trim();
    change((doc) => {
      const fields = {
        name,
        targetDate: d.date as LocalDate,
        tags: d.tags,
        types: d.types,
        notes: d.notes,
      };
      if (d.id) updateStudySet(doc.config.learn, d.id, fields);
      else addStudySet(doc.config.learn, fields);
    });
    setDraft(null);
    await apply(`Saved “${name}”.`);
  };

  const saveDate = async (set: StudySet): Promise<void> => {
    if (!redate || redate.id !== set.id || !isLocalDate(redate.value)) return;
    const value = redate.value as LocalDate;
    change((doc) => updateStudySet(doc.config.learn, set.id, { targetDate: value }));
    setRedate(null);
    await apply(`“${set.name}” now aims at ${formatLocalDate(value)}.`);
  };

  const remove = async (set: StudySet): Promise<void> => {
    change((doc) => removeStudySet(doc.config.learn, set.id));
    setConfirmDelete(null);
    await apply(`Deleted “${set.name}”. Its notes left Learn.`);
  };

  const chips = (
    names: string[],
    chosen: string[],
    onToggle: (name: string, on: boolean) => void,
    emptyText: string,
  ) => {
    const missing = chosen.filter((c) => !names.includes(c));
    const all = [...names, ...missing];
    if (all.length === 0) return <p class="fineprint">{emptyText}</p>;
    return (
      <span class="tag-grid">
        {all.map((name) => {
          const on = chosen.includes(name);
          return (
            <label key={name} class={`tag-chip${on ? ' on' : ''}`}>
              <input
                type="checkbox"
                checked={on}
                onChange={(e) => onToggle(name, (e.target as HTMLInputElement).checked)}
              />
              {name}
              {missing.includes(name) ? ' (not in this space)' : ''}
            </label>
          );
        })}
      </span>
    );
  };

  const editor = draft && (
    <div class="setup-card set-editor">
      <h3>{draft.id ? 'Edit study set' : 'New study set'}</h3>
      <div class="field-row">
        <label class="field">
          <span>Name</span>
          <input
            type="text"
            value={draft.name}
            placeholder="e.g. Spanish B1 exam"
            onInput={(e) => setDraft({ ...draft, name: (e.target as HTMLInputElement).value })}
          />
        </label>
        <label class="field">
          <span>Date</span>
          <input
            type="date"
            value={draft.date}
            onInput={(e) => setDraft({ ...draft, date: (e.target as HTMLInputElement).value })}
          />
        </label>
      </div>
      <p class="fineprint">
        The reviews come closer together as this day gets near.
        {isLocalDate(draft.date) && draft.date < today
          ? ' That date has passed, so nothing will study toward it until you pick a later one.'
          : ''}
      </p>

      <h4>Which notes?</h4>
      <p class="fineprint">
        Use any mix. A tag or a type picks up new notes on its own; notes you pick stay until
        you remove them.
      </p>
      <fieldset class="set-group">
        <legend>By tag</legend>
        {chips(
          (tags ?? []).map((t) => t.name),
          draft.tags,
          (name, on) => setDraft({ ...draft, tags: toggleIn(draft.tags, name, on) }),
          'This space has no tags.',
        )}
      </fieldset>
      <fieldset class="set-group">
        <legend>By type</legend>
        {chips(
          customTypes.map((s) => s.title),
          draft.types,
          (name, on) => setDraft({ ...draft, types: toggleIn(draft.types, name, on) }),
          'This space has no custom types.',
        )}
      </fieldset>
      <fieldset class="set-group">
        <legend>One by one</legend>
        <NoteFinder
          provider={data.session.provider}
          types={finderTypes}
          picked={draft.notes}
          onChange={(notes) => setDraft({ ...draft, notes })}
        />
      </fieldset>

      <div class="settings-actions">
        <button class="primary" disabled={!draftValid || busy} onClick={() => void save()}>
          Save study set
        </button>
        <button class="subtle" onClick={() => setDraft(null)}>
          cancel
        </button>
        {!draftValid && (
          <span class="fineprint">A name and a date are needed.</span>
        )}
      </div>
    </div>
  );

  const card = (set: StudySet) => {
    const { status } = studySetStatus(set, today);
    const passed = status === 'passed';
    const editingDate = redate?.id === set.id;
    return (
      <li key={set.id} class={`set-card${passed ? ' passed' : ''}`}>
        <div class="set-head">
          <h3>{set.name}</h3>
          <span class={`chip${passed ? '' : ' learn-chip'}`}>{whenOf(set, today)}</span>
        </div>
        <p class="fineprint">{selectionOf(set)}</p>
        {viewing?.id === set.id && (
          <div class="set-notes">
            {viewing.members === null ? (
              <p class="fineprint">Looking up the notes…</p>
            ) : viewing.failed ? (
              <p class="fineprint">The notes could not be looked up just now.</p>
            ) : (
              <>
                {viewing.warnings.map((w) => (
                  <p key={w} class="fineprint">
                    {w}
                  </p>
                ))}
                {viewing.members.length === 0 ? (
                  <p class="fineprint">Nothing in this set yet.</p>
                ) : (
                  <ul>
                    {viewing.members.slice(0, NOTES_SHOWN).map((m) => (
                      <li key={m.id}>
                        <a
                          href={data.session.provider.deepLink(m.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {noteLabel(m.title)}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
                {viewing.members.length > NOTES_SHOWN && (
                  <p class="fineprint">and {viewing.members.length - NOTES_SHOWN} more</p>
                )}
              </>
            )}
          </div>
        )}
        {passed && !editingDate && (
          <p class="fineprint">
            This date has passed, so the notes left Learn. Give the set a new date to study them
            again.
          </p>
        )}
        {editingDate && (
          <div class="set-redate">
            <label class="field">
              <span>{passed ? 'New date' : 'Date'}</span>
              <input
                type="date"
                value={redate.value}
                onInput={(e) =>
                  setRedate({ id: set.id, value: (e.target as HTMLInputElement).value })
                }
              />
            </label>
            <button
              class="primary"
              disabled={!isLocalDate(redate.value) || busy}
              onClick={() => void saveDate(set)}
            >
              Save date
            </button>
            <button class="subtle" onClick={() => setRedate(null)}>
              cancel
            </button>
          </div>
        )}
        {!editingDate && (
          <div class="queue-actions set-actions">
            <button class="subtle" onClick={() => void toggleNotes(set)}>
              {viewing?.id === set.id ? 'hide notes' : 'show notes'}
            </button>
            <button
              class={passed ? 'primary' : 'subtle'}
              onClick={() => setRedate({ id: set.id, value: passed ? '' : set.targetDate })}
            >
              {passed ? 'Study again with a new date' : 'change date'}
            </button>
            <button class="subtle" onClick={() => setDraft(fromSet(set))}>
              edit notes
            </button>
            <button
              class="subtle"
              onClick={() => setDraft({ ...fromSet(set), id: null, name: `${set.name} (copy)`, date: '' })}
            >
              duplicate
            </button>
            {confirmDelete === set.id ? (
              <>
                <button class="subtle" onClick={() => void remove(set)}>
                  yes, delete
                </button>
                <button class="subtle" onClick={() => setConfirmDelete(null)}>
                  keep
                </button>
              </>
            ) : (
              <button class="subtle" onClick={() => setConfirmDelete(set.id)}>
                delete
              </button>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <section class="study-sets">
      <div class="set-section-head">
        <h2 class="sub">Study sets</h2>
        {!draft && (
          <button class="primary" onClick={() => setDraft(blank())}>
            New study set
          </button>
        )}
      </div>
      <p class="fineprint">
        A study set is a group of notes that share one date, like the notes for an exam. Pick
        them by tag, by type or one by one. Changing the date moves every note in the set.
      </p>
      {message && <div class="notice">{message}</div>}
      {editor}
      {sets.length === 0 && !draft ? (
        <p class="empty-note">No study sets yet.</p>
      ) : (
        <ul class="set-list">{sets.filter((s) => s.id !== draft?.id).map(card)}</ul>
      )}
    </section>
  );
}
