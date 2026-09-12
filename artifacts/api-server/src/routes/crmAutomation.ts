// ── M4: workflow automation — the API ───────────────────────────────────────
//
// Rules, their runs, and the approvals that gate them.
//
// Two permissions, and the split is deliberate. `settings.read` lets anybody
// operational SEE what the automations are and what they have done — being
// unable to answer "why did this task appear" is how people stop trusting a
// system. `settings.write` is what it takes to CHANGE one or to run it by hand,
// because a rule is a standing instruction that acts on everyone's records, and
// an operations manager who can create one has, in effect, unlimited reach.
//
// Approval decisions are gated differently again: not by permission but by
// IDENTITY. Only the person the rule named may approve or reject, including
// owners. "An approver" that anybody senior can override is not an approval.

import { Router, type IRouter, type Request, type Response } from "express";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  db,
  crmAutomationRules, crmAutomationExecutions, crmAutomationActionRuns, crmAutomationApprovals,
  crmStaff,
  CRM_AUTOMATION_TRIGGERS, CRM_AUTOMATION_OPERATORS, CRM_AUTOMATION_ACTION_TYPES,
  CRM_AUTOMATION_RECORD_TYPES, CRM_AUTOMATION_TRIGGER_RECORD, CRM_AUTOMATION_FIELDS,
  CRM_AUTOMATION_WRITABLE_FIELDS, CRM_AUTOMATION_EXECUTION_STATUSES,
  CRM_AUTOMATION_STOP_REASONS, CRM_AUTOMATION_COMBINERS,
  isAutomationField, isAutomationWritableField,
  type CrmAutomationAction, type CrmAutomationActionType, type CrmAutomationConditionGroup,
  type CrmAutomationRecordType, type CrmAutomationTrigger,
} from "@workspace/db";
import { requireCrmAuth, auditAction } from "../lib/staffAuth.js";
import {
  decideAutomationApproval, drainAutomationJobs, runRuleManually,
} from "../lib/automationEngine.js";

const router: IRouter = Router();

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

function actor(req: Request) {
  const s = req.staffAuth?.staff;
  return { id: s?.id ?? null, label: s?.displayName || s?.email || "admin" };
}

// ── Validation ──────────────────────────────────────────────────────────────
//
// A rule is validated when it is SAVED, not when it first fires. A rule with a
// condition on a field that does not exist would otherwise sit there looking
// correct and silently never match, and the person who wrote it would find out
// weeks later — or never.

type Validated = {
  name: string;
  description: string | null;
  trigger: CrmAutomationTrigger;
  enabled: boolean;
  conditions: CrmAutomationConditionGroup;
  stopConditions: CrmAutomationConditionGroup;
  actions: CrmAutomationAction[];
  maxChainDepth: number;
  windowCap: number;
  windowMinutes: number;
  maxActionAttempts: number;
  inactivityDays: number;
};

/** Per-action-type required settings, so a half-written action cannot be saved. */
const ACTION_REQUIREMENTS: Record<CrmAutomationActionType, (config: Record<string, unknown>) => string | null> = {
  assign_owner: (c) => (num(c["staffId"]) ? null : "Assigning an owner needs a staff member."),
  create_task: (c) => (String(c["title"] ?? "").trim() ? null : "Creating a task needs a title."),
  notify: (c) => (num(c["staffId"]) ? null : "A notification needs somebody to send it to."),
  set_field: (c) => (String(c["field"] ?? "").trim() ? null : "Setting a field needs a field name."),
  add_note: (c) => (String(c["body"] ?? "").trim() ? null : "A note needs something written in it."),
  schedule_follow_up: (c) =>
    (Number.isFinite(Number(c["inDays"])) ? null : "A follow-up needs a number of days."),
  request_approval: (c) =>
    (num(c["approverStaffId"]) ? null : "An approval step needs the person who must approve it."),
};

