import { describe, expect, it } from 'vitest';
import { buildBookingNotice } from './bookingNotifications';

describe('buildBookingNotice', () => {
  const start = new Date('2026-09-10T21:00:00Z'); // 2:00 PM PDT

  it('includes the booking number, organizer, and management hint', () => {
    const notice = buildBookingNotice(7, '123', start);
    expect(notice).toContain('#7');
    expect(notice).toContain('<@123>');
    expect(notice).toContain('booked a meeting with you');
    expect(notice).toContain('/reschedule');
  });

  it('renders the time in Pacific 12-hour format', () => {
    const notice = buildBookingNotice(1, '1', start);
    expect(notice).toContain('2:00 PM');
    expect(notice).toContain('PDT');
  });

  it('includes the organizer message when present', () => {
    const notice = buildBookingNotice(1, '1', start, 'Discuss the Q3 roadmap');
    expect(notice).toContain('Discuss the Q3 roadmap');
  });

  it('omits the message line when there is no message', () => {
    expect(buildBookingNotice(1, '1', start, null)).not.toContain('💬');
    expect(buildBookingNotice(1, '1', start)).not.toContain('💬');
  });

  it('omits the number tag when the booking has no number', () => {
    expect(buildBookingNotice(null, '1', start)).not.toContain('#');
  });
});
