import { useEffect, useMemo, useState } from 'preact/hooks';
import { diffDays, formatLocalDate } from '../../engine/dates';
import { stopLearning } from '../../engine/learn';
import { removeNoteFromSets } from '../../engine/studySets';
import type { PersistedDoc, StructureDef, TagDef } from '../../engine/provider';
import type { AppData } from '../App';
import { DELETED_TITLE, displayTitle, rowsOf, useTitles } from './scheduleShared';
import { StudySets } from './StudySets';

/**
 * Learn: the specific cadence. Only for material with a real date
 * attached: reviews are scheduled as a ratio of the time remaining, so
 * the gaps tighten as the date approaches. The date comes from a study
 * set (one date for a group of notes) or from a date property on the
 * note. Deliberately minimal: this is not a flashcard app, and notes
 * return to Recall once the date passes.
 */
export function Learn({ data }: { data: AppData }) {
  const [, setTick] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<TagDef[] | null>(null);
  const [structures, setStructures] = useState<StructureDef[] | null>(null);

  const state = data.manager.current.state;
  const config = data.manager.current.config;

  useEffect(() => {
    let cancelled = false;
    void data.session.provider.listTags().then((tags) => {
      if (!cancelled) setAllTags(tags);
    });
    void data.session.provider.listStructures().then((found) => {
      if (!cancelled) setStructures(found);
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  const learning = useMemo(
    () =>
      rowsOf(
        state.items,
        (i) => (i.mode === 'learn' ? i.nextDue : null),
        (i) => i.mode === 'learn',
        true,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.items, state.updatedAt],
  );
  const titles = useTitles(data, learning);

  const change = (fn: (doc: PersistedDoc) => void): void => {
    data.manager.mutate(fn);
    setTick((t) => t + 1);
    data.manager.flush().catch(() => {
      setSaveError('Saving the change failed. It will try again on the next run.');
    });
  };

  const toggleAssignTag = (name: string, on: boolean): void => {
    change((doc) => {
      const set = new Set(doc.config.learn.assignByTag);
      if (on) set.add(name);
      else set.delete(name);
      doc.config.learn.assignByTag = [...set];
    });
  };

  return (
    <section class="learn-view">
      <header class="view-head">
        <div class="view-head-icon learn-tint" aria-hidden="true">
          ◎
        </div>
        <div>
          <h1>Learn</h1>
          <p class="fineprint">
            For notes you want to know by a certain day, like a talk or an exam.
            Each review is scheduled at{' '}
            {Math.round(config.learn.targetRatio * 100)}% of the time remaining
            (never sooner than {config.learn.minGapDays} days), so reviews come
            closer together as the date gets near. After the date, a note goes
            back to Recall if it carries a Recall tag. For real memorization,
            use Anki. Learn is for notes you already have.
          </p>
        </div>
      </header>
      {saveError && <div class="notice">{saveError}</div>}

      {!config.learn.enabled ? (
        <div class="setup-card">
          <h2 class="sub">Learn mode is off</h2>
          <p>
            Turn it on to give a few notes a schedule that aims at a date.
            Nothing changes for the rest of your space.
          </p>
          <button
            class="primary"
            onClick={() =>
              change((doc) => {
                doc.config.learn.enabled = true;
              })
            }
          >
            Turn on Learn mode
          </button>
        </div>
      ) : (
        <>
          <StudySets
            data={data}
            tags={allTags}
            structures={structures}
            change={change}
            refresh={() => setTick((n) => n + 1)}
          />

          <section class="queue-section">
            <h2 class="sub">Learning toward a date</h2>
            {learning.length === 0 ? (
              <p class="empty-note">Nothing here yet. Add a study set above.</p>
            ) : (
              <ul class="queue-list learn-list">
                {learning.map((row) => {
                  if (row.item.mode !== 'learn') return null;
                  const target = row.item.targetDate;
                  const daysLeft = diffDays(target, data.today);
                  const due = row.item.nextDue;
                  const dueIn = due ? diffDays(due, data.today) : null;
                  // The first set is the one whose date it studies toward.
                  const setNames = (row.item.setIds ?? [])
                    .map((id) => config.learn.sets.find((s) => s.id === id)?.name)
                    .filter((name): name is string => name !== undefined);
                  return (
                    <li key={row.key}>
                      <span class="queue-title">
                        {displayTitle(titles, row)}
                        {setNames[0] !== undefined && (
                          <span class="chip set-chip">
                            {setNames[0]}
                            {setNames.length > 1 ? ` +${setNames.length - 1} more` : ''}
                          </span>
                        )}
                      </span>
                      <span class="learn-facts">
                        <span class={`chip learn-chip${dueIn !== null && dueIn <= 0 ? ' due' : ''}`}>
                          {dueIn === null
                            ? 'unscheduled'
                            : dueIn <= 0
                              ? 'review due'
                              : `review in ${dueIn}d`}
                        </span>
                        <span class="queue-when">
                          target {formatLocalDate(target)}
                          {daysLeft >= 0 ? ` · ${daysLeft}d away` : ' · passed'}
                        </span>
                      </span>
                      <span class="queue-actions">
                        {titles[row.objectId] === DELETED_TITLE ? (
                          <button
                            class="subtle"
                            onClick={() =>
                              change((doc) => {
                                // Deleted in Capacities: out of its sets and out of Learn.
                                removeNoteFromSets(doc.config.learn, row.objectId);
                                delete doc.state.items[row.key];
                              })
                            }
                          >
                            remove (deleted in Capacities)
                          </button>
                        ) : (
                          <button
                            class="subtle"
                            onClick={() =>
                              change((doc) => {
                                const item = doc.state.items[row.key];
                                if (item?.mode === 'learn') item.nextDue = data.today;
                              })
                            }
                          >
                            review now
                          </button>
                        )}
                        <button
                          class="subtle"
                          onClick={() =>
                            change((doc) => stopLearning(doc.state, row.key, doc.config.recall))
                          }
                        >
                          stop learning
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <details class="setup-card slim property-dates">
            <summary>Dates from a property</summary>
            <p>
              A note can carry its own date instead of belonging to a study set.
              Everything with a chosen tag joins, using the date property mapped in{' '}
              <a href="#/settings">settings</a>
              {config.learn.targetDateProperty
                ? ` (currently “${config.learn.targetDateProperty}”)`
                : ' (no date property mapped yet)'}
              . A note without that date stays out of Learn.
            </p>
            {allTags && allTags.length > 0 && (
              <span class="tag-grid">
                {allTags.map((tag) => {
                  const on = config.learn.assignByTag.includes(tag.name);
                  return (
                    <label key={tag.id} class={`tag-chip${on ? ' on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) =>
                          toggleAssignTag(tag.name, (e.target as HTMLInputElement).checked)
                        }
                      />
                      {tag.name}
                    </label>
                  );
                })}
              </span>
            )}
            <p class="fineprint">
              To study a single note toward a date of its own, use “learn this” on any row in{' '}
              <a href="#/recall">Recall</a>.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
