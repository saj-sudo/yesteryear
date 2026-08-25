import { useEffect, useMemo, useState } from 'preact/hooks';
import { addDays, isLocalDate, monthDayOf, yearOf } from '../../engine/dates';
import type { LocalDate } from '../../engine/types';
import type { DailyNoteMap } from '../../storage/cache';
import { Markdown } from '../components/Markdown';

/**
 * On This Day (§9.1, the default view): today's date across every past
 * year, one column per year, most recent first. Empty years render as
 * empty — the gaps are part of the picture.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function prettyDay(date: LocalDate): string {
  return `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8))}`;
}

export function OnThisDay(props: {
  today: LocalDate;
  notes: DailyNoteMap;
  getMarkdown: (id: string) => Promise<string | null>;
  deepLink: (id: string) => string;
  isDemo: boolean;
}) {
  const [day, setDay] = useState<LocalDate>(props.today);
  const [bodies, setBodies] = useState<Record<string, string | null>>({});

  const years = useMemo(() => {
    const noteYears = Object.keys(props.notes).map((d) => Number(d.slice(0, 4)));
    if (noteYears.length === 0) return [];
    const first = Math.min(...noteYears);
    const current = yearOf(day);
    const out: number[] = [];
    for (let y = current; y >= first; y -= 1) out.push(y);
    return out;
  }, [props.notes, day]);

  const columns = useMemo(
    () =>
      years.map((year) => {
        const date = `${year}-${monthDayOf(day)}`;
        const note = isLocalDate(date) ? props.notes[date] ?? null : null;
        return { year, date, note };
      }),
    [years, day, props.notes],
  );

  useEffect(() => {
    let cancelled = false;
    for (const col of columns) {
      if (col.note && bodies[col.note.id] === undefined) {
        void props.getMarkdown(col.note.id).then((md) => {
          if (!cancelled) {
            setBodies((prev) => ({ ...prev, [col.note!.id]: md }));
          }
        });
      }
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns]);

  return (
    <section class="on-this-day">
      <header class="day-nav">
        <button aria-label="Previous day" onClick={() => setDay(addDays(day, -1))}>
          ←
        </button>
        <h2>
          {prettyDay(day)}
          {day !== props.today && (
            <button class="subtle today-btn" onClick={() => setDay(props.today)}>
              back to today
            </button>
          )}
        </h2>
        <button aria-label="Next day" onClick={() => setDay(addDays(day, 1))}>
          →
        </button>
      </header>

      {columns.length === 0 ? (
        <p class="empty-note">
          No daily notes found in this space yet. Yesteryear will have more to
          show once there is a past to look back on.
        </p>
      ) : (
        <div class="year-columns">
          {columns.map((col) => (
            <article class="year-column" key={col.year}>
              <h3>{col.year}</h3>
              {col.note ? (
                <>
                  {props.isDemo ? (
                    <span class="note-title">{col.note.title}</span>
                  ) : (
                    <a
                      class="note-title"
                      href={props.deepLink(col.note.id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {col.note.title}
                    </a>
                  )}
                  {bodies[col.note.id] === undefined ? (
                    <p class="loading">…</p>
                  ) : bodies[col.note.id] ? (
                    <Markdown text={bodies[col.note.id]!} />
                  ) : (
                    <p class="empty-note">(no content)</p>
                  )}
                </>
              ) : (
                <p class="empty-note">nothing written</p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
