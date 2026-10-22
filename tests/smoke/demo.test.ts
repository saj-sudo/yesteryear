import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright';
import { preview, type PreviewServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Smoke test of the built site in a real browser: every page and every demo
// view loads with no console error, no uncaught exception and no CSP
// violation. The zod eval probe reached production once because nothing ran
// the built pages; this is that check. It looks at nothing else, so the UI
// stays covered by the type checker and the engine tests.
// Run `npm run build` first, then `npm run smoke`.

const root = join(import.meta.dirname, '..', '..');
const VIEWS = ['#/today', '#/on-this-day', '#/heatmap', '#/recall', '#/learn', '#/preview', '#/settings'];
const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
];

const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

let server: PreviewServer;
let browser: Browser;
let base: string;

beforeAll(async () => {
  if (!existsSync(join(root, 'dist', 'index.html'))) {
    throw new Error('No build found. Run `npm run build` before `npm run smoke`.');
  }
  server = await preview({ root, logLevel: 'silent', preview: { port: 4317, strictPort: false } });
  base = (server.resolvedUrls?.local[0] ?? 'http://localhost:4317/').replace(/\/$/, '');
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((done) => server?.httpServer.close(() => done()));
});

async function watch(page: Page): Promise<string[]> {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      problems.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`CSP blocked ${event.blockedURI} (${event.violatedDirective})`);
    });
  });
  return problems;
}

