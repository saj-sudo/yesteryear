import { useEffect, useMemo, useState } from 'preact/hooks';
import { applyLearnResponse } from '../../engine/learn';
import { gatherPairingPool } from '../../engine/orchestrate';
import { drawPairing, type Pairing, type PairingCandidate } from '../../engine/pairing';
import { applyRecallResponse } from '../../engine/recall';
import { parseKey } from '../../engine/state';
import type { ItemResponse, SurfacedItem } from '../../engine/types';
import type { AppData } from '../App';
import { Markdown } from '../components/Markdown';

const RESPONSE_LABELS: Record<ItemResponse, string> = {
  keep: 'keep',
  dismiss: 'dismiss',
  retire: 'retire',
  gotIt: 'got it',
  missedIt: 'missed it',
};

/**
 * Today (the default view). The core comes first: the day's resurfaced
 * mix, produced by the cadence engine — Recall's cooldown-and-sampling
 * rhythm, Learn's contracting ladder toward real dates, and the
 * date-bound items worth never missing. Below it, a serendipity
 * pairing: two things from different corners of the space that had no
 * reason to meet. Drawing a pairing is a lens: it never touches
 * scheduling state.
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
  const [responses, setResponses] = useState<Record<string, ItemResponse>>(() => {
    // Reflect responses already recorded (an earlier visit today, or the note).
    const out: Record<string, ItemResponse> = {};
    for (const item of data.manager.current.state.lastRunItems) {
      const s = data.manager.current.state.items[item.key];
      if (s?.lastResponse) out[item.key] = s.lastResponse;
    }
    return out;
  });

  const respond = (item: SurfacedItem, response: ItemResponse): void => {
    data.manager.mutate((doc) => {
      if (response === 'gotIt' || response === 'missedIt') {
        applyLearnResponse(doc.state, item.key, response, doc.config.learn);
      } else {
        applyRecallResponse(doc.state, item.key, response, doc.config.recall);
      }
    });
    setResponses((prev) => ({ ...prev, [item.key]: response }));
    void data.manager.flush().catch(() => {
      // A failed save is retried on the next flush; the local mark stands.
    });
  };

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
      <h2>Resurfaced today</h2>
      <p class="fineprint">
        What the cadence brought back — items return when their time comes, not
        when the calendar rhymes.
      </p>
      {surfaced.length === 0 ? (
        <p class="empty-note">Nothing surfaced today — a quiet day is a normal day.</p>
      ) : (
        <ul class="mix-list">
          {surfaced.map((item) => {
            const answered = responses[item.key];
            const options: ItemResponse[] =
              item.source === 'learn' ? ['gotIt', 'missedIt'] : ['keep', 'dismiss', 'retire'];
            return (
              <li key={item.key} class={`mix-item src-${item.source}`}>
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
                <div class="mix-responses">
                  {answered ? (
                    <span class="mix-answered">{RESPONSE_LABELS[answered]}</span>
                  ) : (
                    options.map((response) => (
                      <button
                        key={response}
                        class="mix-response"
                        onClick={() => respond(item, response)}
                      >
                        {RESPONSE_LABELS[response]}
                      </button>
                    ))
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div class="pairing-head">
        <div>
          <h2>An unlikely pair</h2>
          <p class="fineprint">
            And on the side: two things from different corners of your space.
            Sometimes nothing — sometimes exactly the connection you would never
            have filed.
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
    </section>
  );
}
