// V8: what this business's assistant can actually do, and why anything it
// cannot do is unavailable.
//
// The Assistant screen needs to answer "what can it do?" truthfully, which
// means reading the same three gates the publish path reads rather than a
// hard-coded list. A capability shown as active here is one the payload would
// genuinely carry; a blocked one names the specific thing standing in the way.

import { Router, type Request, type Response } from "express";
import { requireReceptionistAuth } from "../lib/receptionistAuth.js";
import {
  describeFirmCapabilities,
  readCapabilityEnvironment,
  type CapabilityBlockReason,
  type FirmReadiness,
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
    active: "Callers can check open times and book, reschedule, or cancel an appointment.",
  },
};

const REASON_COPY: Record<CapabilityBlockReason, string> = {
  platform_disabled: "Not switched on for your workspace yet. Contact SiteMint if you need it.",
  not_authorized: "Not switched on for your workspace yet. Contact SiteMint if you need it.",
  needs_appointment_type:
    "Add at least one appointment type first, so there is something for callers to book.",
};

/** What has to be true for the assistant to be trusted with a capability. */
async function loadFirmReadiness(firmId: number): Promise<FirmReadiness> {
  const { db } = await import("@workspace/db");
  const { schedulingAppointmentTypes } = await import("@workspace/db/schema/scheduling");
  const { and, eq, count } = await import("drizzle-orm");
  const [row] = await db
    .select({ n: count() })
    .from(schedulingAppointmentTypes)
    .where(and(eq(schedulingAppointmentTypes.firmId, firmId), eq(schedulingAppointmentTypes.active, true)));
  return { bookableAppointmentTypes: Number(row?.n ?? 0) };
}

/**
 * Whether the platform could attach tools at all. Deliberately reuses the
 * publish path's own loaders, so this can never report "attachable" for a
 * configuration the publish path would reject.
 */
async function isToolsAttachable(): Promise<boolean> {
  try {
    const { loadVoiceServerConfigFromEnv } = await import("../lib/voicePublishing/serverConfig.js");
    const { loadVoiceToolsConfigFromEnv } = await import("../lib/voicePublishing/toolsConfig.js");
    const serverConfig = loadVoiceServerConfigFromEnv();
    return loadVoiceToolsConfigFromEnv(serverConfig) !== null;
  } catch {
    // Enabled-but-misconfigured is not attachable, and saying so is the point.
    return false;
  }
}

// ── GET /api/receptionist/voice/capabilities ──────────────────────────────────

router.get("/receptionist/voice/capabilities", requireReceptionistAuth, async (req: Request, res: Response) => {
  try {
    const [attachable, readiness] = await Promise.all([isToolsAttachable(), loadFirmReadiness(req.firmId!)]);
    const env = readCapabilityEnvironment(attachable);
    const reports = describeFirmCapabilities(env, readiness);

    res.json({
      items: reports.map((r) => ({
        key: r.key,
        label: CAPABILITY_COPY[r.key]?.label ?? r.key,
        state: r.state,
        detail: r.state === "active" ? CAPABILITY_COPY[r.key]?.active ?? "" : REASON_COPY[r.reason!] ?? "",
        // Named so the screen can link to the page that unblocks it.
        blockedBy: r.reason,
      })),
      // True only when a published assistant would actually carry tools.
      toolsAttachable: attachable,
      activeCount: reports.filter((r) => r.state === "active").length,
    });
  } catch (err) {
    req.log.error({ err, firmId: req.firmId }, "[receptionist] failed to describe voice capabilities");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
