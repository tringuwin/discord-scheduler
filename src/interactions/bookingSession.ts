/**
 * Transient state for an in-progress /book wizard, keyed by the ephemeral
 * message id (stable across the wizard's steps). In-memory and short-lived: if
 * the process restarts mid-wizard the draft is gone and the user re-runs /book.
 */
export interface BookingDraft {
  adminIds: string[];
  startMs?: number;
}

interface Entry {
  draft: BookingDraft;
  expiresAt: number;
}

const TTL_MS = 15 * 60_000;
const store = new Map<string, Entry>();

export function saveDraft(key: string, draft: BookingDraft): void {
  store.set(key, { draft, expiresAt: Date.now() + TTL_MS });
}

export function getDraft(key: string): BookingDraft | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.draft;
}

export function clearDraft(key: string): void {
  store.delete(key);
}
