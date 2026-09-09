import type { Command } from './types';
import { availabilityCommand } from './availability';
import { bookCommand } from './book';
import { configCommand } from './config';
import { myBookingsCommand } from './myBookings';
import { myScheduleCommand } from './mySchedule';
import { timezoneCommand } from './timezone';

/** Every slash command the bot exposes. */
export const commands: Command[] = [
  configCommand,
  timezoneCommand,
  availabilityCommand,
  bookCommand,
  myBookingsCommand,
  myScheduleCommand,
];

/** Name -> command lookup for routing interactions. */
export const commandMap: ReadonlyMap<string, Command> = new Map(
  commands.map((command) => [command.data.name, command]),
);
