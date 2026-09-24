// P3: provider payload representation of the closed tool catalog —
// REPRESENTATION ONLY. No live Vapi tool is created until an owner-gated
// activation flips the flag and runs a publish/sync.
//
// Contract (mirrors serverConfig.ts):
//   - VOICE_TOOLS_ATTACH_ENABLED: exact "true" attaches the catalog to the
//     assistant payload; anything else sends no `tools` and hashes are
//     byte-identical to today.
//   - Tools are useless without a webhook to execute them, so enabling tools
//     REQUIRES the server attachment to be enabled and valid; otherwise the
//     publish/sync fails pre-claim with TOOLS_CONFIG_INVALID.
//   - The emitted definitions come only from the closed catalog
//     (toolCatalog.ts) — names, descriptions, and JSON-schema parameters are
//     static; nothing request- or tenant-supplied can alter them.

import type { JsonObject } from "../voice/types.js";
import {
  TOOL_DESCRIPTIONS,
  TOOL_PARAMETER_SCHEMAS,
  type VoiceToolName,
} from "../voice/tools/toolCatalog.js";
export type { VoiceToolName };
import {
  VOICE_TOOLS_CAPABILITIES_ENV_VAR,
  parseToolCapabilities,
  toolNamesForCapabilities,
  TOOL_CAPABILITIES,
  type VoiceToolCapability,
} from "../voice/tools/toolCapabilities.js";
import { PublishFoundationError } from "./errors.js";
import type { VoiceServerConfig } from "./serverConfig.js";

export const VOICE_TOOLS_ATTACH_ENABLED_ENV_VAR = "VOICE_TOOLS_ATTACH_ENABLED";

/** The provider-native tool type that hands a live call to another number. */
export const TRANSFER_TOOL_TYPE = "transferCall";

export function isVoiceToolsAttachEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[VOICE_TOOLS_ATTACH_ENABLED_ENV_VAR] === "true";
}

/** The exact Vapi custom-tool objects for the named tools, in the order given. */
export function buildVoiceToolDefinitions(
  serverConfig: VoiceServerConfig,
  toolNames: readonly VoiceToolName[],
): JsonObject[] {
  return toolNames.map((name) => ({
    type: "function",
    function: {
      name,
      description: TOOL_DESCRIPTIONS[name],
      parameters: TOOL_PARAMETER_SCHEMAS[name],
    },
    server: { url: serverConfig.url, credentialId: serverConfig.credentialId },
  }));
}

/**
 * The transfer tool, as the provider receives it.
 *
 * TWO fields, and the absence of a third is the entire design.
 *
 * There are no `destinations`. A destination list in an assistant config would
 * put a business's private telephone numbers into a provider-stored record,
 * freeze them at publish time, and route a call without ever consulting
 * consent, the contact's own hours, or whether the contact is still active.
 * Omitting them makes the provider ask US, on the call, every time: it sends a
 * `transfer-destination-request` to the server URL below, and
 * receptionistVoiceWebhook.ts answers it firm-scoped, after re-checking that
 * this business may still transfer at all.
 *
 * So no caller phone number, no business number, and no destination of any
 * kind ever leaves this server inside an assistant payload.
 */
export function buildVoiceTransferToolDefinition(serverConfig: VoiceServerConfig): JsonObject {
  return {
    type: TRANSFER_TOOL_TYPE,
    server: { url: serverConfig.url, credentialId: serverConfig.credentialId },
  };
}

/** Does this payload carry the provider-native transfer tool? */
export function hasTransferTool(tools: readonly JsonObject[] | null): boolean {
  return (tools ?? []).some((tool) => tool.type === TRANSFER_TOOL_TYPE);
}

/**
 * The one sentence that tells the model when to reach for the transfer tool.
 *
 * Server-owned and fixed. A business's own instructions are its own; this is
 * the operating rule for a capability SiteMint attached, and it is appended
 * only when the tool is actually on the payload — see
 * `withTransferInstruction`.
 *
 * It names the fallback deliberately. Without it, a refused transfer leaves the
 * model improvising: the failure a caller hears would be invented rather than
 * the truthful "I can't put you through, but I can take a message".
 */
export const TRANSFER_TOOL_INSTRUCTION =
  "If the caller asks to speak with a person, use the transferCall tool. " +
  "If the transfer cannot be made, say so plainly and offer to take a message with save_message.";

