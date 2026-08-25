import { useState } from 'preact/hooks';
import {
  CLIENT_ID,
  connect,
  connectWithToken,
  startDemo,
  type DemoFlavor,
} from '../session';

/**
 * The connect screen. Calm, honest, no dead ends: OAuth is the primary
 * flow when configured; a personal API token is the advanced path for
 * self-hosters and early testing; the demo needs nothing at all.
 */
export function Connect(props: {
  onDemo: (flavor: DemoFlavor) => void;
  onConnected: () => void;
}) {
  const [token, setToken] = useState('');

  const demo = (flavor: DemoFlavor) => () => {
    startDemo(flavor);
    props.onDemo(flavor);
  };

  const useToken = (): void => {
    const trimmed = token.trim();
    if (!trimmed) return;
    connectWithToken(trimmed);
    props.onConnected();
  };

  return (
    <main class="connect">
      <h1>Yesteryear</h1>
      <p class="tagline">Resurfacing for Capacities.</p>
      <p>
        Your notes, coming back on a gentle cadence — the note you tagged three
        months ago returns when its time comes, and material with a real date
        attached tightens toward it. On the side, an unlikely pair each day.
        Yesteryear reads your space from this browser only: there is no server,
        no account, and no tracking. Notes travel from your browser to
        Capacities and nowhere else.
      </p>

      {CLIENT_ID ? (
        <>
          <button class="primary" onClick={() => void connect()}>
            Connect to Capacities
          </button>
          <p class="fineprint">
            You choose which space to share on the Capacities side. You can revoke
            access at any time in Capacities under Settings&nbsp;→ Capacities
            API&nbsp;→ Connections — nothing here can stop you.
          </p>
        </>
      ) : (
        <p class="notice">
          This build has no OAuth client configured, so the one-click connect is
          not available yet. The demo below needs nothing; a personal API token
          (advanced, further down) connects your real space.
        </p>
      )}

      <div class="demo-buttons">
        <button onClick={demo('strangers')}>Try the demo</button>
        <button class="subtle" onClick={demo('minimal')}>
          Demo: a nearly empty space
        </button>
      </div>
      <p class="fineprint">The demo runs on synthetic notes, entirely in this tab.</p>

      <details class="advanced">
        <summary>Advanced: connect with a personal API token</summary>
        <p class="fineprint">
          In the Capacities app: Settings → Capacities API → create a token with
          read and write access, then paste it here. The token stays in this
          browser’s storage — treat it like a password, and revoke it in the
          same settings screen whenever you like.
        </p>
        <div class="token-row">
          <input
            type="password"
            placeholder="cap-api-…"
            value={token}
            onInput={(e) => setToken((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') useToken();
            }}
          />
          <button onClick={useToken} disabled={token.trim() === ''}>
            Connect
          </button>
        </div>
      </details>
    </main>
  );
}
