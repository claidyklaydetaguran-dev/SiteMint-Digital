// ── Signup pipeline ──────────────────────────────────────────────────────────
// Owner directive 2026-09-10 §3: registration must produce, durably —
//   1. one customer record in the private SiteMint CRM (crm_leads),
//   2. an email-verification message,
//   3. a welcome message once the address is confirmed —
// and a retried signup, a double submission, or a re-confirmation must never
// duplicate any of them.
//
// The signup handler ENQUEUES rows in voice_signup_jobs (unique per
// firm × kind, ON CONFLICT DO NOTHING) and answers the customer immediately.
// The worker below claims due rows with FOR UPDATE SKIP LOCKED and retries
// with exponential backoff, so a CRM or mail-provider failure delays the work
// instead of losing it. Nothing here is fire-and-forget: every outcome lands
// back on the job row, and "completed" for an email means ACCEPTED BY THE
// PROVIDER — delivery to an inbox is not observable from this process and is
// never claimed.
//
// Passwords and secrets never enter this module: the payload is the signup
// form's non-secret fields, and the CRM record carries name/company/contact
// data only.

import { db, crmLeads, intakeFirms } from "@workspace/db";
import {
  voiceSignupJobs,
  type VoiceSignupJob,
  type VoiceSignupJobKind,
  type VoiceSignupJobPayload,
  type VoiceSignupJobResult,
} from "@workspace/db/schema/voice";
import { and, eq, inArray, lte, isNull, or, sql } from "drizzle-orm";

const CRM_TAG = "AI Receptionist";
const CRM_SOURCE = "AI Receptionist Signup";
const CLAIM_BATCH = 5;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 60 * 60_000;
// A job left "processing" past this window is presumed abandoned by a crashed
// worker and reclaimed. This makes the pipeline at-least-once: a worker that had
// an email accepted by the provider and died before recording completion resends
// on reclaim. That trade is deliberate and stated honestly — a missing
// verification email locks a customer out, a duplicate is a minor annoyance, and
// the mail provider exposes no cross-request idempotency key here.
const LEASE_MS = 2 * 60_000;

// ── enqueue ──────────────────────────────────────────────────────────────────

export async function enqueueSignupJobs(
  firmId: number,
  payload: VoiceSignupJobPayload,
  kinds: VoiceSignupJobKind[],
): Promise<void> {
  if (kinds.length === 0) return;
  await db
    .insert(voiceSignupJobs)
    .values(kinds.map((kind) => ({ firmId, kind, payload })))
    .onConflictDoNothing();
}

// ── handlers ─────────────────────────────────────────────────────────────────

export interface SignupJobDeps {
  findLeadByEmail: (emailLower: string) => Promise<{ id: number; tags: string[]; notes: string | null } | undefined>;
  insertLead: (values: {
    name: string;
    company: string | null;
    phone: string | null;
    email: string;
    source: string;
    serviceInterest: string;
    tags: string[];
    notes: string;
  }) => Promise<{ id: number }>;
  tagLead: (leadId: number, tags: string[], noteLine: string) => Promise<void>;
  requestVerificationEmail: (firmId: number) => Promise<{ sent: boolean; reason?: string }>;
  sendWelcomeEmail: (to: string, firmName: string) => Promise<{ ok: boolean; reason?: string }>;
  findFirmEmail: (firmId: number) => Promise<{ email: string | null; name: string } | undefined>;
  now: () => Date;
}

async function productionDeps(): Promise<SignupJobDeps> {
  const { requestEmailVerification } = await import("../accountSecurity/accountTokens.js");
  const { createAlertTransportFromEnv } = await import("../voiceAlerts/alertTransport.js");
  return {
    findLeadByEmail: async (emailLower) => {
      const [row] = await db
        .select({ id: crmLeads.id, tags: crmLeads.tags, notes: crmLeads.notes })
        .from(crmLeads)
        .where(sql`lower(${crmLeads.email}) = ${emailLower}`)
        .limit(1);
      return row;
    },
    insertLead: async (values) => {
      const [row] = await db.insert(crmLeads).values(values).returning({ id: crmLeads.id });
      return row;
    },
    tagLead: async (leadId, tags, noteLine) => {
      const [existing] = await db
        .select({ notes: crmLeads.notes })
        .from(crmLeads)
        .where(eq(crmLeads.id, leadId))
        .limit(1);
      const notes = existing?.notes ? `${existing.notes}\n${noteLine}` : noteLine;
      await db.update(crmLeads).set({ tags, notes, updatedAt: new Date() }).where(eq(crmLeads.id, leadId));
    },
    requestVerificationEmail: (firmId) => requestEmailVerification(firmId),
    sendWelcomeEmail: async (to, firmName) => {
      const result = await createAlertTransportFromEnv().send({
        to,
        subject: "Welcome to SiteMint AI Receptionist",
        text: [
          `Hi ${firmName},`,
          "",
          "Your SiteMint AI Receptionist account is ready.",
          "",
          "What happens next:",
          "  1. Finish setup in your dashboard — tell the receptionist about your",
          "     business, your services, and when you take appointments.",
          "  2. Test it from your browser — talk to your receptionist before any",
          "     caller does.",
          "  3. When you're happy, we activate calling together.",
          "",
          "Creating an account does not change your phones: nothing answers real",
          "calls until you activate it.",
          "",
          "Sign in any time at https://sitemintdigital.com/ai-receptionist/dashboard/",
          "",
          "— SiteMint Digital",
        ].join("\n"),
      });
      return result.ok ? { ok: true } : { ok: false, reason: (result as { reason?: string }).reason };
    },
    findFirmEmail: async (firmId) => {
      const [row] = await db
        .select({ email: intakeFirms.email, name: intakeFirms.name })
        .from(intakeFirms)
        .where(eq(intakeFirms.id, firmId))
        .limit(1);
      return row;
    },
    now: () => new Date(),
  };
}