/**
 * Appends the transfer instruction when — and only when — the payload carries
 * the transfer tool.
 *
 * Derived from the payload rather than from the environment on purpose: publish,
 * sync and the digest comparison each build the same tools array and then call
 * this, so all three produce byte-identical instructions. An instruction that
 * was appended on one path and not another would move the digest and report a
 * freshly published assistant as out of sync forever — the 88df967 defect, in a
 * new field.
 */
export function withTransferInstruction(
  systemInstructions: string,
  tools: readonly JsonObject[] | null,
): string {
  return hasTransferTool(tools) ? `${systemInstructions}\n\n${TRANSFER_TOOL_INSTRUCTION}` : systemInstructions;
}

/**
 * Loads the tools attachment. Null when disabled (default).
 *
 * When enabled, THREE things must hold, and each failure is a pre-claim error
 * rather than a silent narrowing:
 *
 *   1. a non-null, already-validated server config (tools without a webhook to
 *      execute them would be an assistant promising actions nobody performs);
 *   2. an explicit, non-empty VOICE_TOOLS_CAPABILITIES allowlist — attaching
 *      "whatever is in the catalog" is exactly the accident this gate exists to
 *      prevent, so there is deliberately no default;
 *   3. every name in that allowlist is a known capability.
 */
export function loadVoiceToolsConfigFromEnv(
  serverConfig: VoiceServerConfig | null,
  env: Record<string, string | undefined> = process.env,
  /**
   * V8: the business's effective tool names, from the one shared capability
   * resolution. When provided it NARROWS the operator allowlist to what this
   * business has actually finished configuring — it can never widen it, because
   * the allowlist check below still runs first.
   *
   * Optional so the env-contract boot probe can validate configuration without
   * a firm, but every caller that has a firmId passes it: publish, sync, and
   * the synchronization comparison must all see the same list or they disagree
   * about what "up to date" means.
   */
  firmToolNames?: readonly VoiceToolName[],
  /**
   * V9: the business's effective CAPABILITIES, from the same shared resolution.
   *
   * Needed alongside `firmToolNames` because a provider-native capability
   * contributes no tool name — narrowing by names alone would drop the transfer
   * tool from every payload, or (worse) keep it for a business whose readiness
   * has lapsed. Undefined means "not firm-scoped" (the env-contract boot probe),
   * exactly as for `firmToolNames`, and can only ever narrow the operator
   * allowlist, never widen it.
   */
  firmCapabilities?: readonly VoiceToolCapability[],
): JsonObject[] | null {
  if (!isVoiceToolsAttachEnabled(env)) return null;
  if (serverConfig === null) {
    throw new PublishFoundationError(
      "TOOLS_CONFIG_INVALID",
      `${VOICE_TOOLS_ATTACH_ENABLED_ENV_VAR} requires the server attachment (VOICE_WEBHOOK_ATTACH_ENABLED) to be enabled and valid.`,
    );
  }

  const parsed = parseToolCapabilities(env[VOICE_TOOLS_CAPABILITIES_ENV_VAR]);
  if (!parsed.ok) {
    throw new PublishFoundationError(
      "TOOLS_CONFIG_INVALID",
      parsed.reason === "empty"
        ? `${VOICE_TOOLS_ATTACH_ENABLED_ENV_VAR} requires ${VOICE_TOOLS_CAPABILITIES_ENV_VAR} to name at least one capability (${TOOL_CAPABILITIES.join(", ")}). There is no default: an assistant must never receive a capability nobody authorized.`
        : `${VOICE_TOOLS_CAPABILITIES_ENV_VAR} names unknown capabilities: ${parsed.unknown.join(", ")}. Valid values are ${TOOL_CAPABILITIES.join(", ")}.`,
    );
  }

  const authorized = toolNamesForCapabilities(parsed.capabilities);
  const effective =
    firmToolNames === undefined
      ? authorized
      : authorized.filter((name) => firmToolNames.includes(name));

  const effectiveCapabilities =
    firmCapabilities === undefined
      ? parsed.capabilities
      : parsed.capabilities.filter((capability) => firmCapabilities.includes(capability));

  // Function tools first, then the provider-native one. A fixed order keeps the
  // payload — and therefore its digest — stable across builds.
  return [
    ...buildVoiceToolDefinitions(serverConfig, effective),
    ...(effectiveCapabilities.includes("transfer") ? [buildVoiceTransferToolDefinition(serverConfig)] : []),
  ];
}
