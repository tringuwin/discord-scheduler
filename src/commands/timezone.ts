import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from './types';
import { isValidTimezone, searchTimezones } from '../domain/timezone';
import { userPrefRepo } from '../repositories/userPrefRepo';

export const timezoneCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('timezone')
    .setDescription('Set the timezone used when scheduling with you')
    .addSubcommand((s) =>
      s
        .setName('set')
        .setDescription('Set your timezone')
        .addStringOption((o) =>
          o
            .setName('zone')
            .setDescription('IANA timezone, e.g. America/New_York')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) => s.setName('view').setDescription('Show your current timezone')),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === 'view') {
      const pref = await userPrefRepo.get(interaction.user.id);
      await interaction.reply({
        content: pref
          ? `Your timezone is **${pref.timezone}**.`
          : 'You have not set a timezone yet. Use `/timezone set`.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const zone = interaction.options.getString('zone', true);
    if (!isValidTimezone(zone)) {
      await interaction.reply({
        content: `\`${zone}\` is not a valid IANA timezone. Re-run \`/timezone set\` and pick from the suggestions.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await userPrefRepo.set(interaction.user.id, zone);
    await interaction.reply({ content: `Timezone set to **${zone}**.`, flags: MessageFlags.Ephemeral });
  },

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const matches = searchTimezones(focused);
    await interaction.respond(matches.map((tz) => ({ name: tz, value: tz })));
  },
};
