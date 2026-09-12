// V8: the ONE effective-capability calculation.
//
// Four places need to agree about what an assistant may do, and before this
// module they each worked it out separately:
//
//   the dashboard readiness screen      — what we tell the owner
//   publish/sync payload construction   — what we send the provider
//   synchronization-state comparison    — what we call "up to date"
//   runtime tool authorization          — what we actually execute
//
// Any disagreement between them is a bug with a customer-visible shape. The
// dashboard saying "Available" while the payload omits the tool is a lie; the
// payload carrying a tool the comparison does not know about is the permanent
// "changes not published" defect fixed in 88df967. So all four now call in
// here, and the only way to add a gate is to add it once.
//
// ── Four different questions, deliberately not merged ──────────────────────
//
//   AUTHORIZED   an operator has switched this capability on for the platform
//                (VOICE_TOOLS_CAPABILITIES) and tools are attachable at all.
//   READY        this business has finished configuring it. Authorization
//                without configuration publishes an assistant that offers
//                something it cannot deliver.
//   PUBLISHED    what the provider is actually running. Derived by comparing
//                the stored digest, not assumed from the other three.
//   EXECUTABLE   what the dispatcher will run RIGHT NOW. Re-checked per call,
//                because readiness can lapse after publication — a business
//                that deletes its last appointment type must stop being offered
//                bookings immediately, not at its next publish.

import {
  CAPABILITY_BY_TOOL,
  TOOL_CAPABILITIES,
  parseToolCapabilities,
  toolNamesForCapabilities,
  type VoiceToolCapability,
} from "./toolCapabilities.js";
import { TOOL_NAMES, type VoiceToolName } from "./toolCatalog.js";

/**
 * Why a capability is not attached. Each maps to one sentence the dashboard
 * shows, and each names something the reader can act on — or is told plainly
 * that only SiteMint can.
 */
export type CapabilityBlockReason =
  | "platform_disabled"
  | "not_authorized"
  | "needs_appointment_type"
  | "needs_opening_hours"
  | "needs_timezone";

export type CapabilityState = "active" | "blocked";

export interface FirmCapabilityReport {
  key: VoiceToolCapability;
  state: CapabilityState;
  /** Present only when state is "blocked". */
  reason: CapabilityBlockReason | null;
  /** The catalog tools this capability contributes. */
  toolNames: VoiceToolName[];
}

/**
 * What the business has configured, as far as capability readiness goes.
 *
 * Scheduling deliberately needs more than one active appointment type. With no
 * open day in the weekly schedule the availability engine returns nothing for
 * every date, so an assistant offering to book would tell every caller the
 * office is closed — a worse outcome than not offering booking at all.
 */
export interface FirmReadiness {
  /** Active types a caller could be booked into. */
  bookableAppointmentTypes: number;
  /** Weekdays with an enabled opening window. Zero means never bookable. */
  openWeekdays: number;
  /** A usable IANA timezone; without it every slot would be computed wrongly. */
  hasUsableTimezone: boolean;
}

export interface CapabilityEnvironment {
  /** True when the platform can attach tools at all (flag on AND webhook valid). */
  toolsAttachable: boolean;
  /** The operator allowlist, already parsed. Empty authorizes nothing. */
  authorized: readonly VoiceToolCapability[];
}

/**
 * Reads the platform half of the decision.
 *
 * `toolsAttachable` is passed in rather than derived here: whether the webhook
 * attachment is valid is the publish path's determination, and computing it two
 * different ways is how the four call sites drifted apart in the first place.
 */
export function readCapabilityEnvironment(
  toolsAttachable: boolean,
  env: Record<string, string | undefined> = process.env,
): CapabilityEnvironment {
  const parsed = parseToolCapabilities(env["VOICE_TOOLS_CAPABILITIES"]);
  return { toolsAttachable, authorized: parsed.ok ? parsed.capabilities : [] };
}

/** The first unmet requirement, in the order a business would fix them. */
function readinessGap(
  capability: VoiceToolCapability,
  readiness: FirmReadiness,
): CapabilityBlockReason | null {
  switch (capability) {
    case "messages":
      // Taking a message needs no configuration: the name, the topic and what
      // the caller wants all come from the conversation itself.
      return null;
    case "scheduling":
      if (readiness.bookableAppointmentTypes < 1) return "needs_appointment_type";
      if (readiness.openWeekdays < 1) return "needs_opening_hours";
      if (!readiness.hasUsableTimezone) return "needs_timezone";
      return null;
  }
}

