import { ChannelType, PermissionFlagsBits, type Client } from 'discord.js';
import { DateTime } from 'luxon';
import type { BookingWithParticipants } from '../repositories/meetingRepo';
import { guildRepo } from '../repositories/guildRepo';

function channelName(startUtc: Date, tz: string): string {
  return `Meeting ${DateTime.fromJSDate(startUtc).setZone(tz).toFormat('LLL d HH:mm')}`;
}

/**
 * Create the private voice channel for a booking: hidden from @everyone,
 * visible/joinable only to the accepted participants. Posts a starting message
 * that pings them. Returns the new channel id, or null on failure.
 */
export async function openMeetingChannel(client: Client, booking: BookingWithParticipants): Promise<string | null> {
  const guild = await client.guilds.fetch(booking.guildId).catch(() => null);
  if (!guild) return null;

  const config = await guildRepo.get(booking.guildId);
  const accepted = booking.participants.filter((p) => p.state === 'accepted');

  const permissionOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
    ...accepted.map((p) => ({
      id: p.userId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
    })),
  ];

  const channel = await guild.channels
    .create({
      name: channelName(booking.startUtc, config?.defaultTz ?? 'UTC'),
      type: ChannelType.GuildVoice,
      parent: config?.categoryId ?? undefined,
      permissionOverwrites,
    })
    .catch((error: unknown) => {
      console.error(`Failed to create meeting channel for booking ${booking.id}:`, error);
      return null;
    });
  if (!channel) return null;

  const mentions = accepted.map((p) => `<@${p.userId}>`).join(' ');
  await channel
    .send({
      content: `${mentions} your meeting is starting now. This channel closes automatically once everyone leaves.`,
    })
    .catch(() => undefined);

  return channel.id;
}

/** Delete a meeting's voice channel (best-effort; already-gone is fine). */
export async function deleteMeetingChannel(client: Client, guildId: string, channelId: string): Promise<void> {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (channel) await channel.delete('Meeting ended').catch(() => undefined);
}

/** Grant a user View/Connect/Speak on an already-open meeting channel. */
export async function grantChannelAccess(
  client: Client,
  guildId: string,
  channelId: string,
  userId: string,
): Promise<void> {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (channel && channel.isVoiceBased()) {
    await channel.permissionOverwrites
      .edit(userId, { ViewChannel: true, Connect: true, Speak: true })
      .catch(() => undefined);
  }
}

/** Whether a meeting channel currently has no connected members (true if gone). */
export async function isChannelEmpty(client: Client, guildId: string, channelId: string): Promise<boolean> {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return true;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) return true;
  if (channel.isVoiceBased()) return channel.members.size === 0;
  return true;
}
