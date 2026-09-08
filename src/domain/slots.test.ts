import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { computeSlots, formatSlotTime, slotDateKey, type Rule } from './slots';

// Anchor "now" on a Sunday and use horizonDays: 1 so exactly one Monday (the
// next day) falls in range — in every timezone under test. This keeps slot
// counts deterministic regardless of UTC offset.
const SUN_JAN = DateTime.fromISO('2026-01-04T12:00:00', { zone: 'utc' }); // → Mon 2026-01-05
const SUN_JUL = DateTime.fromISO('2026-07-05T12:00:00', { zone: 'utc' }); // → Mon 2026-07-06
const MONDAY_JAN = DateTime.fromISO('2026-01-05T00:00:00', { zone: 'utc' });

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
    expect(slots).toHaveLength(2);
    expect(formatSlotTime(slots[0]!.startUtc, 'UTC')).toBe('09:00');
    expect(formatSlotTime(slots[1]!.startUtc, 'UTC')).toBe('09:30');
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
    expect(slots).toHaveLength(1);
    expect(formatSlotTime(slots[0]!.startUtc, 'UTC')).toBe('09:00');
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
    expect(slots).toHaveLength(1);
    expect(formatSlotTime(slots[0]!.startUtc, 'UTC')).toBe('09:30');
  });

  it('converts wall-clock availability to the correct UTC instant (EST, winter)', () => {
    const slots = computeSlots({
      rules: [rule({ startMin: 9 * 60, endMin: 9 * 60 + 30, tz: 'America/New_York' })],
      slotMinutes: 30,
      reservedStartUtc: new Set(),
      now: SUN_JAN,
      horizonDays: 1,
    });
    expect(slots).toHaveLength(1);
    // 09:00 EST (UTC-5) == 14:00 UTC, and reads back as 09:00 in New York.
    expect(formatSlotTime(slots[0]!.startUtc, 'UTC')).toBe('14:00');
    expect(formatSlotTime(slots[0]!.startUtc, 'America/New_York')).toBe('09:00');
  });

  it('honours DST (EDT, summer): same wall-clock, different UTC offset', () => {
    const slots = computeSlots({
      rules: [rule({ startMin: 9 * 60, endMin: 9 * 60 + 30, tz: 'America/New_York' })],
      slotMinutes: 30,
      reservedStartUtc: new Set(),
      now: SUN_JUL,
      horizonDays: 1,
    });
    expect(slots).toHaveLength(1);
    // 09:00 EDT (UTC-4) == 13:00 UTC.
    expect(formatSlotTime(slots[0]!.startUtc, 'UTC')).toBe('13:00');
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
    const starts = slots.map((s) => formatSlotTime(s.startUtc, 'UTC'));
    expect(starts).toEqual(['09:00', '09:30', '10:00']);
  });
});

describe('slotDateKey', () => {
  it('groups by calendar date in the viewer timezone', () => {
    // 03:00 UTC on Jan 6 is still Jan 5 in New York.
    const instant = DateTime.fromISO('2026-01-06T03:00:00Z').toJSDate();
    expect(slotDateKey(instant, 'UTC')).toBe('2026-01-06');
    expect(slotDateKey(instant, 'America/New_York')).toBe('2026-01-05');
  });
});
