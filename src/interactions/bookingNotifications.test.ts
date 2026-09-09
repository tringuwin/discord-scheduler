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

  it('includes the organizer message when present', () => {
    const notice = buildBookingNotice('1', start, 'UTC', 'Discuss the Q3 roadmap');
    expect(notice).toContain('Discuss the Q3 roadmap');
  });

  it('omits the message line when there is no message', () => {
    expect(buildBookingNotice('1', start, 'UTC', null)).not.toContain('💬');
    expect(buildBookingNotice('1', start, 'UTC')).not.toContain('💬');
  });
});
