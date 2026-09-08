import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. See .env.example.`);
  }
  return value;
}

/**
 * Validated runtime configuration, sourced entirely from environment variables.
 * Throws at startup (fail fast) if a required value is absent.
 */
export const config = {
  token: required('DISCORD_TOKEN'),
  clientId: required('DISCORD_CLIENT_ID'),
  /** When set, slash commands register instantly to this one guild (dev). */
  devGuildId: process.env.DEV_GUILD_ID?.trim() || null,
} as const;