function validateGroup(
  raw: unknown, recordType: CrmAutomationRecordType, what: string, fallbackCombine: "and" | "or",
): { ok: true; value: CrmAutomationConditionGroup } | { ok: false; error: string } {
  if (raw === undefined || raw === null) {
    return { ok: true, value: { combine: fallbackCombine, conditions: [] } };
  }
  if (typeof raw !== "object") return { ok: false, error: `${what} must be a group of conditions.` };

  const group = raw as Partial<CrmAutomationConditionGroup>;
  const combine = group.combine ?? fallbackCombine;
  if (!(CRM_AUTOMATION_COMBINERS as readonly string[]).includes(combine)) {
    return { ok: false, error: `${what} must combine with "and" or "or".` };
  }
  const list = Array.isArray(group.conditions) ? group.conditions : [];
  if (list.length > 25) return { ok: false, error: `${what} has too many conditions (25 maximum).` };

  for (const c of list) {
    if (!c || typeof c !== "object") return { ok: false, error: `${what} contains an empty condition.` };
    if (!isAutomationField(recordType, String(c.field ?? ""))) {
      return {
        ok: false,
        error: `A ${recordType} has no field "${String(c.field ?? "")}". `
          + `Available: ${CRM_AUTOMATION_FIELDS[recordType].join(", ")}.`,
      };
    }
    if (!(CRM_AUTOMATION_OPERATORS as readonly string[]).includes(String(c.operator))) {
      return { ok: false, error: `"${String(c.operator)}" is not a comparison this build knows.` };
    }
  }
  return { ok: true, value: { combine, conditions: list } };
}

function validateRule(body: Record<string, unknown>): { ok: true; value: Validated } | { ok: false; error: string } {
  const name = String(body["name"] ?? "").trim();
  if (!name) return { ok: false, error: "Give the rule a name." };
  if (name.length > 200) return { ok: false, error: "That name is too long (200 characters maximum)." };

  const trigger = String(body["trigger"] ?? "");
  if (!(CRM_AUTOMATION_TRIGGERS as readonly string[]).includes(trigger)) {
    return { ok: false, error: `"${trigger}" is not a trigger. Accepted: ${CRM_AUTOMATION_TRIGGERS.join(", ")}.` };
  }
  const recordType = CRM_AUTOMATION_TRIGGER_RECORD[trigger as CrmAutomationTrigger];

  const conditions = validateGroup(body["conditions"], recordType, "Conditions", "and");
  if (!conditions.ok) return conditions;
  const stopConditions = validateGroup(body["stopConditions"], recordType, "Stop conditions", "or");
  if (!stopConditions.ok) return stopConditions;

  const rawActions = Array.isArray(body["actions"]) ? body["actions"] : [];
  if (rawActions.length === 0) return { ok: false, error: "A rule that does nothing is not a rule. Add an action." };
  if (rawActions.length > 10) return { ok: false, error: "A rule may have at most 10 actions." };

  const actions: CrmAutomationAction[] = [];
  for (const raw of rawActions) {
    const a = raw as Partial<CrmAutomationAction>;
    const type = String(a?.type ?? "") as CrmAutomationActionType;
    if (!(CRM_AUTOMATION_ACTION_TYPES as readonly string[]).includes(type)) {
      return { ok: false, error: `"${type}" is not an action this build knows.` };
    }
    const config = (a?.config ?? {}) as Record<string, unknown>;
    const missing = ACTION_REQUIREMENTS[type](config);
    if (missing) return { ok: false, error: missing };

    if (type === "set_field" && !isAutomationWritableField(recordType, String(config["field"]))) {
      return {
        ok: false,
        error: `An automation may not set "${String(config["field"])}" on a ${recordType}. `
          + `It may set: ${CRM_AUTOMATION_WRITABLE_FIELDS[recordType].join(", ") || "nothing"}.`,
      };
    }

    const approver = num(a?.approverStaffId);
    actions.push({ type, config, approverStaffId: approver ?? null });
  }

  const bounded = (key: string, fallback: number, min: number, max: number) => {
    const v = num(body[key]);
    if (v === undefined) return fallback;
    return Math.min(Math.max(Math.trunc(v), min), max);
  };

  return {
    ok: true,
    value: {
      name,
      description: typeof body["description"] === "string" ? body["description"].slice(0, 2000) : null,
      trigger: trigger as CrmAutomationTrigger,
      enabled: body["enabled"] === undefined ? true : Boolean(body["enabled"]),
      conditions: conditions.value,
      stopConditions: stopConditions.value,
      actions,
      // The brakes are clamped, never switched off: a request asking for depth 0
      // is given the floor rather than an unprotected rule.
      maxChainDepth: bounded("maxChainDepth", 3, 1, 10),
      windowCap: bounded("windowCap", 5, 1, 500),
      windowMinutes: bounded("windowMinutes", 60, 1, 10080),
      maxActionAttempts: bounded("maxActionAttempts", 3, 1, 10),
      // Only meaningful for no_activity_for_days; harmless on every other
      // trigger, and cheaper than a conditional shape.
      inactivityDays: bounded("inactivityDays", 14, 1, 365),
    },
  };
}

