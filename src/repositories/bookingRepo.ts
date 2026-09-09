import { Prisma, type Booking, type Participant } from '@prisma/client';
import { prisma } from '../db/client';

const bookingWithParticipants = Prisma.validator<Prisma.BookingDefaultArgs>()({
  include: { participants: true },
});
export type BookingWithParticipants = Prisma.BookingGetPayload<typeof bookingWithParticipants>;

export interface CreateBookingInput {
  guildId: string;
  organizerId: string;
  adminIds: string[];
  startUtc: Date;
  endUtc: Date;
}

export type CreateBookingResult =
  | { ok: true; booking: Booking }
  | { ok: false; reason: 'slot_taken' };

export type CancelResult =
  | { ok: true; booking: Booking }
  | { ok: false; reason: 'not_found' | 'not_active' | 'forbidden' };

/** Data access for bookings, slot reservations, and their participants. */
export const bookingRepo = {
  /** Distinct admins who have at least one availability rule in the guild. */
  async adminsWithAvailability(guildId: string): Promise<string[]> {
    const rows = await prisma.availabilityRule.findMany({
      where: { guildId },
      distinct: ['adminId'],
      select: { adminId: true },
    });
    return rows.map((r) => r.adminId);
  },

  /** Epoch-millis of an admin's reserved slot starts at/after `from`. */
  async reservedStartsForAdmin(adminId: string, from: Date): Promise<number[]> {
    const rows = await prisma.slotReservation.findMany({
      where: { adminId, startUtc: { gte: from } },
      select: { startUtc: true },
    });
    return rows.map((r) => r.startUtc.getTime());
  },

  /**
   * Create a confirmed booking, reserving the slot for every chosen admin
   * atomically. The unique (adminId, startUtc) index is the authoritative guard:
   * if any one admin's slot is already taken, the whole transaction rolls back.
   */
  async createConfirmed(input: CreateBookingInput): Promise<CreateBookingResult> {
    const adminIds = [...new Set(input.adminIds)];
    try {
      const booking = await prisma.$transaction(async (tx) => {
        const created = await tx.booking.create({
          data: {
            guildId: input.guildId,
            organizerId: input.organizerId,
            status: 'confirmed',
            startUtc: input.startUtc,
            endUtc: input.endUtc,
          },
        });
        for (const adminId of adminIds) {
          await tx.slotReservation.create({
            data: { adminId, startUtc: input.startUtc, bookingId: created.id },
          });
        }
        await tx.participant.create({
          data: { bookingId: created.id, userId: input.organizerId, role: 'organizer', state: 'accepted' },
        });
        for (const adminId of adminIds) {
          if (adminId === input.organizerId) continue; // organizer row already created
          await tx.participant.create({
            data: { bookingId: created.id, userId: adminId, role: 'admin', state: 'accepted' },
          });
        }
        return created;
      });
      return { ok: true, booking };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { ok: false, reason: 'slot_taken' };
      }
      throw error;
    }
  },

  /** Confirmed upcoming bookings the user is part of (organizer, admin, or non-declined invitee). */
  async listUpcomingForUser(
    guildId: string,
    userId: string,
    now: Date,
  ): Promise<BookingWithParticipants[]> {
    const parts = await prisma.participant.findMany({
      where: {
        userId,
        state: { not: 'declined' },
        booking: { guildId, status: 'confirmed', startUtc: { gte: now } },
      },
      include: { booking: { include: { participants: true } } },
      orderBy: { booking: { startUtc: 'asc' } },
    });
    return parts.map((p) => p.booking);
  },

  /** Confirmed upcoming bookings where the user is the booked admin. */
  async listUpcomingForAdmin(
    guildId: string,
    adminId: string,
    now: Date,
  ): Promise<BookingWithParticipants[]> {
    const parts = await prisma.participant.findMany({
      where: {
        userId: adminId,
        role: 'admin',
        booking: { guildId, status: 'confirmed', startUtc: { gte: now } },
      },
      include: { booking: { include: { participants: true } } },
      orderBy: { booking: { startUtc: 'asc' } },
    });
    return parts.map((p) => p.booking);
  },

  findById(bookingId: string): Promise<Booking | null> {
    return prisma.booking.findUnique({ where: { id: bookingId } });
  },

  getParticipant(bookingId: string, userId: string): Promise<Participant | null> {
    return prisma.participant.findUnique({ where: { bookingId_userId: { bookingId, userId } } });
  },

  createInvitee(bookingId: string, userId: string): Promise<Participant> {
    return prisma.participant.create({
      data: { bookingId, userId, role: 'invitee', state: 'invited' },
    });
  },

  async setParticipantState(bookingId: string, userId: string, state: string): Promise<void> {
    await prisma.participant.update({
      where: { bookingId_userId: { bookingId, userId } },
      data: { state },
    });
  },

  /** Cancel a booking (organizer or any of its admins only), freeing the slots. */
  async cancel(bookingId: string, requesterId: string): Promise<CancelResult> {
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return { ok: false, reason: 'not_found' };
    if (booking.status !== 'confirmed') return { ok: false, reason: 'not_active' };

    if (booking.organizerId !== requesterId) {
      const participant = await prisma.participant.findUnique({
        where: { bookingId_userId: { bookingId, userId: requesterId } },
      });
      if (!participant || participant.role !== 'admin') return { ok: false, reason: 'forbidden' };
    }

    const [, updated] = await prisma.$transaction([
      prisma.slotReservation.deleteMany({ where: { bookingId } }),
      prisma.booking.update({ where: { id: bookingId }, data: { status: 'cancelled' } }),
    ]);
    return { ok: true, booking: updated };
  },
};
