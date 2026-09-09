import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from './types';
import { formatDateTime } from '../domain/appTime';
import { dmUsers } from '../interactions/bookingNotifications';
import { deleteMeetingChannel } from '../scheduler/channels';
import { bookingRepo } from '../repositories/bookingRepo';
import { meetingRepo } from '../repositories/meetingRepo';
import { accepteesToNotify, resolveAdminBooking } from './bookingLookup';

export const cancelCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('cancel')
    .setDescription('Cancel a booking by its number')
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
        content: `Booking **#${number}** is already ${booking.status}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Tear down a live channel first (if any), then cancel and free the slots.
    const channel = await meetingRepo.channelForBooking(booking.id);
    const result = await bookingRepo.cancel(booking.id, interaction.user.id);
    if (!result.ok) {
      await interaction.reply({
        content: `Couldn't cancel booking **#${number}** — it may no longer be active.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (channel) {
      await deleteMeetingChannel(interaction.client, booking.guildId, channel.channelId);
      await meetingRepo.removeChannel(booking.id);
    }

    await interaction.reply({
      content: `Cancelled booking **#${number}** (${formatDateTime(booking.startUtc)}). The slot is free again.`,
      flags: MessageFlags.Ephemeral,
    });

    await dmUsers(
      interaction.client,
      accepteesToNotify(booking, interaction.user.id),
      `❌ Booking **#${number}** on **${formatDateTime(booking.startUtc)}** was cancelled by <@${interaction.user.id}>.`,
    );
  },
};
