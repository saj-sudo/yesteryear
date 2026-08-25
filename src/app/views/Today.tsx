import { useEffect, useMemo, useState } from 'preact/hooks';
import { gatherPairingPool } from '../../engine/orchestrate';
import { drawPairing, type Pairing, type PairingCandidate } from '../../engine/pairing';
import { parseKey } from '../../engine/state';
import type { SurfacedItem } from '../../engine/types';
import type { AppData } from '../App';
import { Markdown } from '../components/Markdown';

/**
 * Today (the default view): a serendipity pairing up top — two things
 * from different corners of the space that had no reason to meet — and
 * the day's resurfaced mix below it. Drawing a pairing is a lens: it
 * never touches scheduling state.
 */

const EXCERPT_LIMIT = 320;

function PairingSide(props: {
  item: PairingCandidate;
  body: string | null | undefined;
  deepLink: (id: string) => string;
  isDemo: boolean;
}) {
  const { item } = props;
  return (
    <article class="pair-side">
      {props.isDemo ? (
        <span class="note-title">{item.title}</span>
      ) : (
        <a class="note-title" href={props.deepLink(item.objectId)} target="_blank" rel="noreferrer">
          {item.title}
        </a>
      )}
      <div class="pair-meta">
        {item.date && <span class="chip">daily note</span>}
        {item.tags.map((t) => (
          <span key={t} class="chip">
            #{t}
          </span>
        ))}
      </div>
      {props.body === undefined ? (
        <p class="loading">…</p>
      ) : props.body ? (
        <Markdown text={props.body} />
      ) : (
        <p class="empty-note">(no text content)</p>
      )}
    </article>
  );
}

export function Today({ data }: { data: AppData }) {
  const [pool, setPool] = useState<PairingCandidate[] | null>(null);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [bodies, setBodies] = useState<Record<string, string | null>>({});

  // Build the pool once, then draw.
  useEffect(() => {
    let cancelled = false;
    void gatherPairingPool(
      data.session.provider,
      data.manager.current.config,
      data.notes,
    ).then((p) => {
      if (cancelled) return;
      setPool(p);
      setPairing(drawPairing(p, data.manager.current.state, Math.random));
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  // Fetch excerpts for the current pairing.
  useEffect(() => {
    if (!pairing) return;
    let cancelled = false;
    for (const side of [pairing.a, pairing.b]) {
      if (bodies[side.objectId] !== undefined) continue;
      void data.session.provider.getObjectMarkdown(side.objectId).then((md) => {
        if (cancelled) return;
        const flat = md
          ? md.replace(/^---[\s\S]*?---\s*/m, '').trim().slice(0, EXCERPT_LIMIT)
          : null;
        setBodies((prev) => ({ ...prev, [side.objectId]: flat }));
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pairing]);

  const redraw = (): void => {
    if (pool) setPairing(drawPairing(pool, data.manager.current.state, Math.random));
  };

  // Today's allocation: the fresh run report when we have it, else what
  // state recorded the last run surfacing.
  const surfaced: SurfacedItem[] = useMemo(() => {
    if (data.report && data.report.surfaced.length > 0) return data.report.surfaced;
    return data.manager.current.state.lastRunItems.map((item) => {
      const parsed = parseKey(item.key);
      return {
        key: item.key,
        objectId: parsed?.objectId ?? item.key,
        blockId: parsed?.blockId ?? null,
        title: item.title,
        excerpt: null,
        source: item.learn ? ('learn' as const) : ('recall' as const),
        label: item.learn ? 'Review' : 'Resurfaced',
        group: null,
      };
    });
  }, [data]);

  return (
    <section class="today">
      <div class="pairing-head">
        <div>
          <h2>An unlikely pair</h2>
          <p class="fineprint">
            Two things from different corners of your space. Sometimes nothing —
            sometimes exactly the connection you would never have filed.
          </p>
        </div>
        <button onClick={redraw} disabled={!pool || pool.length < 2}>
          Draw another pair
        </button>
      </div>

      {pool === null ? (
        <p class="loading">Gathering the pool…</p>
      ) : pairing === null ? (
        <p class="empty-note">
          Not enough here to pair yet — this comes alive as the space grows.
        </p>
      ) : (
        <div class="pairing">
          <PairingSide
            item={pairing.a}
            body={bodies[pairing.a.objectId]}
            deepLink={(id) => data.session.provider.deepLink(id)}
            isDemo={data.session.kind === 'demo'}
          />
          <span class="pair-x" aria-hidden="true">
            ×
          </span>
          <PairingSide
            item={pairing.b}
            body={bodies[pairing.b.objectId]}
            deepLink={(id) => data.session.provider.deepLink(id)}
            isDemo={data.session.kind === 'demo'}
          />
        </div>
      )}

      <h2 class="today-mix-head">Today’s mix</h2>
      {surfaced.length === 0 ? (
        <p class="empty-note">Nothing surfaced today — a quiet day is a normal day.</p>
      ) : (
        <ul class="mix-list">
          {surfaced.map((item) => (
            <li key={item.key} class="mix-item">
              <span class="mix-label">{item.label}</span>
              {data.session.kind === 'demo' ? (
                <span class="note-title">{item.title}</span>
              ) : (
                <a
                  class="note-title"
                  href={data.session.provider.deepLink(item.objectId)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {item.title}
                </a>
              )}
              {item.excerpt && <p class="mix-excerpt">{item.excerpt}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
