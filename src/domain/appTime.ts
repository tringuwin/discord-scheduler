import { DateTime } from 'luxon';

/**
 * The single timezone the whole app schedules and displays in. Pacific with
 * DST (America/Los_Angeles), so times always match a California wall clock —
 * shown as PST in winter and PDT in summer. There is no per-user timezone.
 */
export const APP_TZ = 'America/Los_Angeles';

/** Human label for the app timezone, used in "times shown in …" copy. */
export const TZ_LABEL = 'Pacific Time';

/** A slot's start time-of-day in Pacific, 12-hour, e.g. "2:30 PM". */
export function formatTimeOfDay(startUtc: Date): string {
  return DateTime.fromJSDate(startUtc).setZone(APP_TZ).toFormat('h:mm a');
}

/** A friendly label for a yyyy-LL-dd key interpreted in Pacific, e.g. "Mon, Sep 8". */
export function formatDateLabel(dateKey: string): string {
  return DateTime.fromFormat(dateKey, 'yyyy-LL-dd', { zone: APP_TZ }).toFormat('ccc, LLL d');
}

/** A full human label for a slot start, e.g. "Mon, Sep 8 2026 • 2:30 PM PDT". */
export function formatDateTime(startUtc: Date): string {
  return DateTime.fromJSDate(startUtc).setZone(APP_TZ).toFormat("ccc, LLL d yyyy '•' h:mm a ZZZZ");
}

/** The calendar-date key ("yyyy-LL-dd") a slot falls on, in Pacific. */
export function dateKey(startUtc: Date): string {
  return DateTime.fromJSDate(startUtc).setZone(APP_TZ).toFormat('yyyy-LL-dd');
}
