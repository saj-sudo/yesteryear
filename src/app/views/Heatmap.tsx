import { useMemo, useState } from 'preact/hooks';
import { isLocalDate, yearOf } from '../../engine/dates';
import type { DailyNoteRef } from '../../engine/temporal';
import type { LocalDate } from '../../engine/types';
import { Markdown } from '../components/Markdown';

/**
 * Calendar heatmap (§9.1): a year at a glance, one cell per date, month
 * by month. Click any day to read what was written then. This answers
 * "what was I doing last November" in one gesture.
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function Heatmap(props: {
  today: LocalDate;
  notes: Map<string, DailyNoteRef>;
  getMarkdown: (id: string) => Promise<string | null>;
  deepLink: (id: string) => string;
  isDemo: boolean;
}) {
  const years = useMemo(() => {
    const ys = new Set<number>([yearOf(props.today)]);
    for (const date of props.notes.keys()) ys.add(Number(date.slice(0, 4)));
    return [...ys].sort((a, b) => b - a);
  }, [props.notes, props.today]);

  const [year, setYear] = useState(yearOf(props.today));
  const [open, setOpen] = useState<{ date: LocalDate; note: DailyNoteRef } | null>(null);
  const [body, setBody] = useState<string | null>(null);

  const openDay = (date: LocalDate, note: DailyNoteRef): void => {
    setOpen({ date, note });
    setBody(null);
    void props.getMarkdown(note.id).then((md) => setBody(md ?? ''));
  };

  return (
    <section class="heatmap">
      <header class="heatmap-head">
        <h2>{year}</h2>
        <div class="year-picker">
          {years.map((y) => (
            <button
              key={y}
              class={y === year ? 'active' : 'subtle'}
              onClick={() => {
                setYear(y);
                setOpen(null);
              }}
            >
              {y}
            </button>
          ))}
        </div>
      </header>

      <div class="heat-grid" role="grid" aria-label={`Daily notes in ${year}`}>
        {MONTHS.map((label, m) => (
          <div class="heat-row" key={label} role="row">
            <span class="heat-month">{label}</span>
            {Array.from({ length: 31 }, (_, i) => {
              const date = `${year}-${String(m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
              if (!isLocalDate(date)) return <span class="heat-cell void" key={i} />;
              const note = props.notes.get(date);
              const isFuture = date > props.today;
              return note ? (
                <button
                  key={i}
                  class={`heat-cell written${open?.date === date ? ' open' : ''}`}
                  title={date}
                  aria-label={`Open ${date}`}
                  onClick={() => openDay(date, note)}
                />
              ) : (
                <span
                  key={i}
                  class={`heat-cell${isFuture ? ' future' : ''}`}
                  title={date}
                />
              );
            })}
          </div>
        ))}
      </div>

      {open && (
        <article class="heat-detail">
          <h3>
            {props.isDemo ? (
              open.note.title
            ) : (
              <a href={props.deepLink(open.note.id)} target="_blank" rel="noreferrer">
                {open.note.title}
              </a>
            )}
          </h3>
          {body === null ? (
            <p class="loading">…</p>
          ) : body ? (
            <Markdown text={body} />
          ) : (
            <p class="empty-note">(no content)</p>
          )}
        </article>
      )}
    </section>
  );
}
