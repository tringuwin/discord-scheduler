import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ButtonInteraction,
  type Guild as DiscordGuild,
  type StringSelectMenuInteraction,
} from 'discord.js';
import type { Guild } from '@prisma/client';
import { DateTime } from 'luxon';
import { CID } from './customIds';
import { clearDraft, getDraft, saveDraft } from './bookingSession';
import {
  computeSlots,
  formatDateKeyLabel,
  formatSlotFull,
  formatSlotTime,
  intersectSlots,
  slotDateKey,
  HORIZON_DAYS,
  type Slot,
} from '../domain/slots';
import { availabilityRepo } from '../repositories/availabilityRepo';
import { bookingRepo } from '../repositories/bookingRepo';
import { guildRepo } from '../repositories/guildRepo';
import { userPrefRepo } from '../repositories/userPrefRepo';
import { notifyAdminsOfBooking } from './bookingNotifications';

const MAX_OPTIONS = 25;
const EXPIRED = 'This booking session expired. Please run `/book` again.';

async function viewerTz(userId: string, guild: Guild): Promise<string> {
  const pref = await userPrefRepo.get(userId);
  return pref?.timezone ?? guild.defaultTz;
}

/** Best-effort display names for a set of admins (falls back if any have left). */
async function displayNames(guild: DiscordGuild, userIds: string[]): Promise<string> {
  const names = await Promise.all(
    userIds.map(async (id) => {
      const member = await guild.members.fetch(id).catch(() => null);
      return member?.displayName ?? `Admin ${id}`;
    }),
  );
  return names.join(', ');
}

/** Slots when *all* the given admins are simultaneously free. */
async function loadCommonSlots(guildId: string, adminIds: string[], slotMinutes: number): Promise<Slot[]> {
  const now = DateTime.utc();
  const perAdmin: Slot[][] = [];
  for (const adminId of adminIds) {
    const rules = await availabilityRepo.listForAdmin(guildId, adminId);
    if (rules.length === 0) return []; // an admin with no availability => no common slot
    const reserved = await bookingRepo.reservedStartsForAdmin(adminId, now.toJSDate());
    perAdmin.push(
      computeSlots({
        rules,
        slotMinutes,
        reservedStartUtc: new Set(reserved),
        now,
        horizonDays: HORIZON_DAYS,
      }),
    );
  }
  return intersectSlots(perAdmin);
}

function selectRow(menu: StringSelectMenuBuilder): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function dateOptions(slots: Slot[], tz: string): StringSelectMenuOptionBuilder[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const slot of slots) {
    const key = slotDateKey(slot.startUtc, tz);
    if (!seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys
    .slice(0, MAX_OPTIONS)
    .map((key) => new StringSelectMenuOptionBuilder().setLabel(formatDateKeyLabel(key, tz)).setValue(key));
}

function timeOptions(slots: Slot[], tz: string, dateKey: string): StringSelectMenuOptionBuilder[] {
  return slots
    .filter((slot) => slotDateKey(slot.startUtc, tz) === dateKey)
    .slice(0, MAX_OPTIONS)
    .map((slot) =>
      new StringSelectMenuOptionBuilder()
        .setLabel(formatSlotTime(slot.startUtc, tz))
        .setValue(String(slot.startUtc.getTime())),
    );
}

/** Build the admin picker (multi-select) used by the /book command. */
export async function buildAdminPicker(
  guild: DiscordGuild,
  adminIds: string[],
): Promise<ActionRowBuilder<StringSelectMenuBuilder>> {
  const ids = adminIds.slice(0, MAX_OPTIONS);
  const members = await guild.members.fetch({ user: ids }).catch(() => null);
  const options = ids.map((id) =>
    new StringSelectMenuOptionBuilder().setLabel(members?.get(id)?.displayName ?? `Admin ${id}`).setValue(id),
  );
  const menu = new StringSelectMenuBuilder()
    .setCustomId(CID.bookAdmin)
    .setPlaceholder('Choose one or more admins to meet')
    .setMinValues(1)
    .setMaxValues(ids.length)
    .addOptions(options);
  return selectRow(menu);
}

/** Step 1 → 2: admin(s) chosen; present the days everyone is free. */
export async function handleBookAdminSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) return;
  const adminIds = [...new Set(interaction.values)];
  const guild = await guildRepo.ensure(interaction.guildId);
  const tz = await viewerTz(interaction.user.id, guild);
  const slots = await loadCommonSlots(interaction.guildId, adminIds, guild.slotMinutes);

  if (slots.length === 0) {
    clearDraft(interaction.message.id);
    await interaction.update({
      content:
        adminIds.length > 1
          ? 'Those admins have no common openings in the next 14 days. Try fewer admins.'
          : 'That admin has no open slots in the next 14 days.',
      components: [],
    });
    return;
  }

  saveDraft(interaction.message.id, { adminIds });
  const menu = new StringSelectMenuBuilder()
    .setCustomId(CID.bookDate)
    .setPlaceholder('Pick a day')
    .addOptions(dateOptions(slots, tz));

  await interaction.update({
    content: `Times shown in **${tz}**. Pick a day:`,
    components: [selectRow(menu)],
  });
}

