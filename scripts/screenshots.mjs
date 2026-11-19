// Retakes every screenshot in the repo from the built-in demo space, so no
// real space can ever appear in one (see CONTRIBUTING.md).
//
//   npm run build && npm run shots
//
// Writes docs/today.png, docs/phone-today.png, docs/learn.png,
// docs/phone-learn.png, docs/setup.png and public/og.png. The demo's dates
// follow the day it runs on and the pair is drawn at random, so two runs
// differ in those details.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';

const root = join(import.meta.dirname, '..');
if (!existsSync(join(root, 'dist', 'index.html'))) {
  console.error('No build found. Run `npm run build` first.');
  process.exit(1);
}

const WIDE = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 412, height: 839 }, deviceScaleFactor: 2 };
const OG = { viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 };
const SETUP = { viewport: { width: 1100, height: 560 }, deviceScaleFactor: 2 };

const server = await preview({ root, logLevel: 'silent', preview: { port: 4318, strictPort: false } });
const base = (server.resolvedUrls?.local[0] ?? 'http://localhost:4318/').replace(/\/$/, '');
const browser = await chromium.launch();

async function open(options, path = '/app/?demo') {
  const page = await browser.newPage({ ...options, colorScheme: 'light' });
  await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
  return page;
}

/** Today, with a pair whose two sheets both have text. */
async function today(options, file) {
  const page = await open(options);
  await page.locator('.lead .note-text').waitFor();
  await page.locator('.pairing').waitFor();
  for (let tries = 0; tries < 30; tries += 1) {
    await page.waitForTimeout(150);
    if ((await page.locator('.pair-side .empty-note, .pair-side .loading').count()) === 0) break;
    await page.getByRole('button', { name: 'Draw another pair' }).click();
  }
  await page.screenshot({ path: join(root, file) });
  await page.close();
}

/** The study sets page, with studying toward a date turned on. */
async function studySets(options, file) {
  const page = await open(options);
  await page.locator('.lead').waitFor();
  await page.evaluate(() => {
    location.hash = '#/learn';
  });
  await page.getByRole('button', { name: 'Turn it on', exact: true }).click();
  await page.getByRole('heading', { name: 'Study sets' }).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(root, file) });
  await page.close();
}

/** The first run on a space with nothing set up yet. */
async function setup(options, file) {
  const page = await open(options, '/app/');
  await page.getByText('More demos', { exact: true }).click();
  await page.getByRole('button', { name: 'Demo: a first run in a new space' }).click();
  await page.getByRole('heading', { name: 'Start with what is in your space' }).waitFor();
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(root, file) });
  await page.close();
}

try {
  await today(WIDE, 'docs/today.png');
  await today(PHONE, 'docs/phone-today.png');
  await today(OG, 'public/og.png');
  await studySets(WIDE, 'docs/learn.png');
  await studySets(PHONE, 'docs/phone-learn.png');
  await setup(SETUP, 'docs/setup.png');
  console.log('Screenshots retaken from the demo space.');
} finally {
  await browser.close();
  await new Promise((done) => server.httpServer.close(() => done()));
}
