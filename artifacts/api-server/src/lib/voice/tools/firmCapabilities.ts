// V8: which capabilities a SPECIFIC business may actually have attached.
//
// Three gates must all pass before a tool reaches an assistant, and they answer
// three different questions:
//
//   1. Is the platform able to run tools at all?      VOICE_TOOLS_ATTACH_ENABLED
//                                                     + a valid webhook attachment
//   2. Has an operator authorized this capability?    VOICE_TOOLS_CAPABILITIES
//   3. Has THIS BUSINESS finished configuring it?     resolved here
//
// The third gate is the one this module adds. Message-taking needs no setup, so
// it is ready for everyone. Scheduling is only ready once the business actually
// has a bookable appointment type — attaching it sooner would publish an
// assistant that offers to book appointments into a calendar with nothing
// bookable in it, and the caller would find that out mid-call.
//
// Reporting is deliberately separate from enforcement: `describeFirmCapabilities`
// explains the state to a human, and `resolveFirmToolNames` decides what the
// payload carries. Both read the same rules, so the dashboard cannot claim a
// capability is active while the publish path omits it.

import {
  CAPABILITY_BY_TOOL,
  TOOL_CAPABILITIES,
  parseToolCapabilities,
  toolNamesForCapabilities,
  type VoiceToolCapability,
} from "./toolCapabilities.js";
import { TOOL_NAMES, type VoiceToolName } from "./toolCatalog.js";

/**
 * Why a capability is not attached. Each value maps to one sentence the
 * dashboard shows, and each names a thing the reader can actually change (or
 * is told plainly that only SiteMint can).
 */
export type CapabilityBlockReason =
  | "platform_disabled"
  | "not_authorized"
  | "needs_appointment_type";

export type CapabilityState = "active" | "blocked";

export interface FirmCapabilityReport {
  key: VoiceToolCapability;
  state: CapabilityState;
  /** Present only when state is "blocked". */
  reason: CapabilityBlockReason | null;
  /** The catalog tools this capability would contribute. */
  toolNames: VoiceToolName[];
}

/** What the firm has configured, as far as capability readiness is concerned. */
export interface FirmReadiness {
  /** Count of appointment types the business could actually be booked into. */
  bookableAppointmentTypes: number;
}

export interface CapabilityEnvironment {
  /** True when the platform can attach tools at all (flag on AND webhook valid). */
  toolsAttachable: boolean;
  /** The operator allowlist, already parsed. Empty authorizes nothing. */
  authorized: readonly VoiceToolCapability[];
}

/**
 * Reads the platform half of the decision from the environment.
 *
 * `toolsAttachable` is passed in rather than derived here, because whether the
 * webhook attachment is valid is the publish path's determination and must not
 * be computed two different ways.
 */
export function readCapabilityEnvironment(
  toolsAttachable: boolean,
  env: Record<string, string | undefined> = process.env,
): CapabilityEnvironment {
  const parsed = parseToolCapabilities(env["VOICE_TOOLS_CAPABILITIES"]);
  return { toolsAttachable, authorized: parsed.ok ? parsed.capabilities : [] };
}

function isReadyForFirm(capability: VoiceToolCapability, readiness: FirmReadiness): boolean {
  switch (capability) {
    case "messages":
      // Taking a message needs no configuration: a name, a topic and what the
      // caller wants are all supplied by the conversation itself.
      return true;
    case "scheduling":
      return readiness.bookableAppointmentTypes > 0;
  }
}

function blockReason(
  capability: VoiceToolCapability,
  env: CapabilityEnvironment,
  readiness: FirmReadiness,
): CapabilityBlockReason | null {
  if (!env.toolsAttachable) return "platform_disabled";
  if (!env.authorized.includes(capability)) return "not_authorized";
  if (!isReadyForFirm(capability, readiness)) {
    return capability === "scheduling" ? "needs_appointment_type" : "not_authorized";
  }
  return null;
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
 * The tool names this business's payload may carry, in catalog order.
 *
 * Returns an empty list rather than throwing: the publish path has already
 * decided whether tools are attachable at all, and an empty list there means
 * "send no tools", which is the correct fail-closed outcome for a business that
 * has not finished setting anything up.
 */
export function resolveFirmToolNames(
  env: CapabilityEnvironment,
  readiness: FirmReadiness,
): VoiceToolName[] {
  if (!env.toolsAttachable) return [];
  const ready = env.authorized.filter((c) => isReadyForFirm(c, readiness));
  return toolNamesForCapabilities(ready);
}
