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
  start_failed: "The browser voice test couldn't start. Please try again.",
  end_failed: "Ending the browser voice test didn't finish cleanly.",
  unexpected_browser_voice_error: "Something went wrong with the browser voice test. Please try again.",
};

export function safeBrowserVoiceErrorMessage(
  category: BrowserVoiceErrorCategory = "unexpected_browser_voice_error",
): string {
  return BROWSER_VOICE_ERROR_COPY[category];
}
