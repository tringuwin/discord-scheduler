import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { computeSlots, intersectSlots, type Rule, type Slot } from './slots';

// Anchor "now" on a Sunday and use horizonDays: 1 so exactly one Monday (the
// next day) falls in range — in every timezone under test. This keeps slot
// counts deterministic regardless of UTC offset.
const SUN_JAN = DateTime.fromISO('2026-01-04T12:00:00', { zone: 'utc' }); // → Mon 2026-01-05
const SUN_JUL = DateTime.fromISO('2026-07-05T12:00:00', { zone: 'utc' }); // → Mon 2026-07-06
const MONDAY_JAN = DateTime.fromISO('2026-01-05T00:00:00', { zone: 'utc' });

/** The slot start instants as ISO strings — the zone-independent source of truth. */
function startsIso(slots: Slot[]): string[] {
  return slots.map((s) => s.startUtc.toISOString());
}

function rule(partial: Partial<Rule>): Rule {
  return { dayOfWeek: 1, startMin: 9 * 60, endMin: 10 * 60, tz: 'UTC', ...partial };
}

describe('computeSlots', () => {
  it('slices a block into fixed-length slots (UTC)', () => {
    const slots = computeSlots({
      rules: [rule({ startMin: 9 * 60, endMin: 10 * 60 })],
      slotMinutes: 30,
      reservedStartUtc: new Set(),
      now: SUN_JAN,
      horizonDays: 1,
    });
    expect(startsIso(slots)).toEqual(['2026-01-05T09:00:00.000Z', '2026-01-05T09:30:00.000Z']);
    expect(slots[0]!.endUtc.getTime() - slots[0]!.startUtc.getTime()).toBe(30 * 60_000);
  });

  it('excludes slots that do not fully fit in the block', () => {
    const slots = computeSlots({
      rules: [rule({ startMin: 9 * 60, endMin: 9 * 60 + 45 })], // 09:00–09:45
      slotMinutes: 30,
      reservedStartUtc: new Set(),
      now: SUN_JAN,
      horizonDays: 1,
    });
    // 09:00 fits (ends 09:30); 09:30 would end 10:00 > 09:45 → excluded.
    expect(startsIso(slots)).toEqual(['2026-01-05T09:00:00.000Z']);
  });

  it('removes already-reserved instants', () => {
    const opts = { rules: [rule({})], slotMinutes: 30, now: SUN_JAN, horizonDays: 1 };
    const all = computeSlots({ ...opts, reservedStartUtc: new Set() });
    const remaining = computeSlots({ ...opts, reservedStartUtc: new Set([all[0]!.startUtc.getTime()]) });
    expect(remaining).toHaveLength(all.length - 1);
    expect(remaining[0]!.startUtc.getTime()).toBe(all[1]!.startUtc.getTime());
  });

  it('drops slots at or before the lead cutoff', () => {
    // now = Monday 09:15 UTC, so the 09:00 slot is in the past.
    const slots = computeSlots({
      rules: [rule({ startMin: 9 * 60, endMin: 10 * 60 })],
      slotMinutes: 30,
      reservedStartUtc: new Set(),
      now: MONDAY_JAN.set({ hour: 9, minute: 15 }),
      horizonDays: 0,
    });
    expect(startsIso(slots)).toEqual(['2026-01-05T09:30:00.000Z']);
  });

  it('converts wall-clock availability to the correct UTC instant (EST, winter)', () => {
    const slots = computeSlots({
      rules: [rule({ startMin: 9 * 60, endMin: 9 * 60 + 30, tz: 'America/New_York' })],
      slotMinutes: 30,
      reservedStartUtc: new Set(),
      now: SUN_JAN,
      horizonDays: 1,
    });
    // 09:00 EST (UTC-5) == 14:00 UTC.
    expect(startsIso(slots)).toEqual(['2026-01-05T14:00:00.000Z']);
  });

  it('honours DST (EDT, summer): same wall-clock, different UTC offset', () => {
    const slots = computeSlots({
      rules: [rule({ startMin: 9 * 60, endMin: 9 * 60 + 30, tz: 'America/New_York' })],
      slotMinutes: 30,
      reservedStartUtc: new Set(),
      now: SUN_JUL,
      horizonDays: 1,
    });
    // 09:00 EDT (UTC-4) == 13:00 UTC.
    expect(startsIso(slots)).toEqual(['2026-07-06T13:00:00.000Z']);
  });

  it('merges overlapping rules without duplicate instants', () => {
    const slots = computeSlots({
      rules: [
        rule({ startMin: 9 * 60, endMin: 10 * 60 }),
        rule({ startMin: 9 * 60 + 30, endMin: 10 * 60 + 30 }), // overlaps 09:30
      ],
      slotMinutes: 30,
      reservedStartUtc: new Set(),
      now: SUN_JAN,
      horizonDays: 1,
    });
    expect(startsIso(slots)).toEqual([
      '2026-01-05T09:00:00.000Z',
      '2026-01-05T09:30:00.000Z',
      '2026-01-05T10:00:00.000Z',
    ]);
  });
});

describe('intersectSlots', () => {
  const mk = (ms: number): Slot => ({ startUtc: new Date(ms), endUtc: new Date(ms + 30 * 60_000) });

  it('keeps only instants present in every set, sorted', () => {
    const a = [mk(3000), mk(1000), mk(2000)];
    const b = [mk(2000), mk(3000), mk(4000)];
    const c = [mk(2000), mk(3000)];
    expect(intersectSlots([a, b, c]).map((s) => s.startUtc.getTime())).toEqual([2000, 3000]);
  });

  it('returns a single set as-is (sorted)', () => {
    expect(intersectSlots([[mk(2000), mk(1000)]]).map((s) => s.startUtc.getTime())).toEqual([1000, 2000]);
  });

  it('is empty when there is no overlap', () => {
    expect(intersectSlots([[mk(1000)], [mk(2000)]])).toHaveLength(0);
  });

  it('is empty for no sets', () => {
    expect(intersectSlots([])).toHaveLength(0);
  });
});
