import {
  CLIENT_ID,
  connect,
  startDemo,
  type DemoFlavor,
} from '../session';

/**
 * The connect screen. Calm, honest, no dead ends: OAuth is the primary
 * flow, and the only way to connect a real space; the demo needs nothing
 * at all.
 */
export function Connect(props: {
  onDemo: (flavor: DemoFlavor) => void;
  onConnected: () => void;
}) {
  const demo = (flavor: DemoFlavor) => () => {
    startDemo(flavor);
    props.onDemo(flavor);
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
          Sign-in isn't set up on this build. You can try the demo.
        </p>
      )}

      <div class="demo-buttons">
        {/* Without a client id the demo is the one thing to do here. */}
        <button class={CLIENT_ID ? '' : 'primary'} onClick={demo('strangers')}>
          Try the demo
        </button>
        <button class="subtle" onClick={demo('fresh')}>
          Demo: a first run in a new space
        </button>
        <button class="subtle" onClick={demo('minimal')}>
          Demo: a nearly empty space
        </button>
      </div>
      <p class="fineprint">The demo runs on synthetic notes, entirely in this tab.</p>

    </main>
  );
}
