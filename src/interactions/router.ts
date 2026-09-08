import { MessageFlags, type Interaction } from 'discord.js';
import { commandMap } from '../commands';
import { CID } from './customIds';
import {
  handleClearCancel,
  handleClearConfirm,
  handleDaySelect,
  handleTimesModal,
} from './availabilityWizard';

/**
 * Single entry point for every interaction. Dispatches slash commands and
 * autocompletes to their command, and component/modal interactions by custom id.
 * All handler errors are caught here so a failure never leaves the user hanging.
 */
export async function routeInteraction(interaction: Interaction): Promise<void> {
  try {
    if (interaction.isChatInputCommand()) {
      const command = commandMap.get(interaction.commandName);
      if (command) await command.execute(interaction);
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = commandMap.get(interaction.commandName);
      if (command?.autocomplete) await command.autocomplete(interaction);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === CID.availDays) await handleDaySelect(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith(CID.availTimesPrefix)) await handleTimesModal(interaction);
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId === CID.availClearConfirm) await handleClearConfirm(interaction);
      else if (interaction.customId === CID.availClearCancel) await handleClearCancel(interaction);
      return;
    }
  } catch (error) {
    console.error('Error handling interaction:', error);
    if (
      (interaction.isChatInputCommand() ||
        interaction.isButton() ||
        interaction.isStringSelectMenu() ||
        interaction.isModalSubmit()) &&
      !interaction.replied &&
      !interaction.deferred
    ) {
      await interaction
        .reply({ content: 'Something went wrong handling that. Please try again.', flags: MessageFlags.Ephemeral })
        .catch(() => {
          /* nothing more we can do */
        });
    }
  }
}
