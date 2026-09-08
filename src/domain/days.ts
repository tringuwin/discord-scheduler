/** Day-of-week helpers. We use Luxon's convention: 1 = Monday ... 7 = Sunday. */

export const DAY_LABEL: Readonly<Record<number, string>> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

export const DAY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [1, 2, 3, 4, 5, 6, 7].map(
  (n) => ({ value: String(n), label: DAY_LABEL[n]! }),
);

export function isValidDay(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 7;
}
