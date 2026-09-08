import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from './types';
import { buildAdminPicker } from '../interactions/bookingWizard';
import { bookingRepo } from '../repositories/bookingRepo';

export const bookCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('book')
    .setDescription('Book a meeting with an available admin'),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }

    const adminIds = await bookingRepo.adminsWithAvailability(interaction.guildId);
    if (adminIds.length === 0) {
      await interaction.reply({
        content: 'No admins have published availability yet. Check back later.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const row = await buildAdminPicker(interaction.guild, adminIds);
    await interaction.reply({
      content: 'Who would you like to meet with?',
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  },
};
