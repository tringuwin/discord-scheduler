import { StringSelectMenuOptionBuilder } from 'discord.js';
import { DateTime } from 'luxon';
import { dateKey, formatDateLabel, formatTimeOfDay } from '../domain/appTime';
import { computeSlots, intersectSlots, HORIZON_DAYS, type Slot } from '../domain/slots';
import { availabilityRepo } from '../repositories/availabilityRepo';
import { bookingRepo } from '../repositories/bookingRepo';

/** Discord caps a select menu at 25 options. */
export const MAX_OPTIONS = 25;

/** Slots when *all* the given admins are simultaneously free (shared by /book and /reschedule). */
export async function loadCommonSlots(
  guildId: string,
  adminIds: string[],
  slotMinutes: number,
): Promise<Slot[]> {
  const now = DateTime.utc();
  const perAdmin: Slot[][] = [];
  for (const adminId of adminIds) {
    const rules = await availabilityRepo.listForAdmin(guildId, adminId);
    if (rules.length === 0) return []; // an admin with no availability => no common slot
    const reserved = await bookingRepo.reservedStartsForAdmin(adminId, now.toJSDate());
    perAdmin.push(
      computeSlots({
        rules,
        slotMinutes,
        reservedStartUtc: new Set(reserved),
        now,
        horizonDays: HORIZON_DAYS,
      }),
    );
  }
  return intersectSlots(perAdmin);
}

/** Distinct day options (yyyy-LL-dd values, Pacific labels) for a set of slots. */
export function dateOptions(slots: Slot[]): StringSelectMenuOptionBuilder[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const slot of slots) {
    const key = dateKey(slot.startUtc);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys
    .slice(0, MAX_OPTIONS)
    .map((key) => new StringSelectMenuOptionBuilder().setLabel(formatDateLabel(key)).setValue(key));
}

/** Time options (epoch-ms values, Pacific AM/PM labels) for slots on one day. */
export function timeOptions(slots: Slot[], day: string): StringSelectMenuOptionBuilder[] {
  return slots
    .filter((slot) => dateKey(slot.startUtc) === day)
    .slice(0, MAX_OPTIONS)
    .map((slot) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(formatTimeOfDay(slot.startUtc))
        .setValue(String(slot.startUtc.getTime())),
    );
}
