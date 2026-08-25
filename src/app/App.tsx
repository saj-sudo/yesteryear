import { useEffect, useMemo, useState } from 'preact/hooks';
import { buildDailyNoteMap, runDaily } from '../engine/orchestrate';
import type { Provider, SpaceInfo } from '../engine/provider';
import { StateManager } from '../engine/state';
import type { DailyNoteRef } from '../engine/temporal';
import type { LocalDate } from '../engine/types';
import { loadCached, saveCached } from '../storage/cache';
import { HASH_FOR, useView, type View } from './router';
import {
  createSession,
  disconnect,
  endDemo,
  isAuthLoss,
  todayLocal,
  type Session,
} from './session';
import { Connect } from './views/Connect';
import { Heatmap } from './views/Heatmap';
import { OnThisDay } from './views/OnThisDay';
import { Preview } from './views/Preview';
import { Queue } from './views/Queue';
import { Settings } from './views/Settings';

const NAV: { view: View; label: string }[] = [
  { view: 'onThisDay', label: 'On This Day' },
  { view: 'heatmap', label: 'Calendar' },
  { view: 'queue', label: 'Queue' },
  { view: 'preview', label: 'Preview' },
  { view: 'settings', label: 'Settings' },
];

export interface AppData {
  session: Session;
  space: SpaceInfo;
  manager: StateManager;
  notes: Map<string, DailyNoteRef>;
  today: LocalDate;
}

type CachedNotes = Record<string, DailyNoteRef>;

export function App() {
  const [session, setSession] = useState<Session | null>(() => createSession());
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ranNote, setRanNote] = useState<string | null>(null);
  const view = useView('onThisDay');
  const today: LocalDate = useMemo(() => todayLocal(null), []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void (async () => {
      try {
        const space = await session.provider.spaceInfo();
        const manager = await StateManager.open(
          session.makeStore(space.spaceId),
          () => new Date().toISOString(),
        );
        if (cancelled) return;

        // Fast paint from cache while the fresh listing runs.
        const cached = loadCached<CachedNotes>(space.spaceId, 'dailyNotes');
        if (cached) {
          setData({
            session, space, manager,
            notes: new Map(Object.entries(cached)),
            today,
          });
        }
        const notes = await buildDailyNoteMap(session.provider);
        if (cancelled) return;
        if (session.kind === 'live') {
          saveCached(space.spaceId, 'dailyNotes', Object.fromEntries(notes));
        }
        setData({ session, space, manager, notes, today });

        // The lazy daily run (§9.2): first visit of the local day computes
        // the allocation, advances the queue, and — only when opted in —
        // writes the Resurfaced section into today's daily note.
        const report = await runDaily({
          provider: session.provider,
          manager,
          today,
          rng: Math.random,
          notesByDate: notes,
        });
        if (cancelled) return;
        if (report.wrote) {
          setRanNote('Today’s Resurfaced section was added to your daily note.');
        }
      } catch (err) {
        if (cancelled) return;
        if (isAuthLoss(err)) {
          disconnect();
          setSession(null);
          setData(null);
        } else {
          setLoadError(
            'Could not reach Capacities right now. Cached content may still be shown.',
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, today]);

  if (!session) {
    return (
      <Connect
        onDemo={() => setSession(createSession())}
        onConnected={() => setSession(createSession())}
      />
    );
  }

  const exitDemo = (): void => {
    endDemo();
    setData(null);
    setSession(createSession());
  };

  const signOut = (): void => {
    disconnect();
    setData(null);
    setSession(null);
  };

  return (
    <div class="app">
      <header class="app-header">
        <span class="brand">Yesteryear</span>
        <nav>
          {NAV.map((item) => (
            <a
              key={item.view}
              href={HASH_FOR[item.view]}
              class={view === item.view ? 'active' : ''}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <span class="space-name">{data?.space.title ?? ''}</span>
      </header>

      {session.kind === 'demo' && (
        <div class="demo-banner">
          Demo space — every note here is synthetic, and nothing leaves this tab.{' '}
          <button class="subtle" onClick={exitDemo}>
            Exit demo
          </button>
        </div>
      )}
      {loadError && <div class="notice">{loadError}</div>}
      {ranNote && <div class="notice">{ranNote}</div>}

      <main class="app-main">
        {data === null ? (
          <p class="loading">Reading the space…</p>
        ) : view === 'onThisDay' ? (
          <OnThisDay
            today={data.today}
            notes={data.notes}
            getMarkdown={(id) => data.session.provider.getObjectMarkdown(id)}
            deepLink={(id) => data.session.provider.deepLink(id)}
            isDemo={session.kind === 'demo'}
          />
        ) : view === 'heatmap' ? (
          <Heatmap
            today={data.today}
            notes={data.notes}
            getMarkdown={(id) => data.session.provider.getObjectMarkdown(id)}
            deepLink={(id) => data.session.provider.deepLink(id)}
            isDemo={session.kind === 'demo'}
          />
        ) : view === 'queue' ? (
          <Queue data={data} />
        ) : view === 'preview' ? (
          <Preview data={data} />
        ) : (
          <Settings data={data} onSignOut={signOut} />
        )}
      </main>
    </div>
  );
}

export type { Provider };
