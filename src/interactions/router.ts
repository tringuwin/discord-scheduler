import { MessageFlags, type Interaction } from 'discord.js';
import { commandMap } from '../commands';
import { CID } from './customIds';
import {
  handleClearCancel,
  handleClearConfirm,
  handleDaySelect,
  handleTimesModal,
} from './availabilityWizard';
import {
  handleBookAbort,
  handleBookAdminSelect,
  handleBookConfirm,
  handleBookDateSelect,
  handleBookTimeSelect,
} from './bookingWizard';
import { handleMyBookingCancel } from '../commands/myBookings';
import {
  handleInviteAccept,
  handleInviteDecline,
  handleInviteSelect,
  handleInviteStart,
} from './inviteFlow';

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
      const { customId } = interaction;
      if (customId === CID.availDays) await handleDaySelect(interaction);
      else if (customId === CID.bookAdmin) await handleBookAdminSelect(interaction);
      else if (customId.startsWith(CID.bookDatePrefix)) await handleBookDateSelect(interaction);
      else if (customId.startsWith(CID.bookTimePrefix)) await handleBookTimeSelect(interaction);
      return;
    }

    if (interaction.isUserSelectMenu()) {
      if (interaction.customId.startsWith(CID.inviteUsersPrefix)) await handleInviteSelect(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith(CID.availTimesPrefix)) await handleTimesModal(interaction);
      return;
    }

    if (interaction.isButton()) {
      const { customId } = interaction;
      if (customId === CID.availClearConfirm) await handleClearConfirm(interaction);
      else if (customId === CID.availClearCancel) await handleClearCancel(interaction);
      else if (customId === CID.bookAbort) await handleBookAbort(interaction);
      else if (customId.startsWith(CID.bookConfirmPrefix)) await handleBookConfirm(interaction);
      else if (customId.startsWith(CID.myBookingCancelPrefix)) await handleMyBookingCancel(interaction);
      else if (customId.startsWith(CID.inviteStartPrefix)) await handleInviteStart(interaction);
      else if (customId.startsWith(CID.inviteAcceptPrefix)) await handleInviteAccept(interaction);
      else if (customId.startsWith(CID.inviteDeclinePrefix)) await handleInviteDecline(interaction);
      return;
    }
  } catch (error) {
    console.error('Error handling interaction:', error);
    if (
      (interaction.isChatInputCommand() ||
        interaction.isButton() ||
        interaction.isStringSelectMenu() ||
        interaction.isUserSelectMenu() ||
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
