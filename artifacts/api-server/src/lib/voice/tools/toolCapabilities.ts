// V7: capability grouping over the closed tool catalog.
//
// Why this exists. Before V7, VOICE_TOOLS_ATTACH_ENABLED was all-or-nothing: it
// attached every tool in the catalog. That made "turn on message taking"
// indistinguishable from "turn on appointment booking, rescheduling and
// cancellation", so activating the finished capability would silently have
// published four scheduling actions to every assistant as well.
//
// The catalog stays closed and static. What this module adds is a second,
// narrower gate: an explicit list of CAPABILITIES an operator has authorized,
// which selects a subset of that catalog. Both gates must pass, and both fail
// closed:
//
//   VOICE_TOOLS_ATTACH_ENABLED=true      — tools may be attached at all
//   VOICE_TOOLS_CAPABILITIES=messages    — and only these ones are
//
// An unknown capability name is an error rather than an ignored entry: a
// typo'd allowlist must not quietly attach nothing (or, worse, look like it
// attached something).

import { TOOL_NAMES, type VoiceToolName } from "./toolCatalog.js";

export const VOICE_TOOLS_CAPABILITIES_ENV_VAR = "VOICE_TOOLS_CAPABILITIES";

/**
 * The capability groups. One per coherent business outcome, so an operator
 * authorizes an outcome rather than a list of function names.
 */
export const TOOL_CAPABILITIES = ["messages", "scheduling", "transfer"] as const;
export type VoiceToolCapability = (typeof TOOL_CAPABILITIES)[number];

export function isVoiceToolCapability(value: unknown): value is VoiceToolCapability {
  return typeof value === "string" && (TOOL_CAPABILITIES as readonly string[]).includes(value);
}

/**
 * Capabilities the model exercises through a PROVIDER-NATIVE tool rather than
 * through a dispatcher function.
 *
 * `transfer` is the first of them. Handing a live call to another number is
 * something the provider performs on the telephone leg itself — there is no
 * SiteMint function for it to call, and no arguments for us to validate, so it
 * is deliberately absent from TOOL_NAMES and TOOL_ARG_SCHEMAS. What the
 * provider is given is a tool with no destinations in it; when the model uses
 * it, the provider asks our webhook where to send the call, and that answer is
 * resolved per call, firm-scoped, against consent and hours.
 *
 * Keeping the list explicit is what stops the payload builder from silently
 * treating "contributes no function tool" as "contributes nothing".
 */
export const PROVIDER_NATIVE_CAPABILITIES = ["transfer"] as const;
export type ProviderNativeCapability = (typeof PROVIDER_NATIVE_CAPABILITIES)[number];

export function isProviderNativeCapability(value: VoiceToolCapability): value is ProviderNativeCapability {
  return (PROVIDER_NATIVE_CAPABILITIES as readonly string[]).includes(value);
}

/**
 * Every DISPATCHER tool belongs to exactly one capability. Total by
 * construction: adding a tool to TOOL_NAMES without classifying it here fails
 * to typecheck, so a new tool can never default into an already-authorized
 * group.
 *
 * A provider-native capability appears nowhere in here, because it contributes
 * no tool the dispatcher can be asked to run.
 */
export const CAPABILITY_BY_TOOL: Record<VoiceToolName, VoiceToolCapability> = {
  check_availability: "scheduling",
  book_appointment: "scheduling",
  reschedule_appointment: "scheduling",
  cancel_appointment: "scheduling",
  save_message: "messages",
};

/** The catalog subset for a set of capabilities, in catalog order. */
export function toolNamesForCapabilities(
  capabilities: readonly VoiceToolCapability[],
): VoiceToolName[] {
  const allowed = new Set<VoiceToolCapability>(capabilities);
  return TOOL_NAMES.filter((name) => allowed.has(CAPABILITY_BY_TOOL[name]));
}

export type ToolCapabilityParseResult =
  | { ok: true; capabilities: VoiceToolCapability[] }
  | { ok: false; reason: "empty" | "unknown"; unknown: string[] };

/**
 * Parses the operator's allowlist. Comma-separated, case-insensitive,
 * whitespace-tolerant, duplicates collapsed, order normalized to the declared
 * capability order so the resulting payload is stable (and therefore so is its
 * config hash).
 */
export function parseToolCapabilities(raw: string | undefined): ToolCapabilityParseResult {
  const entries = (raw ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  if (entries.length === 0) return { ok: false, reason: "empty", unknown: [] };

  const unknown = entries.filter((entry) => !isVoiceToolCapability(entry));
  if (unknown.length > 0) return { ok: false, reason: "unknown", unknown: [...new Set(unknown)] };

  const selected = new Set(entries as VoiceToolCapability[]);
  return { ok: true, capabilities: TOOL_CAPABILITIES.filter((c) => selected.has(c)) };
}
