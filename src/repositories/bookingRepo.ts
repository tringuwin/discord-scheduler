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
  note?: string | null;
}

export type CreateBookingResult =
  | { ok: true; booking: Booking }
  | { ok: false; reason: 'slot_taken' };

export type CancelResult =
  | { ok: true; booking: Booking }
  | { ok: false; reason: 'not_found' | 'not_active' | 'forbidden' };

export type RescheduleResult =
  | { ok: true; booking: Booking }
  | { ok: false; reason: 'not_active' | 'already_started' | 'slot_taken' };

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
        // Atomically claim the next per-guild booking number. The row-level
        // increment serialises concurrent bookings, so numbers never collide.
        const guild = await tx.guild.update({
          where: { id: input.guildId },
          data: { bookingSeq: { increment: 1 } },
          select: { bookingSeq: true },
        });
        const created = await tx.booking.create({
          data: {
            guildId: input.guildId,
            number: guild.bookingSeq,
            organizerId: input.organizerId,
            status: 'confirmed',
            note: input.note ?? null,
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

  /** Look up a booking by its human-facing per-guild number. */
  findByNumber(guildId: string, number: number): Promise<BookingWithParticipants | null> {
    return prisma.booking.findUnique({
      where: { guildId_number: { guildId, number } },
      include: { participants: true },
    });
  },

  /**
   * Move a confirmed booking to a new time, re-reserving every admin's slot
   * atomically. Refuses a meeting that already went live (has a channel). The
   * unique (adminId, startUtc) index guards against double-booking the new slot.
   */
  async reschedule(bookingId: string, newStart: Date, newEnd: Date): Promise<RescheduleResult> {
    const existing = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { reservations: true, channel: true },
    });
    if (!existing || existing.status !== 'confirmed') return { ok: false, reason: 'not_active' };
    if (existing.channel) return { ok: false, reason: 'already_started' };

    const adminIds = [...new Set(existing.reservations.map((r) => r.adminId))];
    try {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.slotReservation.deleteMany({ where: { bookingId } });
        for (const adminId of adminIds) {
          await tx.slotReservation.create({ data: { adminId, startUtc: newStart, bookingId } });
        }
        return tx.booking.update({
          where: { id: bookingId },
          data: { startUtc: newStart, endUtc: newEnd, reminded: false },
        });
      });
      return { ok: true, booking: updated };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { ok: false, reason: 'slot_taken' };
      }
      throw error;
    }
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
