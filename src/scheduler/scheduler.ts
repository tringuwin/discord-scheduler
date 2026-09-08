import type { Client, VoiceState } from 'discord.js';
import { formatSlotFull } from '../domain/slots';
import { meetingRepo, type BookingWithGuild } from '../repositories/meetingRepo';
import { userPrefRepo } from '../repositories/userPrefRepo';
import { deleteMeetingChannel, isChannelEmpty, openMeetingChannel } from './channels';
import { cleanupByAge, isInReminderWindow, isMissed } from './decisions';

const TICK_MS = 30_000;
const EMPTY_GRACE_MS = 2 * 60_000; // absorb brief disconnects before closing
const NO_SHOW_MS = 15 * 60_000; // close if nobody ever joined
const HARD_CAP_MS = 12 * 60 * 60_000; // absolute channel lifetime
const MISSED_AFTER_MS = 60 * 60_000; // don't resurrect long-past meetings
const MAX_REMINDER_MINUTES = 1440; // bound the reminder query window (24h)

/** Channels awaiting a grace-period close, keyed by channel id. */
const pendingClose = new Map<string, NodeJS.Timeout>();

/** Start the periodic scheduler loop. Returns the interval handle. */
export function startScheduler(client: Client): NodeJS.Timeout {
  let running = false;
  const run = async () => {
    if (running) return; // never overlap ticks
    running = true;
    try {
      await tick(client);
    } catch (error) {
      console.error('Scheduler tick failed:', error);
    } finally {
      running = false;
    }
  };
  void run();
  return setInterval(() => void run(), TICK_MS);
}

async function tick(client: Client): Promise<void> {
  const now = new Date();
  await openDueMeetings(client, now);
  await sendDueReminders(client, now);
  await cleanupChannels(client, now);
}

async function openDueMeetings(client: Client, now: Date): Promise<void> {
  const due = await meetingRepo.dueToOpen(now);
  for (const booking of due) {
    if (isMissed(now.getTime(), booking.startUtc.getTime(), MISSED_AFTER_MS)) {
      await meetingRepo.markDone(booking.id);
      continue;
    }
    const channelId = await openMeetingChannel(client, booking);
    if (channelId) await meetingRepo.recordChannel(booking.id, channelId);
  }
}

async function sendDueReminders(client: Client, now: Date): Promise<void> {
  const due = await meetingRepo.dueForReminder(now, MAX_REMINDER_MINUTES);
  for (const booking of due) {
    if (!isInReminderWindow(now.getTime(), booking.startUtc.getTime(), booking.guild.reminderMinutes)) {
      if (booking.guild.reminderMinutes <= 0) await meetingRepo.markReminded(booking.id);
      continue;
    }
    await remindParticipants(client, booking, now);
    await meetingRepo.markReminded(booking.id);
  }
}

async function remindParticipants(client: Client, booking: BookingWithGuild, now: Date): Promise<void> {
  const minutesUntil = Math.max(1, Math.round((booking.startUtc.getTime() - now.getTime()) / 60_000));
  for (const participant of booking.participants) {
    if (participant.state !== 'accepted') continue;
    const user = await client.users.fetch(participant.userId).catch(() => null);
    if (!user) continue;
    const pref = await userPrefRepo.get(participant.userId);
    const tz = pref?.timezone ?? booking.guild.defaultTz;
    await user
      .send({
        content:
          `Reminder: your meeting starts in about ${minutesUntil} min — ` +
          `${formatSlotFull(booking.startUtc, tz)} (${tz}). ` +
          'A private voice channel will open when it starts.',
      })
      .catch(() => undefined);
  }
}

async function cleanupChannels(client: Client, now: Date): Promise<void> {
  const channels = await meetingRepo.allChannels();
  for (const mc of channels) {
    const verdict = cleanupByAge(now.getTime(), mc.createdAt.getTime(), mc.everJoined, {
      noShowMs: NO_SHOW_MS,
      hardCapMs: HARD_CAP_MS,
    });
    if (verdict !== 'none') {
      await closeMeeting(client, mc.booking.guildId, mc.channelId, mc.bookingId);
      continue;
    }
    // Backstop for a voiceStateUpdate we may have missed (e.g. during downtime).
    if (mc.everJoined && (await isChannelEmpty(client, mc.booking.guildId, mc.channelId))) {
      await closeMeeting(client, mc.booking.guildId, mc.channelId, mc.bookingId);
    }
  }
}

async function closeMeeting(
  client: Client,
  guildId: string,
  channelId: string,
  bookingId: string,
): Promise<void> {
  const timer = pendingClose.get(channelId);
  if (timer) {
    clearTimeout(timer);
    pendingClose.delete(channelId);
  }
  await deleteMeetingChannel(client, guildId, channelId);
  await meetingRepo.closeMeeting(bookingId);
}

/**
 * React to voice joins/leaves on our meeting channels: record the first join,
 * and when a channel empties, close it after a short grace (the tick is the
 * durable backstop if this handler or the process misses the event).
 */
export async function handleVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
  const client = newState.client;
  const joinedId = newState.channelId;
  const leftId = oldState.channelId;

  if (joinedId && joinedId !== leftId) {
    const mc = await meetingRepo.findByChannelId(joinedId);
    if (mc) {
      if (!mc.everJoined) await meetingRepo.markEverJoined(mc.bookingId);
      const timer = pendingClose.get(joinedId);
      if (timer) {
        clearTimeout(timer); // someone rejoined during the grace window
        pendingClose.delete(joinedId);
      }
    }
  }

  if (leftId && leftId !== joinedId && !pendingClose.has(leftId)) {
    const mc = await meetingRepo.findByChannelId(leftId);
    if (mc && (await isChannelEmpty(client, mc.booking.guildId, leftId))) {
      const timer = setTimeout(() => {
        pendingClose.delete(leftId);
        void closeIfStillEmpty(client, mc.booking.guildId, leftId, mc.bookingId);
      }, EMPTY_GRACE_MS);
      pendingClose.set(leftId, timer);
    }
  }
}

async function closeIfStillEmpty(
  client: Client,
  guildId: string,
  channelId: string,
  bookingId: string,
): Promise<void> {
  if (await isChannelEmpty(client, guildId, channelId)) {
    await deleteMeetingChannel(client, guildId, channelId);
    await meetingRepo.closeMeeting(bookingId);
  }
}
