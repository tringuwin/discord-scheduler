import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { CID } from './customIds';
import { DAY_LABEL, DAY_OPTIONS, isValidDay } from '../domain/days';
import { formatMinutes, parseHmm } from '../domain/time';
import { availabilityRepo } from '../repositories/availabilityRepo';
import { guildRepo } from '../repositories/guildRepo';
import { userPrefRepo } from '../repositories/userPrefRepo';

/** Row 1 of the wizard: pick which day(s) the availability block applies to. */
export function buildDaySelectRow(): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(CID.availDays)
    .setPlaceholder('Select the day(s) this availability applies to')
    .setMinValues(1)
    .setMaxValues(DAY_OPTIONS.length)
    .addOptions(
      DAY_OPTIONS.map((d) => new StringSelectMenuOptionBuilder().setLabel(d.label).setValue(d.value)),
    );
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

/** Step 2: after days are chosen, open a modal to collect the time range. */
export async function handleDaySelect(interaction: StringSelectMenuInteraction): Promise<void> {
  const days = interaction.values.join(',');
  const modal = new ModalBuilder()
    .setCustomId(`${CID.availTimesPrefix}${days}`)
    .setTitle('Availability time range');

  const start = new TextInputBuilder()
    .setCustomId('start')
    .setLabel('Start time (24h, e.g. 09:00)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(3)
    .setMaxLength(5);

  const end = new TextInputBuilder()
    .setCustomId('end')
    .setLabel('End time (24h, e.g. 17:00)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(3)
    .setMaxLength(5);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(start),
    new ActionRowBuilder<TextInputBuilder>().addComponents(end),
  );
  await interaction.showModal(modal);
}

/** Step 3: validate the submitted times and persist a rule per selected day. */
export async function handleTimesModal(interaction: ModalSubmitInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) return;

  const days = interaction.customId
    .slice(CID.availTimesPrefix.length)
    .split(',')
    .map(Number)
    .filter(isValidDay);

  if (days.length === 0) {
    await interaction.reply({
      content: 'No valid days were selected. Please run `/availability set` again.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const startMin = parseHmm(interaction.fields.getTextInputValue('start'));
  const endMin = parseHmm(interaction.fields.getTextInputValue('end'));

  if (startMin === null || endMin === null) {
    await interaction.reply({
      content: 'Times must be in 24-hour HH:MM format (e.g. `09:00`).',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (endMin <= startMin) {
    await interaction.reply({
      content: 'End time must be after the start time.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guild = await guildRepo.ensure(interaction.guildId);
  const pref = await userPrefRepo.get(interaction.user.id);
  const tz = pref?.timezone ?? guild.defaultTz;

  await availabilityRepo.addRules(interaction.guildId, interaction.user.id, days, startMin, endMin, tz);

  const dayNames = days.map((d) => DAY_LABEL[d]).join(', ');
  await interaction.reply({
    content: `Added availability **${formatMinutes(startMin)}–${formatMinutes(endMin)}** (${tz}) on **${dayNames}**.`,
    flags: MessageFlags.Ephemeral,
  });
}

/** Clear-confirmation button: delete every rule for the caller. */
export async function handleClearConfirm(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.inCachedGuild()) return;
  const count = await availabilityRepo.clearForAdmin(interaction.guildId, interaction.user.id);
  await interaction.update({
    content: `Cleared ${count} availability block${count === 1 ? '' : 's'}.`,
    components: [],
  });
}

/** Clear-cancellation button: leave everything untouched. */
export async function handleClearCancel(interaction: ButtonInteraction): Promise<void> {
  await interaction.update({ content: 'Cancelled — nothing was changed.', components: [] });
}
