import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  UserSelectMenuBuilder,
  type ButtonInteraction,
  type UserSelectMenuInteraction,
} from 'discord.js';
import { CID } from './customIds';
import { formatDateTime } from '../domain/appTime';
import { bookingRepo } from '../repositories/bookingRepo';
import { meetingRepo } from '../repositories/meetingRepo';
import { grantChannelAccess } from '../scheduler/channels';

const MAX_INVITES = 10;

const mention = (id: string): string => `<@${id}>`;

/** Organizer clicked "Invite" on a /my-bookings entry → show the user picker. */
export async function handleInviteStart(interaction: ButtonInteraction): Promise<void> {
  const bookingId = interaction.customId.slice(CID.inviteStartPrefix.length);
  const booking = await bookingRepo.findById(bookingId);

  if (!booking || booking.status !== 'confirmed') {
    await interaction.reply({ content: 'That meeting is no longer active.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (booking.organizerId !== interaction.user.id) {
    await interaction.reply({ content: 'Only the organizer can invite people.', flags: MessageFlags.Ephemeral });
    return;
  }

  const menu = new UserSelectMenuBuilder()
    .setCustomId(`${CID.inviteUsersPrefix}${bookingId}`)
    .setPlaceholder('Choose members to invite')
    .setMinValues(1)
    .setMaxValues(MAX_INVITES);

  await interaction.reply({
    content: 'Who would you like to add to this meeting?',
    components: [new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(menu)],
    flags: MessageFlags.Ephemeral,
  });
}

/** Organizer picked members → DM each an invite and record it. */
export async function handleInviteSelect(interaction: UserSelectMenuInteraction): Promise<void> {
  const bookingId = interaction.customId.slice(CID.inviteUsersPrefix.length);
  const booking = await bookingRepo.findById(bookingId);

  if (!booking || booking.status !== 'confirmed') {
    await interaction.update({ content: 'That meeting is no longer active.', components: [] });
    return;
  }
  if (booking.organizerId !== interaction.user.id) {
    await interaction.update({ content: 'Only the organizer can invite people.', components: [] });
    return;
  }

  const invited: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];

  for (const [id, user] of interaction.users) {
    if (user.bot) {
      skipped.push(id);
      continue;
    }
    if (await bookingRepo.getParticipant(bookingId, id)) {
      skipped.push(id); // already the organizer/admin or already invited
      continue;
    }

    const dmRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${CID.inviteAcceptPrefix}${bookingId}`).setLabel('Accept').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`${CID.inviteDeclinePrefix}${bookingId}`).setLabel('Decline').setStyle(ButtonStyle.Danger),
    );

    const sent = await user
      .send({
        content:
          `${mention(booking.organizerId)} invited you to a meeting on ` +
          `**${formatDateTime(booking.startUtc)}**. A private voice channel opens at start time.`,
        components: [dmRow],
      })
      .then(() => true)
      .catch(() => false);

    if (!sent) {
      failed.push(id);
      continue;
    }
    await bookingRepo.createInvitee(bookingId, id);
    invited.push(id);
  }

  const lines: string[] = [];
  if (invited.length) lines.push(`Invited: ${invited.map(mention).join(', ')}`);
  if (skipped.length) lines.push(`Skipped (already in the meeting or a bot): ${skipped.map(mention).join(', ')}`);
  if (failed.length) lines.push(`Couldn't DM (their DMs may be closed): ${failed.map(mention).join(', ')}`);

  await interaction.update({ content: lines.join('\n') || 'No one was invited.', components: [] });
}

/** Invitee accepted (from their DM). */
export async function handleInviteAccept(interaction: ButtonInteraction): Promise<void> {
  const bookingId = interaction.customId.slice(CID.inviteAcceptPrefix.length);
  const booking = await bookingRepo.findById(bookingId);
  const participant = booking ? await bookingRepo.getParticipant(bookingId, interaction.user.id) : null;

  if (!booking || !participant) {
    await interaction.update({ content: 'This invitation is no longer valid.', components: [] });
    return;
  }
  if (booking.status !== 'confirmed') {
    await interaction.update({ content: 'That meeting is no longer scheduled.', components: [] });
    return;
  }

  await bookingRepo.setParticipantState(bookingId, interaction.user.id, 'accepted');

  // If the meeting is already live, grant access to the channel immediately.
  const channel = await meetingRepo.channelForBooking(bookingId);
  if (channel) {
    await grantChannelAccess(interaction.client, booking.guildId, channel.channelId, interaction.user.id);
  }

  await interaction.update({
    content: "You're in! You'll be added to the private voice channel when the meeting starts.",
    components: [],
  });
}

/** Invitee declined (from their DM). */
export async function handleInviteDecline(interaction: ButtonInteraction): Promise<void> {
  const bookingId = interaction.customId.slice(CID.inviteDeclinePrefix.length);
  const participant = await bookingRepo.getParticipant(bookingId, interaction.user.id);
  if (participant) {
    await bookingRepo.setParticipantState(bookingId, interaction.user.id, 'declined');
  }
  await interaction.update({ content: 'You declined the invitation.', components: [] });
}
