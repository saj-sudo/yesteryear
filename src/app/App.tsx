import { useEffect, useMemo, useState } from 'preact/hooks';
import { normalizeConfig } from '../engine/config';
import { buildDailyNoteMap, runDaily, type RunReport } from '../engine/orchestrate';
import type { Provider, SpaceInfo } from '../engine/provider';
import { StateManager } from '../engine/state';
import { applySuggestion, suggestionKey, suggestMapping, type Suggestion } from '../engine/suggest';
import type { DailyNoteRef } from '../engine/temporal';
import type { LocalDate } from '../engine/types';
import { isBasicStructure } from '../providers/capacities/constants';
import { loadCached, saveCached } from '../storage/cache';
import { HASH_FOR, useView, type View } from './router';
import {
  CLIENT_ID,
  connect,
  createSession,
  disconnect,
  endDemo,
  isAuthLoss,
  STALL_MS,
  suggestsReconnect,
  todayLocal,
  type Session,
} from './session';
import { ConnectionTrouble } from './components/ConnectionTrouble';
import { Icon } from './components/Icon';
import { MappingSuggestions } from './components/MappingSuggestions';
import { Connect } from './views/Connect';
import { Learn } from './views/Learn';
import { Settings } from './views/Settings';
import { Today } from './views/Today';
import { readSkipped, saveSkipped } from './suggestionSkipped';

const DISCLAIMER = 'Independent community tool. Not affiliated with Capacities.';

// Two destinations. What used to be Recall opens from Today as a sheet,
// and the study sets page opens from Settings, so neither is listed here.
const NAV: { view: View; label: string }[] = [
  { view: 'today', label: 'Today' },
  { view: 'settings', label: 'Settings' },
];

export interface AppData {
  session: Session;
  space: SpaceInfo;
  manager: StateManager;
  notes: Map<string, DailyNoteRef>;
  today: LocalDate;
  report: RunReport | null;
}

type CachedNotes = Record<string, DailyNoteRef>;

/**
 * Before the very first run, what the space offers to map. The daily run
 * happens once a day, so offering this first lets the choice shape the first
 * set of notes instead of waiting for tomorrow. Null when the space has run
 * before, offers nothing, or the same offer was already skipped.
 */
async function firstRunSuggestion(provider: Provider, manager: StateManager): Promise<Suggestion | null> {
  if (manager.current.state.lastRunDate !== null) return null;
  try {
    const [structures, tags] = await Promise.all([provider.listStructures(), provider.listTags()]);
    const found = suggestMapping(
      structures.filter((s) => !isBasicStructure(s.id)),
      tags,
      manager.current.config,
    );
    return found && suggestionKey(found) !== readSkipped() ? found : null;
  } catch {
    return null; // never hold the first run for a suggestion that could not be read
  }
}

