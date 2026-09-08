/**
 * Centralised custom-id scheme for message components and modals.
 * Custom ids are limited to 100 characters; keep encoded payloads small.
 */
export const CID = {
  /** Day-of-week multi-select in the availability wizard. */
  availDays: 'avail:days',
  /** Modal collecting the time range; suffixed with a CSV of day numbers. */
  availTimesPrefix: 'avail:times:',
  /** Confirm / cancel buttons for clearing availability. */
  availClearConfirm: 'avail:clear:confirm',
  availClearCancel: 'avail:clear:cancel',
} as const;
