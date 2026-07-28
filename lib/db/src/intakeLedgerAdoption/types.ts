// Checkpoint A3 — shared types for the guarded intake ledger adoption
// utility. No database driver types leak in here; `AdoptionDbClient` is the
// only surface the orchestrator (adopt.ts) is allowed to touch, which is
// what makes it mockable in tests without a live database.

/** Minimal query surface the adoption utility needs. Implemented for real
 * by a thin `pg.Client` wrapper (see cli.ts) and by an in-memory fake in
 * tests. Deliberately has no `.connect()`/`.end()` — connection lifecycle is
 * the caller's responsibility, not the orchestrator's. */
export interface AdoptionDbClient {
  query<Row extends object = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<{ rows: Row[] }>;
}

export type AdoptionMode = "dry-run" | "apply" | "rehearse";

export interface AdoptionOptions {
  /** "apply" and "rehearse" both require a correct `confirmation`. Defaults to "dry-run". Mutually
   * exclusive at the CLI layer (see cli.ts's parseArgs) — this type does not enforce that itself
   * because it's a single mode value, not two independent flags, by the time it reaches here. */
  mode: AdoptionMode;
  /** Required for "apply" and "rehearse". Must exactly equal the value computed by computeConfirmationToken(). */
  confirmation?: string;
}

export type AdoptionOutcome =
  | { status: "dry-run-ok"; confirmationToken: string; targetFingerprint: string }
  | { status: "already-adopted"; targetFingerprint: string }
  | { status: "adopted"; targetFingerprint: string }
  | { status: "rehearsed"; targetFingerprint: string; ledgerWriteExercised: boolean };

export class IntakeAdoptionError extends Error {
  readonly reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = "IntakeAdoptionError";
    this.reason = reason;
  }
}
