import type { Command } from './types';
import { availabilityCommand } from './availability';
import { bookCommand } from './book';
import { cancelCommand } from './cancel';
import { configCommand } from './config';
import { myBookingsCommand } from './myBookings';
import { myScheduleCommand } from './mySchedule';
import { rescheduleCommand } from './reschedule';
import { startEarlyCommand } from './startEarly';

/** Every slash command the bot exposes. */
export const commands: Command[] = [
  configCommand,
  availabilityCommand,
  bookCommand,
  myBookingsCommand,
  myScheduleCommand,
  startEarlyCommand,
  rescheduleCommand,
  cancelCommand,
];

/** Name -> command lookup for routing interactions. */
export const commandMap: ReadonlyMap<string, Command> = new Map(
  commands.map((command) => [command.data.name, command]),
);