describe.each(VIEWPORTS)('on $name', (viewport) => {
  it('loads the landing page and the callback without errors', async () => {
    const page = await browser.newPage({ viewport });
    const problems = await watch(page);
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    await page.goto(`${base}/callback/?code=smoke&state=smoke`, { waitUntil: 'networkidle' });
    await page.close();
    expect(problems).toEqual([]);
  });

  it('opens every demo view without errors', async () => {
    const page = await browser.newPage({ viewport });
    const problems = await watch(page);
    await page.goto(`${base}/app/`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
    for (const view of VIEWS) {
      await page.evaluate((hash) => {
        location.hash = hash;
      }, view);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(300);
    }
    await page.close();
    expect(problems).toEqual([]);
  });
});

it('serves the manifest and its icons', async () => {
  const page = await browser.newPage();
  const manifest = await page.request.get(`${base}/manifest.webmanifest`);
  expect(manifest.status()).toBe(200);
  const { icons } = (await manifest.json()) as { icons: { src: string }[] };
  for (const icon of icons) {
    expect((await page.request.get(`${base}${icon.src}`)).status(), icon.src).toBe(200);
  }
  await page.close();
});

interface AxeViolation {
  id: string;
  help: string;
  nodes: { target: string[] }[];
}

/** WCAG A and AA plus axe's best practices, on whatever the page shows now. */
async function violationsOn(page: Page): Promise<string[]> {
  await page.evaluate(axeSource);
  const found = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: AxeViolation[] }> } }).axe;
    const result = await axe.run(document, {
      runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'],
    });
    return result.violations;
  });
  return found.map((v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')})`);
}

describe.each(['light', 'dark'] as const)('accessibility in %s', (colorScheme) => {
  it.each(VIEWPORTS)('has no axe violations on any page at $name size', async (viewport) => {
    const page = await browser.newPage({ viewport, colorScheme });
    const problems: string[] = [];
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    problems.push(...(await violationsOn(page)).map((v) => `landing: ${v}`));
    await page.goto(`${base}/app/`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
    await page.waitForTimeout(500);
    for (const view of VIEWS) {
      await page.evaluate((hash) => {
        location.hash = hash;
      }, view);
      await page.waitForTimeout(500);
      problems.push(...(await violationsOn(page)).map((v) => `${view}: ${v}`));
    }
    await page.close();
    expect(problems).toEqual([]);
  });
});

it('moves the theme choice with the arrow keys and keeps one option in the tab order', async () => {
  const page = await browser.newPage({ viewport: VIEWPORTS[1]! });
  await page.goto(`${base}/app/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  const radio = (name: string) => page.getByRole('radio', { name, exact: true });
  await radio('Auto').focus();
  await page.keyboard.press('ArrowRight');
  expect(await radio('Light').getAttribute('aria-checked')).toBe('true');
  expect(await page.evaluate(() => document.documentElement.dataset['theme'])).toBe('light');
  await page.keyboard.press('End');
  expect(await radio('Dark').getAttribute('aria-checked')).toBe('true');
  await page.keyboard.press('ArrowRight');
  expect(await radio('Auto').getAttribute('aria-checked')).toBe('true');
  expect(await page.evaluate(() => document.documentElement.dataset['theme'])).toBeUndefined();
  const tabbable = await page.locator('.theme-choice:visible [role=radio][tabindex="0"]').count();
  expect(tabbable).toBe(1);
  await page.close();
});

it('picks a range of notes with two taps on a touch screen', async () => {
  const page = await browser.newPage({ viewport: VIEWPORTS[0]!, hasTouch: true });
  await page.goto(`${base}/app/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Try the demo', exact: true }).click();
  await page.evaluate(() => {
    location.hash = '#/learn';
  });
  const turnOn = page.getByRole('button', { name: 'Turn on Learn mode' });
  if (await turnOn.count()) await turnOn.click();
  await page.getByRole('button', { name: 'New study set' }).click();
  await page.getByLabel('Search your notes').fill('a');
  await page.locator('.finder-results li').nth(5).waitFor();
  await page.getByRole('button', { name: 'Pick a range', exact: true }).tap();
  await page.getByText('Tap the first note of the range.').waitFor();
  await page.locator('.finder-results li label').nth(1).tap();
  await page.getByText(/Tap the last note of the range/).waitFor();
  await page.locator('.finder-results li label').nth(3).tap();
  await page.getByRole('heading', { name: /Picked \(3\)/ }).or(page.getByText('Picked (3)')).first().waitFor();
  expect(await page.locator('.finder-results li input:checked').count()).toBe(3);
  expect(await page.getByText('Tap the first note of the range.').count()).toBe(0);
  await page.close();
});

const FRESH = 'Demo: a first run in a new space';

describe.each(['light', 'dark'] as const)('first run in %s', (colorScheme) => {
  it('offers what the space contains, with no axe violations', async () => {
    const page = await browser.newPage({ viewport: VIEWPORTS[1]!, colorScheme });
    await page.goto(`${base}/app/`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: FRESH, exact: true }).click();
    await page.getByRole('heading', { name: 'Start with what is in your space' }).waitFor();
    expect(await violationsOn(page)).toEqual([]);
    await page.close();
  });
});

it('maps what the person ticks, then runs the first day', async () => {
  const page = await browser.newPage({ viewport: VIEWPORTS[1]! });
  const problems = await watch(page);
  await page.goto(`${base}/app/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: FRESH, exact: true }).click();
  await page.getByRole('heading', { name: 'Start with what is in your space' }).waitFor();

  // Guesses start unticked; a tag that already says "keep" starts ticked.
  const projects = page.getByRole('checkbox', { name: /Expedition.*might be your projects/ });
  expect(await projects.isChecked()).toBe(false);
  await projects.check();
  await page.getByRole('checkbox', { name: /Correspondent.*might be your people/ }).check();
  await page.getByRole('button', { name: 'Use these', exact: true }).click();

  await page.getByRole('heading', { name: 'Start with what is in your space' }).waitFor({ state: 'detached' });
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => {
    location.hash = '#/settings';
  });
  await page.getByRole('heading', { name: 'Settings', level: 1 }).waitFor();
  expect(await page.getByLabel(/^Projects/).inputValue()).toBe('Expedition');
  expect(await page.getByLabel(/^People/).inputValue()).toBe('Correspondent');
  expect(await page.getByRole('heading', { name: 'Found in your space' }).count()).toBe(0);
  await page.close();
  expect(problems).toEqual([]);
});

it('does not offer the same thing again after it is skipped', async () => {
  const page = await browser.newPage({ viewport: VIEWPORTS[1]! });
  await page.goto(`${base}/app/`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: FRESH, exact: true }).click();
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click();
  await page.getByRole('heading', { name: 'Start with what is in your space' }).waitFor({ state: 'detached' });
  await page.evaluate(() => {
    location.hash = '#/settings';
  });
  await page.getByRole('heading', { name: 'Settings', level: 1 }).waitFor();
  expect(await page.getByRole('heading', { name: 'Found in your space' }).count()).toBe(0);
  await page.close();
});
