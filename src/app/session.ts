import { CapacitiesClient, CapacitiesOAuthError } from '@capacities/api';
import { beginAuthorization, type StoredTokens } from '../auth/oauth';
import { clearTokens, loadTokens, saveTokens } from '../auth/tokens';
import type { Provider, StateStore } from '../engine/provider';
import { CapacitiesAdapter } from '../providers/capacities/adapter';
import { FixtureProvider } from '../providers/fixture/fixtureProvider';
import { buildMinimalSpace } from '../providers/fixture/minimalSpace';
import { buildStrangersSpace } from '../providers/fixture/strangersSpace';
import { todayInZone } from '../engine/dates';
import type { LocalDate } from '../engine/types';

/**
 * Session wiring for the app shell: which Provider backs this visit.
 *
 * - "live": OAuth tokens exist → the Capacities adapter. A failed token
 *   refresh (revoked/expired) returns the user cleanly to Connect (§7.3).
 * - "demo": synthetic fixture space; nothing leaves the tab.
 * - null: not connected → the Connect screen.
 */

export type DemoFlavor = 'strangers' | 'minimal';

export interface Session {
  kind: 'live' | 'demo';
  provider: Provider;
  /** Present in demo mode (FixtureProvider is also the state store). */
  demoStore: StateStore | null;
}

const DEMO_KEY = 'yesteryear.demo';

export const CLIENT_ID: string | undefined = import.meta.env
  .VITE_CAPACITIES_CLIENT_ID as string | undefined;

export function todayLocal(timezone: string | null): LocalDate {
  return todayInZone(new Date(), timezone);
}

export function activeDemo(): DemoFlavor | null {
  try {
    const v = sessionStorage.getItem(DEMO_KEY);
    return v === 'strangers' || v === 'minimal' ? v : null;
  } catch {
    return null;
  }
}

export function startDemo(flavor: DemoFlavor): void {
  try {
    sessionStorage.setItem(DEMO_KEY, flavor);
  } catch {
    // sessionStorage unavailable: demo simply won't persist across reloads
  }
}

export function endDemo(): void {
  try {
    sessionStorage.removeItem(DEMO_KEY);
  } catch {
    // nothing to do
  }
}

export function createSession(): Session | null {
  const demo = activeDemo();
  if (demo) {
    const today = todayLocal(null);
    const space = demo === 'strangers' ? buildStrangersSpace(today) : buildMinimalSpace(today);
    const provider = new FixtureProvider(space);
    return { kind: 'demo', provider, demoStore: provider };
  }

  const tokens = loadTokens();
  if (tokens && CLIENT_ID) {
    const client = new CapacitiesClient({
      oauth: {
        tokens,
        clientId: CLIENT_ID,
        onTokenRefreshed: (next) => saveTokens(next as StoredTokens),
      },
    });
    return { kind: 'live', provider: new CapacitiesAdapter(client), demoStore: null };
  }
  return null;
}

/** Kick off the OAuth redirect. */
export async function connect(): Promise<void> {
  if (!CLIENT_ID) return;
  const url = await beginAuthorization({
    clientId: CLIENT_ID,
    redirectUri: `${location.origin}/callback`,
    storage: {
      get: (k) => sessionStorage.getItem(k),
      set: (k, v) => sessionStorage.setItem(k, v),
      remove: (k) => sessionStorage.removeItem(k),
    },
  });
  location.assign(url);
}

export function disconnect(): void {
  clearTokens();
}

/**
 * True when an error means "the connection is gone" — revoked access or
 * an expired refresh token. Callers clear tokens and show Connect again
 * rather than error-looping (§11).
 */
export function isAuthLoss(err: unknown): boolean {
  return err instanceof CapacitiesOAuthError;
}
