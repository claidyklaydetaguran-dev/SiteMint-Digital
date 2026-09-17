// V8: what this business's assistant can actually do, and why anything it
// cannot do is unavailable.
//
// Reads the ONE shared capability resolution (lib/voice/tools/firmCapabilities)
// — the same one the publish payload, the synchronization comparison and the
// runtime dispatcher use. This route adds only the wording; it decides nothing,
// which is what makes "Available" here mean the same thing as "attached" there.

import { Router, type Request, type Response } from "express";
import { requireReceptionistAuth } from "../lib/receptionistAuth.js";
import {
  resolveEffectiveCapabilities,
  type CapabilityBlockReason,
} from "../lib/voice/tools/firmCapabilities.js";

const router = Router();

/**
 * One sentence per capability, and one per reason it is unavailable. Written
 * for a business owner: each says what the assistant will do, or what has to
 * happen first — never which environment variable is unset.
 */
const CAPABILITY_COPY: Record<string, { label: string; active: string }> = {
  messages: {
    label: "Take a message",
    active:
      "Callers can leave their name, what they need, and how to reach them. Saved messages appear in Inquiries and you get an email.",
  },
  scheduling: {
    label: "Book appointments",
    // Booking is automatic once the caller confirms the details and the
    // calendar accepts the event; only then is the caller told it is booked.
    // Without a connected calendar the request waits for the business.
    active:
      "Callers can check open times and book one. After the caller confirms the details, the appointment is added to your connected calendar and they're told it's booked. Without a connected calendar, requests wait for you to confirm.",
  },
  transfer: {
    label: "Put callers through to a person",
    // Says what the caller gets AND what it costs, because both change whether
    // a business wants it on. It stops short of promising someone answers:
    // once the call is handed over, the assistant has left it.
    active:
      "When a caller asks for someone, your assistant can hand the call to a transfer contact who is available right now. That places an outbound call billable on your telephone account, and once the caller is handed over the assistant leaves the call.",
  },
};

const REASON_COPY: Record<CapabilityBlockReason, string> = {
  platform_disabled: "Not switched on for your workspace yet. Contact SiteMint if you need it.",
  not_authorized: "Not switched on for your workspace yet. Contact SiteMint if you need it.",
  needs_appointment_type:
    "Add at least one appointment type first, so there is something for callers to book.",
  needs_opening_hours:
    "Set your opening hours first. With no open days the assistant would tell every caller you are closed.",
  needs_timezone: "Set your business timezone first, so offered times are correct.",
  needs_transfer_contact:
    "Add a transfer contact first, and confirm that they agreed to receive transferred calls. Nobody is called without that.",
};

/** Where the owner goes to clear each blocker, when they can clear it themselves. */
const REASON_FIX_PATH: Partial<Record<CapabilityBlockReason, string>> = {
  needs_appointment_type: "/scheduling/appointment-types",
  needs_opening_hours: "/scheduling/availability",
  needs_timezone: "/scheduling/availability",
  needs_transfer_contact: "/channels/transfer-contacts",
};

// ── GET /api/receptionist/voice/capabilities ──────────────────────────────────

router.get("/receptionist/voice/capabilities", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    const effective = await resolveEffectiveCapabilities(req.firmId!);

    res.json({
      items: effective.reports.map((r) => ({
        key: r.key,
        label: CAPABILITY_COPY[r.key]?.label ?? r.key,
        state: r.state,
        detail: r.state === "active" ? CAPABILITY_COPY[r.key]?.active ?? "" : REASON_COPY[r.reason!] ?? "",
        blockedBy: r.reason,
        fixPath: r.reason ? REASON_FIX_PATH[r.reason] ?? null : null,
      })),
      // True only when a published assistant would actually carry tools.
      toolsAttachable: effective.env.toolsAttachable,
      activeCount: effective.reports.filter((r) => r.state === "active").length,
      /**
       * What a payload built right now would carry. Exposed so the dashboard can
       * say "your setup changed — republish to apply" by comparing against the
       * assistant's synchronization state, rather than guessing.
       */
      toolNames: effective.toolNames,
    });
  } catch (err) {
    req.log.error({ err, firmId: req.firmId }, "[receptionist] failed to describe voice capabilities");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
