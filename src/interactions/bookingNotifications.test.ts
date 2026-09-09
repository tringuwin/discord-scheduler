import { describe, expect, it } from 'vitest';
import { buildBookingNotice } from './bookingNotifications';

describe('buildBookingNotice', () => {
  const start = new Date('2026-09-10T21:00:00Z'); // 2:00 PM PDT

  it('mentions the organizer and points to /my-schedule', () => {
    const notice = buildBookingNotice('123', start);
    expect(notice).toContain('<@123>');
    expect(notice).toContain('booked a meeting with you');
    expect(notice).toContain('/my-schedule');
  });

  it('renders the time in Pacific 12-hour format', () => {
    const notice = buildBookingNotice('1', start);
    expect(notice).toContain('2:00 PM');
    expect(notice).toContain('PDT');
  });

  it('includes the organizer message when present', () => {
    const notice = buildBookingNotice('1', start, 'Discuss the Q3 roadmap');
    expect(notice).toContain('Discuss the Q3 roadmap');
  });

  it('omits the message line when there is no message', () => {
    expect(buildBookingNotice('1', start, null)).not.toContain('💬');
    expect(buildBookingNotice('1', start)).not.toContain('💬');
  });
});
