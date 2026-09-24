// J6: the controls that must exist BEFORE call recording is switched on.
//
// VOICE_ARTIFACT_POLICY decides what the provider keeps. When it is `full`
// (audio + transcript), three more server-owned settings become REQUIRED, and
// publishing refuses without them — so recording can never be on while its
// disclosure, retention or access rule is missing:
//
//   VOICE_RECORDING_DISCLOSURE      the sentence spoken before anything else
//                                   on every call (prepended to the greeting);
//   VOICE_RECORDING_RETENTION_DAYS  1–365; recordings older than this are
//                                   deleted at the provider and their
//                                   transcript scrubbed here;
//   VOICE_RECORDING_ACCESS          "owners" (default) or "team": who may
//                                   play a recording back.
//
// None of these enables anything. They are read only when the policy is
// already `full`, which remains an owner decision.

export const VOICE_RECORDING_DISCLOSURE_ENV_VAR = "VOICE_RECORDING_DISCLOSURE";
export const VOICE_RECORDING_RETENTION_DAYS_ENV_VAR = "VOICE_RECORDING_RETENTION_DAYS";
export const VOICE_RECORDING_ACCESS_ENV_VAR = "VOICE_RECORDING_ACCESS";

export type RecordingAccess = "owners" | "team";

export interface RecordingControls {
  disclosure: string;
  retentionDays: number;
  access: RecordingAccess;
}

export class RecordingControlsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecordingControlsError";
  }
}

/**
 * Null when the artifact policy is not `full` (nothing is recorded, so there
 * is nothing to control). Throws when it IS `full` and any control is missing
 * or malformed: recording without its rules must be impossible, not merely
 * discouraged.
 */
export function loadRecordingControls(env: Record<string, string | undefined> = process.env): RecordingControls | null {
  if ((env["VOICE_ARTIFACT_POLICY"] ?? "").trim() !== "full") return null;

  const disclosure = (env[VOICE_RECORDING_DISCLOSURE_ENV_VAR] ?? "").trim();
  if (disclosure.length < 20 || disclosure.length > 300) {
    throw new RecordingControlsError(`${VOICE_RECORDING_DISCLOSURE_ENV_VAR} must be set (20–300 characters) when recording is on.`);
  }
  if (!/record/i.test(disclosure)) {
    throw new RecordingControlsError(`${VOICE_RECORDING_DISCLOSURE_ENV_VAR} must say that the call is recorded.`);
  }

  const rawDays = (env[VOICE_RECORDING_RETENTION_DAYS_ENV_VAR] ?? "").trim();
  const retentionDays = Number(rawDays);
  if (rawDays === "" || !Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) {
    throw new RecordingControlsError(`${VOICE_RECORDING_RETENTION_DAYS_ENV_VAR} must be a whole number of days in [1, 365] when recording is on.`);
  }

  const rawAccess = (env[VOICE_RECORDING_ACCESS_ENV_VAR] ?? "").trim() || "owners";
  if (rawAccess !== "owners" && rawAccess !== "team") {
    throw new RecordingControlsError(`${VOICE_RECORDING_ACCESS_ENV_VAR} must be "owners" or "team".`);
  }

  return { disclosure, retentionDays, access: rawAccess };
}

/**
 * The greeting a recorded call opens with: the disclosure first, then the
 * business's own first message. Recording starts when the call starts, so the
 * disclosure must be the very first thing said — an assistant that waits for
 * the caller to speak first cannot guarantee that, and is refused.
 */
export function composeRecordedGreeting(
  controls: RecordingControls,
  firstMessage: string | undefined,
  firstMessageMode: string,
): { ok: true; firstMessage: string } | { ok: false; reason: "assistant_must_speak_first" } {
  if (firstMessageMode !== "assistant-speaks-first") return { ok: false, reason: "assistant_must_speak_first" };
  const rest = (firstMessage ?? "").trim();
  return { ok: true, firstMessage: rest ? `${controls.disclosure} ${rest}` : controls.disclosure };
}

/** A recording is past retention once its call ended more than `retentionDays` ago. */
export function isPastRetention(endedAt: Date, now: Date, retentionDays: number): boolean {
  return now.getTime() - endedAt.getTime() > retentionDays * 86_400_000;
}

/** Whether this principal may play recordings back under the access rule. */
export function mayPlayRecording(access: RecordingAccess, role: "owner" | "staff" | undefined): boolean {
  if (access === "team") return role === "owner" || role === "staff";
  return role === "owner";
}
