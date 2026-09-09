import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { computeSlots, intersectSlots, type Rule, type Slot } from '../domain/slots';

// Integration tests run the real repositories against a real (throwaway) SQLite
// database. This exercises the reservation transaction, the unique-slot guard,
// multi-admin all-or-nothing rollback, cancel, and the invite state machine —
// the closest we can get to end-to-end without a live Discord connection.

type DbModule = typeof import('../db/client');
type BookingRepoModule = typeof import('../repositories/bookingRepo');
type AvailRepoModule = typeof import('../repositories/availabilityRepo');

let prisma: DbModule['prisma'];
let bookingRepo: BookingRepoModule['bookingRepo'];
let availabilityRepo: AvailRepoModule['availabilityRepo'];
let tmpDir: string;

const GUILD = 'g1';
const NOW = DateTime.utc();
const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

function slotsFor(rules: Rule[], reserved: Set<number> = new Set()): Slot[] {
  return computeSlots({ rules, slotMinutes: 30, reservedStartUtc: reserved, now: NOW, horizonDays: 14 });
}

async function reserved(adminId: string): Promise<number[]> {
  return bookingRepo.reservedStartsForAdmin(adminId, new Date(0));
}

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'sched-int-'));
  const url = `file:${join(tmpDir, 'test.db')}`;
  process.env.DATABASE_URL = url;
  // Create the schema in the throwaway database before importing the client.
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
  ({ prisma } = await import('../db/client'));
  ({ bookingRepo } = await import('../repositories/bookingRepo'));
  ({ availabilityRepo } = await import('../repositories/availabilityRepo'));
});

