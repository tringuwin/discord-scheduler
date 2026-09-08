/**
 * Pure scheduling decisions. Kept free of Discord/DB IO so the timing rules can
 * be unit-tested in isolation. All times are epoch milliseconds.
 */

/** A meeting is "missed" if it should have opened but is now too far past. */
export function isMissed(nowMs: number, startMs: number, missedAfterMs: number): boolean {
  return nowMs - startMs > missedAfterMs;
}

/** Whether a not-yet-started meeting falls within its reminder lead window. */
export function isInReminderWindow(nowMs: number, startMs: number, leadMinutes: number): boolean {
  if (leadMinutes <= 0) return false;
  const minutesUntil = (startMs - nowMs) / 60_000;
  return minutesUntil > 0 && minutesUntil <= leadMinutes;
}

export type AgeVerdict = 'hard_cap' | 'no_show' | 'none';

/**
 * Age-based cleanup verdict for an open meeting channel (the durable backstop
 * to the voiceStateUpdate listener):
 * - `hard_cap`: older than the maximum channel lifetime → force close.
 * - `no_show`: nobody ever joined and the grace period elapsed → close.
 * - `none`: leave it (an occupant may still be inside).
 */
export function cleanupByAge(
  nowMs: number,
  createdAtMs: number,
  everJoined: boolean,
  opts: { noShowMs: number; hardCapMs: number },
): AgeVerdict {
  const age = nowMs - createdAtMs;
  if (age > opts.hardCapMs) return 'hard_cap';
  if (!everJoined && age > opts.noShowMs) return 'no_show';
  return 'none';
}
