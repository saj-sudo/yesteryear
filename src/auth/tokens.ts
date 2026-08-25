import type { StoredTokens } from './oauth';

/**
 * Token persistence (spec §7.3). Tokens live in this browser only and
 * never reach any server the maintainer controls. Browser storage is
 * reachable by any script on the page — which is why the app bundles
 * everything, loads no third-party scripts, and ships a strict CSP.
 * The tradeoff is documented in the README rather than hidden.
 */

const TOKEN_KEY = 'yesteryear.tokens';

export function loadTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredTokens>;
    if (
      typeof parsed.accessToken === 'string' &&
      typeof parsed.refreshToken === 'string'
    ) {
      return parsed as StoredTokens;
    }
  } catch {
    // corrupt or unavailable storage → treat as signed out
  }
  return null;
}

export function saveTokens(tokens: StoredTokens): void {
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  } catch {
    // Private windows can refuse writes; the session still works until reload.
  }
}

export function clearTokens(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // nothing to do
  }
}
