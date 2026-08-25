import { useEffect, useMemo, useState } from 'preact/hooks';
import type { SpaceInfo } from '../engine/provider';
import type { LocalDate } from '../engine/types';
import {
  loadCached,
  refreshDailyNoteMap,
  saveCached,
  type DailyNoteMap,
} from '../storage/cache';
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
import { OnThisDay } from './views/OnThisDay';

const NAV: { view: View; label: string }[] = [
  { view: 'onThisDay', label: 'On This Day' },
  { view: 'heatmap', label: 'Calendar' },
  { view: 'queue', label: 'Queue' },
  { view: 'preview', label: 'Preview' },
  { view: 'settings', label: 'Settings' },
];

export function App() {
  const [session, setSession] = useState<Session | null>(() => createSession());
  const [space, setSpace] = useState<SpaceInfo | null>(null);
  const [notes, setNotes] = useState<DailyNoteMap | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const view = useView('onThisDay');
  const today: LocalDate = useMemo(() => todayLocal(null), []);

  // Load space info and the daily-note map when a session exists.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void (async () => {
      try {
        const info = await session.provider.spaceInfo();
        if (cancelled) return;
        setSpace(info);
        if (session.kind === 'live') {
          const cached = loadCached<DailyNoteMap>(info.spaceId, 'dailyNotes');
          if (cached && !cancelled) setNotes(cached); // fast paint, then refresh
        }
        const fresh = await refreshDailyNoteMap(session.provider);
        if (cancelled) return;
        setNotes(fresh);
        if (session.kind === 'live') saveCached(info.spaceId, 'dailyNotes', fresh);
      } catch (err) {
        if (cancelled) return;
        if (isAuthLoss(err)) {
          // Revoked or expired: return cleanly to Connect (§7.3, §11).
          disconnect();
          setSession(null);
          setSpace(null);
          setNotes(null);
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
  }, [session]);

  if (!session) {
    return <Connect onDemo={() => setSession(createSession())} />;
  }

  const exitDemo = (): void => {
    endDemo();
    setSession(createSession());
    setSpace(null);
    setNotes(null);
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
        <span class="space-name">{space?.title ?? ''}</span>
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

      <main class="app-main">
        {notes === null ? (
          <p class="loading">Reading the space…</p>
        ) : view === 'onThisDay' ? (
          <OnThisDay
            today={today}
            notes={notes}
            getMarkdown={(id) => session.provider.getObjectMarkdown(id)}
            deepLink={(id) => session.provider.deepLink(id)}
            isDemo={session.kind === 'demo'}
          />
        ) : (
          <p class="empty-note">This view is on its way.</p>
        )}
      </main>
    </div>
  );
}
