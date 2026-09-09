import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { CID } from './customIds';
import { formatDateLabel, formatDateTime, TZ_LABEL } from '../domain/appTime';
import { dmUsers } from './bookingNotifications';
import { dateOptions, loadCommonSlots, timeOptions } from './slotPicker';
import { clearReschedule, getReschedule, saveReschedule } from './rescheduleSession';
import { accepteesToNotify } from '../commands/bookingLookup';
import { bookingRepo } from '../repositories/bookingRepo';
import { guildRepo } from '../repositories/guildRepo';

const EXPIRED = 'This reschedule session expired. Please run `/reschedule` again.';

function selectRow(menu: StringSelectMenuBuilder): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

/** Step 1 → 2: new day chosen; present that day's open times. */
export async function handleReschedDate(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) return;
  const draft = getReschedule(interaction.message.id);
  if (!draft) {
    await interaction.update({ content: EXPIRED, components: [] });
    return;
  }

  const day = interaction.values[0]!;
  const guild = await guildRepo.ensure(interaction.guildId);
  const slots = await loadCommonSlots(interaction.guildId, draft.adminIds, guild.slotMinutes);
  const options = timeOptions(slots, day);
  if (options.length === 0) {
    await interaction.update({ content: 'No times remain on that day. Please run `/reschedule` again.', components: [] });
    return;
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(CID.reschedTime)
    .setPlaceholder('Pick a new time')
    .addOptions(options);

  await interaction.update({
    content: `Pick a new time on **${formatDateLabel(day)}** (${TZ_LABEL}):`,
    components: [selectRow(menu)],
  });
}

/** Step 2 → 3: new time chosen; confirm the move. */
export async function handleReschedTime(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) return;
  const draft = getReschedule(interaction.message.id);
  if (!draft) {
    await interaction.update({ content: EXPIRED, components: [] });
    return;
  }

  const startMs = Number(interaction.values[0]);
  saveReschedule(interaction.message.id, { ...draft, startMs });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(CID.reschedConfirm).setLabel('Confirm reschedule').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(CID.reschedAbort).setLabel('Keep current time').setStyle(ButtonStyle.Secondary),
  );

  await interaction.update({
    content: `Move booking **#${draft.number}** to **${formatDateTime(new Date(startMs))}**?`,
    components: [row],
  });
}

/** Step 3: confirm — move the booking atomically, then notify attendees. */
export async function handleReschedConfirm(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) return;
  const draft = getReschedule(interaction.message.id);
  if (!draft || draft.startMs === undefined) {
    await interaction.update({ content: EXPIRED, components: [] });
    return;
  }

  const guild = await guildRepo.ensure(interaction.guildId);
  const startMs = draft.startMs;

  // Re-check the slot is still free for everyone before committing.
  const slots = await loadCommonSlots(interaction.guildId, draft.adminIds, guild.slotMinutes);
  if (!slots.some((slot) => slot.startUtc.getTime() === startMs)) {
    clearReschedule(interaction.message.id);
    await interaction.update({
      content: 'That time is no longer available for everyone. Please run `/reschedule` again.',
      components: [],
    });
    return;
  }

  const result = await bookingRepo.reschedule(
    draft.bookingId,
    new Date(startMs),
    new Date(startMs + guild.slotMinutes * 60_000),
  );
  clearReschedule(interaction.message.id);

  if (!result.ok) {
    const message =
      result.reason === 'slot_taken'
        ? 'That time was just taken by someone else. Please run `/reschedule` again.'
        : result.reason === 'already_started'
          ? 'That meeting already started — use `/cancel` instead.'
          : 'That booking is no longer active.';
    await interaction.update({ content: message, components: [] });
    return;
  }

  await interaction.update({
    content: `Rescheduled booking **#${draft.number}** to **${formatDateTime(new Date(startMs))}**.`,
    components: [],
  });

  // Notify the other attendees of the new time (best-effort).
  const refreshed = await bookingRepo.findByNumber(interaction.guildId, draft.number);
  if (refreshed) {
    await dmUsers(
      interaction.client,
      accepteesToNotify(refreshed, interaction.user.id),
      `🔄 Booking **#${draft.number}** was moved to **${formatDateTime(new Date(startMs))}** by <@${interaction.user.id}>.`,
    );
  }
}

/** Abort button on the confirmation step. */
export async function handleReschedAbort(interaction: ButtonInteraction): Promise<void> {
  clearReschedule(interaction.message.id);
  await interaction.update({ content: 'Reschedule cancelled — the booking keeps its current time.', components: [] });
}