// ── Vocabulary ──────────────────────────────────────────────────────────────

/** Everything the rule builder needs to offer only valid choices. */
router.get("/crm/automation/vocabulary", requireCrmAuth("settings.read"), async (_req: Request, res: Response) => {
  const staff = await db.select({ id: crmStaff.id, displayName: crmStaff.displayName })
    .from(crmStaff).where(eq(crmStaff.status, "active")).orderBy(crmStaff.displayName);

  res.json({
    triggers: CRM_AUTOMATION_TRIGGERS.map((t) => ({ trigger: t, recordType: CRM_AUTOMATION_TRIGGER_RECORD[t] })),
    operators: CRM_AUTOMATION_OPERATORS,
    combiners: CRM_AUTOMATION_COMBINERS,
    actionTypes: CRM_AUTOMATION_ACTION_TYPES,
    recordTypes: CRM_AUTOMATION_RECORD_TYPES,
    fields: CRM_AUTOMATION_FIELDS,
    writableFields: CRM_AUTOMATION_WRITABLE_FIELDS,
    executionStatuses: CRM_AUTOMATION_EXECUTION_STATUSES,
    stopReasons: CRM_AUTOMATION_STOP_REASONS,
    staff,
    notes: {
      outbound: "No action in this vocabulary can contact a customer. Notifications are the in-app "
        + "bell; there is no email, SMS or call action, so an automation cannot reach a client.",
      loopProtection: "Every rule carries a chain-depth limit and a per-record execution cap. Both are "
        + "clamped to at least 1 — a rule cannot be saved with its loop protection switched off.",
    },
  });
});

// ── Rules ───────────────────────────────────────────────────────────────────

router.get("/crm/automation/rules", requireCrmAuth("settings.read"), async (req: Request, res: Response) => {
  const includeArchived = req.query["includeArchived"] === "true";
  const rules = await db.select().from(crmAutomationRules)
    .where(includeArchived ? undefined : isNull(crmAutomationRules.archivedAt))
    .orderBy(desc(crmAutomationRules.id));

  const ids = rules.map((r) => r.id);
  const tallies = ids.length
    ? await db.select({
        ruleId: crmAutomationExecutions.ruleId,
        status: crmAutomationExecutions.status,
        value: count(),
      }).from(crmAutomationExecutions)
        .where(inArray(crmAutomationExecutions.ruleId, ids))
        .groupBy(crmAutomationExecutions.ruleId, crmAutomationExecutions.status)
    : [];

  const byRule = new Map<number, Record<string, number>>();
  for (const t of tallies) {
    const bucket = byRule.get(t.ruleId) ?? {};
    bucket[t.status] = Number(t.value);
    byRule.set(t.ruleId, bucket);
  }

  res.json({
    rules: rules.map((r) => {
      const counts = byRule.get(r.id) ?? {};
      return {
        ...r,
        recordType: CRM_AUTOMATION_TRIGGER_RECORD[r.trigger as CrmAutomationTrigger] ?? null,
        counts: {
          ...counts,
          total: Object.values(counts).reduce((s, n) => s + n, 0),
        },
      };
    }),
  });
});

