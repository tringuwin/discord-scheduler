import { describe, expect, it } from 'vitest';
import { cleanupByAge, isInReminderWindow, isMissed } from './decisions';

const MIN = 60_000;

describe('isMissed', () => {
  it('is false at the start instant and within the window', () => {
    expect(isMissed(1_000, 1_000, 60 * MIN)).toBe(false);
    expect(isMissed(1_000 + 59 * MIN, 1_000, 60 * MIN)).toBe(false);
  });
  it('is true once past the window', () => {
    expect(isMissed(1_000 + 61 * MIN, 1_000, 60 * MIN)).toBe(true);
  });
});

describe('isInReminderWindow', () => {
  const now = 1_000_000;
  it('fires inside the lead window before start', () => {
    expect(isInReminderWindow(now, now + 5 * MIN, 10)).toBe(true);
    expect(isInReminderWindow(now, now + 10 * MIN, 10)).toBe(true);
  });
  it('does not fire before the window opens', () => {
    expect(isInReminderWindow(now, now + 11 * MIN, 10)).toBe(false);
  });
  it('does not fire once the meeting has started', () => {
    expect(isInReminderWindow(now, now - 1, 10)).toBe(false);
  });
  it('is disabled when lead is zero or negative', () => {
    expect(isInReminderWindow(now, now + 5 * MIN, 0)).toBe(false);
  });
});

describe('cleanupByAge', () => {
  const opts = { noShowMs: 15 * MIN, hardCapMs: 12 * 60 * MIN };
  it('keeps a young, occupied channel', () => {
    expect(cleanupByAge(20 * MIN, 10 * MIN, true, opts)).toBe('none');
  });
  it('closes a no-show past the grace period', () => {
    expect(cleanupByAge(20 * MIN, 0, false, opts)).toBe('no_show');
  });
  it('does not no-show a channel someone joined', () => {
    expect(cleanupByAge(20 * MIN, 0, true, opts)).toBe('none');
  });
  it('hard-caps a very old channel regardless of occupancy', () => {
    expect(cleanupByAge(13 * 60 * MIN, 0, true, opts)).toBe('hard_cap');
  });
});