/** Step 2 → 3: date chosen; present that day's common times. */
export async function handleBookDateSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) return;
  const draft = getDraft(interaction.message.id);
  if (!draft) {
    await interaction.update({ content: EXPIRED, components: [] });
    return;
  }

  const dateKey = interaction.values[0]!;
  const guild = await guildRepo.ensure(interaction.guildId);
  const tz = await viewerTz(interaction.user.id, guild);
  const slots = await loadCommonSlots(interaction.guildId, draft.adminIds, guild.slotMinutes);
  const options = timeOptions(slots, tz, dateKey);

  if (options.length === 0) {
    await interaction.update({ content: 'No times remain on that day. Please run `/book` again.', components: [] });
    return;
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(CID.bookTime)
    .setPlaceholder('Pick a time')
    .addOptions(options);

  await interaction.update({
    content: `Pick a time on **${formatDateKeyLabel(dateKey, tz)}** (${tz}):`,
    components: [selectRow(menu)],
  });
}

/** Step 3 → 4: time chosen; show a confirmation. */
export async function handleBookTimeSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) return;
  const draft = getDraft(interaction.message.id);
  if (!draft) {
    await interaction.update({ content: EXPIRED, components: [] });
    return;
  }

  const startMs = Number(interaction.values[0]);
  saveDraft(interaction.message.id, { ...draft, startMs });

  const guild = await guildRepo.ensure(interaction.guildId);
  const tz = await viewerTz(interaction.user.id, guild);
  const names = await displayNames(interaction.guild, draft.adminIds);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(CID.bookConfirm).setLabel('Confirm booking').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(CID.bookAbort).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );

  await interaction.update({
    content: `Book **${names}** on **${formatSlotFull(new Date(startMs), tz)}** (${tz})?`,
    components: [row],
  });
}

/** Step 4: confirm — reserve every admin's slot atomically. */
export async function handleBookConfirm(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) return;
  const draft = getDraft(interaction.message.id);
  if (!draft || draft.startMs === undefined) {
    await interaction.update({ content: EXPIRED, components: [] });
    return;
  }

  const guild = await guildRepo.ensure(interaction.guildId);
  const tz = await viewerTz(interaction.user.id, guild);
  const startMs = draft.startMs;

  const slots = await loadCommonSlots(interaction.guildId, draft.adminIds, guild.slotMinutes);
  if (!slots.some((slot) => slot.startUtc.getTime() === startMs)) {
    clearDraft(interaction.message.id);
    await interaction.update({
      content: 'That slot is no longer available for everyone. Please run `/book` again.',
      components: [],
    });
    return;
  }

  const result = await bookingRepo.createConfirmed({
    guildId: interaction.guildId,
    organizerId: interaction.user.id,
    adminIds: draft.adminIds,
    startUtc: new Date(startMs),
    endUtc: new Date(startMs + guild.slotMinutes * 60_000),
  });

  clearDraft(interaction.message.id);

  if (!result.ok) {
    await interaction.update({
      content: 'One of those slots was just taken by someone else. Please run `/book` again.',
      components: [],
    });
    return;
  }

  const names = await displayNames(interaction.guild, draft.adminIds);
  await interaction.update({
    content:
      `Booked! Meeting with **${names}** on **${formatSlotFull(new Date(startMs), tz)}** (${tz}).\n` +
      'See it any time with `/my-bookings`.',
    components: [],
  });

  // Let each booked admin know who booked them and when (best-effort; done
  // after the reply so slow DMs can't miss the interaction response window).
  await notifyAdminsOfBooking(interaction.client, {
    adminIds: draft.adminIds,
    organizerId: interaction.user.id,
    startUtc: new Date(startMs),
    guild,
  });
}

/** Abort button on the confirmation step. */
export async function handleBookAbort(interaction: ButtonInteraction): Promise<void> {
  clearDraft(interaction.message.id);
  await interaction.update({ content: 'Booking cancelled — nothing was reserved.', components: [] });
}
