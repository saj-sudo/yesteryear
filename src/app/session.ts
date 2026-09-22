import {
  CapacitiesApiError,
  CapacitiesClient,
  CapacitiesErrorCode,
  CapacitiesOAuthError,
} from '@capacities/api';
import { beginAuthorization } from '../auth/oauth';
import { clearCredential, loadCredential, saveCredential } from '../auth/tokens';
import type { Provider, StateStore } from '../engine/provider';
import { CapacitiesAdapter } from '../providers/capacities/adapter';
import { CapacitiesStateStore } from '../providers/capacities/stateStore';
import { FixtureProvider } from '../providers/fixture/fixtureProvider';
import { buildMinimalSpace } from '../providers/fixture/minimalSpace';
import { buildStrangersSpace } from '../providers/fixture/strangersSpace';
import { normalizeConfig } from '../engine/config';
import { addDays, todayInZone } from '../engine/dates';
import { emptyDoc } from '../engine/state';
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
  /** State store for the space; call once spaceId is known. */
  makeStore: (spaceId: string) => StateStore;
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
    if (demo === 'strangers') {
      // The demo starts as a user would be after onboarding: the invented
      // schema mapped, tags picked, the daily-note surface on, and Learn
      // mode mid-flight so its cadence is visible from the first visit.
      const doc = emptyDoc(
        normalizeConfig({
          types: { project: 'Expedition', person: 'Correspondent', note: 'Field Note' },
          properties: {
            projectStart: 'Set Off',
            projectTarget: 'Summit Day',
            projectStatus: 'Phase',
            personBirthday: 'Born On',
          },
          activeStatusValues: ['Underway', 'Basecamp'],
          recall: { tags: ['spark', 'keeper', 'thread'], tagWeights: { spark: 1.5 } },
          rotation: { enabled: true, groupBy: 'tag', groups: ['spark', 'thread'] },
          learn: {
            enabled: true,
            assignByTag: ['keeper'],
            targetDateProperty: 'Summit Day',
          },
          surfaces: { dailyNote: { enabled: true } },
        }),
        new Date().toISOString(),
      );
      // The Larkspur survey was reviewed ten days ago and is due again now.
      doc.state.items['obj:x-larkspur#learn'] = {
        mode: 'learn',
        targetDate: addDays(today, 45),
        lastSurfaced: addDays(today, -10),
        nextDue: today,
        surfaceCount: 1,
        lastResponse: 'gotIt',
      };
      void provider.save(doc, null);
    }
    return { kind: 'demo', provider, makeStore: () => provider };
  }

  const credential = loadCredential();
  let client: CapacitiesClient | null = null;
  if (credential?.kind === 'token') {
    client = new CapacitiesClient({ apiToken: credential.apiToken });
  } else if (credential?.kind === 'oauth' && CLIENT_ID) {
    const { kind, ...tokens } = credential;
    void kind;
    client = new CapacitiesClient({
      oauth: {
        tokens,
        clientId: CLIENT_ID,
        onTokenRefreshed: (next) => saveCredential({ kind: 'oauth', ...next }),
      },
    });
  }
  if (client) {
    const c = client;
    return {
      kind: 'live',
      provider: new CapacitiesAdapter(c),
      makeStore: (spaceId) =>
        new CapacitiesStateStore(c, spaceId, () => new Date().toISOString()),
    };
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

/** Store a personal API token and let the caller rebuild the session. */
export function connectWithToken(apiToken: string): void {
  saveCredential({ kind: 'token', apiToken });
}

export function disconnect(): void {
  clearCredential();
}

/**
 * True when an error means "the connection is gone" — revoked access,
 * an expired refresh token, or a revoked/invalid personal token.
 * Callers clear the credential and show Connect again rather than
 * error-looping (§11).
 */
export function isAuthLoss(err: unknown): boolean {
  return (
    err instanceof CapacitiesOAuthError ||
    (err instanceof CapacitiesApiError &&
      (err.code === CapacitiesErrorCode.NotAuthenticated || err.status === 401))
  );
}
