# Yesteryear

[![CI](https://github.com/saj-sudo/yesteryear/actions/workflows/ci.yml/badge.svg)](https://github.com/saj-sudo/yesteryear/actions/workflows/ci.yml)

**Resurfacing for Capacities.** Yesteryear brings your older notes back **on a schedule**. The notes you tag as worth seeing again come back when they are due, a month later or six months later. Notes tied to a real date, like a talk or an exam, come back more often as that date gets closer. Each day you also get one *unlikely pair*: two notes from different corners of your space, side by side. Date-based views (on this day across the years, birthdays, project dates) are here too, as extra ways to look back.

![Today in the synthetic Fernweh Field Office demo: four resurfaced notes with tinted source labels, and an unlikely pair shown as two overlapping prints in blue and apricot. A banner at the top says every note is made up.](docs/today.png)

> **Disclaimer:** Yesteryear is an independent community tool. It is not
> affiliated with, endorsed by, or sponsored by Capacities. Capacities is a
> trademark of its respective owners.

Notes go into Capacities easily and rarely come back out. Capacities is very good at capturing and linking, but nothing puts your older writing back in front of you: the idea you tagged in March, the meeting note that suddenly relates to it, the friend whose birthday is Thursday. Yesteryear does that part. It reads your space and shows your own past notes again, on the site and (if you turn it on) as a short `Resurfaced` section in the daily note you already open each morning. The daily mix draws partly at random, because a calendar can only bring back notes that already share a date.

## No server and no tracking

Yesteryear is **a set of static files**. OAuth runs in your browser, tokens stay in your browser, and every API call goes from your browser to `api.capacities.io`. No note content passes through a server the maintainer runs, because there isn't one. There are no accounts and no analytics, and a strict Content-Security-Policy backs that up.

The tradeoff is that a token kept in the browser can be read by any script running on the page. That's why the app bundles everything, loads no third-party scripts, and treats every dependency as something to review. The runtime dependencies are `preact`, the official `@capacities/api` SDK, and its `zod` peer, and that's the whole list. Browser storage is still not an OS keychain. You can revoke Yesteryear's access at any time in Capacities under **Settings → Capacities API → Connections**, whatever this app does.

Your resurfacing history lives in a `Yesteryear State` page **inside your own space**. You can read it, export it as JSON from Settings, or delete it to start over. Clearing browser data only signs you out. Reconnecting brings everything back, because the history was never stored only in the browser.

## Works with your object types

Every Capacities space has its own object types, properties and tags, so **no type ID, property ID or tag name is hardcoded**. Yesteryear reads what your space contains, and you map it in Settings: which type holds "projects" or "people", which date property is a birthday, which tags mark a note worth seeing again, and which status values mean a project is active. Anything you don't map is skipped. A space with nothing set up still gets "on this day", because every space has daily notes. If a name in your settings doesn't exist in your space, the error says what was missing and lists what your space has.

## Getting started

1. Open the site and click **Connect to Capacities**, or **Try the demo** first. The demo runs on a made-up space and needs no account.
2. Approve access and pick which space to share. That choice happens on the Capacities side.
3. You land on **Today**: the day's resurfaced notes, with an unlikely pair underneath. This works with no setup, because daily notes alone are enough.
4. Each schedule has its own page in the sidebar. **Recall** helps you pick resurfacing tags right there. **Learn** turns on with one click and shows its three ways in (flag one item, a tag, or a type). **Settings** holds the full mapping: object types, date properties, and whether whole pages or single paragraphs come back.
5. Open **Preview** to see what tomorrow would bring back, before anything is written.
6. If you like it, turn on the **daily note** section. On your first visit each day, a `Resurfaced` section is added to that day's note.

### Use it now with a personal token

One-click connect needs an OAuth client id from Capacities. Until that's in place, or for your own self-hosted build, use the advanced path. In the Capacities app, create a token under **Settings → Capacities API** with read and write access. Run the site (`npm install && npm run dev`) and paste the token under **Advanced** on the Connect screen. The token stays in your browser's storage, so treat it like a password. You can revoke it in the same settings screen at any time.

Answering is optional, and happens in the note itself. Tick the box (or strike `keep`) to keep a note in rotation, strike `dismiss` to see it three times less often, or strike `retire` to never see it again. **Not answering is always fine.** The note just stays on its normal schedule. Nothing is removed unless you retire it, and you can edit or delete the whole section. The parser handles hand-edited notes without complaint.

## The two schedules

**Recall** (the default) is the general schedule. It isn't spaced repetition, because personal notes have no deadline and so no memory schedule to optimise. Instead it uses a 45-day cooldown, weighted sampling that favours tag groups and notes you haven't seen in a while, and a fixed 20% share of pure chance. The schedule gets at least half of each day's slots. Items tied to a date that matters (birthdays, target dates) always appear, and same-day lookbacks share what's left. The pair on Today sits next to the schedule and never changes it.

**Learn** (opt-in) is for the few notes you want to know well before a known date, like a talk, an exam or a trip. The gap between reviews is a share of the time remaining (`0.15 ×` the days to the target, with limits), so reviews come closer together as the date gets near. The first review is always delayed a little. After the date passes, the notes go back to Recall. Learn stays small: no cloze deletions and no grading ladders. If you need real memorisation tools, use [Anki](https://apps.ankiweb.net/). Learn exists for notes you already have, because moving notes into Anki is a chore of its own.

There are no streaks, counters or reminders anywhere. Leaving everything untouched is a normal state.

![The calendar: a year of days in the demo space, with a dot of ink for each day that has a daily note.](docs/calendar.png)

## Built on the official API

Yesteryear uses the official Capacities HTTP API through the official [`@capacities/api`](https://www.npmjs.com/package/@capacities/api) TypeScript SDK. It doesn't use the app's internal interfaces, which some community tools depend on. OAuth 2.1 with PKCE is the main sign-in; the personal-token path is there for self-hosters and early testing. Using only the official API means Yesteryear keeps working as Capacities changes.

## Deploying your own

The site works on any static host, with no server functions.

```sh
npm install
VITE_CAPACITIES_CLIENT_ID=<your client id> npm run build   # output in dist/
```

The OAuth `client_id` comes from Capacities. Registration is [by email](https://developers.capacities.io), and you register your own `/callback` URL as the redirect URI. The id is public by design (a PKCE public client has no client secret). Without one, the site still serves the demo.

## Development

```sh
npm install
npm run lint    # eslint, warnings fail
npm test        # Vitest; the whole engine runs against made-up fixture spaces
npm run dev     # local dev server
npm run build   # typecheck + production build
```

The engine (`src/engine/`) is plain TypeScript with no Capacities or DOM imports. Providers implement a small interface, which would also make an adapter for another notes app possible. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
