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

  /** Booking wizard. Prefixed ids carry state (admin id, date, slot start). */
  bookAdmin: 'book:admin',
  bookDatePrefix: 'book:date:', // + <adminId>
  bookTimePrefix: 'book:time:', // + <adminId>:<yyyy-LL-dd>
  bookConfirmPrefix: 'book:confirm:', // + <adminId>:<startEpochMillis>
  bookAbort: 'book:abort',

  /** Cancel button on a /my-bookings entry. */
  myBookingCancelPrefix: 'mybook:cancel:', // + <bookingId>
} as const;
