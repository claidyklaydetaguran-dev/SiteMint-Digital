// Customer issue resolution — only the issues that are the customer's to fix.
//
// Before: any signed-in business could POST .../issues/:id/resolve for any of
// its issues, including `billing_suspended` and `usage_pause_requested`, which
// request an OWNER action. "Resolving" one only hid it from the list an
// operator shares with the business.
//
// Over real HTTP, with the issue store replaced at the service seam and the
// session middleware by a stand-in that maps fixed cookies to firms.

import http from "node:http";
import type { AddressInfo } from "node:net";
import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

interface FakeIssue {
  id: number;
  firmId: number;
  code: string;
  level: string;
  message: string;
  context: Record<string, unknown>;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const h = vi.hoisted(() => ({
  issues: [] as FakeIssue[],
  resolveCalls: [] as Array<{ firmId: number; issueId: number }>,
}));

vi.mock("../lib/receptionistAuth.js", () => ({
  COOKIE_NAME: "receptionist_session",
  requireReceptionistAuth: (req: Request, res: Response, next: NextFunction) => {
    const token = (req.cookies as Record<string, string> | undefined)?.["receptionist_session"] ?? "";
    const firmId = ({ firm7: 7, firm8: 8 } as Record<string, number>)[token];
    if (firmId === undefined) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    req.firmId = firmId;
    next();
  },
}));

vi.mock("../lib/voiceIssues/voiceIssueService.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/voiceIssues/voiceIssueService.js")>();
  const open = (firmId: number, issueId?: number) =>
    h.issues.filter((i) => i.firmId === firmId && i.resolvedAt === null && (issueId === undefined || i.id === issueId));
  return {
    ...actual,
    listOpenVoiceIssues: async (firmId: number) => open(firmId),
    findOpenVoiceIssue: async (firmId: number, issueId: number) => open(firmId, issueId)[0],
    resolveVoiceIssue: async (firmId: number, issueId: number) => {
      h.resolveCalls.push({ firmId, issueId });
      const row = open(firmId, issueId)[0];
      if (!row) return undefined;
      row.resolvedAt = new Date();
      return row;
    },
  };
});

import monitoringRouter from "./receptionistMonitoring.js";
import {
  CUSTOMER_RESOLVABLE_ISSUE_CODES,
  OPERATOR_ONLY_ISSUE_MESSAGE,
  VOICE_ISSUE_CODES,
  customerResolveDecision,
  isCustomerResolvableIssueCode,
} from "../lib/voiceIssues/voiceIssueService.js";

const NOW = new Date("2026-09-16T12:00:00.000Z");
const issue = (id: number, firmId: number, code: string): FakeIssue => ({
  id,
  firmId,
  code,
  level: "warning",
  message: `issue ${id}`,
  context: { occurrences: 1 },
  resolvedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
});

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use((req, _res, next) => {
  (req as unknown as { log: Record<string, () => void> }).log = { error: () => {}, warn: () => {}, info: () => {} };
  next();
});
app.use("/api", monitoringRouter);

let server: http.Server;
let base = "";

beforeAll(async () => {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  h.issues = [
    issue(1, 7, "calendar_revoked"),
    issue(2, 7, "billing_suspended"),
    issue(3, 7, "usage_pause_requested"),
    issue(4, 7, "emergency_language_detected"),
    issue(5, 8, "calendar_revoked"),
    issue(6, 8, "billing_suspended"),
  ];
  h.resolveCalls = [];
});

async function call(method: string, path: string, cookie: string | null) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: cookie === null ? {} : { Cookie: `receptionist_session=${cookie}` },
  });
  const text = await res.text();
  return { status: res.status, json: (text ? JSON.parse(text) : {}) as Record<string, unknown> };
}