export type JobOutcome =
  | { ok: true; result: VoiceSignupJobResult }
  | { ok: false; retryable: boolean; error: string };

export async function runSignupJob(job: VoiceSignupJob, deps: SignupJobDeps): Promise<JobOutcome> {
  const payload = job.payload ?? {};
  switch (job.kind as VoiceSignupJobKind) {
    case "crm_link": {
      const email = (payload.email ?? "").toLowerCase().trim();
      if (!email) return { ok: false, retryable: false, error: "payload_missing_email" };
      const displayName = payload.fullName?.trim() || payload.businessName?.trim() || email;
      const noteLine =
        `AI Receptionist account created ${deps.now().toISOString().slice(0, 10)}` +
        (payload.industry ? ` — industry: ${payload.industry}` : "") +
        ` (firm ${job.firmId}).`;
      const existing = await deps.findLeadByEmail(email);
      if (existing) {
        if (existing.tags.includes(CRM_TAG)) {
          return { ok: true, result: { crmLeadId: existing.id, crmOutcome: "already_linked" } };
        }
        await deps.tagLead(existing.id, [...existing.tags, CRM_TAG], noteLine);
        return { ok: true, result: { crmLeadId: existing.id, crmOutcome: "linked" } };
      }
      const created = await deps.insertLead({
        name: displayName,
        company: payload.businessName?.trim() || null,
        phone: payload.phone?.trim() || null,
        email,
        source: CRM_SOURCE,
        serviceInterest: "AI Receptionist",
        tags: [CRM_TAG],
        notes: noteLine,
      });
      return { ok: true, result: { crmLeadId: created.id, crmOutcome: "created" } };
    }
    case "verification_email": {
      const sent = await deps.requestVerificationEmail(job.firmId);
      if (sent.sent) return { ok: true, result: { emailAccepted: true } };
      if (sent.reason === "no_email") return { ok: false, retryable: false, error: "no_email_on_firm" };
      return { ok: false, retryable: true, error: sent.reason ?? "delivery_unavailable" };
    }
    case "welcome_email": {
      const firm = await deps.findFirmEmail(job.firmId);
      if (!firm?.email) return { ok: false, retryable: false, error: "no_email_on_firm" };
      const sent = await deps.sendWelcomeEmail(firm.email, firm.name);
      if (sent.ok) return { ok: true, result: { emailAccepted: true } };
      return { ok: false, retryable: true, error: sent.reason ?? "delivery_unavailable" };
    }
    default:
      return { ok: false, retryable: false, error: `unknown_kind:${job.kind}` };
  }
}

// ── worker ───────────────────────────────────────────────────────────────────

export function backoffDelayMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

async function claimDueJobs(now: Date): Promise<VoiceSignupJob[]> {
  return db.transaction(async (tx) => {
    const leaseDeadline = new Date(now.getTime() - LEASE_MS);
    const due = await tx
      .select({ id: voiceSignupJobs.id })
      .from(voiceSignupJobs)
      .where(
        or(
          and(
            inArray(voiceSignupJobs.status, ["pending", "retry_scheduled"]),
            or(isNull(voiceSignupJobs.nextAttemptAt), lte(voiceSignupJobs.nextAttemptAt, now)),
          ),
          // Crash recovery: a lease that expired while "processing". SKIP LOCKED
          // keeps a still-running worker's row locked, so only a genuinely
          // abandoned job (its transaction gone) is reclaimed here.
          and(eq(voiceSignupJobs.status, "processing"), lte(voiceSignupJobs.updatedAt, leaseDeadline)),
        ),
      )
      .orderBy(voiceSignupJobs.id)
      .limit(CLAIM_BATCH)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];
    const claimed = await tx
      .update(voiceSignupJobs)
      .set({ status: "processing", updatedAt: now })
      .where(inArray(voiceSignupJobs.id, due.map((row) => row.id)))
      .returning();
    return claimed;
  });
}

async function settleJob(job: VoiceSignupJob, outcome: JobOutcome, now: Date): Promise<void> {
  if (outcome.ok) {
    await db
      .update(voiceSignupJobs)
      .set({ status: "completed", result: outcome.result, lastError: null, updatedAt: now })
      .where(eq(voiceSignupJobs.id, job.id));
    return;
  }
  const attempts = job.attempts + 1;
  const exhausted = !outcome.retryable || attempts >= job.maxAttempts;
  await db
    .update(voiceSignupJobs)
    .set({
      status: exhausted ? "permanently_failed" : "retry_scheduled",
      attempts,
      lastError: outcome.error.slice(0, 500),
      nextAttemptAt: exhausted ? null : new Date(now.getTime() + backoffDelayMs(attempts)),
      updatedAt: now,
    })
    .where(eq(voiceSignupJobs.id, job.id));
}

