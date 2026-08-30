// P8: append-only audit writer. One narrow function so every sensitive
// account/billing action leaves the same shaped trail. Rows are never
// updated or deleted by application code.

export type AuditActor = "owner" | "system" | "admin";

export interface AuditEventInput {
  firmId: number;
  actor: AuditActor;
  /** Machine-readable, e.g. "subscription.grace_entered", "password.reset_completed". */
  action: string;
  /** What it acted on (a member email, a plan code, a period). Never secrets. */
  subject?: string;
  /** Operator-safe fields only — never tokens, passwords, or customer content. */
  context?: Record<string, unknown>;
}

export interface AuditDeps {
  insertAuditRow: (row: {
    firmId: number;
    actor: AuditActor;
    action: string;
    subject: string | null;
    context: Record<string, unknown>;
  }) => Promise<void>;
}

async function productionAuditDeps(): Promise<AuditDeps> {
  const { db } = await import("@workspace/db");
  const { voiceAuditLog } = await import("@workspace/db/schema/voice");
  return {
    insertAuditRow: async (row) => {
      await db.insert(voiceAuditLog).values(row);
    },
  };
}

const ACTION_SHAPE = /^[a-z0-9_.]{1,60}$/;

/**
 * Best-effort by contract at call sites (an audit failure must never undo
 * the audited action), but the function itself throws on malformed input
 * so tests catch bad action names at build time.
 */
export async function recordAuditEvent(input: AuditEventInput, deps?: AuditDeps): Promise<void> {
  if (!ACTION_SHAPE.test(input.action)) {
    throw new Error(`audit action must match ${ACTION_SHAPE}: "${input.action}"`);
  }
  const resolved = deps ?? (await productionAuditDeps());
  await resolved.insertAuditRow({
    firmId: input.firmId,
    actor: input.actor,
    action: input.action,
    subject: input.subject ?? null,
    context: input.context ?? {},
  });
}
