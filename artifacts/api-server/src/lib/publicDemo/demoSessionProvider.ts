// V5 blueprint §10: the ONLY surface a live demo implementation may fill.
//
// This file (and every other file under lib/publicDemo/) must NEVER import
// a Vapi type, URL, SDK, or credential, and must never import
// VapiVoiceProvider.ts or the voice provider factory — CLAUDE.md reserves
// all of that to artifacts/api-server/src/lib/voice/. The controlled demo
// is a SEPARATE, deliberately unimplemented seam: `createProductionDemoSessionProvider`
// always throws, exactly like `createProductionPhoneNumberProvider`
// (lib/voiceNumbers/numberService.ts) does for live number acquisition. A
// real implementation is a future, owner-gated activation — not something
// this PR wires, even behind a flag.

export interface DemoSessionHandle {
  /** Opaque id from whatever eventually implements this. Never a Vapi call/session id today — there is no provider. */
  providerSessionId: string;
}

export interface DemoSessionProvider {
  /** Rough per-session cost estimate in cents, charged against the daily budget the instant a session starts (not metered afterward). */
  readonly estimatedCostCentsPerSession: number;
  startDemoSession(): Promise<DemoSessionHandle>;
  endDemoSession(providerSessionId: string): Promise<void>;
}

/** Always refuses. No real implementation exists in this codebase. */
export function createProductionDemoSessionProvider(): DemoSessionProvider {
  return {
    estimatedCostCentsPerSession: 0,
    async startDemoSession(): Promise<DemoSessionHandle> {
      throw new Error("Live demo session provider is not configured.");
    },
    async endDemoSession(): Promise<void> {
      throw new Error("Live demo session provider is not configured.");
    },
  };
}

/** Deterministic fake for tests. */
export class FakeDemoSessionProvider implements DemoSessionProvider {
  readonly started: string[] = [];
  readonly ended: string[] = [];
  estimatedCostCentsPerSession: number;
  private counter = 0;

  constructor(estimatedCostCentsPerSession = 50) {
    this.estimatedCostCentsPerSession = estimatedCostCentsPerSession;
  }

  async startDemoSession(): Promise<DemoSessionHandle> {
    const providerSessionId = `fake-demo-${++this.counter}`;
    this.started.push(providerSessionId);
    return { providerSessionId };
  }

  async endDemoSession(providerSessionId: string): Promise<void> {
    this.ended.push(providerSessionId);
  }
}