router.post("/crm/automation/rules", requireCrmAuth("settings.write"), async (req: Request, res: Response) => {
  const parsed = validateRule(req.body as Record<string, unknown>);
  if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }

  const me = actor(req);
  const [rule] = await db.insert(crmAutomationRules).values({
    ...parsed.value,
    createdByStaffId: me.id,
    createdByLabel: me.label,
    updatedByStaffId: me.id,
  }).returning();

  await auditAction(req, "automation.rule_created", `rule:${rule!.id} ${rule!.name}`);
  res.status(201).json({ rule });
});

router.patch("/crm/automation/rules/:id", requireCrmAuth("settings.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid rule." }); return; }

  const [existing] = await db.select().from(crmAutomationRules)
    .where(eq(crmAutomationRules.id, id)).limit(1);
  if (!existing || existing.archivedAt) { res.status(404).json({ error: "Not found." }); return; }

  const body = req.body as Record<string, unknown>;
  // An "enable/disable" PATCH is the common case and must not require the
  // caller to re-send the whole rule; merging first means a partial body is
  // still validated as a WHOLE rule rather than sneaking past the checks.
  const merged: Record<string, unknown> = {
    name: existing.name,
    description: existing.description,
    trigger: existing.trigger,
    enabled: existing.enabled,
    conditions: existing.conditions,
    stopConditions: existing.stopConditions,
    actions: existing.actions,
    maxChainDepth: existing.maxChainDepth,
    windowCap: existing.windowCap,
    windowMinutes: existing.windowMinutes,
    maxActionAttempts: existing.maxActionAttempts,
    // Load-bearing: the validator below defaults a missing inactivityDays to
    // 14, so without carrying the stored value forward a plain enable/disable
    // PATCH would quietly reset a 30-day rule.
    inactivityDays: existing.inactivityDays,
    ...body,
  };

  const parsed = validateRule(merged);
  if (!parsed.ok) { res.status(400).json({ error: parsed.error }); return; }

  const me = actor(req);
  const [rule] = await db.update(crmAutomationRules).set({
    ...parsed.value, updatedByStaffId: me.id, updatedAt: new Date(),
  }).where(eq(crmAutomationRules.id, id)).returning();

  await auditAction(req, "automation.rule_updated", `rule:${id}`);
  res.json({ rule });
});

/**
 * Soft delete. The rule stops matching new events immediately; its history
 * stays, because "what did the CRM do to my records, and on whose instruction"
 * must remain answerable after somebody tidies up.
 */
router.delete("/crm/automation/rules/:id", requireCrmAuth("settings.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid rule." }); return; }

  const now = new Date();
  const [rule] = await db.update(crmAutomationRules)
    .set({ archivedAt: now, enabled: false, updatedAt: now })
    .where(and(eq(crmAutomationRules.id, id), isNull(crmAutomationRules.archivedAt)))
    .returning();
  if (!rule) { res.status(404).json({ error: "Not found." }); return; }

  await auditAction(req, "automation.rule_deleted", `rule:${id}`);
  res.json({
    rule,
    note: "The rule is off and will not match new events. Its run history is kept.",
  });
});

/**
 * Runs one rule against one named record, now.
 *
 * It goes on the same queue everything else does, and is then drained in this
 * request so the person who pressed the button sees the outcome rather than a
 * promise. Every brake still applies — a manual run is not a way round the loop
 * protection.
 */