describe("which issues a customer may resolve", () => {
  it("is an explicit allowlist drawn only from known codes", () => {
    for (const code of CUSTOMER_RESOLVABLE_ISSUE_CODES) expect(VOICE_ISSUE_CODES, code).toContain(code);
  });

  it("keeps billing, usage and platform issues with the operator", () => {
    // Pinned exactly, so moving a code across the line is a deliberate edit.
    expect(VOICE_ISSUE_CODES.filter((code) => !isCustomerResolvableIssueCode(code))).toEqual([
      "webhook_malformed_event",
      "webhook_store_failed",
      "call_stale_in_progress",
      "call_missing_report",
      "tool_invalid_args",
      "tool_execution_failed",
      "usage_pause_requested",
      "billing_suspended",
    ]);
  });

  it("treats a code it has never heard of as operator-only", () => {
    expect(isCustomerResolvableIssueCode("some_future_code")).toBe(false);
  });

  it("decides not-found before it classifies anything", () => {
    expect(customerResolveDecision(undefined)).toBe("not_found");
    expect(customerResolveDecision({ code: "billing_suspended" })).toBe("operator_only");
    expect(customerResolveDecision({ code: "calendar_revoked" })).toBe("allowed");
  });
});

describe("GET /api/receptionist/voice/issues", () => {
  it("marks each of the firm's issues with whether the customer may resolve it", async () => {
    const res = await call("GET", "/receptionist/voice/issues", "firm7");
    expect(res.status).toBe(200);
    const items = res.json.items as Array<{ id: number; customerResolvable: boolean }>;
    expect(items.map((i) => [i.id, i.customerResolvable])).toEqual([
      [1, true],
      [2, false],
      [3, false],
      [4, true],
    ]);
  });
});

describe("POST /api/receptionist/voice/issues/:id/resolve", () => {
  it("resolves a customer-actionable issue", async () => {
    const res = await call("POST", "/receptionist/voice/issues/1/resolve", "firm7");
    expect(res.status).toBe(200);
    expect(h.resolveCalls).toEqual([{ firmId: 7, issueId: 1 }]);
    expect(h.issues.find((i) => i.id === 1)?.resolvedAt).not.toBeNull();
  });

  it("refuses billing_suspended with 403 and a plain sentence, and resolves nothing", async () => {
    const res = await call("POST", "/receptionist/voice/issues/2/resolve", "firm7");
    expect(res.status).toBe(403);
    expect(res.json.error).toBe(OPERATOR_ONLY_ISSUE_MESSAGE);
    expect(h.resolveCalls).toEqual([]);
    expect(h.issues.find((i) => i.id === 2)?.resolvedAt).toBeNull();
  });

  it("refuses usage_pause_requested the same way", async () => {
    const res = await call("POST", "/receptionist/voice/issues/3/resolve", "firm7");
    expect(res.status).toBe(403);
    expect(h.resolveCalls).toEqual([]);
  });

  it("another firm's issue is 404 — never 403, so its code is not disclosed", async () => {
    expect((await call("POST", "/receptionist/voice/issues/5/resolve", "firm7")).status).toBe(404);
    expect((await call("POST", "/receptionist/voice/issues/6/resolve", "firm7")).status).toBe(404);
    expect(h.resolveCalls).toEqual([]);
    expect(h.issues.filter((i) => i.firmId === 8).every((i) => i.resolvedAt === null)).toBe(true);
  });

  it("an issue already resolved is 404", async () => {
    expect((await call("POST", "/receptionist/voice/issues/4/resolve", "firm7")).status).toBe(200);
    expect((await call("POST", "/receptionist/voice/issues/4/resolve", "firm7")).status).toBe(404);
  });

  it("requires a session and a numeric id", async () => {
    expect((await call("POST", "/receptionist/voice/issues/1/resolve", null)).status).toBe(401);
    expect((await call("POST", "/receptionist/voice/issues/not-a-number/resolve", "firm7")).status).toBe(400);
    expect(h.resolveCalls).toEqual([]);
  });
});
