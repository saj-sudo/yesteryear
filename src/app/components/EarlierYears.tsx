import { useEffect, useMemo, useState } from 'preact/hooks';
import { addDays, isLocalDate, monthDayOf, yearOf } from '../../engine/dates';
import type { DailyNoteRef } from '../../engine/temporal';
import type { LocalDate } from '../../engine/types';
import { Markdown } from './Markdown';

/**
 * The same day in earlier years: the daily note written on this date in
 * each past year that has one, most recent first. It sits under the pair
 * on Today. The arrows walk to neighbouring days. Years with nothing
 * written are left out, so the section never reads as a tally of gaps.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function prettyDay(date: LocalDate): string {
  return `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8))}`;
}

export function EarlierYears(props: {
  today: LocalDate;
  notes: Map<string, DailyNoteRef>;
  getMarkdown: (id: string) => Promise<string | null>;
  deepLink: (id: string) => string;
  isDemo: boolean;
}) {
  const [day, setDay] = useState<LocalDate>(props.today);
  const [bodies, setBodies] = useState<Record<string, string | null>>({});

  const entries = useMemo(() => {
    const out: { year: number; note: DailyNoteRef }[] = [];
    const first = Math.min(...[...props.notes.keys()].map((d) => Number(d.slice(0, 4))));
    for (let year = yearOf(props.today); year >= first; year -= 1) {
      const date = `${year}-${monthDayOf(day)}`;
      if (!isLocalDate(date) || date >= props.today) continue;
      const note = props.notes.get(date);
      if (note) out.push({ year, note });
    }
    return out;
  }, [props.notes, props.today, day]);

  useEffect(() => {
    let cancelled = false;
    for (const entry of entries) {
      if (bodies[entry.note.id] === undefined) {
        void props.getMarkdown(entry.note.id).then((md) => {
          if (!cancelled) setBodies((prev) => ({ ...prev, [entry.note.id]: md }));
        });
      }
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  if (props.notes.size === 0) return null;

  return (
    <section class="earlier" aria-labelledby="earlier-heading">
      <header class="earlier-head">
        <h2 id="earlier-heading">{prettyDay(day)} in earlier years</h2>
        <div class="earlier-nav">
          {day !== props.today && (
            <button class="quiet" onClick={() => setDay(props.today)}>
              back to today
            </button>
          )}
          <button class="quiet step" aria-label="Previous day" onClick={() => setDay(addDays(day, -1))}>
            ←
          </button>
          <button class="quiet step" aria-label="Next day" onClick={() => setDay(addDays(day, 1))}>
            →
          </button>
        </div>
      </header>

      {entries.length === 0 ? (
        <p class="empty-note">Nothing was written on this day in earlier years.</p>
      ) : (
        <div class="earlier-list">
          {entries.map(({ year, note }) => (
            <article class="earlier-year" key={year}>
              <h3>
                {props.isDemo ? (
                  year
                ) : (
                  <a href={props.deepLink(note.id)} target="_blank" rel="noreferrer">
                    {year}
                  </a>
                )}
              </h3>
              {bodies[note.id] === undefined ? (
                <p class="loading">…</p>
              ) : bodies[note.id] ? (
                <div class="note-text">
                  <Markdown text={bodies[note.id]!} />
                </div>
              ) : (
                <p class="empty-note">(no content)</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