router.post("/crm/automation/rules/:id/run", requireCrmAuth("settings.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  const recordId = num((req.body as Record<string, unknown>)?.["recordId"]);
  if (!id) { res.status(400).json({ error: "Invalid rule." }); return; }
  if (!recordId) { res.status(400).json({ error: "Say which record to run it against." }); return; }

  const [rule] = await db.select().from(crmAutomationRules)
    .where(eq(crmAutomationRules.id, id)).limit(1);
  if (!rule || rule.archivedAt) { res.status(404).json({ error: "Not found." }); return; }
  if (!rule.enabled) {
    res.status(409).json({ error: "This rule is switched off. Turn it on before running it." });
    return;
  }

  const me = actor(req);
  const started = await runRuleManually({ rule, recordId, staffId: me.id });
  if (!started.started) {
    // A brake refused it. The refusal itself is recorded, and the id of that
    // record is handed back so the caller can go and read why.
    res.status(409).json({ error: started.reason, executionId: started.executionId });
    return;
  }

  await drainAutomationJobs(undefined, 20);

  const [execution] = await db.select().from(crmAutomationExecutions)
    .where(eq(crmAutomationExecutions.id, started.executionId)).limit(1);
  const actionRuns = await db.select().from(crmAutomationActionRuns)
    .where(eq(crmAutomationActionRuns.executionId, started.executionId))
    .orderBy(crmAutomationActionRuns.actionIndex);

  await auditAction(req, "automation.rule_run", `rule:${id} record:${recordId}`);
  res.status(202).json({ execution, actionRuns });
});

// ── History ─────────────────────────────────────────────────────────────────

const EXECUTION_LIMIT_DEFAULT = 50;
const EXECUTION_LIMIT_MAX = 500;

function limitOf(req: Request): number {
  const raw = num(req.query["limit"]) ?? EXECUTION_LIMIT_DEFAULT;
  return Math.min(Math.max(Math.trunc(raw), 1), EXECUTION_LIMIT_MAX);
}

/**
 * Counts for a set of executions, computed over EVERY matching row rather than
 * over the page that was returned. A count that only counts what fits on the
 * screen is a count that disagrees with its own label.
 */
async function statusCounts(where: ReturnType<typeof eq> | undefined) {
  const rows = await db.select({ status: crmAutomationExecutions.status, value: count() })
    .from(crmAutomationExecutions).where(where).groupBy(crmAutomationExecutions.status);
  const counts: Record<string, number> = {};
  for (const s of CRM_AUTOMATION_EXECUTION_STATUSES) counts[s] = 0;
  for (const r of rows) counts[r.status] = Number(r.value);
  counts["total"] = rows.reduce((s, r) => s + Number(r.value), 0);
  return counts;
}

/** History for one rule: what this automation has done, newest first. */
router.get("/crm/automation/rules/:id/executions", requireCrmAuth("settings.read"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid rule." }); return; }

  const [rule] = await db.select().from(crmAutomationRules)
    .where(eq(crmAutomationRules.id, id)).limit(1);
  if (!rule) { res.status(404).json({ error: "Not found." }); return; }

  const where = eq(crmAutomationExecutions.ruleId, id);
  const [executions, counts] = await Promise.all([
    db.select().from(crmAutomationExecutions).where(where)
      .orderBy(desc(crmAutomationExecutions.id)).limit(limitOf(req)),
    statusCounts(where),
  ]);

  res.json({ rule, executions, counts, limit: limitOf(req) });
});

/**
 * History for one record: everything every automation has done to it.
 *
 * This is the question somebody asks with a contact open in front of them —
 * "why does this lead have three tasks nobody remembers creating" — and it is
 * the reason `record_type`/`record_id` are indexed as their own key rather than
 * being reachable only by walking every rule.
 */
