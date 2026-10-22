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
      <p class="tagline">Your older Capacities notes, back on a schedule.</p>
      <p>
        Notes go into Capacities easily and rarely come back out. Yesteryear
        brings them back.
      </p>
      <ul>
        <li>
          Notes you tag as worth seeing again return when they are due, a month
          or six months later.
        </li>
        <li>
          Notes with a real date, like a talk or an exam, return more often as
          it gets closer.
        </li>
        <li>
          Each day you also get an unlikely pair: two notes from different
          corners of your space, side by side.
        </li>
      </ul>

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
        a study set, pick them by tag, by type or one at a time, and give the
        set a date.
      </p>
      <ul>
        <li>
          Each review is set at 15% of the time left, so reviews come closer
          together as the day gets near. The first one waits at least a week.
        </li>
        <li>
          After the date the notes leave Learn. Give the set a new date and they
          study again, which suits an exam you sit twice.
        </li>
        <li>
          A set lists the notes it holds, and each note in Learn names its set.
        </li>
      </ul>
      <p>
        There are no cards to make and no grades to give: you see the note and
        answer with a tap. For heavier memorising, Anki is the better tool.
      </p>

      <img
        src={learnShot}
        alt="The Learn page in a made-up field office space: two study sets, one counting down to its date and one whose date has passed, and the notes now studying toward a date."
      />

      <h2>No server, no account, no analytics</h2>
      <p>
        The site is static files. Your notes go from your browser to Capacities
        and nowhere else, and access tokens stay in your browser. You can
        revoke access any time in Capacities.
      </p>
      <p>
        A strict Content-Security-Policy blocks every other script, and{' '}
        <a href="https://github.com/saj-sudo/yesteryear/blob/main/tests/build/csp.test.ts">
          a test
        </a>{' '}
        checks it on each build. Your resurfacing history lives in a page inside
        your own space, where you can read it or delete it.
      </p>

      <h2>Works with the types you already have</h2>
      <p>
        Every Capacities space has its own types, properties and tags, so
        Yesteryear assumes none of them. You choose which types are projects or
        people, which tags mark a note worth seeing again, and whether a whole
        page or one paragraph comes back. With nothing set up, it still works
        from your daily notes.
      </p>

      <h2>Dates bring notes back, and so does chance</h2>
      <p>
        On This Day shows what you wrote on this date in earlier years, and a
        calendar marks every day you wrote. Birthdays and project dates come
        back as they approach. The daily mix also draws at random, because a
        date can only bring back notes that already share one.
      </p>

      <img
        src={calendarShot}
        alt="The calendar: a year of days, with a dot of ink for each day that has a daily note."
      />

      <h2>No streaks or scores</h2>
      <p>
        Nothing here counts days or marks anything overdue. Skipping a day is
        fine, and so is never answering. If you turn on the daily note section,
        a short Resurfaced list appears in the note you open each morning:
        answer it or leave it.
      </p>

      <h2>Works on a phone</h2>
      <p>
        The layout fits a narrow screen, and you can add the site to your home
        screen so it opens on Today. Choose light, dark or automatic.
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
