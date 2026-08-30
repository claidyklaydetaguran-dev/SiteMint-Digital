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
  TOOL_NAMES,
  TOOL_DESCRIPTIONS,
  TOOL_PARAMETER_SCHEMAS,
} from "../voice/tools/toolCatalog.js";
import { PublishFoundationError } from "./errors.js";
import type { VoiceServerConfig } from "./serverConfig.js";

export const VOICE_TOOLS_ATTACH_ENABLED_ENV_VAR = "VOICE_TOOLS_ATTACH_ENABLED";

export function isVoiceToolsAttachEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[VOICE_TOOLS_ATTACH_ENABLED_ENV_VAR] === "true";
}

/** The exact Vapi custom-tool objects for the whole catalog. */
export function buildVoiceToolDefinitions(serverConfig: VoiceServerConfig): JsonObject[] {
  return TOOL_NAMES.map((name) => ({
    type: "function",
    function: {
      name,
      description: TOOL_DESCRIPTIONS[name],
      parameters: TOOL_PARAMETER_SCHEMAS[name],
    },
    server: { url: serverConfig.url, secret: serverConfig.secret },
  }));
}

/**
 * Loads the tools attachment. Null when disabled (default). When enabled it
 * requires a non-null, already-validated server config — the same object the
 * publish/sync flow loaded one step earlier — and fails closed otherwise.
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
  return buildVoiceToolDefinitions(serverConfig);
}
