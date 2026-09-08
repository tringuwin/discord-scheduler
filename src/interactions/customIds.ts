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

  /** Booking wizard. State lives in a session keyed by the message id, so these
   *  ids are fixed (no embedded payload). */
  bookAdmin: 'book:admin',
  bookDate: 'book:date',
  bookTime: 'book:time',
  bookConfirm: 'book:confirm',
  bookAbort: 'book:abort',

  /** Cancel button on a /my-bookings entry. */
  myBookingCancelPrefix: 'mybook:cancel:', // + <bookingId>

  /** Invite flow. */
  inviteStartPrefix: 'invite:start:', // + <bookingId>  (button on /my-bookings)
  inviteUsersPrefix: 'invite:users:', // + <bookingId>  (user-select)
  inviteAcceptPrefix: 'invite:accept:', // + <bookingId>  (DM button)
  inviteDeclinePrefix: 'invite:decline:', // + <bookingId>  (DM button)
} as const;
