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
import {
  VOICE_TOOLS_CAPABILITIES_ENV_VAR,
  parseToolCapabilities,
  toolNamesForCapabilities,
  TOOL_CAPABILITIES,
} from "../voice/tools/toolCapabilities.js";
import { PublishFoundationError } from "./errors.js";
import type { VoiceServerConfig } from "./serverConfig.js";

export const VOICE_TOOLS_ATTACH_ENABLED_ENV_VAR = "VOICE_TOOLS_ATTACH_ENABLED";

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

  return buildVoiceToolDefinitions(serverConfig, toolNamesForCapabilities(parsed.capabilities));
}
