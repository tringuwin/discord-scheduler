import { EmbedBuilder, MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { Command } from './types';
import { formatSlotFull } from '../domain/slots';
import { bookingRepo } from '../repositories/bookingRepo';
import { guildRepo } from '../repositories/guildRepo';
import { userPrefRepo } from '../repositories/userPrefRepo';

/** How many upcoming bookings to list (Discord embeds get unwieldy past this). */
const MAX_SHOWN = 10;

export const myScheduleCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('my-schedule')
    .setDescription('See who has booked you and when'),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }

    const guild = await guildRepo.ensure(interaction.guildId);
    const pref = await userPrefRepo.get(interaction.user.id);
    const tz = pref?.timezone ?? guild.defaultTz;

    const bookings = await bookingRepo.listUpcomingForAdmin(interaction.guildId, interaction.user.id, new Date());
    if (bookings.length === 0) {
      await interaction.reply({
        content: 'No one has any upcoming bookings with you.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const shown = bookings.slice(0, MAX_SHOWN);
    const lines = shown.map((b, i) => {
      // The organizer is who booked; also surface any invitees who'll attend.
      const guests = b.participants
        .filter((p) => p.userId !== b.organizerId && p.role !== 'admin' && p.state !== 'declined')
        .map((p) => `<@${p.userId}>`);
      const withGuests = guests.length ? ` (with ${guests.join(', ')})` : '';
      const noteLine = b.note ? `\n> 💬 ${b.note}` : '';
      return `**${i + 1}.** ${formatSlotFull(b.startUtc, tz)} — booked by <@${b.organizerId}>${withGuests}${noteLine}`;
    });

    const embed = new EmbedBuilder()
      .setTitle('Upcoming bookings with you')
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Times shown in ${tz}` });

    const note = bookings.length > MAX_SHOWN ? `_Showing the next ${MAX_SHOWN} of ${bookings.length}._` : undefined;
    await interaction.reply({ content: note, embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
