/** Parsing/formatting for wall-clock times expressed as minutes-from-midnight. */

const HHMM = /^(\d{1,2}):(\d{2})$/;

/**
 * Parse a 24-hour "H:MM" / "HH:MM" string into minutes from midnight.
 * Returns null when the input is not a valid time of day.
 */
export function parseHmm(input: string): number | null {
  const match = HHMM.exec(input.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Format minutes-from-midnight back to a zero-padded "HH:MM" string. */
export function formatMinutes(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
