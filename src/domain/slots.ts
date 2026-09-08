import { DateTime } from 'luxon';

/** How far ahead bookable slots are offered. */
export const HORIZON_DAYS = 14;

/** Minimum notice before a slot's start for it to be offered. */
export const LEAD_MINUTES = 0;

/** One bookable slot, as absolute UTC instants. */
export interface Slot {
  startUtc: Date;
  endUtc: Date;
}

/** A recurring weekly availability block (subset of the persisted rule). */
export interface Rule {
  dayOfWeek: number; // Luxon weekday: 1=Mon ... 7=Sun
  startMin: number; // minutes from midnight in `tz`
  endMin: number;
  tz: string; // IANA timezone the times are expressed in
}

export interface ComputeSlotsParams {
  rules: Rule[];
  slotMinutes: number;
  /** Epoch-millis of slot starts already taken (per admin). */
  reservedStartUtc: ReadonlySet<number>;
  /** "Now" as a Luxon DateTime (any zone; compared as an instant). */
  now: DateTime;
  horizonDays?: number;
  leadMinutes?: number;
}

/**
 * Compute the bookable slots for a set of weekly availability rules.
 *
 * Rules are expanded across the horizon in each rule's own timezone (so DST is
 * handled correctly), sliced into fixed-length slots that must fully fit inside
 * the block, then filtered to remove past slots and already-reserved instants.
 * The result is de-duplicated by start instant and sorted ascending.
 */
export function computeSlots(params: ComputeSlotsParams): Slot[] {
  const {
    rules,
    slotMinutes,
    reservedStartUtc,
    now,
    horizonDays = HORIZON_DAYS,
    leadMinutes = LEAD_MINUTES,
  } = params;

  const earliest = now.toUTC().plus({ minutes: leadMinutes });
  const byStart = new Map<number, Slot>();

  for (const rule of rules) {
    const firstDay = now.setZone(rule.tz).startOf('day');

    for (let dayOffset = 0; dayOffset <= horizonDays; dayOffset++) {
      const day = firstDay.plus({ days: dayOffset });
      if (day.weekday !== rule.dayOfWeek) continue;

      for (let minute = rule.startMin; minute + slotMinutes <= rule.endMin; minute += slotMinutes) {
        const localStart = day.set({
          hour: Math.floor(minute / 60),
          minute: minute % 60,
          second: 0,
          millisecond: 0,
        });
        if (!localStart.isValid) continue;

        const startUtc = localStart.toUTC();
        if (startUtc <= earliest) continue;

        const ms = startUtc.toMillis();
        if (reservedStartUtc.has(ms) || byStart.has(ms)) continue;

        byStart.set(ms, {
          startUtc: startUtc.toJSDate(),
          endUtc: startUtc.plus({ minutes: slotMinutes }).toJSDate(),
        });
      }
    }
  }

  return [...byStart.values()].sort((a, b) => a.startUtc.getTime() - b.startUtc.getTime());
}

/**
 * Intersect several slot lists by start instant — the slots that are free for
 * *every* set. Used to offer only times when all chosen admins are available.
 */
export function intersectSlots(slotSets: Slot[][]): Slot[] {
  if (slotSets.length === 0) return [];
  const current = new Map<number, Slot>(slotSets[0]!.map((s) => [s.startUtc.getTime(), s]));
  for (let i = 1; i < slotSets.length; i++) {
    const times = new Set(slotSets[i]!.map((s) => s.startUtc.getTime()));
    for (const ms of [...current.keys()]) {
      if (!times.has(ms)) current.delete(ms);
    }
    if (current.size === 0) break;
  }
  return [...current.values()].sort((a, b) => a.startUtc.getTime() - b.startUtc.getTime());
}

/** The calendar-date key ("yyyy-LL-dd") a slot falls on, in the viewer's tz. */
export function slotDateKey(startUtc: Date, tz: string): string {
  return DateTime.fromJSDate(startUtc).setZone(tz).toFormat('yyyy-LL-dd');
}

/** A friendly label for a date key, e.g. "Mon, Sep 8". */
export function formatDateKeyLabel(dateKey: string, tz: string): string {
  return DateTime.fromFormat(dateKey, 'yyyy-LL-dd', { zone: tz }).toFormat('ccc, LLL d');
}

/** A slot's start time-of-day in the viewer's tz, e.g. "14:30". */
export function formatSlotTime(startUtc: Date, tz: string): string {
  return DateTime.fromJSDate(startUtc).setZone(tz).toFormat('HH:mm');
}

/** A full human label for a slot start, e.g. "Mon, Sep 8 2026 • 14:30". */
export function formatSlotFull(startUtc: Date, tz: string): string {
  return DateTime.fromJSDate(startUtc).setZone(tz).toFormat("ccc, LLL d yyyy '•' HH:mm");
}
