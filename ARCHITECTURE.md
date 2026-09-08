# Discord Scheduling Bot — Architecture

A "Calendly-in-Discord" bot: admins publish availability, members book meetings,
and the bot spins up a private voice channel at meeting time.

---

## 1. Stack

| Concern | Choice | Why |
|---|---|---|
| Language | **TypeScript**, Node 20+ | Typed, matches your standards |
| Gateway/API | **discord.js v14** | Most-maintained, full component support |
| UI | **Native components** (buttons / string- & user-select menus / modals) | No extra hosting; all in Discord |
| Storage | **SQLite** via **Prisma ORM** | Migrations, typed queries, easy transactions (alt: `better-sqlite3` if you want zero-ORM) |
| Time math | **luxon** | Reliable IANA timezone conversion |
| Scheduler | **In-process polling tick (30s)** | Restart-safe by design — see §5 |
| Config | env vars + `dotenv` | Token/IDs never in code |

---

## 2. Core design decisions

- **Availability = recurring weekly rules** (Calendly-style), not thousands of concrete slots.
  A rule is `(admin, dayOfWeek, startMinute, endMinute, timezone)`. Bookable slots are
  *computed on demand* = rules sliced into slot-length chunks, minus existing reservations.
- **Slot length** is configurable per server (default **30 min**). The slot governs the
  *booking/reservation* only — the voice channel is **not** torn down on a timer; it lives
  until everyone leaves (see §5).
- **No double-booking is enforced at the DB layer**, not in memory: a `SlotReservation`
  row with a `UNIQUE(adminId, startUtc)` index. Two people confirming the same slot → the
  second insert fails → they see "just taken," pick again. This is the only race-safe way.
- **Everything stored in UTC.** Each user sets their own IANA timezone once; display is
  converted per-viewer.
- **Multi-admin meetings** reserve a slot for *every* chosen admin (all must be free at
  that instant → the offered times are the intersection of their availability).

---

## 3. Data model (Prisma / SQLite)

```
Guild            id, adminRoleId, categoryId, defaultTz, slotMinutes, reminderMinutes
UserPref         discordId, timezone                         # per-user TZ
AvailabilityRule id, guildId, adminId, dayOfWeek, startMin, endMin, tz
Booking          id, guildId, organizerId, status(pending|confirmed|cancelled|done),
                 startUtc, endUtc, reminded, createdAt
SlotReservation  id, adminId, startUtc, bookingId            # UNIQUE(adminId, startUtc) ← no double-book
Participant      bookingId, userId, role(organizer|admin|invitee), state(invited|accepted|declined)
MeetingChannel   bookingId, channelId, everJoined, createdAt # live channel + empty-cleanup guard
```

A booking's admins are its `Participant` rows with role `admin` (one source of truth,
no separate join table) plus one `SlotReservation` per admin. A multi-admin booking
reserves every admin's slot in one transaction; if any is already taken the whole
transaction rolls back. Cancelling deletes the booking's `SlotReservation` rows,
freeing the slots atomically.

---

## 4. Commands & flows

**Admin**
- `/config` — set admin role, channel category, default TZ, slot length, reminder lead time.
- `/availability set` — wizard: pick day(s) → pick time range → save recurring rule.
- `/availability view` · `/availability clear`

**Member**
- `/book` — wizard: choose admin(s) → day select → available-time select menu → confirm.
  Offered times are the intersection of the chosen admins' availability. Writes a
  `confirmed` booking + one reservation per admin. Wizard state is held in a short-lived
  session keyed by the ephemeral message id.
- `/my-bookings` — list upcoming; organizer gets **Invite** + **Cancel**, the meeting's
  admin gets **Cancel**. Invite opens a user-select menu; each invitee gets an
  Accept/Decline DM.

**Everyone**
- `/timezone set` — set your IANA timezone (prompted automatically on first `/book`).

All wizards use **ephemeral** replies (only the invoking user sees them).

---

## 5. Scheduler / meeting lifecycle

Two mechanisms, both restart-safe (state always reconstructed from the DB, no in-memory
job list to lose):

**A. Polling tick — every 30 seconds:**
1. **Reminder:** booking starting within `reminderMinutes` and not yet reminded → ping participants.
2. **Open:** `confirmed` booking with `startUtc ≤ now` and no `MeetingChannel` → create a
   private voice channel in the configured category. Permission overwrites:
   deny `@everyone` View+Connect; allow the admin(s), organizer, and *accepted* invitees.
   Post a message pinging everyone; record `MeetingChannel`.

**B. `voiceStateUpdate` event — channel stays until empty:**
- The 30-min slot does **not** delete the channel. Instead, once a channel has had at least
  one member join and then drops to **0 members**, start a short grace timer (~2 min, to
  absorb brief disconnects) and delete it if still empty. Mark the booking `done`.
- **Safety nets** (checked in the tick, so they survive restarts): delete a channel that is
  still empty ~15 min after creation (no-show), and hard-cap any channel at e.g. 12h.
- Each booking gets its **own** channel, so an overrunning meeting never blocks the next
  booking's reservation — only the lingering channel is separate.

---

## 6. Security & validation

- Only members holding the configured **admin role** can set availability / be booked.
- Cancel/invite actions verify the caller is the booking's organizer.
- Validate every interaction payload (day/time/admin ids) before writing.
- Token & IDs via env; nothing sensitive in source.
- Guardrails: cap pending bookings per user; expire stale `pending` bookings; ignore
  interactions from non-members.

---

## 7. Project layout (many small files)

```
src/
  index.ts                # boot + login + handler registration
  config.ts               # env + constants
  db/client.ts            # Prisma client
  commands/               # one file per slash command
  interactions/           # button/menu/modal handlers (wizards)
  domain/                 # pure, unit-testable logic
    slots.ts              # rules − reservations → bookable slots
    timezone.ts
  repositories/           # data access (Repository pattern)
  scheduler/
    tick.ts               # the 30s lifecycle loop
    channels.ts           # create/delete voice channels
  ui/                     # embed + component builders
prisma/schema.prisma
tests/
```

---

## 8. Build phases

1. **Foundation** — project + config + `/timezone` + admin `/availability` (recurring).
2. **Booking** — `/book` single-admin, `SlotReservation` (no double-book), `/my-bookings` + cancel.
3. **Live meetings** — scheduler creates/deletes voice channels + reminders.
4. **Collaboration** — multi-admin (intersection) booking + invite feature.
5. **Polish** — date-specific availability exceptions, pagination, tests to 80%+.

---

## 9. Confirmed scope (v1)

1. **Multi-server ready** — config keyed by guild.
2. **30-min booking slots**; the voice channel persists until everyone leaves (§5).
3. **Members pick a specific admin** to meet (multi-admin selection deferred to Phase 4).
4. **Voice channel** per meeting, with a text message dropped inside it.
5. **Reminders on** — ping participants ~10 min before start.
