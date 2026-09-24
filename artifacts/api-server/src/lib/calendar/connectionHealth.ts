// What state is the business's calendar connection ACTUALLY in?
//
// `GET /availability/calendar-status` answers one boolean, `connected`, and
// that boolean is derived from an active row existing. It therefore says
// "connected" in a situation where nothing works at all: the owner removes
// SiteMint's access from their Google account, every call starts failing, and
// the row stays `active` until something tries to use it and marks it revoked.
// Until that happens the dashboard reports a healthy connection while every
// approval silently fails.
//
// This computes the honest answer from what the connection row already
// records, and — importantly — separates three things the boolean conflated:
//
//   - whether a connection EXISTS,
//   - whether it is USABLE (not revoked),
//   - whether it has recently WORKED (a successful free/busy read more recent
//     than the last error).
//
// The third one is the difference between "set up" and "working", and only the
// second of those is worth telling a business their bookings depend on.

export type CalendarHealthState =
  | "not_connected" // nothing has ever been connected
  | "revoked" // the provider withdrew access; nothing will work until reconnected
  | "failing" // connected, but the most recent attempt failed
  | "untested" // connected, and nothing has tried to use it yet
  | "healthy"; // connected, and the last attempt succeeded

export interface ConnectionSnapshot {
  /**
   * The stored status. Typed as a plain string because the column is one, and
   * anything that is not exactly "active" is treated as unusable — a status
   * this code does not recognise must not be reported as working.
   */
  status: string;
  provider: string;
  accountLabel: string | null;
  calendarId: string;
  lastFreebusyAt: Date | null;
  lastErrorAt: Date | null;
  createdAt: Date;
}

export interface CalendarHealth {
  state: CalendarHealthState;
  /** True only when the connection can be used right now. */
  usable: boolean;
  provider: string | null;
  accountLabel: string | null;
  calendarId: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  connectedAt: string | null;
}

export const NOT_CONNECTED: CalendarHealth = {
  state: "not_connected",
  usable: false,
  provider: null,
  accountLabel: null,
  calendarId: null,
  lastSuccessAt: null,
  lastErrorAt: null,
  connectedAt: null,
};

/**
 * Pure: given the row, say what state the connection is in.
 *
 * A revoked connection is NEVER reported as usable, whatever its timestamps
 * say — a successful read an hour before access was withdrawn does not make it
 * working now.
 */
export function assessConnectionHealth(connection: ConnectionSnapshot | undefined): CalendarHealth {
  if (connection === undefined) return NOT_CONNECTED;

  const base = {
    provider: connection.provider,
    accountLabel: connection.accountLabel,
    calendarId: connection.calendarId,
    lastSuccessAt: connection.lastFreebusyAt?.toISOString() ?? null,
    lastErrorAt: connection.lastErrorAt?.toISOString() ?? null,
    connectedAt: connection.createdAt.toISOString(),
  };

  // Fail closed on anything that is not explicitly active, so a status added
  // later cannot start life being reported as a working connection.
  if (connection.status !== "active") return { ...base, state: "revoked", usable: false };

  const success = connection.lastFreebusyAt?.getTime() ?? null;
  const failure = connection.lastErrorAt?.getTime() ?? null;

  if (failure !== null && (success === null || failure > success)) {
    // Still "usable" in the sense that the credentials have not been withdrawn
    // — a transient provider outage looks exactly like this — but the business
    // is told the last attempt failed rather than shown a healthy tick.
    return { ...base, state: "failing", usable: true };
  }
  if (success === null) return { ...base, state: "untested", usable: true };
  return { ...base, state: "healthy", usable: true };
}
