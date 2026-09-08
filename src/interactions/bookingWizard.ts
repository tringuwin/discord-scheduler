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
import {
  computeSlots,
  formatDateKeyLabel,
  formatSlotFull,
  formatSlotTime,
  slotDateKey,
  HORIZON_DAYS,
  type Slot,
} from '../domain/slots';
import { availabilityRepo } from '../repositories/availabilityRepo';
import { bookingRepo } from '../repositories/bookingRepo';
import { guildRepo } from '../repositories/guildRepo';
import { userPrefRepo } from '../repositories/userPrefRepo';

const MAX_OPTIONS = 25;

/** Resolve the timezone slots should be displayed in for a given viewer. */
async function viewerTz(userId: string, guild: Guild): Promise<string> {
  const pref = await userPrefRepo.get(userId);
  return pref?.timezone ?? guild.defaultTz;
}

/** Best-effort display name for an admin (falls back if they've left). */
async function displayName(guild: DiscordGuild, userId: string): Promise<string> {
  const member = await guild.members.fetch(userId).catch(() => null);
  return member?.displayName ?? 'this admin';
}

/** Fetch and compute the currently bookable slots for an admin. */
async function loadSlots(guildId: string, adminId: string, slotMinutes: number): Promise<Slot[]> {
  const rules = await availabilityRepo.listForAdmin(guildId, adminId);
  if (rules.length === 0) return [];
  const now = DateTime.utc();
  const reserved = await bookingRepo.reservedStartsForAdmin(adminId, now.toJSDate());
  return computeSlots({
    rules,
    slotMinutes,
    reservedStartUtc: new Set(reserved),
    now,
    horizonDays: HORIZON_DAYS,
  });
}

function selectRow(menu: StringSelectMenuBuilder): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

/** Distinct date options (in the viewer tz) that have at least one open slot. */
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

/** Time options for a chosen date (value = slot-start epoch millis). */
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

/** Step 1 → 2: admin chosen, present the days that have openings. */
export async function handleBookAdminSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) return;
  const adminId = interaction.values[0]!;
  const guild = await guildRepo.ensure(interaction.guildId);
  const tz = await viewerTz(interaction.user.id, guild);
  const slots = await loadSlots(interaction.guildId, adminId, guild.slotMinutes);

  if (slots.length === 0) {
    await interaction.update({
      content: 'That admin has no open slots in the next 14 days.',
      components: [],
    });
    return;
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${CID.bookDatePrefix}${adminId}`)
    .setPlaceholder('Pick a day')
    .addOptions(dateOptions(slots, tz));

  await interaction.update({
    content: `Times shown in **${tz}**. Pick a day:`,
    components: [selectRow(menu)],
  });
}

/** Step 2 → 3: date chosen, present that day's times. */
export async function handleBookDateSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) return;
  const adminId = interaction.customId.slice(CID.bookDatePrefix.length);
  const dateKey = interaction.values[0]!;
  const guild = await guildRepo.ensure(interaction.guildId);
  const tz = await viewerTz(interaction.user.id, guild);
  const slots = await loadSlots(interaction.guildId, adminId, guild.slotMinutes);
  const options = timeOptions(slots, tz, dateKey);

  if (options.length === 0) {
    await interaction.update({
      content: 'No times remain on that day. Please run `/book` again.',
      components: [],
    });
    return;
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${CID.bookTimePrefix}${adminId}:${dateKey}`)
    .setPlaceholder('Pick a time')
    .addOptions(options);

  await interaction.update({
    content: `Pick a time on **${formatDateKeyLabel(dateKey, tz)}** (${tz}):`,
    components: [selectRow(menu)],
  });
}

/** Step 3 → 4: time chosen, show a confirmation. */
export async function handleBookTimeSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) return;
  const [adminId] = interaction.customId.slice(CID.bookTimePrefix.length).split(':');
  const startMs = interaction.values[0]!;
  const guild = await guildRepo.ensure(interaction.guildId);
  const tz = await viewerTz(interaction.user.id, guild);
  const name = await displayName(interaction.guild, adminId!);
  const label = formatSlotFull(new Date(Number(startMs)), tz);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CID.bookConfirmPrefix}${adminId}:${startMs}`)
      .setLabel('Confirm booking')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(CID.bookAbort).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );

  await interaction.update({
    content: `Book **${name}** on **${label}** (${tz})?`,
    components: [row],
  });
}

/** Step 4: confirm — create the booking, re-validating and racing safely. */
export async function handleBookConfirm(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) return;
  const [adminId, startMsStr] = interaction.customId.slice(CID.bookConfirmPrefix.length).split(':');
  const startMs = Number(startMsStr);
  const guild = await guildRepo.ensure(interaction.guildId);
  const tz = await viewerTz(interaction.user.id, guild);

  const slots = await loadSlots(interaction.guildId, adminId!, guild.slotMinutes);
  if (!slots.some((slot) => slot.startUtc.getTime() === startMs)) {
    await interaction.update({
      content: 'That slot is no longer available — someone may have just taken it. Please run `/book` again.',
      components: [],
    });
    return;
  }

  const startUtc = new Date(startMs);
  const endUtc = new Date(startMs + guild.slotMinutes * 60_000);
  const result = await bookingRepo.createConfirmed({
    guildId: interaction.guildId,
    organizerId: interaction.user.id,
    adminId: adminId!,
    startUtc,
    endUtc,
  });

  if (!result.ok) {
    await interaction.update({
      content: 'That slot was just taken by someone else. Please run `/book` again.',
      components: [],
    });
    return;
  }

  const name = await displayName(interaction.guild, adminId!);
  await interaction.update({
    content:
      `Booked! Meeting with **${name}** on **${formatSlotFull(startUtc, tz)}** (${tz}).\n` +
      'See it any time with `/my-bookings`.',
    components: [],
  });
}

/** Abort button on the confirmation step. */
export async function handleBookAbort(interaction: ButtonInteraction): Promise<void> {
  await interaction.update({ content: 'Booking cancelled — nothing was reserved.', components: [] });
}

/** Build the admin picker used by the /book command. */
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
    .setPlaceholder('Choose an admin to meet')
    .addOptions(options);
  return selectRow(menu);
}
