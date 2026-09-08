# discord-scheduler

A Calendly-style scheduling bot for Discord. Admins publish weekly availability;
members book meetings; at meeting time the bot opens a private voice channel for
the participants. Built with **discord.js v14 + TypeScript** and **SQLite (Prisma)**.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full design.

## Status

**Phase 1 (this scaffold):** project skeleton, database schema, and the
`/config`, `/timezone`, and `/availability` commands with a click-based
day → time-range wizard. Booking, live voice channels, and invites come in later phases.

## Prerequisites

- Node.js 20+
- A Discord application with a bot user
  ([Developer Portal](https://discord.com/developers/applications))

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure environment:

   ```bash
   cp .env.example .env
   ```

   Fill in `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`. Set `DEV_GUILD_ID` to your
   test server's id so slash commands appear instantly during development.

3. Create the database:

   ```bash
   npm run db:migrate
   ```

4. Register slash commands:

   ```bash
   npm run deploy
   ```

5. Run the bot:

   ```bash
   npm run dev
   ```

## Inviting the bot

Invite with the `bot` and `applications.commands` scopes. Phase 2 will create and
delete voice channels, so grant these permissions: **View Channels**,
**Manage Channels**, **Manage Roles** (to set per-member channel overwrites),
**Connect**, and **Move Members**.

## Commands

| Command | Who | What |
|---|---|---|
| `/config view` · `/config set` | Server managers | Set admin role, meeting category, default timezone, slot length, reminder lead |
| `/timezone set` · `/timezone view` | Everyone | Set/see your IANA timezone (used for all scheduling) |
| `/availability set` · `view` · `clear` | Admin role | Manage your weekly bookable availability |

`/availability set` opens a menu: pick the day(s), then enter a start/end time.

## Project layout

```
src/
  index.ts              boot + login + interaction wiring
  config.ts             env-sourced config (fail-fast)
  deploy-commands.ts    register slash commands with Discord
  db/client.ts          shared Prisma client
  commands/             one file per slash command + registry
  interactions/         component/modal routing + wizards
  domain/               pure, testable logic (time, timezone, days, permissions)
  repositories/         data access (Repository pattern)
prisma/schema.prisma    database schema
```

## Useful scripts

```bash
npm run typecheck   # type-check without emitting
npm run db:studio   # browse the database in Prisma Studio
```
