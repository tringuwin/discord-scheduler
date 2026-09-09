import { describe, expect, it } from 'vitest';
import { buildBookingNotice } from './bookingNotifications';

describe('buildBookingNotice', () => {
  const start = new Date('2026-09-10T14:00:00Z');

  it('mentions the organizer and points to /my-schedule', () => {
    const notice = buildBookingNotice('123', start, 'UTC');
    expect(notice).toContain('<@123>');
    expect(notice).toContain('booked a meeting with you');
    expect(notice).toContain('/my-schedule');
  });

  it('renders the time in the given timezone', () => {
    const utc = buildBookingNotice('1', start, 'UTC');
    const ny = buildBookingNotice('1', start, 'America/New_York');
    expect(utc).toContain('14:00');
    expect(utc).toContain('(UTC)');
    // Same instant, different wall-clock text in a different zone.
    expect(ny).not.toEqual(utc);
    expect(ny).toContain('10:00');
  });
});
