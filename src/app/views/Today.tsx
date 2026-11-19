import { useEffect, useMemo, useState } from 'preact/hooks';
import { RESPONSE_LABELS } from '../../engine/markdown';
import { gatherPairingPool } from '../../engine/orchestrate';
import { drawPairing, type Pairing, type PairingCandidate } from '../../engine/pairing';
import { ageOf, applyResponse, undoResponse, type ItemSnapshot } from '../../engine/respond';
import { parseKey } from '../../engine/state';
import type { ItemResponse, SurfacedItem } from '../../engine/types';
import type { AppData } from '../App';
import { ComingSheet } from '../components/ComingSheet';
import { EarlierYears } from '../components/EarlierYears';
import { Markdown } from '../components/Markdown';
import { HASH_FOR } from '../router';

/**
 * Today (the default view). It opens on one resurfaced note, set like a
 * printed page with its text readable and its age as the headline when
 * the note has a real date behind it. The day's other notes follow as a
 * short stack. Under them, the unlikely pair: two things from different
 * corners of the space that had no reason to meet. Then the same day in
 * earlier years. Drawing a pair is a lens: it never touches scheduling
 * state.
 */

const PAIR_LIMIT = 320;
const LEAD_LIMIT = 1200;
const STACK_LIMIT = 150;

/** What a response reads as once it has been given. */
const ANSWERED: Record<ItemResponse, string> = {
  keep: 'Kept',
  dismiss: 'Dismissed',
  retire: 'Retired',
  gotIt: 'Got it',
  notYet: 'Not yet',
};

/** A response given in this visit, with what undo needs to take it back. */
interface Given {
  response: ItemResponse;
  /** Filled in by the mutation, again on every conflict replay. Absent for
   *  a response recorded on an earlier visit, which cannot be undone here. */
  snap: { before: ItemSnapshot } | null;
}

function stripFrontmatter(md: string): string {
  return md.replace(/^---[\s\S]*?---\s*/m, '').trim();
}

/** Cut at a word, so a clipped note never ends mid-word. */
function clip(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), limit - 40))} …`;
}

/** One plain line of a note, for the stack. */
function firstLine(md: string): string {
  const line = md
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*]\s+(?:\[[ xX]\]\s+)?|#{1,6}\s+|>\s+)/, '').trim())
    .find((l) => l !== '');
  return clip((line ?? '').replace(/\*\*|`|\[\[|\]\]/g, ''), STACK_LIMIT);
}

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
        {item.date && <span>daily note</span>}
        {item.tags.map((t) => (
          <span key={t}>#{t}</span>
        ))}
      </div>
      {props.body === undefined ? (
        <p class="loading">…</p>
      ) : props.body ? (
        <div class="note-text">
          <Markdown text={props.body} />
        </div>
      ) : (
        <p class="empty-note">(no text content)</p>
      )}
    </article>
  );
}

