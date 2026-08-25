import type { LocalDate } from './types';

/**
 * All calendar math for the engine. A LocalDate is a plain YYYY-MM-DD
 * string in the *user's* timezone (§11: local date, never UTC). Date.UTC
 * is used below purely as an arithmetic substrate for day counting — the
 * user's timezone only ever matters when deriving "today", which happens
 * once in todayInZone() and is injected everywhere else.
 */

const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isLocalDate(value: string): value is LocalDate {
  const m = LOCAL_DATE_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  return isRealDate(Number(y), Number(mo), Number(d));
}

function isRealDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const t = Date.UTC(year, month - 1, day);
  const dt = new Date(t);
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

function fromYmd(year: number, month: number, day: number): LocalDate {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}` as LocalDate;
}

function toUtcMs(date: LocalDate): number {
  const m = LOCAL_DATE_RE.exec(date)!;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * The current date in the given IANA timezone (browser-detected zone when
 * null). This is the only place wall-clock time enters the engine's world;
 * callers pass `now` explicitly so tests stay deterministic.
 */
export function todayInZone(now: Date, timeZone: string | null): LocalDate {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    ...(timeZone ? { timeZone } : {}),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA formats as YYYY-MM-DD.
  return fmt.format(now) as LocalDate;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const dt = new Date(toUtcMs(date) + days * 86_400_000);
  return fromYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Whole days from `earlier` to `later` (positive when later is after). */
export function diffDays(later: LocalDate, earlier: LocalDate): number {
  return Math.round((toUtcMs(later) - toUtcMs(earlier)) / 86_400_000);
}

export function yearOf(date: LocalDate): number {
  return Number(date.slice(0, 4));
}

export function monthDayOf(date: LocalDate): string {
  return date.slice(5);
}

/**
 * Next occurrence of a month-day (MM-DD) on or after `today`, with Feb 29
 * mapped to Feb 28 in non-leap years. Returns the date and days until it.
 */
export function nextOccurrence(
  monthDay: string,
  today: LocalDate,
): { date: LocalDate; inDays: number } {
  const [moStr, dayStr] = monthDay.split('-');
  const month = Number(moStr);
  const day = Number(dayStr);
  for (const year of [yearOf(today), yearOf(today) + 1]) {
    let d = day;
    if (month === 2 && day === 29 && !isRealDate(year, 2, 29)) d = 28;
    const candidate = fromYmd(year, month, d);
    const inDays = diffDays(candidate, today);
    if (inDays >= 0) return { date: candidate, inDays };
  }
  // Unreachable: next year's occurrence is always in the future.
  throw new Error(`no next occurrence for ${monthDay}`);
}

/* ------------------------------------------------------------------ */
/* Daily-note title parsing (§8.2)                                     */
/* ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = {};
for (const [i, names] of [
  ['january', 'jan'],
  ['february', 'feb'],
  ['march', 'mar', 'märz', 'maerz'],
  ['april', 'apr'],
  ['may', 'mai'],
  ['june', 'jun', 'juni'],
  ['july', 'jul', 'juli'],
  ['august', 'aug'],
  ['september', 'sep', 'sept'],
  ['october', 'oct', 'okt', 'oktober'],
  ['november', 'nov'],
  ['december', 'dec', 'dez', 'dezember'],
].entries()) {
  for (const name of names) MONTHS[name] = i + 1;
}

function monthFromName(name: string): number | null {
  return MONTHS[name.toLowerCase().replace(/\.$/, '')] ?? null;
}

/**
 * Parse a daily-note title into a LocalDate. Titles are locale-formatted
 * dates ("Aug 27, 2025", "27 Aug 2025", "2025-08-27", "27.08.2025", …).
 * Parsing is deliberately forgiving, and anything unrecognized — including
 * ambiguous numeric forms like 03/04/2025 — returns null so the caller
 * skips the note instead of failing the run (§8.2).
 */
export function parseDailyNoteTitle(title: string): LocalDate | null {
  const t = title.trim();

  // ISO: 2025-08-27
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (m) {
    const [, y, mo, d] = m;
    return isRealDate(Number(y), Number(mo), Number(d))
      ? fromYmd(Number(y), Number(mo), Number(d))
      : null;
  }

  // Month-name first: "Aug 27, 2025" / "August 27 2025"
  m = /^([A-Za-zÀ-ÿ.]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(t);
  if (m) {
    const month = monthFromName(m[1]!);
    const day = Number(m[2]);
    const year = Number(m[3]);
    return month !== null && isRealDate(year, month, day)
      ? fromYmd(year, month, day)
      : null;
  }

  // Day first: "27 Aug 2025" / "27. August 2025"
  m = /^(\d{1,2})(?:st|nd|rd|th)?\.?\s+([A-Za-zÀ-ÿ.]+),?\s+(\d{4})$/.exec(t);
  if (m) {
    const day = Number(m[1]);
    const month = monthFromName(m[2]!);
    const year = Number(m[3]);
    return month !== null && isRealDate(year, month, day)
      ? fromYmd(year, month, day)
      : null;
  }

  // Dotted numeric is conventionally day-first: "27.08.2025"
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    return isRealDate(year, month, day) ? fromYmd(year, month, day) : null;
  }

  // Slash numeric (03/04/2025) is ambiguous between DMY and MDY: skip.
  return null;
}

/**
 * Extract a LocalDate from an API date-ish value (ISO date or datetime
 * string). Returns null for anything unrecognizable.
 */
export function localDateFromIso(value: string): LocalDate | null {
  const m = /^(\d{4}-\d{2}-\d{2})([T ].*)?$/.exec(value.trim());
  if (!m) return null;
  return isLocalDate(m[1]!) ? (m[1] as LocalDate) : null;
}
