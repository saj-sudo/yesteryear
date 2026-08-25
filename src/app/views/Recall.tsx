import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { isLocalDate } from '../../engine/dates';
import { ensureLearnScheduled } from '../../engine/learn';
import type { TagDef } from '../../engine/provider';
import { learnKey } from '../../engine/state';
import type { ItemKey, LocalDate } from '../../engine/types';
import type { AppData } from '../App';
import { displayTitle, rowsOf, useTitles, type Row } from './scheduleShared';

/**
 * Recall — the general cadence. No deadline, no memory model: a hard
 * cooldown, weighted sampling, and a slice of pure chance. This view is
 * where that rhythm becomes visible and editable, and where someone who
 * has configured nothing gets shown the one step that makes it richer.
 */
export function Recall({ data }: { data: AppData }) {
  const [, setTick] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [learnDraft, setLearnDraft] = useState<{ key: ItemKey; date: string } | null>(null);
  const [allTags, setAllTags] = useState<TagDef[] | null>(null);
  const [draftTags, setDraftTags] = useState<Set<string> | null>(null);

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

  const upcoming = useMemo(
    () =>
      rowsOf(
        state.items,
        (i) => (i.mode === 'recall' ? i.nextEligible : null),
        (i) => i.mode === 'recall' && !i.retired && i.nextEligible !== null,
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
        (i) => i.mode === 'recall' && !i.retired && i.lastSurfaced !== null,
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
  const titles = useTitles(data, [...upcoming, ...recent, ...retired]);

  const change = (fn: (doc: typeof data.manager.current) => void): void => {
    data.manager.mutate(fn);
    setTick((t) => t + 1);
    data.manager.flush().catch(() => {
      setSaveError('Saving the change failed — it will retry on the next run.');
    });
  };

  const saveTags = (): void => {
    if (!draftTags) return;
    const tags = [...draftTags];
    change((doc) => {
      doc.config.recall.tags = tags;
    });
    setDraftTags(null);
  };

  const startLearn = (): void => {
    if (!learnDraft || !isLocalDate(learnDraft.date)) return;
    const targetDate = learnDraft.date as LocalDate;
    const key = learnKey(learnDraft.key);
    change((doc) => {
      ensureLearnScheduled(doc.state, key, targetDate, data.today, doc.config.learn);
    });
    setLearnDraft(null);
  };

  const actions = (row: Row): JSX.Element => (
    <>
      <button
        class="subtle"
        onClick={() =>
          change((doc) => {
            const item = doc.state.items[row.key];
            if (item?.mode === 'recall') item.nextEligible = data.today;
          })
        }
      >
        bring forward
      </button>
      <button
        class="subtle"
        onClick={() =>
          change((doc) => {
            const item = doc.state.items[row.key];
            if (item?.mode === 'recall') {
              item.retired = true;
              item.lastResponse = 'retire';
            }
          })
        }
      >
        retire
      </button>
      {config.learn.enabled && !state.items[learnKey(row.key)] && (
        <button class="subtle" onClick={() => setLearnDraft({ key: row.key, date: '' })}>
          learn this
        </button>
      )}
      {learnDraft?.key === row.key && (
        <span class="learn-draft">
          <label>
            Target date
            <input
              type="date"
              value={learnDraft.date}
              onInput={(e) =>
                setLearnDraft({ key: row.key, date: (e.target as HTMLInputElement).value })
              }
            />
          </label>
          <button onClick={startLearn} disabled={!isLocalDate(learnDraft.date)}>
            Start learning
          </button>
          <button class="subtle" onClick={() => setLearnDraft(null)}>
            cancel
          </button>
        </span>
      )}
    </>
  );

  const section = (
    name: string,
    rows: Row[],
    empty: string,
    rowActions: (row: Row) => JSX.Element,
  ): JSX.Element => (
    <section class="queue-section">
      <h3>{name}</h3>
      {rows.length === 0 ? (
        <p class="empty-note">{empty}</p>
      ) : (
        <ul class="queue-list">
          {rows.map((row) => (
            <li key={row.key}>
              <span class="queue-title">{displayTitle(titles, row)}</span>
              <span class="queue-when">{row.when ?? ''}</span>
              <span class="queue-actions">{rowActions(row)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const tagCount = config.recall.tags.length;

  return (
    <section class="recall-view">
      <header class="view-head">
        <div class="view-head-icon recall-tint" aria-hidden="true">
          ↻
        </div>
        <div>
          <h2>Recall</h2>
          <p class="fineprint">
            The general cadence: everything worth meeting again comes back on a
            rhythm — at least {config.recall.cooldownDays} days between visits,
            weighted toward what has waited longest, with{' '}
            {Math.round(config.recall.randomShare * 100)}% pure chance mixed in.
            No deadlines, no scores; skipping is a normal state.
          </p>
        </div>
      </header>
      {saveError && <div class="notice">{saveError}</div>}

      {tagCount === 0 && (
        <div class="setup-card">
          <h3>Give Recall something to work with</h3>
          <p>
            Daily notes resurface on their own, but the rotation gets rich when
            you pick a few tags that mark notes worth meeting again — an
            “insight” tag, a “keeper” tag, whatever your space uses.
          </p>
          {allTags === null ? (
            <p class="loading">Reading your tags…</p>
          ) : allTags.length === 0 ? (
            <p class="empty-note">
              This space has no tags yet — tag a few notes in Capacities and
              they will appear here.
            </p>
          ) : (
            <>
              <div class="tag-grid">
                {allTags.map((tag) => {
                  const on = (draftTags ?? new Set<string>()).has(tag.name);
                  return (
                    <label key={tag.id} class={`tag-chip${on ? ' on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) => {
                          const next = new Set(draftTags ?? []);
                          if ((e.target as HTMLInputElement).checked) next.add(tag.name);
                          else next.delete(tag.name);
                          setDraftTags(next);
                        }}
                      />
                      {tag.name}
                    </label>
                  );
                })}
              </div>
              <button
                class="primary"
                onClick={saveTags}
                disabled={!draftTags || draftTags.size === 0}
              >
                Start resurfacing these
              </button>
            </>
          )}
        </div>
      )}

      {tagCount > 0 && (
        <p class="fineprint config-line">
          Resurfacing tags: {config.recall.tags.map((t) => (
            <span key={t} class="chip">#{t}</span>
          ))}{' '}
          <a href="#/settings">adjust in settings</a>
        </p>
      )}

      {section(
        'Scheduled next',
        upcoming,
        'Nothing scheduled yet — the rotation fills as items surface.',
        actions,
      )}
      {section('Recently surfaced', recent, 'Nothing has surfaced yet.', actions)}
      {section('Retired', retired, 'Nothing retired.', (row) => (
        <button
          class="subtle"
          onClick={() =>
            change((doc) => {
              const item = doc.state.items[row.key];
              if (item?.mode === 'recall') {
                item.retired = false;
                item.lastResponse = null;
              }
            })
          }
        >
          restore
        </button>
      ))}
    </section>
  );
}
