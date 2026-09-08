import { DateTime } from 'luxon';

/** True when `tz` is a valid IANA timezone identifier. */
export function isValidTimezone(tz: string): boolean {
  return DateTime.now().setZone(tz).isValid;
}

/** The full list of IANA timezones known to this runtime. */
export function listTimezones(): string[] {
  try {
    // Available in Node 18+. Typed loosely because lib types lag behind.
    const values = (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf(
      'timeZone',
    );
    return values.length > 0 ? values : ['UTC'];
  } catch {
    return ['UTC'];
  }
}

/** Case-insensitive substring search over IANA timezones (for autocomplete). */
export function searchTimezones(query: string, limit = 25): string[] {
  const needle = query.trim().toLowerCase();
  const all = listTimezones();
  if (!needle) return all.slice(0, limit);
  return all.filter((tz) => tz.toLowerCase().includes(needle)).slice(0, limit);
}
