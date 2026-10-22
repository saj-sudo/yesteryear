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
  createSession,
  disconnect,
  endDemo,
  isAuthLoss,
  todayLocal,
  type Session,
} from './session';
import { Icon } from './components/Icon';
import { MappingSuggestions } from './components/MappingSuggestions';
import { ThemeChoice } from './components/ThemeChoice';
import { Connect } from './views/Connect';
import { Heatmap } from './views/Heatmap';
import { Learn } from './views/Learn';
import { OnThisDay } from './views/OnThisDay';
import { Preview } from './views/Preview';
import { Recall } from './views/Recall';
import { Settings } from './views/Settings';
import { Today } from './views/Today';
import { readSkipped, saveSkipped } from './suggestionSkipped';

const DISCLAIMER = 'Independent community tool. Not affiliated with Capacities.';

const NAV_GROUPS: { label: string | null; items: { view: View; label: string }[] }[] = [
  {
    label: null,
    items: [{ view: 'today', label: 'Today' }],
  },
  {
    label: 'Cadences',
    items: [
      { view: 'recall', label: 'Recall' },
      { view: 'learn', label: 'Learn' },
    ],
  },
  {
    label: 'Lenses',
    items: [
      { view: 'onThisDay', label: 'On This Day' },
      { view: 'heatmap', label: 'Calendar' },
      { view: 'preview', label: 'Preview' },
    ],
  },
  {
    label: null,
    items: [{ view: 'settings', label: 'Settings' }],
  },
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
          if (report.wrote) {
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
    setSession(null);
  };

  return (
    <div class="app">
      <aside class="sidebar">
        <a class="brand" href="#/today">
          <span class="brand-mark" aria-hidden="true" />
          Yesteryear
        </a>
        <nav>
          {NAV_GROUPS.map((group, gi) => (
            <div class="nav-group" key={gi}>
              {group.label && <span class="nav-group-label">{group.label}</span>}
              {group.items.map((item) => (
                <a
                  key={item.view}
                  href={HASH_FOR[item.view]}
                  class={view === item.view ? 'active' : ''}
                >
                  <Icon name={item.view} />
                  {item.label}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div class="sidebar-foot">
          {session.kind === 'demo' && (
            <div class="demo-badge">
              <span>Demo space</span>
              <button class="subtle" onClick={exitDemo}>
                exit
              </button>
            </div>
          )}
          <span class="space-name">{data?.space.title ?? ''}</span>
          <ThemeChoice />
          <p class="disclaimer">{DISCLAIMER}</p>
        </div>
      </aside>

      <div class="content">
        {session.kind === 'demo' && (
          <aside class="demo-banner" aria-label="Demo space">
            Every note here is synthetic, and nothing leaves this tab.
          </aside>
        )}

        <main class="app-main">
          {loadError && <div class="notice">{loadError}</div>}
          {ranNote && <div class="notice">{ranNote}</div>}
          {view === 'today' && <h1 class="sr-only">Today</h1>}
          {view === 'onThisDay' && <h1 class="sr-only">On this day</h1>}
          {view === 'heatmap' && <h1 class="sr-only">Calendar</h1>}
          {data === null ? (
            <p class="loading">Reading the space…</p>
          ) : view === 'today' ? (
            setup ? (
              <MappingSuggestions
                suggestion={setup.suggestion}
                spaceTitle={data.space.title}
                firstRun={true}
                onUse={finishSetup}
                onSkip={() => finishSetup(null)}
              />
            ) : (
              <Today data={data} />
            )
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
          ) : view === 'recall' ? (
            <Recall data={data} />
          ) : view === 'learn' ? (
            <Learn data={data} />
          ) : view === 'preview' ? (
            <Preview data={data} />
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
          <ThemeChoice />
          <p class="disclaimer">{DISCLAIMER}</p>
        </footer>
      </div>
    </div>
  );
}

export type { Provider };
