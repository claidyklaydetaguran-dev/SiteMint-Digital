// ── The sales chain ─────────────────────────────────────────────────────────
//
// Contact → Lead → Deal → Proposal → accepted work → Project → Tasks →
// Transaction. Every step of that existed except the one that joins the two
// halves: nothing turned a won deal into a project. Somebody re-typed it, or
// did not, and the money and the work lived in two places that never agreed.
//
// The conversion here is deliberately idempotent. Double-clicking "convert"
// must not produce two projects with two sets of template tasks against one
// piece of paid work — so `crm_deals.converted_project_id` is the key, and a
// second attempt returns the first result rather than doing it again.

import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import {
  db, crmDeals, crmProjects, crmLeads, crmStaff, crmTransactions, crmActivities,
  DEAL_LOST_REASONS, PROJECT_STAGES,
} from "@workspace/db";
import { requireCrmAuth, auditAction } from "../lib/staffAuth.js";

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

/** Stage-level fallbacks, used only where nobody has judged the deal itself. */
const STAGE_PROBABILITY: Record<string, number> = {
  Lead: 10, Qualified: 30, Proposal: 60, Won: 100, Lost: 0,
};

// ── Deal outcome ────────────────────────────────────────────────────────────

/**
 * Marks a deal won or lost, recording who decided and why.
 *
 * Losing requires a reason from a closed list. Not because paperwork is
 * virtuous, but because a lost deal with no reason teaches nothing, and "we
 * keep losing on price" is only visible if the reasons can be counted.
 */
router.post("/crm/deals/:id/close", requireCrmAuth("deals.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid deal." }); return; }

  const body = req.body as Record<string, unknown>;
  const outcome = body["outcome"];
  if (outcome !== "won" && outcome !== "lost") {
    res.status(400).json({ error: "Say whether the deal was won or lost." });
    return;
  }

  const [deal] = await db.select().from(crmDeals).where(eq(crmDeals.id, id)).limit(1);
  if (!deal) { res.status(404).json({ error: "Not found." }); return; }

  if (outcome === "lost") {
    const reason = body["lostReason"];
    if (typeof reason !== "string" || !(DEAL_LOST_REASONS as readonly string[]).includes(reason)) {
      res.status(400).json({
        error: "Give a reason the deal was lost.",
        accepted: DEAL_LOST_REASONS,
      });
      return;
    }
  }

  const me = actor(req);
  const now = new Date();
  const [updated] = await db.update(crmDeals).set({
    stage: outcome === "won" ? "Won" : "Lost",
    probability: outcome === "won" ? 100 : 0,
    wonAt: outcome === "won" ? now : null,
    lostAt: outcome === "lost" ? now : null,
    closedByStaffId: me.id,
    lostReason: outcome === "lost" ? String(body["lostReason"]) : null,
    lostReasonDetail: outcome === "lost" && typeof body["lostReasonDetail"] === "string"
      ? body["lostReasonDetail"] : null,
    updatedAt: now,
  }).where(eq(crmDeals.id, id)).returning();

  if (deal.leadId) {
    await db.insert(crmActivities).values({
      leadId: deal.leadId,
      type: outcome === "won" ? "deal_won" : "deal_lost",
      title: `Deal ${outcome}: ${deal.name}`,
      description: outcome === "lost"
        ? `Reason: ${String(body["lostReason"])}${body["lostReasonDetail"] ? ` — ${String(body["lostReasonDetail"])}` : ""}`
        : `Value: ${deal.value}`,
      createdBy: me.label,
    });
  }

  await auditAction(req, `deal.${outcome}`, `deal:${id}`);
  res.json({
    deal: updated,
    nextStep: outcome === "won"
      ? "Convert it into a project to start the work."
      : null,
  });
});

// ── Conversion ──────────────────────────────────────────────────────────────

/**
 * Turns a won deal into a project.
 *
 * Idempotent by construction: the deal records the project it became, and a
 * repeat call returns that project with `created: false`. Without this, a
 * double submit — or two people clicking at once — produces two projects, two
 * sets of template tasks, and two places the team might record the same work.
 */
