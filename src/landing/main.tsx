import { render } from 'preact';
import todayShot from '../../docs/today.png';
import calendarShot from '../../docs/calendar.png';
import learnShot from '../../docs/learn.png';

/**
 * The landing page: what it is, what it looks like, and the privacy
 * property stated plainly (§9.1). Screenshots come from the built-in
 * demo space: synthetic notes, like everything else in this repo.
 */
function Landing() {
  return (
    <main class="landing">
      <div class="landing-art" aria-hidden="true" />
      <h1>Yesteryear</h1>
      <p class="tagline">Resurfacing for Capacities.</p>
      <p>
        Notes go into Capacities easily and rarely come back out. Yesteryear
        brings older notes back to you <em>on a cadence</em>. The ones you tag
        as worth seeing again come back when they are due: a month later, six
        months later. Notes tied to a real date, like a talk or an exam, come
        back more often as that date gets closer. Each day you also get one
        unlikely pair: two notes from different corners of your space, side by
        side.
      </p>

      <p>
        <a class="cta" href="/app/">Open Yesteryear</a>
        <a class="cta-secondary" href="/app/">Try the demo (no account needed)</a>
      </p>

      <img
        src={todayShot}
        alt="Today in a made-up field office space: four resurfaced notes with tinted labels, and an unlikely pair shown as two overlapping prints."
      />

      <h2>Study toward a date</h2>
      <p>
        Some notes matter by a certain day, like a talk or an exam. Put them in
        a study set, choosing them by tag, by object type, or one at a time with
        a search, and give the set a date. Yesteryear spaces the reviews out,
        with each gap set at 15% of the time left, so they come closer together
        as the day gets near. The first review waits at least a week.
      </p>
      <p>
        Sitting the same exam again? Give the set a new date and the same notes
        study toward it. Learn works on the notes you already have. There are
        no cards to make and no grades to give: you see the note and answer
        with a tap. For heavier memorising, Anki is the better tool.
      </p>

      <img
        src={learnShot}
        alt="The Learn page in a made-up field office space: two study sets, one counting down to its date and one whose date has passed, and the notes now studying toward a date."
      />

      <h2>No server</h2>
      <p>
        The site is a set of static files. Your notes go from your browser to
        Capacities and nowhere else. There's no account to make and no
        analytics. Access tokens stay in your browser. Your resurfacing
        history is kept in a page inside your own space, where you can read it
        or delete it. You can revoke access any time in Capacities.
      </p>

      <h2>Works with the types you already have</h2>
      <p>
        Every Capacities space has its own types, properties and tags, so
        Yesteryear doesn't assume any. It reads what your space contains and
        lets you choose: which types are projects or people, which tags mark a
        note worth seeing again, and whether a whole page or a single
        paragraph comes back. With nothing set up, it still works from your
        daily notes.
      </p>

      <h2>Dates help, and so does chance</h2>
      <p>
        Birthdays, project dates and what you wrote a year ago today are all
        here, in On This Day and a calendar of the days you wrote. The daily
        mix also draws at random, because a date can only bring back notes
        that already share one.
      </p>

      <img
        src={calendarShot}
        alt="The calendar: a year of days, with a dot of ink for each day that has a daily note."
      />

      <h2>No streaks or scores</h2>
      <p>
        Nothing here counts days or marks anything overdue. Skipping a day is
        fine, and so is never answering. If you turn on the daily note
        section, a short Resurfaced list appears in the note you already open
        each morning. Answer it, edit it or leave it.
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
