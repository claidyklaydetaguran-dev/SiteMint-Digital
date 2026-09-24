// J6: deleting a call's recording — by the business, one call at a time, or
// by the retention sweep once a recording is older than the approved period.
//
// Order matters: the provider deletion happens FIRST, and the call is marked
// deleted here only after the provider confirmed it (or said it holds nothing
// for that id). A provider failure leaves the call unmarked, so the sweep
// tries again and the dashboard never claims a deletion that did not happen.

import { isPastRetention, loadRecordingControls } from "./recordingControls.js";

export interface RecordingDeletionDeps {
  deleteAtProvider: (providerCallId: string) => Promise<"deleted" | "not_found">;
  scrub: (firmId: number, callId: string, at: Date) => Promise<number>;
  audit: (firmId: number, callId: string, reason: "business_request" | "retention") => Promise<void>;
  now?: () => Date;
}

export type DeleteRecordingOutcome = { ok: true; provider: "deleted" | "not_found" } | { ok: false; reason: "provider_failed" };

export async function deleteCallRecording(
  firmId: number,
  callId: string,
  reason: "business_request" | "retention",
  deps: RecordingDeletionDeps,
): Promise<DeleteRecordingOutcome> {
  let provider: "deleted" | "not_found";
  try {
    provider = await deps.deleteAtProvider(callId);
  } catch {
    return { ok: false, reason: "provider_failed" };
  }
  const at = deps.now?.() ?? new Date();
  await deps.scrub(firmId, callId, at);
  try {
    await deps.audit(firmId, callId, reason);
  } catch {
    // The deletion is done; a lost audit row must not undo or hide it.
  }
  return { ok: true, provider };
}

export async function productionRecordingDeletionDeps(): Promise<RecordingDeletionDeps> {
  const { createProductionVoiceProvider } = await import("../voicePublishing/providerFactory.js");
  const { scrubCallArtifacts } = await import("../voice/webhooks/realCallsRepository.js");
  const { recordAuditEvent } = await import("../voiceAccounts/auditLog.js");
  const provider = createProductionVoiceProvider();
  if (!provider.deleteCallArtifacts) throw new Error("This voice provider cannot delete call artifacts.");
  return {
    deleteAtProvider: (id) => provider.deleteCallArtifacts!(id),
    scrub: scrubCallArtifacts,
    audit: (firmId, callId, reason) =>
      recordAuditEvent({ firmId, actor: reason === "retention" ? "system" : "owner", action: "call.recording_deleted", subject: callId.slice(0, 64), context: { reason } }),
  };
}

export interface RetentionSweepDeps extends RecordingDeletionDeps {
  env?: Record<string, string | undefined>;
  listPastRetention: (cutoff: Date) => Promise<Array<{ firmId: number; callId: string }>>;
}

/**
 * One pass of the retention sweep. Inert unless recording is on (policy
 * `full`) with a valid retention period. Returns what it did, for the log.
 */
export async function runRecordingRetentionOnce(deps: RetentionSweepDeps): Promise<{ state: "off" } | { state: "ran"; due: number; deleted: number; failed: number }> {
  let controls;
  try {
    controls = loadRecordingControls(deps.env ?? process.env);
  } catch {
    return { state: "off" };
  }
  if (!controls) return { state: "off" };
  const now = deps.now?.() ?? new Date();
  const cutoff = new Date(now.getTime() - controls.retentionDays * 86_400_000);
  const due = await deps.listPastRetention(cutoff);
  let deleted = 0;
  let failed = 0;
  for (const call of due) {
    const outcome = await deleteCallRecording(call.firmId, call.callId, "retention", deps);
    if (outcome.ok) deleted += 1;
    else failed += 1;
  }
  return { state: "ran", due: due.length, deleted, failed };
}

export { isPastRetention };

let retentionStarted = false;

export function startRecordingRetentionSweep(intervalMs: number, log: { info: (o: object, m: string) => void; error: (o: object, m: string) => void }): void {
  if (retentionStarted) return;
  retentionStarted = true;
  const tick = async () => {
    try {
      if (loadRecordingControlsSafe() === null) return;
      const { listCallsPastRetention } = await import("../voice/webhooks/realCallsRepository.js");
      const result = await runRecordingRetentionOnce({ ...(await productionRecordingDeletionDeps()), listPastRetention: listCallsPastRetention });
      if (result.state === "ran" && result.due > 0) log.info({ ...result }, "[recording retention] sweep");
    } catch (err) {
      log.error({ errorClass: err instanceof Error ? err.name : "unknown" }, "[recording retention] sweep failed");
    }
  };
  setInterval(tick, intervalMs).unref?.();
  void tick();
}

function loadRecordingControlsSafe() {
  try {
    return loadRecordingControls();
  } catch {
    return null;
  }
}
