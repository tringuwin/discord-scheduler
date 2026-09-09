/** Parsing/formatting for wall-clock times expressed as minutes-from-midnight. */

const TWELVE_HOUR = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i; // "9 AM", "9:30 pm"
const TWENTY_FOUR = /^(\d{1,2}):(\d{2})$/; // "09:00", "17:30"

/**
 * Parse a time-of-day into minutes from midnight. Accepts 12-hour input with an
 * AM/PM suffix ("9:00 AM", "5 pm") and 24-hour "HH:MM". Returns null when the
 * input is not a valid time of day.
 */
export function parseTimeInput(input: string): number | null {
  const text = input.trim();

  const twelve = TWELVE_HOUR.exec(text);
  if (twelve) {
    let hour = Number(twelve[1]);
    const minute = twelve[2] ? Number(twelve[2]) : 0;
    if (hour < 1 || hour > 12 || minute > 59) return null;
    if (hour === 12) hour = 0; // 12 AM → 0, 12 PM → handled by the +12 below
    if (twelve[3]!.toLowerCase() === 'p') hour += 12;
    return hour * 60 + minute;
  }

  const twentyFour = TWENTY_FOUR.exec(text);
  if (twentyFour) {
    const hour = Number(twentyFour[1]);
    const minute = Number(twentyFour[2]);
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
  }

  return null;
}

/** Format minutes-from-midnight to a 12-hour "h:mm AM/PM" string. */
export function formatMinutes(totalMinutes: number): string {
  const hour24 = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const period = hour24 < 12 ? 'AM' : 'PM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minute).padStart(2, '0')} ${period}`;
}
