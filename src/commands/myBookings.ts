import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ButtonInteraction,
  type InteractionReplyOptions,
} from 'discord.js';
import type { Command } from './types';
import { CID } from '../interactions/customIds';
import { formatSlotFull } from '../domain/slots';
import { bookingRepo } from '../repositories/bookingRepo';
import { guildRepo } from '../repositories/guildRepo';
import { userPrefRepo } from '../repositories/userPrefRepo';

/** How many upcoming bookings to show (one cancel button per action row; max 5). */
const MAX_SHOWN = 5;

/** Build the /my-bookings view for a user (shared by the command and cancel button). */
async function renderMyBookings(guildId: string, userId: string): Promise<InteractionReplyOptions> {
  const guild = await guildRepo.ensure(guildId);
  const pref = await userPrefRepo.get(userId);
  const tz = pref?.timezone ?? guild.defaultTz;

  const bookings = await bookingRepo.listUpcomingForUser(guildId, userId, new Date());
  if (bookings.length === 0) {
    return { content: 'You have no upcoming bookings. Use `/book` to schedule one.', components: [] };
  }

  const shown = bookings.slice(0, MAX_SHOWN);
  const lines = shown.map((b, i) => {
    const withWhom = b.organizerId === userId ? `admin <@${b.adminId}>` : `<@${b.organizerId}>`;
    return `**${i + 1}.** ${formatSlotFull(b.startUtc, tz)} — with ${withWhom}`;
  });

  const embed = new EmbedBuilder()
    .setTitle('Your upcoming bookings')
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Times shown in ${tz}` });

  // Buttons depend on the viewer's role: organizers can invite and cancel,
  // the meeting's admin can cancel, invitees get no controls here.
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  shown.forEach((b, i) => {
    const isOrganizer = b.organizerId === userId;
    const isAdmin = b.adminId === userId;
    const buttons: ButtonBuilder[] = [];
    if (isOrganizer) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`${CID.inviteStartPrefix}${b.id}`)
          .setLabel(`Invite #${i + 1}`)
          .setStyle(ButtonStyle.Primary),
      );
    }
    if (isOrganizer || isAdmin) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`${CID.myBookingCancelPrefix}${b.id}`)
          .setLabel(`Cancel #${i + 1}`)
          .setStyle(ButtonStyle.Danger),
      );
    }
    if (buttons.length > 0) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons));
    }
  });

  const note = bookings.length > MAX_SHOWN ? `\n_Showing the next ${MAX_SHOWN} of ${bookings.length}._` : '';
  return { content: note || undefined, embeds: [embed], components: rows };
}

export const myBookingsCommand: Command = {
  data: new SlashCommandBuilder().setName('my-bookings').setDescription('View and cancel your upcoming meetings'),

  async execute(interaction) {
    if (!interaction.inCachedGuild()) {
      await interaction.reply({ content: 'Use this command in a server.', flags: MessageFlags.Ephemeral });
      return;
    }
    const view = await renderMyBookings(interaction.guildId, interaction.user.id);
    await interaction.reply({ ...view, flags: MessageFlags.Ephemeral });
  },
};

/** Cancel button handler: cancel then re-render the (ephemeral) list in place. */
export async function handleMyBookingCancel(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) return;
  const bookingId = interaction.customId.slice(CID.myBookingCancelPrefix.length);
  const result = await bookingRepo.cancel(bookingId, interaction.user.id);

  if (!result.ok) {
    const message =
      result.reason === 'forbidden'
        ? 'Only the organizer or the meeting admin can cancel that booking.'
        : 'That booking is no longer active.';
    await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    return;
  }

  const view = await renderMyBookings(interaction.guildId, interaction.user.id);
  await interaction.update({
    content: view.content ?? 'Booking cancelled.',
    embeds: view.embeds ?? [],
    components: view.components ?? [],
  });
}
