import { bookingRepo, type BookingWithParticipants } from '../repositories/bookingRepo';

export type AdminBookingLookup =
  | { ok: true; booking: BookingWithParticipants }
  | { ok: false; message: string };

/**
 * Resolve a booking by its per-guild number and confirm the caller is one of
 * its admins — the shared gate for /start-early, /reschedule, and /cancel.
 */
export async function resolveAdminBooking(
  guildId: string,
  bookingNumber: number,
  userId: string,
): Promise<AdminBookingLookup> {
  const booking = await bookingRepo.findByNumber(guildId, bookingNumber);
  if (!booking) {
    return { ok: false, message: `No booking **#${bookingNumber}** found in this server.` };
  }
  const isAdmin = booking.participants.some((p) => p.userId === userId && p.role === 'admin');
  if (!isAdmin) {
    return { ok: false, message: `Only an admin on booking **#${bookingNumber}** can manage it.` };
  }
  return { ok: true, booking };
}

/** User ids to notify about a change: everyone still attending, minus the actor. */
export function accepteesToNotify(booking: BookingWithParticipants, actorId: string): string[] {
  return booking.participants
    .filter((p) => p.state === 'accepted' && p.userId !== actorId)
    .map((p) => p.userId);
}
