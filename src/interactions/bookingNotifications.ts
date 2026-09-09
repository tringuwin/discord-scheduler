import type { Client } from 'discord.js';
import { formatDateTime } from '../domain/appTime';

export interface AdminBookingNotice {
  adminIds: string[];
  organizerId: string;
  startUtc: Date;
  note?: string | null;
}

/**
 * The DM an admin receives when someone books them: who booked them, when
 * (in Pacific time), and their optional message. Pure so it can be unit-tested.
 */
export function buildBookingNotice(organizerId: string, startUtc: Date, note?: string | null): string {
  const lines = [`📅 <@${organizerId}> just booked a meeting with you for **${formatDateTime(startUtc)}**.`];
  if (note) lines.push(`💬 ${note}`);
  lines.push('See everyone who has booked you with `/my-schedule`.');
  return lines.join('\n');
}

/**
 * Best-effort: DM each booked admin that they were booked. The booking has
 * already been confirmed, so a closed-DM admin (or one who left the server)
 * must never fail the flow — every send is guarded. The organizer, who made
 * the booking, is skipped since they already saw the confirmation.
 */
export async function notifyAdminsOfBooking(client: Client, notice: AdminBookingNotice): Promise<void> {
  const { adminIds, organizerId, startUtc, note } = notice;
  for (const adminId of adminIds) {
    if (adminId === organizerId) continue;
    const user = await client.users.fetch(adminId).catch(() => null);
    if (!user) continue;
    await user.send({ content: buildBookingNotice(organizerId, startUtc, note) }).catch(() => undefined);
  }
}