router.post("/crm/deals/:id/convert", requireCrmAuth("projects.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid deal." }); return; }

  const [deal] = await db.select().from(crmDeals).where(eq(crmDeals.id, id)).limit(1);
  if (!deal) { res.status(404).json({ error: "Not found." }); return; }

  // Already converted — return what it became.
  if (deal.convertedProjectId) {
    const [existing] = await db.select().from(crmProjects)
      .where(eq(crmProjects.id, deal.convertedProjectId)).limit(1);
    if (existing) {
      res.json({
        project: existing, created: false,
        note: "This deal was already converted. Returning the project it became rather than creating a second one.",
      });
      return;
    }
    // The recorded project is gone. Say so rather than silently making a new
    // one, because "where did the project go" is a question worth asking.
    res.status(409).json({
      error: `This deal records project ${deal.convertedProjectId}, but that project no longer exists. Clear the link deliberately before converting again.`,
    });
    return;
  }

  if (deal.stage !== "Won") {
    res.status(409).json({
      error: `Only a won deal becomes a project. This one is at "${deal.stage}". Close it as won first.`,
    });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const me = actor(req);

  const stage = typeof body["stage"] === "string"
    && (PROJECT_STAGES as readonly string[]).includes(body["stage"])
      ? body["stage"] : PROJECT_STAGES[0];

  const [project] = await db.insert(crmProjects).values({
    name: typeof body["name"] === "string" && body["name"].trim()
      ? body["name"].trim() : deal.name,
    stage,
    leadId: deal.leadId,
    dealId: deal.id,
    // The agreed price carries across. It is the one number both halves of the
    // business have to agree on, and re-typing it is how they stop agreeing.
    budget: deal.value,
    projectType: typeof body["projectType"] === "string" ? body["projectType"] : null,
    targetLaunchDate: typeof body["targetLaunchDate"] === "string" ? body["targetLaunchDate"] : null,
    notes: deal.notes,
    launchChecklist: [],
    links: [],
  }).returning();

  await db.update(crmDeals).set({
    convertedProjectId: project.id,
    convertedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(crmDeals.id, deal.id));

  if (deal.leadId) {
    await db.insert(crmActivities).values({
      leadId: deal.leadId,
      type: "project_created",
      title: `Project started from won deal: ${project.name}`,
      description: `Deal ${deal.id} → project ${project.id}`,
      createdBy: me.label,
    });
    // A won, converted deal means this contact is a client now.
    await db.update(crmLeads).set({ status: "Client", updatedAt: new Date() })
      .where(eq(crmLeads.id, deal.leadId));
  }

  await auditAction(req, "deal.converted", `deal:${id} project:${project.id}`);
  res.status(201).json({ project, created: true });
});

// ── Forecast ────────────────────────────────────────────────────────────────

/**
 * The pipeline, with each figure's basis stated.
 *
 * Three different numbers get called "revenue" and conflating them is how a
 * business talks itself into money it does not have:
 *
 *   pipeline   the face value of everything still open — an upper bound, not a
 *              prediction
 *   weighted   pipeline scaled by likelihood — a prediction, and only as good
 *              as the likelihoods
 *   contracted the value of deals actually won
 *   received   money that actually arrived, from transactions
 *
 * Every one of them is reported separately and labelled, and a rate with no
 * denominator is null rather than 0%.
 */
router.get("/crm/sales/forecast", requireCrmAuth("reports.read"), async (req: Request, res: Response) => {
  const ownerFilter = num(req.query["ownerStaffId"]);

  const where = ownerFilter ? [eq(crmDeals.ownerStaffId, ownerFilter)] : [];
  const deals = await db.select().from(crmDeals)
    .where(where.length ? and(...where) : undefined);

  const open = deals.filter((d) => d.stage !== "Won" && d.stage !== "Lost");
  const won = deals.filter((d) => d.stage === "Won");
  const lost = deals.filter((d) => d.stage === "Lost");

  const value = (v: string | null) => Number(v ?? 0) || 0;
  const probabilityOf = (d: typeof crmDeals.$inferSelect) =>
    d.probability != null ? d.probability : STAGE_PROBABILITY[d.stage] ?? 0;

  const pipeline = open.reduce((s, d) => s + value(d.value), 0);
  const weighted = open.reduce((s, d) => s + value(d.value) * (probabilityOf(d) / 100), 0);
  const contracted = won.reduce((s, d) => s + value(d.value), 0);

  const [received] = await db.select({
    total: sql<string>`coalesce(sum(${crmTransactions.amount}), 0)`,
  }).from(crmTransactions);

  const decided = won.length + lost.length;
  const judged = open.filter((d) => d.probability != null).length;

  // Why deals are lost, counted — the reason the reason is mandatory.
  const lossReasons: Record<string, number> = {};
  for (const d of lost) {
    const key = d.lostReason ?? "not_recorded";
    lossReasons[key] = (lossReasons[key] ?? 0) + 1;
  }

  res.json({
    openDeals: open.length,
    wonDeals: won.length,
    lostDeals: lost.length,
    pipelineValue: pipeline,
    weightedForecast: Math.round(weighted * 100) / 100,
    contractedValue: contracted,
    moneyReceivedAllTime: Number(received?.total ?? 0),
    winRate: decided > 0 ? Math.round((won.length / decided) * 100) : null,
    winRateDenominator: decided,
    lossReasons,
    forecastBasis: {
      dealsWithOwnJudgement: judged,
      dealsUsingStageDefault: open.length - judged,
      stageDefaults: STAGE_PROBABILITY,
    },
    definitions: {
      pipelineValue: "Face value of every open deal. An upper bound on what could close, not a prediction.",
      weightedForecast: `Each open deal scaled by its own likelihood where somebody set one (${judged} of ${open.length}), and by a stage default otherwise. The defaults are an assumption, not a measurement.`,
      contractedValue: "Value of deals marked won. Agreed, not necessarily paid.",
      moneyReceivedAllTime: "Actual cash recorded against transactions. This is the only figure here that is money we have.",
      winRate: decided === 0
        ? "No deals have been decided yet, so there is no rate to report — which is why this is null rather than 0%."
        : "Won as a share of decided deals. Open deals are excluded because they have not been decided.",
    },
  });
});

