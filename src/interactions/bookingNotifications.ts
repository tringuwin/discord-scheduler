import type { Client } from 'discord.js';
import type { Guild } from '@prisma/client';
import { formatSlotFull } from '../domain/slots';
import { userPrefRepo } from '../repositories/userPrefRepo';

export interface AdminBookingNotice {
  adminIds: string[];
  organizerId: string;
  startUtc: Date;
  guild: Guild;
}

/**
 * The DM an admin receives when someone books them: who booked them and when,
 * with the time rendered in the given timezone. Pure so it can be unit-tested.
 */
export function buildBookingNotice(organizerId: string, startUtc: Date, tz: string): string {
  return (
    `📅 <@${organizerId}> just booked a meeting with you for ` +
    `**${formatSlotFull(startUtc, tz)}** (${tz}).\n` +
    'See everyone who has booked you with `/my-schedule`.'
  );
}

/**
 * Best-effort: DM each booked admin that they were booked. The booking has
 * already been confirmed, so a closed-DM admin (or one who left the server)
 * must never fail the flow — every send is guarded. The organizer, who made
 * the booking, is skipped since they already saw the confirmation.
 */
export async function notifyAdminsOfBooking(client: Client, notice: AdminBookingNotice): Promise<void> {
  const { adminIds, organizerId, startUtc, guild } = notice;
  for (const adminId of adminIds) {
    if (adminId === organizerId) continue;
    const user = await client.users.fetch(adminId).catch(() => null);
    if (!user) continue;
    const pref = await userPrefRepo.get(adminId);
    const tz = pref?.timezone ?? guild.defaultTz;
    await user.send({ content: buildBookingNotice(organizerId, startUtc, tz) }).catch(() => undefined);
  }
}