afterAll(async () => {
  if (prisma) await prisma.$disconnect();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(async () => {
  // Wipe children before parents, then seed the guild (FKs require it).
  await prisma.slotReservation.deleteMany();
  await prisma.participant.deleteMany();
  await prisma.meetingChannel.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.availabilityRule.deleteMany();
  await prisma.guild.deleteMany();
  await prisma.guild.create({ data: { id: GUILD } });
});

describe('single-admin booking lifecycle', () => {
  it('reserves a slot, blocks a re-book, and frees it on cancel', async () => {
    await availabilityRepo.addRules(GUILD, 'a1', ALL_DAYS, 9 * 60, 17 * 60, 'UTC');
    const rules = await availabilityRepo.listForAdmin(GUILD, 'a1');
    const target = slotsFor(rules)[0]!;
    expect(target).toBeDefined();

    const first = await bookingRepo.createConfirmed({
      guildId: GUILD,
      organizerId: 'u1',
      adminIds: ['a1'],
      startUtc: target.startUtc,
      endUtc: target.endUtc,
    });
    expect(first.ok).toBe(true);

    // The slot is now reserved and no longer offered.
    expect(await reserved('a1')).toContain(target.startUtc.getTime());
    const remaining = slotsFor(rules, new Set(await reserved('a1')));
    expect(remaining.some((s) => s.startUtc.getTime() === target.startUtc.getTime())).toBe(false);

    // A second person cannot take the same slot.
    const dupe = await bookingRepo.createConfirmed({
      guildId: GUILD,
      organizerId: 'u2',
      adminIds: ['a1'],
      startUtc: target.startUtc,
      endUtc: target.endUtc,
    });
    expect(dupe.ok).toBe(false);
    if (!dupe.ok) expect(dupe.reason).toBe('slot_taken');

    // Cancelling frees the slot for someone else.
    if (first.ok) expect((await bookingRepo.cancel(first.booking.id, 'u1')).ok).toBe(true);
    expect(await reserved('a1')).not.toContain(target.startUtc.getTime());

    const rebook = await bookingRepo.createConfirmed({
      guildId: GUILD,
      organizerId: 'u2',
      adminIds: ['a1'],
      startUtc: target.startUtc,
      endUtc: target.endUtc,
    });
    expect(rebook.ok).toBe(true);
  });

  it('rejects cancellation by an unrelated user', async () => {
    await availabilityRepo.addRules(GUILD, 'a1', ALL_DAYS, 9 * 60, 17 * 60, 'UTC');
    const target = slotsFor(await availabilityRepo.listForAdmin(GUILD, 'a1'))[0]!;
    const res = await bookingRepo.createConfirmed({
      guildId: GUILD,
      organizerId: 'u1',
      adminIds: ['a1'],
      startUtc: target.startUtc,
      endUtc: target.endUtc,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const outcome = await bookingRepo.cancel(res.booking.id, 'stranger');
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.reason).toBe('forbidden');
    }
  });
});

describe('multi-admin booking', () => {
  it('offers only common times and rolls back fully on a partial conflict', async () => {
    await availabilityRepo.addRules(GUILD, 'a1', ALL_DAYS, 9 * 60, 12 * 60, 'UTC'); // 09:00–12:00
    await availabilityRepo.addRules(GUILD, 'a2', ALL_DAYS, 10 * 60, 13 * 60, 'UTC'); // 10:00–13:00
    const r1 = await availabilityRepo.listForAdmin(GUILD, 'a1');
    const r2 = await availabilityRepo.listForAdmin(GUILD, 'a2');
    const common = intersectSlots([slotsFor(r1), slotsFor(r2)]);
    expect(common.length).toBeGreaterThan(1);

    // Make a2 busy at the first common slot.
    const busy = common[0]!;
    expect(
      (await bookingRepo.createConfirmed({
        guildId: GUILD,
        organizerId: 'x',
        adminIds: ['a2'],
        startUtc: busy.startUtc,
        endUtc: busy.endUtc,
      })).ok,
    ).toBe(true);

    // Booking both admins at that slot fails, and a1 must NOT be left reserved.
    const conflict = await bookingRepo.createConfirmed({
      guildId: GUILD,
      organizerId: 'u1',
      adminIds: ['a1', 'a2'],
      startUtc: busy.startUtc,
      endUtc: busy.endUtc,
    });
    expect(conflict.ok).toBe(false);
    expect(await reserved('a1')).not.toContain(busy.startUtc.getTime());

    // A different common slot books both admins and reserves for each.
    const free = common[1]!;
    const ok = await bookingRepo.createConfirmed({
      guildId: GUILD,
      organizerId: 'u1',
      adminIds: ['a1', 'a2'],
      startUtc: free.startUtc,
      endUtc: free.endUtc,
    });
    expect(ok.ok).toBe(true);
    expect(await reserved('a1')).toContain(free.startUtc.getTime());
    expect(await reserved('a2')).toContain(free.startUtc.getTime());
  });
});

describe('booking message', () => {
  it('persists the organizer note and returns it in the admin schedule', async () => {
    await availabilityRepo.addRules(GUILD, 'a1', ALL_DAYS, 9 * 60, 17 * 60, 'UTC');
    const target = slotsFor(await availabilityRepo.listForAdmin(GUILD, 'a1'))[0]!;
    const res = await bookingRepo.createConfirmed({
      guildId: GUILD,
      organizerId: 'u1',
      adminIds: ['a1'],
      startUtc: target.startUtc,
      endUtc: target.endUtc,
      note: 'Need help with onboarding',
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.booking.note).toBe('Need help with onboarding');

    const forAdmin = await bookingRepo.listUpcomingForAdmin(GUILD, 'a1', new Date());
    expect(forAdmin[0]!.note).toBe('Need help with onboarding');
  });

  it('stores null when no note is given', async () => {
    await availabilityRepo.addRules(GUILD, 'a1', ALL_DAYS, 9 * 60, 17 * 60, 'UTC');
    const target = slotsFor(await availabilityRepo.listForAdmin(GUILD, 'a1'))[0]!;
    const res = await bookingRepo.createConfirmed({
      guildId: GUILD,
      organizerId: 'u1',
      adminIds: ['a1'],
      startUtc: target.startUtc,
      endUtc: target.endUtc,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.booking.note).toBeNull();
  });
});

describe('booking numbers & reschedule', () => {
  async function bookAt(organizerId: string, slot: Slot) {
    return bookingRepo.createConfirmed({
      guildId: GUILD,
      organizerId,
      adminIds: ['a1'],
      startUtc: slot.startUtc,
      endUtc: slot.endUtc,
    });
  }

  it('assigns sequential per-guild booking numbers', async () => {
    await availabilityRepo.addRules(GUILD, 'a1', ALL_DAYS, 9 * 60, 17 * 60, 'UTC');
    const slots = slotsFor(await availabilityRepo.listForAdmin(GUILD, 'a1'));
    const first = await bookAt('u1', slots[0]!);
    const second = await bookAt('u2', slots[1]!);
    expect(first.ok && first.booking.number).toBe(1);
    expect(second.ok && second.booking.number).toBe(2);

    const found = await bookingRepo.findByNumber(GUILD, 1);
    expect(found?.organizerId).toBe('u1');
    expect(await bookingRepo.findByNumber(GUILD, 999)).toBeNull();
  });

  it('moves a booking to a new time, freeing the old slot', async () => {
    await availabilityRepo.addRules(GUILD, 'a1', ALL_DAYS, 9 * 60, 17 * 60, 'UTC');
    const slots = slotsFor(await availabilityRepo.listForAdmin(GUILD, 'a1'));
    const from = slots[0]!;
    const to = slots[1]!;
    const res = await bookAt('u1', from);
    expect(res.ok).toBe(true);
    const bookingId = res.ok ? res.booking.id : '';

    const moved = await bookingRepo.reschedule(bookingId, to.startUtc, to.endUtc);
    expect(moved.ok).toBe(true);
    if (moved.ok) expect(moved.booking.startUtc.getTime()).toBe(to.startUtc.getTime());

    const reserved = await bookingRepo.reservedStartsForAdmin('a1', new Date(0));
    expect(reserved).toContain(to.startUtc.getTime());
    expect(reserved).not.toContain(from.startUtc.getTime());
  });

  it('rejects a reschedule onto a slot another booking holds, leaving the original intact', async () => {
    await availabilityRepo.addRules(GUILD, 'a1', ALL_DAYS, 9 * 60, 17 * 60, 'UTC');
    const slots = slotsFor(await availabilityRepo.listForAdmin(GUILD, 'a1'));
    const mine = slots[0]!;
    const taken = slots[1]!;
    const res = await bookAt('u1', mine);
    expect((await bookAt('u2', taken)).ok).toBe(true); // someone else holds `taken`
    const bookingId = res.ok ? res.booking.id : '';

    const conflict = await bookingRepo.reschedule(bookingId, taken.startUtc, taken.endUtc);
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.reason).toBe('slot_taken');

    // The original reservation must survive the failed move.
    const reserved = await bookingRepo.reservedStartsForAdmin('a1', new Date(0));
    expect(reserved).toContain(mine.startUtc.getTime());
  });

  it('refuses to reschedule a meeting that already went live', async () => {
    await availabilityRepo.addRules(GUILD, 'a1', ALL_DAYS, 9 * 60, 17 * 60, 'UTC');
    const slots = slotsFor(await availabilityRepo.listForAdmin(GUILD, 'a1'));
    const res = await bookAt('u1', slots[0]!);
    const bookingId = res.ok ? res.booking.id : '';
    await prisma.meetingChannel.create({ data: { bookingId, channelId: 'chan-1' } });

    const outcome = await bookingRepo.reschedule(bookingId, slots[1]!.startUtc, slots[1]!.endUtc);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('already_started');
  });
});

describe('admin schedule view', () => {
  it('lists bookings where the user is the booked admin, and not ones they organized', async () => {
    await availabilityRepo.addRules(GUILD, 'a1', ALL_DAYS, 9 * 60, 17 * 60, 'UTC');
    const target = slotsFor(await availabilityRepo.listForAdmin(GUILD, 'a1'))[0]!;
    const res = await bookingRepo.createConfirmed({
      guildId: GUILD,
      organizerId: 'u1',
      adminIds: ['a1'],
      startUtc: target.startUtc,
      endUtc: target.endUtc,
    });
    expect(res.ok).toBe(true);

    // The booked admin sees the booking and who organized it.
    const forAdmin = await bookingRepo.listUpcomingForAdmin(GUILD, 'a1', new Date());
    expect(forAdmin.length).toBe(1);
    expect(forAdmin[0]!.organizerId).toBe('u1');

    // The organizer is not an admin of anything, so their schedule is empty.
    expect((await bookingRepo.listUpcomingForAdmin(GUILD, 'u1', new Date())).length).toBe(0);
  });

  it('drops cancelled and past bookings from the admin schedule', async () => {
    await availabilityRepo.addRules(GUILD, 'a1', ALL_DAYS, 9 * 60, 17 * 60, 'UTC');
    const target = slotsFor(await availabilityRepo.listForAdmin(GUILD, 'a1'))[0]!;
    const res = await bookingRepo.createConfirmed({
      guildId: GUILD,
      organizerId: 'u1',
      adminIds: ['a1'],
      startUtc: target.startUtc,
      endUtc: target.endUtc,
    });
    expect(res.ok).toBe(true);
    expect((await bookingRepo.listUpcomingForAdmin(GUILD, 'a1', new Date())).length).toBe(1);

    // A `now` after the slot start treats it as past.
    const afterStart = new Date(target.startUtc.getTime() + 60_000);
    expect((await bookingRepo.listUpcomingForAdmin(GUILD, 'a1', afterStart)).length).toBe(0);

    // Cancelling removes it from the upcoming schedule too.
    if (res.ok) await bookingRepo.cancel(res.booking.id, 'u1');
    expect((await bookingRepo.listUpcomingForAdmin(GUILD, 'a1', new Date())).length).toBe(0);
  });
});

describe('invite lifecycle', () => {
  it('shows a non-declined invitee and hides a declined one', async () => {
    await availabilityRepo.addRules(GUILD, 'a1', ALL_DAYS, 9 * 60, 17 * 60, 'UTC');
    const target = slotsFor(await availabilityRepo.listForAdmin(GUILD, 'a1'))[0]!;
    const res = await bookingRepo.createConfirmed({
      guildId: GUILD,
      organizerId: 'u1',
      adminIds: ['a1'],
      startUtc: target.startUtc,
      endUtc: target.endUtc,
    });
    expect(res.ok).toBe(true);
    const bookingId = res.ok ? res.booking.id : '';

    await bookingRepo.createInvitee(bookingId, 'u3');
    expect((await bookingRepo.getParticipant(bookingId, 'u3'))?.state).toBe('invited');
    expect((await bookingRepo.listUpcomingForUser(GUILD, 'u3', new Date())).length).toBe(1);

    await bookingRepo.setParticipantState(bookingId, 'u3', 'accepted');
    expect((await bookingRepo.getParticipant(bookingId, 'u3'))?.state).toBe('accepted');

    await bookingRepo.createInvitee(bookingId, 'u4');
    await bookingRepo.setParticipantState(bookingId, 'u4', 'declined');
    expect((await bookingRepo.listUpcomingForUser(GUILD, 'u4', new Date())).length).toBe(0);
  });
});