// ── The chain, for one contact ──────────────────────────────────────────────

/**
 * Everything that happened with one contact, in order, across the chain.
 *
 * This is the view that was missing: deals, their outcomes, the project each
 * became, and the money against it, in one place, so somebody can answer
 * "where did this client get to" without opening four screens.
 */
router.get("/crm/sales/chain/:leadId", requireCrmAuth("leads.read"), async (req: Request, res: Response) => {
  const leadId = num(req.params["leadId"]);
  if (!leadId) { res.status(400).json({ error: "Invalid contact." }); return; }

  const [lead] = await db.select().from(crmLeads).where(eq(crmLeads.id, leadId)).limit(1);
  if (!lead) { res.status(404).json({ error: "Not found." }); return; }

  const deals = await db.select().from(crmDeals).where(eq(crmDeals.leadId, leadId));
  const dealIds = deals.map((d) => d.id);
  const projectIds = deals.map((d) => d.convertedProjectId).filter((v): v is number => v != null);

  const [projects, transactions, owners] = await Promise.all([
    projectIds.length
      ? db.select().from(crmProjects).where(inArray(crmProjects.id, projectIds))
      : ([] as (typeof crmProjects.$inferSelect)[]),
    dealIds.length
      ? db.select().from(crmTransactions).where(inArray(crmTransactions.dealId, dealIds))
      : ([] as (typeof crmTransactions.$inferSelect)[]),
    (async () => {
      const ids = [...new Set(deals.map((d) => d.ownerStaffId).filter((v): v is number => v != null))];
      return ids.length
        ? db.select({ id: crmStaff.id, displayName: crmStaff.displayName })
            .from(crmStaff).where(inArray(crmStaff.id, ids))
        : [];
    })(),
  ]);

  const projectById = new Map(projects.map((p) => [p.id, p]));
  const ownerById = new Map(owners.map((o) => [o.id, o.displayName]));

  res.json({
    contact: lead,
    deals: deals.map((d) => ({
      ...d,
      ownerName: d.ownerStaffId ? ownerById.get(d.ownerStaffId) ?? null : null,
      project: d.convertedProjectId ? projectById.get(d.convertedProjectId) ?? null : null,
      transactions: transactions.filter((t) => t.dealId === d.id),
      received: transactions.filter((t) => t.dealId === d.id)
        .reduce((s, t) => s + (Number(t.amount ?? 0) || 0), 0),
    })),
    // Stated because the two are not the same thing and the difference is the
    // business's actual exposure.
    totals: {
      contracted: deals.filter((d) => d.stage === "Won")
        .reduce((s, d) => s + (Number(d.value ?? 0) || 0), 0),
      received: transactions.reduce((s, t) => s + (Number(t.amount ?? 0) || 0), 0),
    },
  });
});

/** Assigns a deal to somebody, or hands it back. */
router.post("/crm/deals/:id/owner", requireCrmAuth("deals.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid deal." }); return; }
  const target = (req.body as { staffId?: unknown })?.staffId;
  const ownerStaffId = target === null ? null : num(target);

  if (ownerStaffId != null) {
    const [staff] = await db.select({ id: crmStaff.id, status: crmStaff.status })
      .from(crmStaff).where(eq(crmStaff.id, ownerStaffId)).limit(1);
    if (!staff) { res.status(404).json({ error: "No such staff account." }); return; }
    if (staff.status === "disabled") {
      res.status(409).json({ error: "That account is disabled, so deals cannot be assigned to it." });
      return;
    }
  }

  const [updated] = await db.update(crmDeals)
    .set({ ownerStaffId: ownerStaffId ?? null, updatedAt: new Date() })
    .where(eq(crmDeals.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found." }); return; }

  await auditAction(req, "deal.owner_changed", `deal:${id} staff:${ownerStaffId ?? "none"}`);
  res.json({ deal: updated });
});

/** Sets a deal's own likelihood, which the forecast then uses instead of a default. */
router.post("/crm/deals/:id/probability", requireCrmAuth("deals.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid deal." }); return; }
  const raw = (req.body as { probability?: unknown })?.probability;
  const probability = raw === null ? null : num(raw);
  if (probability != null && (probability < 0 || probability > 100)) {
    res.status(400).json({ error: "Likelihood is a percentage between 0 and 100." });
    return;
  }
  const [updated] = await db.update(crmDeals)
    .set({ probability: probability ?? null, updatedAt: new Date() })
    .where(eq(crmDeals.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "Not found." }); return; }
  res.json({ deal: updated });
});

export default router;
