/**
 * Milestone 1 / Checkpoint F1: static, safe display copy for browser-test
 * failure conditions. Never derived from a provider/client error's
 * `message`, `stack`, or `cause` — those are never rendered or logged.
 */
export type BrowserVoiceErrorCategory =
  | "integration_unavailable"
  | "permission_denied"
  | "microphone_unavailable"
  | "connection_failed"
  | "connection_closed"
  // AR-001V.2 (owner directive 2026-09-11): the provider-refusal categories.
  // A browser test that reached the provider and was REFUSED is a different
  // failure from one that never connected, and the customer's next action is
  // different too. Collapsing all three into the generic message is what made
  // the observed staging failure undiagnosable from the UI.
  | "provider_not_authorized"
  | "provider_refused"
  | "provider_unavailable"
  | "start_failed"
  | "end_failed"
  | "unexpected_browser_voice_error";

const BROWSER_VOICE_ERROR_COPY: Record<BrowserVoiceErrorCategory, string> = {
  integration_unavailable: "Browser voice integration is not connected yet.",
  permission_denied:
    "Microphone permission was denied. Allow microphone access in your browser settings and try again.",
  microphone_unavailable: "The microphone couldn't be accessed. Check your device and try again.",
  connection_failed: "The browser voice test couldn't connect. Please try again.",
  connection_closed: "The browser voice test connection closed unexpectedly.",
  provider_not_authorized:
    "The voice service refused this test for a configuration reason. A SiteMint administrator needs to check that the browser key allows this website address and this assistant.",
  provider_refused:
    "The voice service refused to start this test. The assistant may need to be published again before it can be tested.",
  provider_unavailable: "The voice service is temporarily unavailable. Please try again in a few minutes.",
  start_failed: "The browser voice test couldn't start. Please try again.",
  end_failed: "Ending the browser voice test didn't finish cleanly.",
  unexpected_browser_voice_error: "Something went wrong with the browser voice test. Please try again.",
};

/**
 * A short, opaque reference the customer can quote to support. It identifies
 * ONE attempt in this browser tab and nothing else: it is random, carries no
 * firm, assistant, session or provider identifier, and is never sent anywhere.
 * Its only job is to let a support conversation and a server-side log line be
 * talked about without the customer reading out an error they shouldn't see.
 */
export function newBrowserVoiceSupportReference(): string {
  const bytes = new Uint8Array(4);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return "BVT-" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/**
 * Categories whose copy already tells the customer exactly what happened and
 * what to do. Showing a support reference alongside those is noise — the
 * reference is for failures we could not explain.
 */
const SELF_EXPLANATORY: ReadonlySet<BrowserVoiceErrorCategory> = new Set([
  "permission_denied",
  "microphone_unavailable",
  "integration_unavailable",
]);

export function browserVoiceErrorNeedsSupportReference(category: BrowserVoiceErrorCategory): boolean {
  return !SELF_EXPLANATORY.has(category);
}

export function safeBrowserVoiceErrorMessage(
  category: BrowserVoiceErrorCategory = "unexpected_browser_voice_error",
): string {
  return BROWSER_VOICE_ERROR_COPY[category];
}
