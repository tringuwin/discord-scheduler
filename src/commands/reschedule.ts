import {
  ActionRowBuilder,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import type { Command } from './types';
import { CID } from '../interactions/customIds';
import { TZ_LABEL } from '../domain/appTime';
import { dateOptions, loadCommonSlots } from '../interactions/slotPicker';
import { saveReschedule } from '../interactions/rescheduleSession';
import { guildRepo } from '../repositories/guildRepo';
import { meetingRepo } from '../repositories/meetingRepo';
import { resolveAdminBooking } from './bookingLookup';

export const rescheduleCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('reschedule')
    .setDescription('Move a booking to a new time by its number')
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
        content: `Booking **#${number}** is ${booking.status} — it can't be rescheduled.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (await meetingRepo.channelForBooking(booking.id)) {
      await interaction.reply({
        content: `Booking **#${number}** is already live. Use \`/cancel\` instead.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const adminIds = booking.participants.filter((p) => p.role === 'admin').map((p) => p.userId);
    const guild = await guildRepo.ensure(interaction.guildId);
    const slots = await loadCommonSlots(interaction.guildId, adminIds, guild.slotMinutes);
    if (slots.length === 0) {
      await interaction.reply({
        content: `No open times to move booking **#${number}** to in the next 14 days.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const menu = new StringSelectMenuBuilder()
      .setCustomId(CID.reschedDate)
      .setPlaceholder('Pick a new day')
      .addOptions(dateOptions(slots));

    await interaction.reply({
      content: `Rescheduling booking **#${number}**. Times shown in **${TZ_LABEL}**. Pick a new day:`,
      components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],
      flags: MessageFlags.Ephemeral,
    });
    const message = await interaction.fetchReply();
    saveReschedule(message.id, { bookingId: booking.id, number, adminIds });
  },
};
