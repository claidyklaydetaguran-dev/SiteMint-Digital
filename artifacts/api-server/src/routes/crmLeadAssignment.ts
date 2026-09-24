// ── M6: the unmapped-lead-owner review surface ──────────────────────────────
//
// `crm_leads.assigned_to` is free text and always has been. M6 adds
// `assigned_to_staff_id` as the real reference and backfills the names that
// match exactly one member of staff (docs/crm-ops/schema/M6-lead-assignee.sql).
// Everything the rules could NOT decide is deliberately left NULL — and this is
// where a person is shown it and decides. The panel lives on /admin/crm/admin.
//
// Two routes, and the asymmetry between them is on purpose:
//
//   GET  /crm/lead-assignment/unresolved   leads.read — looking at which of
//        your contacts carry an owner nobody has identified is an ordinary
//        read. It also returns the most recent mapping decisions (who, when,
//        which rule or by hand), so the mapping of the existing names is
//        visible, not merely performed.
//
//   POST /crm/lead-assignment/map          requireStaff("staff.read") +
//        leads.write. It writes to a STAFF record — the name is appended to
//        that person's `legacy_names`, which changes how it resolves for
//        everybody from then on — AND rewrites a batch of contacts. Its
//        neighbour PATCH /crm/staff/:id is `requireStaff("staff.read")`, so it
//        is gated the same way, with the contact-write grant asserted in the
//        handler for the other half of what it does.
//
// `requireStaff`, not `requireCrmAuth`, for the write: the decision is recorded
// against the person who made it (crm_lead_owner_mappings.decided_by_staff_id
// and the audit log), and the legacy shared bearer is nobody.

import { Router, type IRouter, type Request, type Response } from "express";
import { requireCrmAuth, requireStaff, staffCan, auditAction } from "../lib/staffAuth.js";
import {
  canMapLeadOwners, listRecentOwnerMappings, listUnresolvedOwners, loadOwnerCandidates,
  recordOwnerMapping, MAP_LEAD_OWNERS_REQUIRES,
} from "../lib/leadAssignee.js";
import { ownerKey, toOwnerPerson } from "../lib/leadOwnerRules.js";

const router: IRouter = Router();

// A distinct `/crm/lead-assignment/*` prefix rather than `/crm/leads/...`:
// crm.ts owns several parameterised `/crm/leads/:id/...` routes, and a literal
// path under the same prefix is one ordering mistake away from being answered
// by somebody else's `:id` handler — the failure 3508a43 documents.

router.get("/crm/lead-assignment/unresolved", requireCrmAuth("leads.read"), async (req: Request, res: Response) => {
  try {
    const staff = await loadOwnerCandidates();
    const [summary, recentMappings] = await Promise.all([
      listUnresolvedOwners(staff),
      listRecentOwnerMappings(25),
    ]);
    const canMap = canMapLeadOwners(req);
    res.json({
      ...summary,
      recentMappings,
      canMap,
      mapRequires: MAP_LEAD_OWNERS_REQUIRES,
      // Everyone a name may be mapped TO — disabled and invited accounts
      // included, labelled by the UI — but only for somebody who may map. The
      // candidates on each entry already name the people an ambiguity is
      // between; the whole directory is the mapper's tool, not a read-only view.
      staff: canMap ? staff.map(toOwnerPerson) : [],
    });
  } catch (err) {
    req.log.error({ err }, "Error listing unresolved lead owners");
    res.status(500).json({ error: "Couldn't work out which lead owners are unmapped." });
  }
});

router.post("/crm/lead-assignment/map", requireStaff("staff.read"), async (req: Request, res: Response) => {
  if (!staffCan(req, "leads.write")) {
    res.status(403).json({ error: "You do not have permission to change contacts.", permission: "leads.write" });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const rawStaffId = body["staffId"];
  const staffId = typeof rawStaffId === "number" ? rawStaffId
    : typeof rawStaffId === "string" && /^\d+$/.test(rawStaffId.trim()) ? Number(rawStaffId.trim())
    : Number.NaN;

  if (!ownerKey(body["value"])) {
    res.status(400).json({ error: "Say which owner name you are mapping." });
    return;
  }
  if (!Number.isSafeInteger(staffId) || staffId <= 0) {
    res.status(400).json({ error: "Choose the person this name belongs to." });
    return;
  }

  try {
    const actor = req.staffAuth!.staff;
    const result = await recordOwnerMapping({
      value: body["value"],
      staffId,
      decidedBy: { staffId: actor.id, label: actor.displayName || actor.email },
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    await auditAction(
      req,
      "lead.owner.mapped",
      `"${result.value}" -> staff:${result.staff.id} ${result.staff.displayName} rule:${result.rule} `
      + `leads:${result.leadsUpdated} legacyNameAdded:${result.legacyNameAdded} mapping:${result.mappingId}`,
    );

    const { ok: _ok, ...payload } = result;
    res.json(payload);
  } catch (err) {
    req.log.error({ err }, "Error mapping a lead owner name");
    res.status(500).json({ error: "That mapping could not be saved." });
  }
});

// There is deliberately NO "people a lead may be assigned to" route here.
// `GET /crm/operations/assignees` (crmOperations.ts) already serves exactly
// that — active staff, no roles, no grants, no security state — for tasks,
// projects and support, and the lead pickers use it too. A second list that
// could disagree with the first about who exists is a bug, not a convenience.

export default router;
