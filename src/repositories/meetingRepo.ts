import { Prisma, type MeetingChannel } from '@prisma/client';
import { prisma } from '../db/client';

const bookingWithParticipants = Prisma.validator<Prisma.BookingDefaultArgs>()({
  include: { participants: true },
});
export type BookingWithParticipants = Prisma.BookingGetPayload<typeof bookingWithParticipants>;

const bookingWithGuild = Prisma.validator<Prisma.BookingDefaultArgs>()({
  include: { participants: true, guild: true },
});
export type BookingWithGuild = Prisma.BookingGetPayload<typeof bookingWithGuild>;

const channelWithBooking = Prisma.validator<Prisma.MeetingChannelDefaultArgs>()({
  include: { booking: true },
});
export type MeetingChannelWithBooking = Prisma.MeetingChannelGetPayload<typeof channelWithBooking>;

/** Data access for the live-meeting lifecycle (channels, reminders, cleanup). */
export const meetingRepo = {
  /** Confirmed bookings that have started but have no channel yet. */
  dueToOpen(now: Date): Promise<BookingWithParticipants[]> {
    return prisma.booking.findMany({
      where: { status: 'confirmed', startUtc: { lte: now }, channel: { is: null } },
      include: { participants: true },
    });
  },

  /** Confirmed, not-yet-reminded bookings starting within the max lead window. */
  dueForReminder(now: Date, maxLeadMinutes: number): Promise<BookingWithGuild[]> {
    const windowEnd = new Date(now.getTime() + maxLeadMinutes * 60_000);
    return prisma.booking.findMany({
      where: { status: 'confirmed', reminded: false, startUtc: { gt: now, lte: windowEnd } },
      include: { participants: true, guild: true },
    });
  },

  async markReminded(bookingId: string): Promise<void> {
    await prisma.booking.update({ where: { id: bookingId }, data: { reminded: true } });
  },

  /** Mark a booking concluded without opening a channel (missed / no-show). */
  async markDone(bookingId: string): Promise<void> {
    await prisma.booking.update({ where: { id: bookingId }, data: { status: 'done' } });
  },

  recordChannel(bookingId: string, channelId: string): Promise<MeetingChannel> {
    return prisma.meetingChannel.create({ data: { bookingId, channelId } });
  },

  async markEverJoined(bookingId: string): Promise<void> {
    await prisma.meetingChannel.update({ where: { bookingId }, data: { everJoined: true } });
  },

  allChannels(): Promise<MeetingChannelWithBooking[]> {
    return prisma.meetingChannel.findMany({ include: { booking: true } });
  },

  findByChannelId(channelId: string): Promise<MeetingChannelWithBooking | null> {
    return prisma.meetingChannel.findUnique({ where: { channelId }, include: { booking: true } });
  },

  /** The open channel for a booking, if one exists. */
  channelForBooking(bookingId: string): Promise<MeetingChannel | null> {
    return prisma.meetingChannel.findUnique({ where: { bookingId } });
  },

  /** Remove the channel record and mark the booking done, atomically. */
  async closeMeeting(bookingId: string): Promise<void> {
    await prisma.$transaction([
      prisma.meetingChannel.deleteMany({ where: { bookingId } }),
      prisma.booking.update({ where: { id: bookingId }, data: { status: 'done' } }),
    ]);
  },
};
