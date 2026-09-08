import { REST, Routes } from 'discord.js';
import { config } from './config';
import { commands } from './commands';

/**
 * Registers slash commands with Discord. Run this whenever commands change.
 * With DEV_GUILD_ID set, registration is instant to that one guild; otherwise
 * commands register globally (which can take up to ~1 hour to propagate).
 */
async function main(): Promise<void> {
  const body = commands.map((command) => command.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(config.token);

  const route = config.devGuildId
    ? Routes.applicationGuildCommands(config.clientId, config.devGuildId)
    : Routes.applicationCommands(config.clientId);

  const registered = (await rest.put(route, { body })) as unknown[];
  const scope = config.devGuildId ? `dev guild ${config.devGuildId}` : 'globally';
  console.log(`Registered ${registered.length} command(s) ${scope}.`);
}

main().catch((error) => {
  console.error('Failed to register commands:', error);
  process.exit(1);
});
