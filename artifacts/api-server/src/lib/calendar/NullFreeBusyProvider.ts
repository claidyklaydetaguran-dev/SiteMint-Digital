// The honest "no calendar connected" fallback. Used whenever no real
// provider is configured (the default in every environment until Google
// credentials are explicitly provisioned) — never throws, never blocks
// availability, and never fabricates a busy range.

import type { FreeBusyProvider, BusyRange } from "./FreeBusyProvider.js";

export class NullFreeBusyProvider implements FreeBusyProvider {
  async getBusyRanges(_firmId: number, _rangeStartUtc: Date, _rangeEndUtc: Date): Promise<BusyRange[]> {
    return [];
  }

  async isConnected(_firmId: number): Promise<boolean> {
    return false;
  }
}
