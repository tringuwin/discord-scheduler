import {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import type { Guild, Prisma } from '@prisma/client';
import type { Command } from './types';
import { guildRepo } from '../repositories/guildRepo';
import { isValidTimezone, searchTimezones } from '../domain/timezone';

function configEmbed(guild: Guild): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('Scheduling configuration')
    .addFields(
      { name: 'Admin role', value: guild.adminRoleId ? `<@&${guild.adminRoleId}>` : '_not set_', inline: true },
      { name: 'Meeting category', value: guild.categoryId ? `<#${guild.categoryId}>` : '_not set_', inline: true },
      { name: 'Default timezone', value: guild.defaultTz, inline: true },
      { name: 'Slot length', value: `${guild.slotMinutes} min`, inline: true },
      { name: 'Reminder lead', value: `${guild.reminderMinutes} min`, inline: true },
    );
}

export const configCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure the scheduling bot (server managers only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s.setName('view').setDescription('Show the current configuration'))
    .addSubcommand((s) =>
      s
        .setName('set')
        .setDescription('Update one or more configuration values')
        .addRoleOption((o) =>
          o.setName('admin-role').setDescription('Role whose members can set availability and be booked'),
        )
        .addChannelOption((o) =>
          o
            .setName('category')
            .setDescription('Category to create meeting voice channels under')
            .addChannelTypes(ChannelType.GuildCategory),
        )
        .addStringOption((o) =>
          o.setName('default-timezone').setDescription('Fallback timezone for the server').setAutocomplete(true),
        )
        .addIntegerOption((o) =>
          o
            .setName('slot-minutes')
            .setDescription('Meeting slot length in minutes')
            .setMinValue(5)
            .setMaxValue(240),
        )
        .addIntegerOption((o) =>
          o
            .setName('reminder-minutes')
            .setDescription('Minutes before start to send a reminder (0 = off)')
            .setMinValue(0)
            .setMaxValue(1440),
        ),
    ),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }

    const guild = await guildRepo.ensure(interaction.guildId);

    if (interaction.options.getSubcommand() === 'view') {
      await interaction.reply({ embeds: [configEmbed(guild)], flags: MessageFlags.Ephemeral });
      return;
    }

    const data: Prisma.GuildUpdateInput = {};
    const role = interaction.options.getRole('admin-role');
    if (role) data.adminRoleId = role.id;

    const category = interaction.options.getChannel('category');
    if (category) data.categoryId = category.id;

    const tz = interaction.options.getString('default-timezone');
    if (tz) {
      if (!isValidTimezone(tz)) {
        await interaction.reply({
          content: `\`${tz}\` is not a valid IANA timezone.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      data.defaultTz = tz;
    }

    const slot = interaction.options.getInteger('slot-minutes');
    if (slot !== null) data.slotMinutes = slot;

    const reminder = interaction.options.getInteger('reminder-minutes');
    if (reminder !== null) data.reminderMinutes = reminder;

    if (Object.keys(data).length === 0) {
      await interaction.reply({
        content: 'Nothing to update — provide at least one option.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const updated = await guildRepo.update(interaction.guildId, data);
    await interaction.reply({
      content: 'Configuration updated.',
      embeds: [configEmbed(updated)],
      flags: MessageFlags.Ephemeral,
    });
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    await interaction.respond(searchTimezones(focused).map((tz) => ({ name: tz, value: tz })));
  },
};
