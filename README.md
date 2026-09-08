# discord-scheduler

A Calendly-style scheduling bot for Discord. Admins publish weekly availability;
members book meetings; at meeting time the bot opens a private voice channel for
the participants. Built with **discord.js v14 + TypeScript** and **SQLite (Prisma)**.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full design.

## Status

- **Phase 1:** project skeleton, database schema, `/config`, `/timezone`, and
  admin `/availability` with a click-based day → time-range wizard. ✅
- **Phase 2:** `/book` (admin → day → time wizard) with atomic slot reservation
  (no double-booking), and `/my-bookings` with cancel. ✅
- **Phase 3:** live meetings — a 30s scheduler opens a private voice channel at
  start time, DMs reminders, and tears the channel down once it empties (plus
  no-show / hard-cap backstops). Restart-safe: state is rebuilt from the DB. ✅
- **Phase 4:** invites — the organizer adds members from `/my-bookings`; invitees
  get an Accept/Decline DM, and accepting grants the voice channel (live if the
  meeting is already open). ✅

All four core features are implemented. Next up is polish: date-specific
availability exceptions, pagination, and multi-admin meetings.

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
| `/book` | Everyone | Book a meeting: pick an admin → day → time (shown in your timezone) → confirm |
| `/my-bookings` | Everyone | List your upcoming meetings; organizers get **Invite** + **Cancel**, the meeting admin gets **Cancel** |

`/availability set` opens a menu: pick the day(s), then enter a start/end time.
`/book` walks admin → day → time and reserves the slot atomically, so the same
slot can never be double-booked.

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
npm test            # run unit tests (Vitest)
npm run typecheck   # type-check without emitting
npm run db:studio   # browse the database in Prisma Studio
```
