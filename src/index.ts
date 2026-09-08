import { Client, Events, GatewayIntentBits } from 'discord.js';
import { config } from './config';
import { prisma } from './db/client';
import { routeInteraction } from './interactions/router';

const client = new Client({
  // Guilds: base data. GuildVoiceStates: needed in Phase 2 to clean up empty
  // meeting voice channels via voiceStateUpdate.
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready. Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, routeInteraction);

async function main(): Promise<void> {
  await prisma.$connect();
  await client.login(config.token);
}

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}, shutting down...`);
  await client.destroy();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

main().catch(async (error) => {
  console.error('Fatal startup error:', error);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
