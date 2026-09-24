export type RecordingResult =
  | { status: "available"; url: string }
  | { status: "disabled" | "pending" | "unavailable" };

export const RECORDING = {
  heading: "Conversation replay",
  intro: "Listen to retained audio from this conversation.",
  load: "Load recording",
  loading: "Checking recording…",
  retry: "Check again",
  ready: "Recording ready. Press play to listen.",
  disabled: "Audio replay is switched off for this workspace. Calls made without recording cannot be replayed later.",
  pending: "This call has not finished. Check again after it ends.",
  unavailable: "No audio is available yet. It may still be processing, may not have been recorded, or may have expired.",
  failed: "The recording couldn't be played. Check again to get a fresh playback link.",
  unauthorized: "Your session or access has changed. Sign in again to continue.",
  rateLimited: "Too many recording requests. Try again later.",
  speed: "Playback speed",
  player: "Conversation audio",
  unsupported: "This browser does not support audio playback.",
} as const;

/** Treat mixed-version or malformed responses as a failure, never success. */
export function parseRecordingResult(value: unknown): RecordingResult {
  if (value && typeof value === "object" && "status" in value) {
    if (value.status === "disabled" || value.status === "pending" || value.status === "unavailable") {
      return { status: value.status };
    }
    if (value.status === "available" && "url" in value && typeof value.url === "string") {
      const url = new URL(value.url);
      if (url.protocol === "https:" && !url.username && !url.password) return { status: "available", url: url.href };
    }
  }
  throw new Error("Recording response is unavailable.");
}
