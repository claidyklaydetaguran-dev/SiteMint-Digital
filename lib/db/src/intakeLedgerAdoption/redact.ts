// Checkpoint A3 — connection-identity redaction. Nothing in this module
// ever returns or logs a username, password, or complete connection URL.
import { fingerprintConnectionTarget } from "./crypto";

export interface RedactedTarget {
  /** Non-reversible identity fingerprint, safe to print/log/compare. */
  fingerprint: string;
  /** Host only, safe to print — never the port, database name, user, or password. */
  hostForDisplay: string;
}

/** Parses a postgres connection string and returns only a display-safe host
 * plus a non-reversible fingerprint of host+port+dbname. Throws (rather
 * than falling back to printing the raw string) if the value doesn't parse
 * as a URL, so a malformed env var can never leak verbatim into logs. */
export function redactConnectionTarget(connectionString: string): RedactedTarget {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error(
      `${"connection string"} is not a valid URL; refusing to log or process it further to avoid leaking it`,
    );
  }
  const hostPortDb = `${url.hostname}:${url.port || "5432"}${url.pathname}`;
  return {
    fingerprint: fingerprintConnectionTarget(hostPortDb),
    hostForDisplay: url.hostname,
  };
}
