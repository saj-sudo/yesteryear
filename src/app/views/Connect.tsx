import { CLIENT_ID, connect, startDemo, type DemoFlavor } from '../session';

/**
 * The connect screen. Calm, honest, no dead ends: when OAuth is not yet
 * configured for this deployment, the demo is offered instead of a wall.
 */
export function Connect({ onDemo }: { onDemo: (flavor: DemoFlavor) => void }) {
  const demo = (flavor: DemoFlavor) => () => {
    startDemo(flavor);
    onDemo(flavor);
  };

  return (
    <main class="connect">
      <h1>Yesteryear</h1>
      <p class="tagline">Resurfacing for Capacities.</p>
      <p>
        See what you wrote a month, a season, a year ago — on this day. Yesteryear
        reads your space from this browser only: there is no server, no account,
        and no tracking. Notes travel from your browser to Capacities and nowhere
        else.
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
          This deployment has no OAuth client configured yet, so connecting a real
          space is not available. The demo below shows everything with an invented
          space.
        </p>
      )}

      <div class="demo-buttons">
        <button onClick={demo('strangers')}>Try the demo</button>
        <button class="subtle" onClick={demo('minimal')}>
          Demo: a nearly empty space
        </button>
      </div>
      <p class="fineprint">
        The demo runs on synthetic notes, entirely in this tab.
      </p>
    </main>
  );
}