export function Today({ data, comingOpen }: { data: AppData; comingOpen: boolean }) {
  const isDemo = data.session.kind === 'demo';
  const deepLink = (id: string): string => data.session.provider.deepLink(id);
  const [pool, setPool] = useState<PairingCandidate[] | null>(null);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  // Note text by object id: undefined while loading, null when there is none.
  const [bodies, setBodies] = useState<Record<string, string | null>>({});
  const [announcement, setAnnouncement] = useState('');
  const [given, setGiven] = useState<Record<string, Given>>(() => {
    // Reflect responses already recorded (an earlier visit today, or the note).
    const out: Record<string, Given> = {};
    for (const item of data.manager.current.state.lastRunItems) {
      const s = data.manager.current.state.items[item.key];
      if (s?.lastResponse) out[item.key] = { response: s.lastResponse, snap: null };
    }
    return out;
  });

  const save = (): void => {
    void data.manager.flush().catch(() => {
      // A failed save is retried on the next flush; the local mark stands.
    });
  };

  const respond = (item: SurfacedItem, response: ItemResponse): void => {
    const snap: { before: ItemSnapshot } = { before: null };
    data.manager.mutate((doc) => {
      snap.before = applyResponse(doc.state, item.key, response, doc.config);
    });
    setGiven((prev) => ({ ...prev, [item.key]: { response, snap } }));
    setAnnouncement(`${ANSWERED[response]}: ${item.title}. Undo is available.`);
    save();
  };

  const undo = (item: SurfacedItem): void => {
    const snap = given[item.key]?.snap;
    if (!snap) return;
    data.manager.mutate((doc) => {
      undoResponse(doc.state, item.key, snap.before);
    });
    setGiven((prev) => {
      const next = { ...prev };
      delete next[item.key];
      return next;
    });
    setAnnouncement(`Taken back: ${item.title} is unanswered again.`);
    save();
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

  // Fetch the text of today's notes and of the current pair.
  useEffect(() => {
    let cancelled = false;
    const wanted = [
      ...surfaced.filter((item) => !item.excerpt).map((item) => item.objectId),
      ...(pairing ? [pairing.a.objectId, pairing.b.objectId] : []),
    ];
    for (const id of new Set(wanted)) {
      if (bodies[id] !== undefined) continue;
      void data.session.provider.getObjectMarkdown(id).then(
        (md) => {
          if (cancelled) return;
          const text = md ? stripFrontmatter(md) : '';
          setBodies((prev) => ({ ...prev, [id]: text === '' ? null : text }));
        },
        () => {
          if (!cancelled) setBodies((prev) => ({ ...prev, [id]: null }));
        },
      );
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surfaced, pairing]);

  const redraw = (): void => {
    if (pool) setPairing(drawPairing(pool, data.manager.current.state, Math.random));
  };

  /** The text to show for an item: its block when it has one, else the note. */
  const textOf = (item: SurfacedItem): string | null | undefined =>
    item.excerpt ?? bodies[item.objectId];

  const title = (item: SurfacedItem) =>
    isDemo ? (
      <span class="note-title">{item.title}</span>
    ) : (
      <a class="note-title" href={deepLink(item.objectId)} target="_blank" rel="noreferrer">
        {item.title}
      </a>
    );

  const responses = (item: SurfacedItem) => {
    const answer = given[item.key];
    const options: ItemResponse[] =
      item.source === 'learn' ? ['gotIt', 'notYet'] : ['keep', 'dismiss', 'retire'];
    return (
      <div class="responses">
        {answer ? (
          <>
            <span class="answered">{ANSWERED[answer.response]}</span>
            {answer.snap && (
              <button class="quiet" onClick={() => undo(item)}>
                undo<span class="sr-only">: {item.title}</span>
              </button>
            )}
          </>
        ) : (
          options.map((response) => (
            <button key={response} class="quiet" onClick={() => respond(item, response)}>
              {RESPONSE_LABELS[response]}
              <span class="sr-only">: {item.title}</span>
            </button>
          ))
        )}
      </div>
    );
  };

  // The lead is a note that can be read: the first one with a real age and
  // text of its own, else the first with text, else the first with an age.
  // It is chosen once every text has arrived, so the page never reshuffles.
  const settled = surfaced.every((item) => textOf(item) !== undefined);
  const hasText = (item: SurfacedItem): boolean => Boolean(textOf(item));
  const hasAge = (item: SurfacedItem): boolean => ageOf(item.reason) !== null;
  const lead =
    surfaced.find((item) => hasAge(item) && hasText(item)) ??
    surfaced.find(hasText) ??
    surfaced.find(hasAge) ??
    surfaced[0] ??
    null;
  const rest = surfaced.filter((item) => item !== lead);
  const leadText = lead ? textOf(lead) : null;
  const leadAge = lead ? ageOf(lead.reason) : null;

  return (
    <section class="today">
      <p class="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {lead === null ? (
        <p class="empty-note today-empty">Nothing came back today. Days like that are normal.</p>
      ) : !settled ? (
        <div class="skeleton" role="status">
          <span class="sr-only">Reading today's notes…</span>
          <div class="skeleton-page" />
        </div>
      ) : (
        <div class={rest.length > 0 ? 'today-first' : 'today-first alone'}>
          <article class={`lead src-${lead.source}`}>
            {leadAge ? (
              <>
                <p class="kicker">
                  {lead.reason?.kind === 'lookback' ? 'From your daily notes' : 'Started'}
                </p>
                <h2 class="lead-headline">{leadAge}</h2>
              </>
            ) : (
              <h2 class="lead-headline plain">{lead.label}</h2>
            )}
            <p class="lead-title">{title(lead)}</p>
            {leadText ? (
              <div class="note-text">
                <Markdown text={clip(leadText, LEAD_LIMIT)} />
              </div>
            ) : (
              <p class="empty-note">This note has no text of its own.</p>
            )}
            {responses(lead)}
          </article>

          {rest.length > 0 && (
            <section class="stack" aria-labelledby="stack-heading">
              <h2 id="stack-heading">Also back today</h2>
              <ul>
                {rest.map((item) => {
                  const text = textOf(item);
                  return (
                    <li key={item.key} class={`stack-item src-${item.source}`}>
                      <p class="kicker">{item.label}</p>
                      <p class="stack-title">{title(item)}</p>
                      {text && <p class="stack-line">{firstLine(text)}</p>}
                      {responses(item)}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}

      <section class="pair-section" aria-labelledby="pair-heading">
        <header class="pair-head">
          <h2 id="pair-heading">An unlikely pair</h2>
          <button class="quiet" onClick={redraw} disabled={!pool || pool.length < 2}>
            Draw another pair
          </button>
        </header>
        {pool === null ? (
          <p class="loading">Gathering the pool…</p>
        ) : pairing === null ? (
          <p class="empty-note">
            There aren't enough notes to pair yet. This starts working as the
            space grows.
          </p>
        ) : (
          <div class="pairing">
            {[pairing.a, pairing.b].map((side) => {
              const body = bodies[side.objectId];
              return (
                <PairingSide
                  key={side.objectId}
                  item={side}
                  body={body ? clip(body, PAIR_LIMIT) : body}
                  deepLink={deepLink}
                  isDemo={isDemo}
                />
              );
            })}
          </div>
        )}
      </section>

      <EarlierYears
        today={data.today}
        notes={data.notes}
        getMarkdown={(id) => data.session.provider.getObjectMarkdown(id)}
        deepLink={deepLink}
        isDemo={isDemo}
      />

      <p class="coming-link">
        <a class="button" href={HASH_FOR.coming}>
          What is coming
        </a>
      </p>

      <ComingSheet
        data={data}
        open={comingOpen}
        onClose={() => {
          if (location.hash !== HASH_FOR.today) location.hash = HASH_FOR.today;
        }}
      />
    </section>
  );
}