export function App() {
  const [session, setSession] = useState<Session | null>(() => createSession());
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Whether the failed load looks like lost or refused access.
  const [reconnectFirst, setReconnectFirst] = useState(false);
  // The first load has run past STALL_MS without painting anything.
  const [stalled, setStalled] = useState(false);
  const [ranNote, setRanNote] = useState<string | null>(null);
  // The first run, held while the person looks at what the space offers to map.
  const [setup, setSetup] = useState<{ suggestion: Suggestion; startRun: () => Promise<void> } | null>(null);
  const view = useView('today');
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
            report: null,
          });
        }
        const notes = await buildDailyNoteMap(session.provider);
        if (cancelled) return;
        if (session.kind === 'live') {
          saveCached(space.spaceId, 'dailyNotes', Object.fromEntries(notes));
        }
        setData({ session, space, manager, notes, today, report: null });

        // The lazy daily run (§9.2): first visit of the local day computes
        // the allocation, advances the queue, and (only when opted in)
        // writes the Resurfaced section into today's daily note.
        const startRun = async (): Promise<void> => {
          const report = await runDaily({
            provider: session.provider,
            manager,
            today,
            rng: Math.random,
            notesByDate: notes,
          });
          if (cancelled) return;
          setData({ session, space, manager, notes, today, report });
          // The demo writes to a made-up note, so there is nothing to report.
          if (report.wrote && session.kind !== 'demo') {
            setRanNote('Today’s Resurfaced section was added to your daily note.');
          }
        };
        const offer = await firstRunSuggestion(session.provider, manager);
        if (cancelled) return;
        if (offer) {
          setSetup({ suggestion: offer, startRun });
          return;
        }
        await startRun();
      } catch (err) {
        if (cancelled) return;
        if (isAuthLoss(err)) {
          disconnect();
          setSession(null);
          setData(null);
        } else {
          setReconnectFirst(suggestsReconnect(err));
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

  // Nothing in the boot chain has a timeout of its own, so a request that
  // stalls on a phone would leave "Reading the space…" up for good. After
  // STALL_MS the recovery card is offered; the load keeps running and
  // replaces the card if it finishes.
  const waiting = session !== null && data === null;
  useEffect(() => {
    setStalled(false);
    if (!waiting) return;
    const timer = setTimeout(() => setStalled(true), STALL_MS);
    return () => clearTimeout(timer);
  }, [waiting, session]);

  if (!session) {
    return (
      <Connect
        onDemo={() => setSession(createSession())}
        onConnected={() => setSession(createSession())}
      />
    );
  }

  const finishSetup = (picked: Suggestion | null): void => {
    if (!setup || !data) return;
    const { suggestion, startRun } = setup;
    if (picked) {
      data.manager.mutate((doc) => {
        doc.config = normalizeConfig(applySuggestion(doc.config, picked));
      });
      void data.manager.flush().catch(() => undefined); // kept in this browser and saved again later
    } else {
      saveSkipped(suggestionKey(suggestion));
    }
    setSetup(null);
    void startRun();
  };

  const exitDemo = (): void => {
    endDemo();
    setData(null);
    setSession(createSession());
  };

  const signOut = (): void => {
    disconnect();
    setData(null);
    setLoadError(null);
    setSession(null);
  };

  const retryLoad = (): void => {
    setLoadError(null);
    setReconnectFirst(false);
    setSession(createSession());
  };

  // The old credential stays until the callback saves the new one, so
  // backing out of the Capacities consent screen leaves things as they were.
  const reconnect = (): Promise<void> => connect();

  // The sheet and the study sets page sit under one of the two destinations.
  const section: View = view === 'coming' ? 'today' : view === 'learn' ? 'settings' : view;

  return (
    <div class="app">
      <header class="topbar">
        <a class="brand" href="#/today">
          <span class="brand-mark" aria-hidden="true" />
          Yesteryear
        </a>
        <nav class="mainnav" aria-label="Main">
          {NAV.map((item) => (
            <a
              key={item.view}
              href={HASH_FOR[item.view]}
              class={section === item.view ? 'active' : ''}
              aria-current={view === item.view ? 'page' : undefined}
            >
              <Icon name={item.view} />
              {item.label}
            </a>
          ))}
        </nav>
        <div class="topbar-space">
          <span class="space-name">{data?.space.title ?? ''}</span>
          {session.kind === 'demo' && (
            <span class="demo-badge">
              Demo space
              <button class="quiet" onClick={exitDemo}>
                exit
              </button>
            </span>
          )}
        </div>
      </header>

      <div class="content">
        {session.kind === 'demo' && (
          <aside class="demo-banner" aria-label="Demo space">
            Every note here is made up, and nothing leaves this tab.
          </aside>
        )}

        <main class="app-main">
          {loadError && data !== null && <div class="notice">{loadError}</div>}
          {ranNote && section === 'today' && (
            <div class="notice notice-dismissable">
              <span>{ranNote}</span>
              <button type="button" class="subtle" onClick={() => setRanNote(null)}>
                Dismiss
              </button>
            </div>
          )}
          {section === 'today' && <h1 class="sr-only">Today</h1>}
          {data === null && (loadError || stalled) && session.kind === 'live' ? (
            <ConnectionTrouble
              stalled={!loadError}
              reconnectFirst={reconnectFirst}
              canReconnect={Boolean(CLIENT_ID)}
              onRetry={retryLoad}
              onReconnect={reconnect}
              onDisconnect={signOut}
            />
          ) : data === null ? (
            <>
              {loadError && <div class="notice">{loadError}</div>}
              <div class="skeleton" role="status">
                <span class="sr-only">Reading the space…</span>
                <div class="skeleton-page" />
                <div class="skeleton-line" />
                <div class="skeleton-line short" />
              </div>
            </>
          ) : section === 'today' ? (
            setup ? (
              <MappingSuggestions
                suggestion={setup.suggestion}
                spaceTitle={data.space.title}
                firstRun={true}
                onUse={finishSetup}
                onSkip={() => finishSetup(null)}
              />
            ) : (
              <Today data={data} comingOpen={view === 'coming'} />
            )
          ) : view === 'learn' ? (
            <Learn data={data} />
          ) : (
            <Settings
              data={data}
              onSignOut={signOut}
              onSuggestionApplied={() => {
                if (setup) {
                  const { startRun } = setup;
                  setSetup(null);
                  void startRun();
                }
              }}
            />
          )}
        </main>
        <footer class="app-foot">
          <p class="disclaimer">{DISCLAIMER}</p>
        </footer>
      </div>
    </div>
  );
}

export type { Provider };