function blockReason(
  capability: VoiceToolCapability,
  env: CapabilityEnvironment,
  readiness: FirmReadiness,
): CapabilityBlockReason | null {
  if (!env.toolsAttachable) return "platform_disabled";
  if (!env.authorized.includes(capability)) return "not_authorized";
  return readinessGap(capability, readiness);
}

/** Every capability, with the honest reason for any that is not attached. */
export function describeFirmCapabilities(
  env: CapabilityEnvironment,
  readiness: FirmReadiness,
): FirmCapabilityReport[] {
  return TOOL_CAPABILITIES.map((key) => {
    const reason = blockReason(key, env, readiness);
    return {
      key,
      state: reason === null ? "active" : "blocked",
      reason,
      toolNames: TOOL_NAMES.filter((name) => CAPABILITY_BY_TOOL[name] === key),
    };
  });
}

/**
 * The tool names a payload may carry for this business, in catalog order.
 *
 * Empty rather than throwing: the publish path has already decided whether
 * tools are attachable at all, and an empty list there means "send no tools",
 * which is the right fail-closed outcome for a business mid-setup.
 */
export function resolveFirmToolNames(
  env: CapabilityEnvironment,
  readiness: FirmReadiness,
): VoiceToolName[] {
  if (!env.toolsAttachable) return [];
  const ready = env.authorized.filter((c) => readinessGap(c, readiness) === null);
  return toolNamesForCapabilities(ready);
}

/** Readiness for a business that has configured nothing. Fail-closed. */
export const NO_READINESS: FirmReadiness = {
  bookableAppointmentTypes: 0,
  openWeekdays: 0,
  hasUsableTimezone: false,
};

// ── the shared resolution every call site uses ───────────────────────────────

export interface EffectiveCapabilities {
  env: CapabilityEnvironment;
  readiness: FirmReadiness;
  reports: FirmCapabilityReport[];
  /** What a payload built right now would carry. */
  toolNames: VoiceToolName[];
}

export interface CapabilityResolutionDeps {
  loadReadiness: (firmId: number) => Promise<FirmReadiness>;
  isToolsAttachable: () => Promise<boolean>;
  /** The operator allowlist source. Defaults to the real environment. */
  env?: Record<string, string | undefined>;
}

function isUsableTimeZone(timezone: unknown): boolean {
  if (typeof timezone !== "string" || timezone.trim().length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

async function productionDeps(): Promise<CapabilityResolutionDeps> {
  return {
    loadReadiness: async (firmId) => {
      const { buildAvailabilityConfig } = await import("../../scheduling/schedulingRepository.js");
      try {
        const config = await buildAvailabilityConfig(firmId);
        const openWeekdays = Object.values(config.weeklyHours).filter((d) => d !== null).length;
        return {
          bookableAppointmentTypes: config.appointmentTypes.length,
          openWeekdays,
          hasUsableTimezone: isUsableTimeZone(config.timezone),
        };
      } catch {
        // Unreadable scheduling configuration is not readiness. Fail closed.
        return NO_READINESS;
      }
    },
    isToolsAttachable: async () => {
      try {
        const { loadVoiceServerConfigFromEnv } = await import("../../voicePublishing/serverConfig.js");
        const { loadVoiceToolsConfigFromEnv } = await import("../../voicePublishing/toolsConfig.js");
        const serverConfig = loadVoiceServerConfigFromEnv();
        return loadVoiceToolsConfigFromEnv(serverConfig) !== null;
      } catch {
        // Enabled-but-misconfigured is not attachable, and saying so is the point.
        return false;
      }
    },
  };
}

/**
 * Resolve everything once, for one business.
 *
 * Callers that serialize many assistants should call this ONCE per request and
 * reuse the result — it is per-firm, not per-assistant, and the comparison in
 * `deriveProviderSyncState` must see exactly the list the payload builder saw.
 */
export async function resolveEffectiveCapabilities(
  firmId: number,
  deps?: CapabilityResolutionDeps,
): Promise<EffectiveCapabilities> {
  const resolved = deps ?? (await productionDeps());
  const [attachable, readiness] = await Promise.all([
    resolved.isToolsAttachable(),
    resolved.loadReadiness(firmId),
  ]);
  const env = readCapabilityEnvironment(attachable, resolved.env ?? process.env);
  return {
    env,
    readiness,
    reports: describeFirmCapabilities(env, readiness),
    toolNames: resolveFirmToolNames(env, readiness),
  };
}
