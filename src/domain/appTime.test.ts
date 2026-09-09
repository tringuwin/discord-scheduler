import { describe, expect, it } from 'vitest';
import { dateKey, formatDateLabel, formatDateTime, formatTimeOfDay } from './appTime';

describe('appTime (Pacific display)', () => {
  // 2026-01-05T17:00:00Z is 09:00 PST (UTC-8, winter).
  const winter = new Date('2026-01-05T17:00:00Z');
  // 2026-07-06T16:00:00Z is 09:00 PDT (UTC-7, summer).
  const summer = new Date('2026-07-06T16:00:00Z');

  it('formats time-of-day in 12-hour AM/PM', () => {
    expect(formatTimeOfDay(winter)).toBe('9:00 AM');
    expect(formatTimeOfDay(new Date('2026-01-06T01:30:00Z'))).toBe('5:30 PM'); // 17:30 PST
  });

  it('renders a full label with the current Pacific abbreviation', () => {
    expect(formatDateTime(winter)).toBe('Mon, Jan 5 2026 • 9:00 AM PST');
    expect(formatDateTime(summer)).toContain('PDT');
    expect(formatDateTime(summer)).toContain('9:00 AM');
  });

  it('derives the Pacific calendar date and label', () => {
    // 2026-01-06T03:00:00Z is still Jan 5 in Pacific (19:00 PST).
    expect(dateKey(new Date('2026-01-06T03:00:00Z'))).toBe('2026-01-05');
    expect(formatDateLabel('2026-01-05')).toBe('Mon, Jan 5');
  });
});
