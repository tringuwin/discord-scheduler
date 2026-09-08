import { Client, Events, GatewayIntentBits } from 'discord.js';
import { config } from './config';
import { prisma } from './db/client';
import { routeInteraction } from './interactions/router';
import { handleVoiceStateUpdate, startScheduler } from './scheduler/scheduler';

const client = new Client({
  // Guilds: base data. GuildVoiceStates: required to detect when meeting voice
  // channels empty out (so they can be torn down).
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

let schedulerHandle: NodeJS.Timeout | null = null;

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready. Logged in as ${readyClient.user.tag}`);
  // Start the meeting lifecycle loop once connected. It rebuilds all state from
  // the database each tick, so a restart never loses scheduled meetings.
  schedulerHandle = startScheduler(readyClient);
});

client.on(Events.InteractionCreate, routeInteraction);
client.on(Events.VoiceStateUpdate, (oldState, newState) => void handleVoiceStateUpdate(oldState, newState));

async function main(): Promise<void> {
  await prisma.$connect();
  await client.login(config.token);
}

async function shutdown(signal: string): Promise<void> {
  console.log(`Received ${signal}, shutting down...`);
  if (schedulerHandle) clearInterval(schedulerHandle);
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
