// POST /api/receptionist/account/password/change, over real HTTP.
//
// Settings posted here for months and got a 404. passwordChange.test.ts owns
// the rules; these cases pin the route's wiring: a session is required, the
// session making the change is the one kept, a session can only ever change its
// own firm, failures map to the statuses the dashboard reads, nothing echoes a
// password, and the limiter applies.
//
// The database is replaced at the dependency seam (productionPasswordChangeDeps)
// and the session middleware by a stand-in that maps fixed cookies to firms and
// refuses everything else, the way the real one does against Postgres.

import http from "node:http";
import type { AddressInfo } from "node:net";
import express, { type NextFunction, type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@workspace/db", () => ({ db: {}, pool: {} }));

const h = vi.hoisted(() => ({
  hashes: new Map<number, string>(),
  sessions: [] as Array<{ firmId: number; token: string }>,
  audits: [] as Array<{ firmId: number; action: string }>,
}));

vi.mock("../lib/receptionistAuth.js", () => ({
  COOKIE_NAME: "receptionist_session",
  requireReceptionistAuth: (req: Request, res: Response, next: NextFunction) => {
    const token = (req.cookies as Record<string, string> | undefined)?.["receptionist_session"];
    const session = h.sessions.find((s) => s.token === token);
    if (!session) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    req.firmId = session.firmId;
    next();
  },
}));

vi.mock("../lib/accountSecurity/passwordChange.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/accountSecurity/passwordChange.js")>();
  return {
    ...actual,
    productionPasswordChangeDeps: async () => ({
      loadPasswordHash: async (firmId: number) => h.hashes.get(firmId),
      verifyPassword: async (password: string, hash: string) => hash === `hash:${password}`,
      hashPassword: async (password: string) => `hash:${password}`,
      updatePasswordHash: async (firmId: number, hash: string) => {
        h.hashes.set(firmId, hash);
      },
      revokeOtherSessions: async (firmId: number, keep: string | undefined) => {
        h.sessions = h.sessions.filter((s) => s.firmId !== firmId || (keep !== undefined && s.token === keep));
      },
      recordAudit: async (firmId: number, action: string) => {
        h.audits.push({ firmId, action });
      },
    }),
  };
});

import accountRouter from "./receptionistAccount.js";

const FIRM7_PASSWORD = "harbour-trellis-5521";
const FIRM8_PASSWORD = "meridian-basalt-9911";
const NEXT = "lantern-quartz-7734";

const app = express();
app.set("trust proxy", true); // lets each case present its own client address to the limiter
app.use(express.json());
app.use(cookieParser());
app.use((req, _res, next) => {
  (req as unknown as { log: Record<string, () => void> }).log = { error: () => {}, warn: () => {}, info: () => {} };
  next();
});
app.use("/api", accountRouter);

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
  h.hashes = new Map([
    [7, `hash:${FIRM7_PASSWORD}`],
    [8, `hash:${FIRM8_PASSWORD}`],
  ]);
  h.sessions = [
    { firmId: 7, token: "firm7-this-browser" },
    { firmId: 7, token: "firm7-old-laptop" },
    { firmId: 7, token: "firm7-phone" },
    { firmId: 8, token: "firm8-this-browser" },
  ];
  h.audits = [];
});

let nextIp = 0;
async function change(cookie: string | null, body: unknown, ip = `10.1.0.${++nextIp}`) {
  const res = await fetch(`${base}/api/receptionist/account/password/change`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": ip,
      ...(cookie === null ? {} : { Cookie: `receptionist_session=${cookie}` }),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text, json: (text ? JSON.parse(text) : {}) as Record<string, unknown> };
}

describe("POST /api/receptionist/account/password/change", () => {
  it("refuses a request with no session and touches nothing", async () => {
    const res = await change(null, { currentPassword: FIRM7_PASSWORD, newPassword: NEXT });
    expect(res.status).toBe(401);
    expect(h.hashes.get(7)).toBe(`hash:${FIRM7_PASSWORD}`);
    expect(h.sessions).toHaveLength(4);
  });

  it("changes the password, keeps this session, and signs every other session of the firm out", async () => {
    const res = await change("firm7-this-browser", { currentPassword: FIRM7_PASSWORD, newPassword: NEXT });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true, otherSessionsSignedOut: true });
    expect(h.hashes.get(7)).toBe(`hash:${NEXT}`);
    expect(h.sessions.filter((s) => s.firmId === 7).map((s) => s.token)).toEqual(["firm7-this-browser"]);
    // Another business is untouched.
    expect(h.sessions.filter((s) => s.firmId === 8)).toHaveLength(1);
    expect(h.hashes.get(8)).toBe(`hash:${FIRM8_PASSWORD}`);
    expect(h.audits).toEqual([{ firmId: 7, action: "password.changed" }]);
  });

  it("answers 401 with a reason for a wrong current password, and changes nothing", async () => {
    const res = await change("firm7-this-browser", { currentPassword: "not-the-password", newPassword: NEXT });
    expect(res.status).toBe(401);
    expect(res.json.reason).toBe("wrong_password");
    expect(typeof res.json.error).toBe("string");
    expect(h.hashes.get(7)).toBe(`hash:${FIRM7_PASSWORD}`);
    expect(h.sessions).toHaveLength(4);
  });

  it("answers 400 for a new password the reset path would also refuse", async () => {
    const res = await change("firm7-this-browser", { currentPassword: FIRM7_PASSWORD, newPassword: "short" });
    expect(res.status).toBe(400);
    expect(res.json.reason).toBe("weak_password");
    expect(h.hashes.get(7)).toBe(`hash:${FIRM7_PASSWORD}`);
  });

  it("a session only ever changes its own firm's password — the body cannot name another", async () => {
    const res = await change("firm8-this-browser", { currentPassword: FIRM8_PASSWORD, newPassword: NEXT, firmId: 7 });
    expect(res.status).toBe(200);
    expect(h.hashes.get(8)).toBe(`hash:${NEXT}`);
    expect(h.hashes.get(7)).toBe(`hash:${FIRM7_PASSWORD}`);
    expect(h.sessions.filter((s) => s.firmId === 7)).toHaveLength(3);
  });

  it("never echoes a password back, on success or refusal", async () => {
    const refused = await change("firm7-this-browser", { currentPassword: "guess-guess-guess", newPassword: NEXT });
    const ok = await change("firm7-this-browser", { currentPassword: FIRM7_PASSWORD, newPassword: NEXT });
    for (const res of [refused, ok]) {
      expect(res.text).not.toContain(NEXT);
      expect(res.text).not.toContain(FIRM7_PASSWORD);
      expect(res.text).not.toContain("guess-guess-guess");
    }
  });

  it("is rate limited, like the other password-checking account routes", async () => {
    const ip = "10.2.0.1";
    for (let i = 0; i < 10; i++) {
      expect((await change("firm7-this-browser", { currentPassword: `wrong-${i}-password`, newPassword: NEXT }, ip)).status).toBe(401);
    }
    const limitedRes = await change("firm7-this-browser", { currentPassword: FIRM7_PASSWORD, newPassword: NEXT }, ip);
    expect(limitedRes.status).toBe(429);
    expect(h.hashes.get(7)).toBe(`hash:${FIRM7_PASSWORD}`);
  });
});
