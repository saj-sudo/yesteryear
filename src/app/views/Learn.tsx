import { useEffect, useMemo, useState } from 'preact/hooks';
import { diffDays, formatLocalDate } from '../../engine/dates';
import { stopLearning } from '../../engine/learn';
import type { TagDef } from '../../engine/provider';
import type { AppData } from '../App';
import { displayTitle, rowsOf, useTitles } from './scheduleShared';

/**
 * Learn — the specific cadence. Only for material with a real date
 * attached: reviews are scheduled as a ratio of the time remaining, so
 * the gaps tighten as the date approaches. Deliberately minimal — this
 * is not a flashcard app — and everything reverts to Recall once the
 * date passes.
 */
export function Learn({ data }: { data: AppData }) {
  const [, setTick] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<TagDef[] | null>(null);

  const state = data.manager.current.state;
  const config = data.manager.current.config;

  useEffect(() => {
    let cancelled = false;
    void data.session.provider.listTags().then((tags) => {
      if (!cancelled) setAllTags(tags);
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

  const change = (fn: (doc: typeof data.manager.current) => void): void => {
    data.manager.mutate(fn);
    setTick((t) => t + 1);
    data.manager.flush().catch(() => {
      setSaveError('Saving the change failed — it will retry on the next run.');
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
          <h2>Learn</h2>
          <p class="fineprint">
            The specific cadence, for material with a real date attached — a
            talk, an exam, a trip. Each review is scheduled at{' '}
            {Math.round(config.learn.targetRatio * 100)}% of the time remaining
            (never sooner than {config.learn.minGapDays} days), so the rhythm
            tightens as the date approaches. Afterwards, everything returns to
            Recall. For serious memorization, use Anki — this is for notes you
            already have.
          </p>
        </div>
      </header>
      {saveError && <div class="notice">{saveError}</div>}

      {!config.learn.enabled ? (
        <div class="setup-card">
          <h3>Learn mode is off</h3>
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
          <div class="setup-card slim">
            <h3>Three ways in</h3>
            <ol class="ways-in">
              <li>
                <strong>Flag one item:</strong> use “learn this” on any row in{' '}
                <a href="#/recall">Recall</a> and give it a target date.
              </li>
              <li>
                <strong>By tag:</strong> everything carrying a chosen tag joins,
                using the date property mapped in{' '}
                <a href="#/settings">settings</a>
                {config.learn.targetDateProperty
                  ? ` (currently “${config.learn.targetDateProperty}”)`
                  : ' (no date property mapped yet)'}
                .
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
              </li>
              <li>
                <strong>By type:</strong> assign a whole object type in{' '}
                <a href="#/settings">settings</a>.
              </li>
            </ol>
            <p class="fineprint">
              Items without a resolvable target date simply stay in Recall —
              a date is never invented.
            </p>
          </div>

          <section class="queue-section">
            <h3>Learning toward a date</h3>
            {learning.length === 0 ? (
              <p class="empty-note">Nothing here yet — pick a way in above.</p>
            ) : (
              <ul class="queue-list learn-list">
                {learning.map((row) => {
                  if (row.item.mode !== 'learn') return null;
                  const target = row.item.targetDate;
                  const daysLeft = diffDays(target, data.today);
                  const due = row.item.nextDue;
                  const dueIn = due ? diffDays(due, data.today) : null;
                  return (
                    <li key={row.key}>
                      <span class="queue-title">{displayTitle(titles, row)}</span>
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
        </>
      )}
    </section>
  );
}
