/**
 * API-defined basic structure ids. These are constants of the Capacities
 * API itself, present in every space — they are NOT user schema, and they
 * are the only structure ids permitted to appear in code (spec §4).
 */
export const DAILY_NOTE_STRUCTURE_ID = 'RootDailyNote';
export const TAG_STRUCTURE_ID = 'RootTag';
export const PAGE_STRUCTURE_ID = 'RootPage';

/** Known deep-link base (spec V5 fallback). */
export const APP_BASE = 'https://app.capacities.io';
