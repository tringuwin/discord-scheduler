import { describe, expect, it } from 'vitest';
import { formatMinutes, parseTimeInput } from './time';

describe('parseTimeInput', () => {
  it('parses 12-hour AM/PM input', () => {
    expect(parseTimeInput('9:00 AM')).toBe(9 * 60);
    expect(parseTimeInput('9 am')).toBe(9 * 60);
    expect(parseTimeInput('5:30 pm')).toBe(17 * 60 + 30);
    expect(parseTimeInput('5pm')).toBe(17 * 60);
    expect(parseTimeInput('12:00 AM')).toBe(0);
    expect(parseTimeInput('12 PM')).toBe(12 * 60);
  });

  it('still parses 24-hour input', () => {
    expect(parseTimeInput('09:00')).toBe(9 * 60);
    expect(parseTimeInput('17:30')).toBe(17 * 60 + 30);
    expect(parseTimeInput('00:00')).toBe(0);
  });

  it('rejects nonsense and out-of-range times', () => {
    expect(parseTimeInput('')).toBeNull();
    expect(parseTimeInput('25:00')).toBeNull();
    expect(parseTimeInput('9:75 AM')).toBeNull();
    expect(parseTimeInput('13 PM')).toBeNull();
    expect(parseTimeInput('noon')).toBeNull();
  });
});

describe('formatMinutes', () => {
  it('renders 12-hour AM/PM', () => {
    expect(formatMinutes(0)).toBe('12:00 AM');
    expect(formatMinutes(9 * 60)).toBe('9:00 AM');
    expect(formatMinutes(12 * 60)).toBe('12:00 PM');
    expect(formatMinutes(17 * 60 + 30)).toBe('5:30 PM');
  });

  it('round-trips with parseTimeInput', () => {
    for (const minutes of [0, 9 * 60, 12 * 60, 17 * 60 + 30, 23 * 60 + 45]) {
      expect(parseTimeInput(formatMinutes(minutes))).toBe(minutes);
    }
  });
});
