import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from './types';
import { formatDateTime } from '../domain/appTime';
import { dmUsers } from '../interactions/bookingNotifications';
import { openMeetingChannel } from '../scheduler/channels';
import { meetingRepo } from '../repositories/meetingRepo';
import { accepteesToNotify, resolveAdminBooking } from './bookingLookup';

export const startEarlyCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('start-early')
    .setDescription('Open a booking’s meeting channel now, before its scheduled time')
    .addIntegerOption((o) =>
      o.setName('number').setDescription('The booking number (see /my-schedule)').setRequired(true).setMinValue(1),
    ),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }

    const number = interaction.options.getInteger('number', true);
    const lookup = await resolveAdminBooking(interaction.guildId, number, interaction.user.id);
    if (!lookup.ok) {
      await interaction.reply({ content: lookup.message, flags: MessageFlags.Ephemeral });
      return;
    }
    const { booking } = lookup;

    if (booking.status !== 'confirmed') {
      await interaction.reply({
        content: `Booking **#${number}** is ${booking.status} — it can't be started.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const existing = await meetingRepo.channelForBooking(booking.id);
    if (existing) {
      await interaction.reply({
        content: `Booking **#${number}** is already live: <#${existing.channelId}>.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Discord can be slow to create a channel; defer so we don't hit the 3s window.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const channelId = await openMeetingChannel(interaction.client, booking);
    if (!channelId) {
      await interaction.editReply({
        content: `Couldn't open a channel for booking **#${number}**. Check the bot's permissions and try again.`,
      });
      return;
    }
    await meetingRepo.recordChannel(booking.id, channelId);
    await meetingRepo.markReminded(booking.id); // it's live now — no separate reminder needed

    await interaction.editReply({
      content: `Started booking **#${number}** early — the meeting channel is open: <#${channelId}>.`,
    });

    await dmUsers(
      interaction.client,
      accepteesToNotify(booking, interaction.user.id),
      `▶️ Your meeting (booking **#${number}**, scheduled ${formatDateTime(booking.startUtc)}) is starting now: <#${channelId}>.`,
    );
  },
};
