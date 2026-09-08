import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from 'discord.js';
import type { Command } from './types';
import { CID } from '../interactions/customIds';
import { buildDaySelectRow } from '../interactions/availabilityWizard';
import { DAY_LABEL } from '../domain/days';
import { formatMinutes } from '../domain/time';
import { availabilityRepo } from '../repositories/availabilityRepo';
import { guildRepo } from '../repositories/guildRepo';
import { isAdmin } from '../domain/permissions';

export const availabilityCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('availability')
    .setDescription('Manage your weekly bookable availability (admins only)')
    .addSubcommand((s) => s.setName('set').setDescription('Add a weekly availability block'))
    .addSubcommand((s) => s.setName('view').setDescription('View your current availability'))
    .addSubcommand((s) => s.setName('clear').setDescription('Remove all of your availability')),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }

    const guild = await guildRepo.ensure(interaction.guildId);
    if (!isAdmin(interaction.member, guild.adminRoleId)) {
      await interaction.reply({
        content: 'Only members with the configured admin role can manage availability.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      await interaction.reply({
        content: 'Step 1 — pick the day(s), then you will enter a time range:',
        components: [buildDaySelectRow()],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (sub === 'view') {
      const rules = await availabilityRepo.listForAdmin(interaction.guildId, interaction.user.id);
      if (rules.length === 0) {
        await interaction.reply({
          content: 'You have no availability set. Use `/availability set` to add some.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      const lines = rules.map(
        (r) => `**${DAY_LABEL[r.dayOfWeek]}** ${formatMinutes(r.startMin)}–${formatMinutes(r.endMin)} _(${r.tz})_`,
      );
      await interaction.reply({
        embeds: [new EmbedBuilder().setTitle('Your availability').setDescription(lines.join('\n'))],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // sub === 'clear'
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(CID.availClearConfirm).setLabel('Clear all').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(CID.availClearCancel).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
    );
    await interaction.reply({
      content: 'Remove **all** of your availability blocks?',
      components: [row],
      flags: MessageFlags.Ephemeral,
    });
  },
};
