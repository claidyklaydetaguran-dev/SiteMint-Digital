// Checkpoint B: the provider-neutral contract for read-only calendar
// free/busy availability, mirroring the VoiceProvider abstraction
// (../voice/VoiceProvider.ts). Any real provider implements this interface;
// nothing outside that implementation may depend on vendor-specific types,
// URLs, or SDKs. Deliberately excludes any event-write capability — this
// interface cannot create, update, or delete a calendar event by
// construction, not just by convention.

export interface BusyRange {
  startUtc: Date;
  endUtc: Date;
}

export interface FreeBusyProvider {
  /** Firm-scoped busy ranges only — never event titles, attendees, descriptions, locations, or any other private event field. */
  getBusyRanges(firmId: number, rangeStartUtc: Date, rangeEndUtc: Date): Promise<BusyRange[]>;
  /** True once this firm has a working, read-only calendar connection. False is always a safe, honest fallback — never an error. */
  isConnected(firmId: number): Promise<boolean>;
}
