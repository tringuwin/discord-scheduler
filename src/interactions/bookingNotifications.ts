import type { Client } from 'discord.js';
import { formatDateTime } from '../domain/appTime';

export interface AdminBookingNotice {
  bookingNumber: number | null;
  adminIds: string[];
  organizerId: string;
  startUtc: Date;
  note?: string | null;
}

/**
 * The DM an admin receives when someone books them: the booking number, who
 * booked them, when (in Pacific time), and their optional message. Pure so it
 * can be unit-tested.
 */
export function buildBookingNotice(
  bookingNumber: number | null,
  organizerId: string,
  startUtc: Date,
  note?: string | null,
): string {
  const tag = bookingNumber !== null ? `Booking **#${bookingNumber}** — ` : '';
  const lines = [`📅 ${tag}<@${organizerId}> just booked a meeting with you for **${formatDateTime(startUtc)}**.`];
  if (note) lines.push(`💬 ${note}`);
  lines.push('Manage it with `/start-early`, `/reschedule`, or `/cancel` — see all with `/my-schedule`.');
  return lines.join('\n');
}

/**
 * Best-effort: DM each booked admin that they were booked. The booking has
 * already been confirmed, so a closed-DM admin (or one who left the server)
 * must never fail the flow — every send is guarded. The organizer, who made
 * the booking, is skipped since they already saw the confirmation.
 */
export async function notifyAdminsOfBooking(client: Client, notice: AdminBookingNotice): Promise<void> {
  const { bookingNumber, adminIds, organizerId, startUtc, note } = notice;
  for (const adminId of adminIds) {
    if (adminId === organizerId) continue;
    const user = await client.users.fetch(adminId).catch(() => null);
    if (!user) continue;
    await user.send({ content: buildBookingNotice(bookingNumber, organizerId, startUtc, note) }).catch(() => undefined);
  }
}

/** Best-effort DM the same message to a set of users (deduped, failures ignored). */
export async function dmUsers(client: Client, userIds: string[], content: string): Promise<void> {
  for (const id of new Set(userIds)) {
    const user = await client.users.fetch(id).catch(() => null);
    if (!user) continue;
    await user.send({ content }).catch(() => undefined);
  }
}