router.get("/crm/automation/records/:recordType/:recordId/executions",
  requireCrmAuth("settings.read"), async (req: Request, res: Response) => {
    const recordType = String(req.params["recordType"]);
    const recordId = num(req.params["recordId"]);
    if (!(CRM_AUTOMATION_RECORD_TYPES as readonly string[]).includes(recordType)) {
      res.status(400).json({
        error: `"${recordType}" is not a record type.`,
        accepted: CRM_AUTOMATION_RECORD_TYPES,
      });
      return;
    }
    if (!recordId) { res.status(400).json({ error: "Invalid record." }); return; }

    const where = and(
      eq(crmAutomationExecutions.recordType, recordType),
      eq(crmAutomationExecutions.recordId, recordId),
    );
    const [executions, counts] = await Promise.all([
      db.select().from(crmAutomationExecutions).where(where)
        .orderBy(desc(crmAutomationExecutions.id)).limit(limitOf(req)),
      statusCounts(where),
    ]);

    const ruleIds = [...new Set(executions.map((e) => e.ruleId))];
    const rules = ruleIds.length
      ? await db.select({ id: crmAutomationRules.id, name: crmAutomationRules.name })
          .from(crmAutomationRules).where(inArray(crmAutomationRules.id, ruleIds))
      : [];
    const nameById = new Map(rules.map((r) => [r.id, r.name]));

    res.json({
      recordType, recordId, counts, limit: limitOf(req),
      executions: executions.map((e) => ({ ...e, ruleName: nameById.get(e.ruleId) ?? null })),
    });
  });

/** One run in full: every action it attempted and what each one did. */
router.get("/crm/automation/executions/:id", requireCrmAuth("settings.read"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid run." }); return; }

  const [execution] = await db.select().from(crmAutomationExecutions)
    .where(eq(crmAutomationExecutions.id, id)).limit(1);
  if (!execution) { res.status(404).json({ error: "Not found." }); return; }

  const [rule] = await db.select().from(crmAutomationRules)
    .where(eq(crmAutomationRules.id, execution.ruleId)).limit(1);
  const actionRuns = await db.select().from(crmAutomationActionRuns)
    .where(eq(crmAutomationActionRuns.executionId, id))
    .orderBy(crmAutomationActionRuns.actionIndex);
  const approvals = await db.select().from(crmAutomationApprovals)
    .where(eq(crmAutomationApprovals.executionId, id))
    .orderBy(crmAutomationApprovals.actionIndex);

  res.json({
    execution,
    rule: rule ?? null,
    actionRuns,
    approvals,
    // Stated in the payload so a screen does not have to re-derive the meaning
    // of a status and get it subtly wrong.
    summary: {
      actionsAttempted: actionRuns.length,
      actionsSucceeded: actionRuns.filter((a) => a.status === "succeeded").length,
      actionsFailed: actionRuns.filter((a) => a.status === "failed").length,
      actionsUnknown: actionRuns.filter((a) => a.status === "unknown").length,
      actionsSkipped: actionRuns.filter((a) => a.status === "skipped").length,
    },
  });
});

// ── Approvals ───────────────────────────────────────────────────────────────

/** Pending approvals. `mine=true` narrows to the ones this person must decide. */
router.get("/crm/automation/approvals", requireCrmAuth("settings.read"), async (req: Request, res: Response) => {
  const me = actor(req);
  const mineOnly = req.query["mine"] === "true";
  const status = String(req.query["status"] ?? "pending");

  const clauses = [eq(crmAutomationApprovals.status, status)];
  if (mineOnly && me.id !== null) clauses.push(eq(crmAutomationApprovals.approverStaffId, me.id));

  const approvals = await db.select().from(crmAutomationApprovals)
    .where(and(...clauses)).orderBy(desc(crmAutomationApprovals.id)).limit(200);

  const ruleIds = [...new Set(approvals.map((a) => a.ruleId))];
  const rules = ruleIds.length
    ? await db.select({ id: crmAutomationRules.id, name: crmAutomationRules.name })
        .from(crmAutomationRules).where(inArray(crmAutomationRules.id, ruleIds))
    : [];
  const nameById = new Map(rules.map((r) => [r.id, r.name]));

  res.json({
    approvals: approvals.map((a) => ({
      ...a,
      ruleName: nameById.get(a.ruleId) ?? null,
      // Said plainly so a screen does not have to guess who may press the button.
      decidableByMe: me.id !== null && a.approverStaffId === me.id && a.status === "pending",
    })),
    viewerStaffId: me.id,
  });
});

