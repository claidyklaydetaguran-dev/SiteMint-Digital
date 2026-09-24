// J6: recording can never be on without its disclosure, retention and access
// rule; deletion happens at the provider first and is never claimed when it
// did not happen; retention deletes only what is past the approved period.

import { describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import { readFileSync } from "node:fs";
import { composeRecordedGreeting, isPastRetention, loadRecordingControls, mayPlayRecording } from "./recordingControls.js";
import { deleteCallRecording, runRecordingRetentionOnce, type RetentionSweepDeps } from "./recordingDeletion.js";
import { extractPublishableAssistantConfig } from "../voicePublishing/persistedConfigMapper.js";
import { describeEnvContract } from "../envContract.js";

const DISCLOSURE = "This call is recorded for quality and training. If you'd rather it wasn't, tell me and I'll take a message instead.";
const FULL = {
  VOICE_ARTIFACT_POLICY: "full",
  VOICE_RECORDING_DISCLOSURE: DISCLOSURE,
  VOICE_RECORDING_RETENTION_DAYS: "30",
};

describe("recording controls", () => {
  it("are not read at all unless recording is on", () => {
    expect(loadRecordingControls({})).toBeNull();
    expect(loadRecordingControls({ VOICE_ARTIFACT_POLICY: "none" })).toBeNull();
    expect(loadRecordingControls({ VOICE_ARTIFACT_POLICY: "transcript_only" })).toBeNull();
  });

  it("with recording on, every control is required and validated", () => {
    expect(loadRecordingControls(FULL)).toEqual({ disclosure: DISCLOSURE, retentionDays: 30, access: "owners" });
    expect(() => loadRecordingControls({ ...FULL, VOICE_RECORDING_DISCLOSURE: "" })).toThrow();
    expect(() => loadRecordingControls({ ...FULL, VOICE_RECORDING_DISCLOSURE: "Hello and welcome to the business line." })).toThrow(/recorded/);
    for (const days of ["", "0", "366", "abc", "7.5"]) {
      expect(() => loadRecordingControls({ ...FULL, VOICE_RECORDING_RETENTION_DAYS: days }), days).toThrow();
    }
    expect(() => loadRecordingControls({ ...FULL, VOICE_RECORDING_ACCESS: "everyone" })).toThrow();
    expect(loadRecordingControls({ ...FULL, VOICE_RECORDING_ACCESS: "team" })?.access).toBe("team");
  });

  it("access: owners only by default; team adds staff; nobody else", () => {
    expect(mayPlayRecording("owners", "owner")).toBe(true);
    expect(mayPlayRecording("owners", "staff")).toBe(false);
    expect(mayPlayRecording("team", "staff")).toBe(true);
    expect(mayPlayRecording("team", undefined)).toBe(false);
  });

  it("retention compares against the call's end", () => {
    const end = new Date("2026-09-01T00:00:00Z");
    expect(isPastRetention(end, new Date("2026-09-30T23:00:00Z"), 30)).toBe(false);
    expect(isPastRetention(end, new Date("2026-10-01T00:00:01Z"), 30)).toBe(true);
  });

  it("are documented in the environment contract", () => {
    const names = describeEnvContract().map((e) => e.name);
    for (const n of ["VOICE_RECORDING_DISCLOSURE", "VOICE_RECORDING_RETENTION_DAYS", "VOICE_RECORDING_ACCESS"]) expect(names).toContain(n);
  });
});

describe("the disclosure is the first thing said", () => {
  const controls = loadRecordingControls(FULL)!;

  it("prepends the disclosure to the greeting", () => {
    expect(composeRecordedGreeting(controls, "Thanks for calling SiteMint.", "assistant-speaks-first")).toEqual({
      ok: true,
      firstMessage: `${DISCLOSURE} Thanks for calling SiteMint.`,
    });
  });

  it("refuses an assistant that waits for the caller, who would be recorded before hearing it", () => {
    expect(composeRecordedGreeting(controls, undefined, "assistant-waits-for-user")).toEqual({ ok: false, reason: "assistant_must_speak_first" });
  });

  it("is applied in the one mapper publish, sync and the payload digest share", () => {
    const src = readFileSync(new URL("../voicePublishing/persistedConfigMapper.ts", import.meta.url), "utf8");
    expect(src).toContain("composeRecordedGreeting(controls, firstMessage, firstMessageMode)");
    expect(typeof extractPublishableAssistantConfig).toBe("function");
  });

  it("publish and sync refuse before any claim when recording is on without its controls", () => {
    for (const f of ["../voicePublishing/publishService.ts", "../voicePublishing/syncService.ts"]) {
      const src = readFileSync(new URL(f, import.meta.url), "utf8");
      // Inside the pre-claim configuration try-block, before the atomic claim.
      const check = src.search(/loadArtifactPolicy\(\);\s*\/\/ J6:[\s\S]{0,200}loadRecordingControls\(\);/);
      expect(check, f).toBeGreaterThan(-1);
      expect(check, f).toBeLessThan(src.search(/await deps\.repository\.claimFor/));
    }
  });
});

describe("deleting one call's recording", () => {
  const baseDeps = () => {
    const order: string[] = [];
    return {
      order,
      deps: {
        deleteAtProvider: async (id: string) => {
          order.push("provider:" + id);
          return "deleted" as const;
        },
        scrub: async (firmId: number, id: string) => {
          order.push(`scrub:${firmId}:${id}`);
          return 3;
        },
        audit: async (_f: number, _id: string, reason: string) => {
          order.push("audit:" + reason);
        },
      },
    };
  };

  it("deletes at the provider first, then scrubs here, then audits", async () => {
    const h = baseDeps();
    expect(await deleteCallRecording(2, "call-1", "business_request", h.deps)).toEqual({ ok: true, provider: "deleted" });
    expect(h.order).toEqual(["provider:call-1", "scrub:2:call-1", "audit:business_request"]);
  });

  it("a provider failure scrubs nothing and reports a failure", async () => {
    const h = baseDeps();
    h.deps.deleteAtProvider = async () => {
      throw new Error("503");
    };
    expect(await deleteCallRecording(2, "call-1", "business_request", h.deps)).toEqual({ ok: false, reason: "provider_failed" });
    expect(h.order).toEqual([]);
  });

  it("nothing at the provider is the goal state, and is still scrubbed here", async () => {
    const h = baseDeps();
    h.deps.deleteAtProvider = async () => "not_found";
    expect(await deleteCallRecording(2, "call-1", "retention", h.deps)).toEqual({ ok: true, provider: "not_found" });
    expect(h.order).toEqual(["scrub:2:call-1", "audit:retention"]);
  });

  it("the route is owner-only (not in the staff write list) and declared in the route manifest", () => {
    const roles = readFileSync(new URL("../receptionistRoles.ts", import.meta.url), "utf8");
    expect(roles).not.toContain("DELETE /receptionist/voice/calls/:callId/recording");
    const manifest = readFileSync(new URL("../routeSecurity.manifest.ts", import.meta.url), "utf8");
    expect(manifest).toContain('"DELETE /api/receptionist/voice/calls/:callId/recording": "session"');
  });
});

describe("retention sweep", () => {
  const sweepDeps = (env: Record<string, string>, due: Array<{ firmId: number; callId: string }>) => {
    const deleted: string[] = [];
    const cutoffs: Date[] = [];
    const deps: RetentionSweepDeps = {
      env,
      now: () => new Date("2026-10-31T00:00:00Z"),
      listPastRetention: async (cutoff) => {
        cutoffs.push(cutoff);
        return due;
      },
      deleteAtProvider: async (id) => {
        deleted.push(id);
        return "deleted";
      },
      scrub: async () => 1,
      audit: async () => undefined,
    };
    return { deps, deleted, cutoffs };
  };

  it("does nothing while recording is off", async () => {
    const h = sweepDeps({ VOICE_ARTIFACT_POLICY: "none" }, [{ firmId: 2, callId: "old" }]);
    expect(await runRecordingRetentionOnce(h.deps)).toEqual({ state: "off" });
    expect(h.deleted).toEqual([]);
  });

  it("deletes what is past the approved period, measured from now", async () => {
    const h = sweepDeps(FULL, [{ firmId: 2, callId: "a" }, { firmId: 3, callId: "b" }]);
    expect(await runRecordingRetentionOnce(h.deps)).toEqual({ state: "ran", due: 2, deleted: 2, failed: 0 });
    expect(h.cutoffs[0]!.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(h.deleted).toEqual(["a", "b"]);
  });

  it("a malformed control switches the sweep off rather than guessing a period", async () => {
    const h = sweepDeps({ ...FULL, VOICE_RECORDING_RETENTION_DAYS: "forever" }, [{ firmId: 2, callId: "a" }]);
    expect(await runRecordingRetentionOnce(h.deps)).toEqual({ state: "off" });
  });
});
