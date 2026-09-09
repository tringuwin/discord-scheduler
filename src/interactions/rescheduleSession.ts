/**
 * Transient state for an in-progress /reschedule wizard, keyed by the ephemeral
 * message id. In-memory and short-lived — a restart drops it and the admin
 * re-runs /reschedule.
 */
export interface RescheduleDraft {
  bookingId: string;
  number: number;
  adminIds: string[];
  startMs?: number;
}

interface Entry {
  draft: RescheduleDraft;
  expiresAt: number;
}

const TTL_MS = 15 * 60_000;
const store = new Map<string, Entry>();

export function saveReschedule(key: string, draft: RescheduleDraft): void {
  store.set(key, { draft, expiresAt: Date.now() + TTL_MS });
}

export function getReschedule(key: string): RescheduleDraft | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.draft;
}

export function clearReschedule(key: string): void {
  store.delete(key);
}