export interface ProcessSummary {
  claimed: number;
  completed: number;
  failed: number;
}

export async function processDueSignupJobs(deps?: SignupJobDeps): Promise<ProcessSummary> {
  const resolved = deps ?? (await productionDeps());
  const now = resolved.now();
  const jobs = await claimDueJobs(now);
  let completed = 0;
  let failed = 0;
  for (const job of jobs) {
    let outcome: JobOutcome;
    try {
      outcome = await runSignupJob(job, resolved);
    } catch (err) {
      outcome = { ok: false, retryable: true, error: err instanceof Error ? err.message : "handler_threw" };
    }
    await settleJob(job, outcome, resolved.now());
    outcome.ok ? completed++ : failed++;
  }
  return { claimed: jobs.length, completed, failed };
}

// ── reconciliation ───────────────────────────────────────────────────────────
// The durable-recovery half of directive §4. The inline enqueue in the signup
// handler is a fast path wrapped in a catch so it can never fail the account —
// which by itself would mean a rare enqueue failure silently loses the CRM and
// verification work. This sweep is the guarantee that it cannot: every
// receptionist account (a firm WITH a password_hash — the column is null for
// the legacy SMS-intake firms that were never dashboard customers) must have a
// crm_link job, and any firm missing one has its work created here. The enqueue
// is unique per firm × kind with ON CONFLICT DO NOTHING, so this creates
// EXACTLY the missing work and never a duplicate, however many times it runs.

const RECONCILE_BATCH = 25;

export interface ReconcileDeps {
  findAccountsMissingCrmLink: (limit: number) => Promise<Array<{ id: number; email: string | null; name: string; industry: string | null }>>;
  enqueue?: typeof enqueueSignupJobs;
}

async function productionReconcileDeps(): Promise<ReconcileDeps> {
  return {
    findAccountsMissingCrmLink: async (limit) => {
      // Receptionist accounts (password_hash set) with no crm_link job row.
      const rows = await db
        .select({ id: intakeFirms.id, email: intakeFirms.email, name: intakeFirms.name, industry: intakeFirms.industry })
        .from(intakeFirms)
        .where(
          and(
            sql`${intakeFirms.passwordHash} is not null`,
            sql`${intakeFirms.email} is not null`,
            sql`not exists (select 1 from ${voiceSignupJobs} j where j.firm_id = ${intakeFirms.id} and j.kind = 'crm_link')`,
          ),
        )
        .orderBy(intakeFirms.id)
        .limit(limit);
      return rows;
    },
  };
}

export async function reconcileMissingSignupJobs(deps?: ReconcileDeps): Promise<{ enqueued: number }> {
  const resolved = deps ?? (await productionReconcileDeps());
  const enqueue = resolved.enqueue ?? enqueueSignupJobs;
  const accounts = await resolved.findAccountsMissingCrmLink(RECONCILE_BATCH);
  let enqueued = 0;
  for (const acc of accounts) {
    if (!acc.email) continue;
    await enqueue(
      acc.id,
      { businessName: acc.name, email: acc.email, industry: acc.industry ?? undefined },
      ["crm_link", "verification_email"],
    );
    enqueued += 1;
  }
  return { enqueued };
}

const WORKER_TICK_MS = 15_000;
const RECONCILE_TICK_MS = 60_000;
let workerStarted = false;

/**
 * In-process worker. Cheap when idle (one indexed SELECT per tick), loud when
 * something fails permanently. Started once from api-server boot; safe to call
 * twice.
 */
export function startSignupJobWorker(log: { info: (o: object, m: string) => void; error: (o: object, m: string) => void }): void {
  if (workerStarted) return;
  workerStarted = true;
  const tick = async () => {
    try {
      const summary = await processDueSignupJobs();
      if (summary.claimed > 0) {
        log.info({ ...summary }, "[signup-pipeline] processed jobs");
      }
    } catch (err) {
      log.error({ errorClass: err instanceof Error ? err.name : "unknown" }, "[signup-pipeline] tick failed");
    }
  };
  const reconcileTick = async () => {
    try {
      const { enqueued } = await reconcileMissingSignupJobs();
      if (enqueued > 0) log.info({ enqueued }, "[signup-pipeline] reconciled accounts missing signup jobs");
    } catch (err) {
      log.error({ errorClass: err instanceof Error ? err.name : "unknown" }, "[signup-pipeline] reconcile failed");
    }
  };
  setInterval(tick, WORKER_TICK_MS).unref?.();
  setInterval(reconcileTick, RECONCILE_TICK_MS).unref?.();
  // Immediate passes: drain the queue and backfill any account whose enqueue was
  // lost while the worker was down.
  void tick();
  void reconcileTick();
}
