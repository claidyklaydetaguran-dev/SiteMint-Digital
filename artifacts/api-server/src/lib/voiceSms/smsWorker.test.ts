// The sender exists, is started at boot, and sends nothing while text
// messaging is off.
//
// The defect this pins: `sendQueuedVoiceSms` had no caller anywhere in the
// application, so a booking confirmation the caller had explicitly agreed to
// was written to the outbox and never sent — while the assistant had already
// told them a text was coming.

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

import { sendQueuedVoiceSms, VOICE_SMS_WORKER_TICK_MS } from "./outboxService.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("the voice SMS sender is wired to boot", () => {
  it("is started from index.ts, like the other always-on workers", () => {
    const src = readFileSync(resolve(here, "../../index.ts"), "utf8");
    expect(src).toMatch(/import \{ startVoiceSmsWorker \} from "\.\/lib\/voiceSms\/outboxService\.js"/);
    expect(src).toMatch(/startVoiceSmsWorker\(\{/);
  });

  it("ticks on a bounded interval", () => {
    expect(VOICE_SMS_WORKER_TICK_MS).toBeGreaterThanOrEqual(10_000);
    expect(VOICE_SMS_WORKER_TICK_MS).toBeLessThanOrEqual(120_000);
  });
});

describe("with text messaging off", () => {
  it("claims nothing and sends nothing", async () => {
    const transport = vi.fn();
    const summary = await sendQueuedVoiceSms(10, {
      isEnabled: () => false,
      transport: transport as never,
    });
    expect(summary).toEqual({ claimed: 0, sent: 0, failed: 0, blocked: 0 });
    expect(transport).not.toHaveBeenCalled();
  });

  it("stays inert when the credentials are incomplete, rather than sending part of a batch", async () => {
    const transport = vi.fn();
    const summary = await sendQueuedVoiceSms(10, {
      isEnabled: () => true,
      loadConfig: () => {
        throw new Error("VOICE_TWILIO_AUTH_TOKEN is not set.");
      },
      transport: transport as never,
    });
    expect(summary.claimed).toBe(0);
    expect(transport).not.toHaveBeenCalled();
  });
});