/**
 * Approve or reject one step.
 *
 * Gated on IDENTITY, not on a permission. The rule named a person; anybody else
 * — including an owner — is refused, because an approval another role can
 * override is not an approval, it is a speed bump. A rejection must carry a
 * reason and stops the run immediately.
 */
router.post("/crm/automation/approvals/:id/decide", requireCrmAuth(), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid approval." }); return; }

  const me = actor(req);
  if (me.id === null) {
    res.status(403).json({ error: "Only the named approver can decide this, and this request has no person on it." });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const decision = body["decision"];
  if (decision !== "approve" && decision !== "reject") {
    res.status(400).json({ error: "Say whether you approve or reject it.", accepted: ["approve", "reject"] });
    return;
  }

  const [approval] = await db.select().from(crmAutomationApprovals)
    .where(eq(crmAutomationApprovals.id, id)).limit(1);
  if (!approval) { res.status(404).json({ error: "Not found." }); return; }
  if (approval.approverStaffId !== me.id) {
    res.status(403).json({
      error: "This approval was addressed to somebody else. Only the named approver can decide it.",
    });
    return;
  }

  const result = await decideAutomationApproval({
    approvalId: id,
    decision,
    reason: typeof body["reason"] === "string" ? body["reason"] : null,
    deciderStaffId: me.id,
  });
  if (!result.ok) { res.status(409).json({ error: result.error }); return; }

  // Approving re-queues the execution; draining here means the caller sees the
  // rule actually continue rather than being told it will, eventually.
  if (decision === "approve") await drainAutomationJobs(undefined, 20);

  const [execution] = await db.select().from(crmAutomationExecutions)
    .where(eq(crmAutomationExecutions.id, approval.executionId)).limit(1);

  await auditAction(req, `automation.approval_${decision}d`, `approval:${id} execution:${approval.executionId}`);
  res.json({ approval: result.approval, execution: execution ?? null });
});

// ── Health ──────────────────────────────────────────────────────────────────

/**
 * What automation is doing right now, for the operator dashboard.
 *
 * `awaitingApproval` and `failed` are the two numbers that mean somebody has to
 * do something; `stoppedByLoopProtection` is the one that means a rule needs
 * rewriting rather than retrying.
 */
router.get("/crm/automation/health", requireCrmAuth("settings.read"), async (_req: Request, res: Response) => {
  const [byStatus, byStop, ruleCount] = await Promise.all([
    db.select({ status: crmAutomationExecutions.status, value: count() })
      .from(crmAutomationExecutions).groupBy(crmAutomationExecutions.status),
    db.select({ reason: crmAutomationExecutions.stopReason, value: count() })
      .from(crmAutomationExecutions)
      .where(sql`${crmAutomationExecutions.stopReason} IS NOT NULL`)
      .groupBy(crmAutomationExecutions.stopReason),
    db.select({ value: count() }).from(crmAutomationRules)
      .where(and(eq(crmAutomationRules.enabled, true), isNull(crmAutomationRules.archivedAt))),
  ]);

  const statuses: Record<string, number> = {};
  for (const s of CRM_AUTOMATION_EXECUTION_STATUSES) statuses[s] = 0;
  for (const r of byStatus) statuses[r.status] = Number(r.value);

  const stops: Record<string, number> = {};
  for (const r of byStop) if (r.reason) stops[r.reason] = Number(r.value);

  res.json({
    enabledRules: Number(ruleCount[0]?.value ?? 0),
    executions: statuses,
    stopReasons: stops,
    needsAPerson: statuses["awaiting_approval"]! + statuses["failed"]!,
    stoppedByLoopProtection:
      (stops["chain_depth_exceeded"] ?? 0) + (stops["rate_cap_exceeded"] ?? 0),
  });
});

export default router;
