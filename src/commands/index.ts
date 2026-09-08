import type { Command } from './types';
import { availabilityCommand } from './availability';
import { configCommand } from './config';
import { timezoneCommand } from './timezone';

/** Every slash command the bot exposes. */
export const commands: Command[] = [configCommand, timezoneCommand, availabilityCommand];

/** Name -> command lookup for routing interactions. */
export const commandMap: ReadonlyMap<string, Command> = new Map(
  commands.map((command) => [command.data.name, command]),
);
