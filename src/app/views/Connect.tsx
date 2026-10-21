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

  const submitToken = (): void => {
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
        Your older notes, coming back on a schedule. The note you tagged three
        months ago comes back when it is due, and notes tied to a real date
        come back more often as it gets closer. Each day there is also one
        unlikely pair. Yesteryear reads your space from this browser. There is
        no server and no account, and your notes go only to Capacities.
      </p>

      {CLIENT_ID ? (
        <>
          <button class="primary" onClick={() => void connect()}>
            Connect to Capacities
          </button>
          <p class="fineprint">
            You pick which space to share on the Capacities side. You can revoke
            access any time in Capacities under Settings&nbsp;→ Capacities
            API&nbsp;→ Connections.
          </p>
        </>
      ) : (
        <p class="notice">
          One-click connect isn't set up on this build yet. You can try the
          demo, or connect your own space with a personal API token under
          Advanced, further down.
        </p>
      )}

      <div class="demo-buttons">
        {/* Without a client id the demo is the one thing to do here. */}
        <button class={CLIENT_ID ? '' : 'primary'} onClick={demo('strangers')}>
          Try the demo
        </button>
        <button class="subtle" onClick={demo('minimal')}>
          Demo: a nearly empty space
        </button>
      </div>
      <p class="fineprint">The demo runs on synthetic notes, entirely in this tab.</p>

      <details class="advanced">
        <summary>Advanced: connect with a personal API token</summary>
        <p class="fineprint">
          In the Capacities app, go to Settings → Capacities API and create a
          token with read and write access. Paste it here. The token stays in
          this browser’s storage, so treat it like a password. You can revoke
          it in the same settings screen whenever you like.
        </p>
        <div class="token-row">
          <input
            type="password"
            placeholder="cap-api-…"
            value={token}
            onInput={(e) => setToken((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitToken();
            }}
          />
          <button onClick={submitToken} disabled={token.trim() === ''}>
            Connect
          </button>
        </div>
      </details>
    </main>
  );
}
