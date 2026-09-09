# discord-scheduler

A Calendly-style scheduling bot for Discord. Admins publish weekly availability;
members book meetings; at meeting time the bot opens a private voice channel for
the participants. Built with **discord.js v14 + TypeScript** and **SQLite (Prisma)**.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full design.

## Status

- **Phase 1:** project skeleton, database schema, `/config`, and
  admin `/availability` with a click-based day → time-range wizard. ✅
- **Phase 2:** `/book` (admin → day → time wizard) with atomic slot reservation
  (no double-booking), and `/my-bookings` with cancel. ✅
- **Phase 3:** live meetings — a 30s scheduler opens a private voice channel at
  start time, DMs reminders, and tears the channel down once it empties (plus
  no-show / hard-cap backstops). Restart-safe: state is rebuilt from the DB. ✅
- **Phase 4:** invites — the organizer adds members from `/my-bookings`; invitees
  get an Accept/Decline DM, and accepting grants the voice channel (live if the
  meeting is already open). ✅

- **Phase 5:** multi-admin meetings — `/book` lets you pick several admins at
  once; offered times are the **intersection** of their availability, and the
  booking reserves a slot for every admin atomically. ✅

All four core features plus multi-admin are implemented. Next up is polish:
date-specific availability exceptions and pagination beyond the 14-day / 25-slot
component limits.

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

3. Start everything with one command — applies migrations, registers slash
   commands, then runs the bot with hot-reload:

   ```bash
   npm run go
   ```

   Prefer the steps individually? `npm run db:migrate` (create/apply the DB),
   then `npm run deploy` (register commands), then `npm run dev` (run).

## Inviting the bot

Invite with the `bot` and `applications.commands` scopes. Phase 2 will create and
delete voice channels, so grant these permissions: **View Channels**,
**Manage Channels**, **Manage Roles** (to set per-member channel overwrites),
**Connect**, and **Move Members**.

## Commands

| Command | Who | What |
|---|---|---|
| `/config view` · `/config set` | Server managers | Set admin role, meeting category, slot length, reminder lead |
| `/availability set` · `view` · `clear` | Admin role | Manage your weekly bookable availability |
| `/book` | Everyone | Book a meeting: pick one or more admins → day → time → add an optional message → confirm |
| `/my-bookings` | Everyone | List your upcoming meetings; organizers get **Invite** + **Cancel**, the meeting admin gets **Cancel** |
| `/my-schedule` | Admins | See who has booked you and when — each booking's **number**, organizer, and any guests |
| `/start-early <number>` | Booking admin | Open the meeting's voice channel now, before its scheduled time |
| `/reschedule <number>` | Booking admin | Move a booking to a new open time (day → time picker) |
| `/cancel <number>` | Booking admin | Cancel a booking, free its slot, and notify attendees |

All times are in **Pacific Time** (PST/PDT, DST-aware) and shown in 12-hour
AM/PM format. There is no per-user or per-server timezone setting.

Every confirmed booking gets a **number** unique within the server (shown on
confirmation, in the admin's booking DM, and in `/my-schedule`). Admins use that
number with `/start-early`, `/reschedule`, and `/cancel`.

Whenever someone books an admin, that admin also gets a DM naming the booking
number, who booked them, the meeting time, and the booker's optional message.

`/availability set` opens a menu: pick the day(s), then enter a start/end time
(e.g. `9:00 AM` – `5:00 PM`; 24-hour `17:00` is also accepted).
`/book` walks admin → day → time and reserves the slot atomically, so the same
slot can never be double-booked. On the confirmation step the booker can add a
short message (up to 300 characters) that reaches the admin in the booking DM
and in `/my-schedule`.

## Project layout

```
src/
  index.ts              boot + login + interaction wiring
  config.ts             env-sourced config (fail-fast)
  deploy-commands.ts    register slash commands with Discord
  db/client.ts          shared Prisma client
  commands/             one file per slash command + registry
  interactions/         component/modal routing + wizards
  domain/               pure, testable logic (time, Pacific formatting, slots, days)
  repositories/         data access (Repository pattern)
prisma/schema.prisma    database schema
```

## Useful scripts

```bash
npm test            # run unit + integration tests (Vitest)
npm run typecheck   # type-check without emitting
npm run db:studio   # browse the database in Prisma Studio
```

## Testing

- **Unit** — pure logic: DST-aware slot computation, availability
  intersection, Pacific AM/PM formatting, and the scheduler's timing rules.
- **Integration** — the real repositories against a throwaway SQLite database
  (`src/integration/*.int.test.ts`): the booking lifecycle end-to-end —
  reservation, double-book rejection, multi-admin all-or-nothing rollback,
  cancel, and the invite state machine.
- **Not automated** — the live Discord layer (gateway login, voice-channel
  creation/teardown, DM delivery, and clicking through the slash-command UI)
  requires a real bot token and a test server, and slash-command interactions
  can't be self-driven by the bot. Run the bot (see Setup) to exercise those.
