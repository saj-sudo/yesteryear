import { render } from 'preact';
import onThisDayShot from '../../docs/on-this-day.png';
import calendarShot from '../../docs/calendar.png';

/**
 * The landing page: what it is, what it looks like, and the privacy
 * property stated plainly (§9.1). Screenshots come from the built-in
 * demo space — synthetic notes, like everything else in this repo.
 */
function Landing() {
  return (
    <main class="landing">
      <h1>Yesteryear</h1>
      <p class="tagline">Resurfacing for Capacities.</p>
      <p>
        You already wrote the good stuff. Yesteryear brings it back: what you
        wrote on this day across every past year, gentle rotation through the
        notes you tagged as worth meeting again, and — if you opt in — spaced
        review of the few things you want fluent before a real date.
      </p>

      <p>
        <a class="cta" href="/app/">Open Yesteryear</a>
        <a class="cta-secondary" href="/app/">Try the demo — no account needed</a>
      </p>

      <img src={onThisDayShot} alt="On This Day: one column per year for today's date" />

      <h2>No backend. Really none.</h2>
      <p>
        This site is static files. Your notes travel from your browser straight
        to Capacities and nowhere else — there is no server to pass through, no
        account to create, no analytics, no tracking of any kind. Access tokens
        stay in your browser; your resurfacing history lives in a page inside
        your own space, where you can read or delete it whenever you like. You
        can revoke access at any time in Capacities itself.
      </p>

      <h2>Your object types, not ours</h2>
      <p>
        Every Capacities space has its own types, properties, and tags — so
        nothing here is hardcoded. Yesteryear reads what your space actually
        contains and lets you map it: which types count as projects or people,
        which tags mark something worth resurfacing, whether whole pages or
        single paragraphs are the unit. A space with nothing configured still
        gets “on this day”, because daily notes exist everywhere.
      </p>

      <img src={calendarShot} alt="Calendar heatmap: a year of daily notes at a glance" />

      <h2>Quiet by design</h2>
      <p>
        No streaks, no counters, no overdue badges. Skipping a day is a normal
        state, and silence is a valid response — the tool works fully unattended
        forever. If you enable the daily-note surface, a small Resurfaced
        section appears in the note you already open each morning; respond to
        it, rewrite it, or ignore it.
      </p>

      <footer>
        <p>
          <a href="https://github.com/saj-sudo/yesteryear">Source on GitHub</a> ·
          MIT licensed
        </p>
        <p class="fineprint">
          <strong>Disclaimer:</strong> Yesteryear is an independent community
          tool. It is not affiliated with, endorsed by, or sponsored by
          Capacities. Capacities is a trademark of its respective owners.
        </p>
      </footer>
    </main>
  );
}

render(<Landing />, document.getElementById('root')!);
