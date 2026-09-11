// ── M1: staff identity, authentication and administration ───────────────────
//
// Every route here is either an unauthenticated credential exchange (login,
// activation, reset) or gated by `requireStaff(...)`, which enforces the
// session, CSRF, the MFA challenge, and the specific permission.
//
// Responses are deliberately uninformative about account existence: login,
// reset requests, and token validation all answer the same way whether or not
// the address is known, so this surface cannot be used to enumerate staff.

import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import {
  db, crmStaff, crmStaffSessions, crmStaffTokens,
  type CrmStaff,
} from "@workspace/db";
import { verifyAdminPassword } from "../lib/adminPassword.js";
import {
  hashPassword, verifyPassword, refusePassword, generateToken, hashToken,
  generateTotpSecret, verifyTotp, totpEnrolmentUri,
  generateRecoveryCodes, hashRecoveryCodes, findRecoveryCodeIndex,
} from "../lib/staffCredentials.js";
import {
  PERMISSIONS, effectivePermissions, refuseRoleChange, refuseStatusChange,
  type Permission,
} from "../lib/staffPermissions.js";
import {
  STAFF_COOKIE_NAME, staffCookieOptions, requireStaff, resolveStaffSession,
  createStaffSession, revokeStaffSessionByToken, revokeStaffSessionById,
  revokeAllStaffSessions, recordStaffAudit, deriveClientIp,
  recordLoginAttempt, isThrottled, clearLoginAttempts, pruneLoginAttempts,
} from "../lib/staffAuth.js";

const router: IRouter = Router();

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days to accept an invitation
const RESET_TTL_MS = 60 * 60 * 1000;             // 1 hour to use a reset link

/** Never leaks which half of the credential was wrong. */
const GENERIC_LOGIN_FAILURE = "That email address and password do not match.";

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

/** The shape the browser may see. Never includes hashes, secrets, or tokens. */
function publicStaff(staff: CrmStaff) {
  return {
    id: staff.id,
    email: staff.email,
    displayName: staff.displayName,
    role: staff.role,
    status: staff.status,
    mfaEnrolled: !!staff.mfaEnrolledAt,
    lastLoginAt: staff.lastLoginAt,
    createdAt: staff.createdAt,
    legacyNames: staff.legacyNames,
    extraPermissions: staff.extraPermissions,
    revokedPermissions: staff.revokedPermissions,
    permissions: [...effectivePermissions(staff)],
  };
}

async function activeOwnerCount(): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(crmStaff)
    .where(and(eq(crmStaff.role, "owner"), eq(crmStaff.status, "active")));
  return Number(row?.count ?? 0);
}

async function issueToken(
  staffId: number, kind: "invite" | "password_reset", ttlMs: number, createdByStaffId: number | null,
): Promise<string> {
  // Issuing a new token of this kind invalidates any outstanding one, so a
  // resent invitation cannot be replayed from the older link.
  await db.update(crmStaffTokens)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(crmStaffTokens.staffId, staffId),
      eq(crmStaffTokens.kind, kind),
      isNull(crmStaffTokens.consumedAt),
      isNull(crmStaffTokens.revokedAt),
    ));
  const raw = generateToken();
  await db.insert(crmStaffTokens).values({
    staffId, kind,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + ttlMs),
    createdByStaffId,
  });
  return raw;
}

/** Resolves a raw activation/reset token to its staff row, or undefined. */
async function consumeableToken(raw: unknown, kind: "invite" | "password_reset") {
  if (typeof raw !== "string" || raw.length === 0) return undefined;
  const [row] = await db
    .select({ token: crmStaffTokens, staff: crmStaff })
    .from(crmStaffTokens)
    .innerJoin(crmStaff, eq(crmStaffTokens.staffId, crmStaff.id))
    .where(and(
      eq(crmStaffTokens.tokenHash, hashToken(raw)),
      eq(crmStaffTokens.kind, kind),
      isNull(crmStaffTokens.consumedAt),
      isNull(crmStaffTokens.revokedAt),
      sql`${crmStaffTokens.expiresAt} > now()`,
    ))
    .limit(1);
  if (!row) return undefined;
  if (row.staff.status === "disabled") return undefined;
  return row;
}

// ── Bootstrap: create the first owner ───────────────────────────────────────
//
// The cutover problem: staff accounts cannot be created from inside the CRM
// until somebody can sign in, and nobody can sign in until an account exists.
// This route breaks the cycle exactly once, using the deployment's existing
// ADMIN_PASSWORD secret, and refuses as soon as any staff row exists. The
// owner's email is supplied by the operator — never guessed.

router.get("/crm/staff/bootstrap-state", async (_req: Request, res: Response) => {
  try {
    const [row] = await db.select({ count: sql<number>`count(*)` }).from(crmStaff);
    res.json({ staffCount: Number(row?.count ?? 0) });
  } catch {
    res.status(503).json({ error: "Staff storage is unavailable." });
  }
});

router.post("/crm/staff/bootstrap", async (req: Request, res: Response) => {
  const ip = deriveClientIp(req);
  if (await isThrottled("ip", ip)) {
    res.status(429).json({ error: "Too many attempts. Try again later." });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const email = normalizeEmail(body["email"]);
  const displayName = typeof body["displayName"] === "string" ? body["displayName"].trim() : "";
  const password = typeof body["password"] === "string" ? body["password"] : "";

  const [countRow] = await db.select({ count: sql<number>`count(*)` }).from(crmStaff);
  if (Number(countRow?.count ?? 0) > 0) {
    res.status(409).json({ error: "Staff accounts already exist. Sign in instead." });
    return;
  }

  const verdict = verifyAdminPassword(body["adminPassword"], process.env);
  if (verdict === "unconfigured") {
    res.status(503).json({ error: "Admin authentication is not configured on this server." });
    return;
  }
  if (verdict === "mismatch") {
    await recordLoginAttempt("ip", ip);
    res.status(401).json({ error: "That admin password is not correct." });
    return;
  }
  if (!looksLikeEmail(email)) { res.status(400).json({ error: "Enter a valid email address." }); return; }
  if (displayName.length < 2) { res.status(400).json({ error: "Enter the person's display name." }); return; }
  const weak = refusePassword(password);
  if (weak) { res.status(400).json({ error: weak }); return; }

  const [created] = await db.insert(crmStaff).values({
    email, displayName, role: "owner", status: "active",
    passwordHash: await hashPassword(password),
    passwordUpdatedAt: new Date(),
  }).returning();

  await recordStaffAudit({
    actorStaffId: created.id, actorLabel: created.email,
    action: "staff.bootstrap", target: `staff:${created.id}`, ip,
  });
  res.status(201).json({ staff: publicStaff(created) });
});

// ── Login ───────────────────────────────────────────────────────────────────

router.post("/crm/staff/login", async (req: Request, res: Response) => {
  const ip = deriveClientIp(req);
  const body = req.body as Record<string, unknown>;
  const email = normalizeEmail(body["email"]);
  const password = typeof body["password"] === "string" ? body["password"] : "";

  if (await isThrottled("ip", ip) || (email && await isThrottled("account", email))) {
    res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
    return;
  }

  const [staff] = email
    ? await db.select().from(crmStaff).where(eq(crmStaff.email, email)).limit(1)
    : [];

  const ok = staff?.status === "active" && await verifyPassword(password, staff.passwordHash);
  if (!ok) {
    await recordLoginAttempt("ip", ip);
    if (email) await recordLoginAttempt("account", email);
    res.status(401).json({ error: GENERIC_LOGIN_FAILURE });
    return;
  }

  const uaHeader = req.headers["user-agent"];
  const userAgent = Array.isArray(uaHeader) ? uaHeader[0] : uaHeader;
  const mfaRequired = !!staff.mfaEnrolledAt;

  const session = await createStaffSession({
    staff, ip, userAgent, mfaSatisfied: !mfaRequired,
  });
  res.cookie(STAFF_COOKIE_NAME, session.token, staffCookieOptions());

  await clearLoginAttempts("account", email);
  void pruneLoginAttempts();
  await recordStaffAudit({
    actorStaffId: staff.id, actorLabel: staff.email,
    action: mfaRequired ? "staff.login.password_ok" : "staff.login", target: `session:${session.sessionId}`, ip,
  });

  if (mfaRequired) {
    // The cookie exists but the session cannot reach CRM data until the
    // challenge is satisfied — requireStaff enforces that.
    res.json({ mfaRequired: true, csrfToken: session.csrfToken });
    return;
  }
  await db.update(crmStaff).set({ lastLoginAt: new Date() }).where(eq(crmStaff.id, staff.id));
  res.json({ staff: publicStaff(staff), csrfToken: session.csrfToken, mfaRequired: false });
});

router.post("/crm/staff/login/mfa", async (req: Request, res: Response) => {
  const ip = deriveClientIp(req);
  const resolved = await resolveStaffSession(req);
  if (!resolved) { res.status(401).json({ error: "Not signed in." }); return; }
  if (await isThrottled("account", resolved.staff.email)) {
    res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const code = typeof body["code"] === "string" ? body["code"] : "";
  const staff = resolved.staff;

  let satisfied = verifyTotp(staff.mfaSecret, code);
  let usedRecovery = false;

  if (!satisfied && staff.mfaRecoveryHashes.length > 0) {
    const idx = findRecoveryCodeIndex(code, staff.mfaRecoveryHashes);
    if (idx >= 0) {
      satisfied = true;
      usedRecovery = true;
      // Consume exactly that code so it cannot be replayed.
      const remaining = staff.mfaRecoveryHashes.filter((_, i) => i !== idx);
      await db.update(crmStaff).set({ mfaRecoveryHashes: remaining }).where(eq(crmStaff.id, staff.id));
    }
  }

  if (!satisfied) {
    await recordLoginAttempt("account", staff.email);
    await recordStaffAudit({
      actorStaffId: staff.id, actorLabel: staff.email, action: "staff.mfa.failed", ip,
    });
    res.status(401).json({ error: "That code is not valid." });
    return;
  }

  await db.update(crmStaffSessions).set({ mfaSatisfied: true }).where(eq(crmStaffSessions.id, resolved.sessionId));
  await db.update(crmStaff).set({ lastLoginAt: new Date() }).where(eq(crmStaff.id, staff.id));
  await clearLoginAttempts("account", staff.email);
  await recordStaffAudit({
    actorStaffId: staff.id, actorLabel: staff.email,
    action: usedRecovery ? "staff.mfa.recovery_used" : "staff.mfa.ok", ip,
  });
  res.json({ staff: publicStaff(staff), recoveryCodesRemaining: staff.mfaRecoveryHashes.length - (usedRecovery ? 1 : 0) });
});

router.post("/crm/staff/logout", requireStaff(), async (req: Request, res: Response) => {
  const cookies = req.cookies as Record<string, string | undefined> | undefined;
  const raw = cookies?.[STAFF_COOKIE_NAME];
  if (raw) await revokeStaffSessionByToken(raw);
  res.clearCookie(STAFF_COOKIE_NAME, { ...staffCookieOptions(), maxAge: undefined });
  await recordStaffAudit({
    actorStaffId: req.staffAuth!.staff.id, actorLabel: req.staffAuth!.staff.email,
    action: "staff.logout", ip: deriveClientIp(req),
  });
  res.json({ ok: true });
});

// ── The signed-in person ────────────────────────────────────────────────────

router.get("/crm/staff/me", requireStaff(), (req: Request, res: Response) => {
  res.json({ staff: publicStaff(req.staffAuth!.staff) });
});

router.patch("/crm/staff/me", requireStaff(), async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const displayName = typeof body["displayName"] === "string" ? body["displayName"].trim() : undefined;
  if (displayName !== undefined && displayName.length < 2) {
    res.status(400).json({ error: "Display name must be at least 2 characters." });
    return;
  }
  const [updated] = await db.update(crmStaff)
    .set({ ...(displayName !== undefined ? { displayName } : {}), updatedAt: new Date() })
    .where(eq(crmStaff.id, req.staffAuth!.staff.id))
    .returning();
  res.json({ staff: publicStaff(updated) });
});

router.post("/crm/staff/me/password", requireStaff(), async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const current = typeof body["currentPassword"] === "string" ? body["currentPassword"] : "";
  const next = typeof body["newPassword"] === "string" ? body["newPassword"] : "";
  const staff = req.staffAuth!.staff;

  if (!await verifyPassword(current, staff.passwordHash)) {
    res.status(401).json({ error: "Your current password is not correct." });
    return;
  }
  const weak = refusePassword(next);
  if (weak) { res.status(400).json({ error: weak }); return; }

  await db.update(crmStaff)
    .set({ passwordHash: await hashPassword(next), passwordUpdatedAt: new Date(), updatedAt: new Date() })
    .where(eq(crmStaff.id, staff.id));
  // Rotate: every existing session dies, including this one.
  await revokeAllStaffSessions(staff.id);
  res.clearCookie(STAFF_COOKIE_NAME, { ...staffCookieOptions(), maxAge: undefined });
  await recordStaffAudit({
    actorStaffId: staff.id, actorLabel: staff.email, action: "staff.password.changed", ip: deriveClientIp(req),
  });
  res.json({ ok: true, signedOut: true });
});

// ── Sessions the signed-in person holds ─────────────────────────────────────

router.get("/crm/staff/me/sessions", requireStaff(), async (req: Request, res: Response) => {
  const rows = await db.select({
    id: crmStaffSessions.id,
    createdAt: crmStaffSessions.createdAt,
    lastSeenAt: crmStaffSessions.lastSeenAt,
    expiresAt: crmStaffSessions.expiresAt,
    ip: crmStaffSessions.ip,
    userAgent: crmStaffSessions.userAgent,
    revokedAt: crmStaffSessions.revokedAt,
  })
    .from(crmStaffSessions)
    .where(and(
      eq(crmStaffSessions.staffId, req.staffAuth!.staff.id),
      eq(crmStaffSessions.epoch, req.staffAuth!.staff.sessionEpoch),
    ))
    .orderBy(desc(crmStaffSessions.lastSeenAt))
    .limit(50);
  res.json({ sessions: rows, currentSessionId: req.staffAuth!.sessionId });
});

router.delete("/crm/staff/me/sessions/:id", requireStaff(), async (req: Request, res: Response) => {
  const id = Number(req.params["id"]);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid session id." }); return; }
  const ok = await revokeStaffSessionById(id, req.staffAuth!.staff.id);
  if (!ok) { res.status(404).json({ error: "Session not found." }); return; }
  await recordStaffAudit({
    actorStaffId: req.staffAuth!.staff.id, actorLabel: req.staffAuth!.staff.email,
    action: "staff.session.revoked", target: `session:${id}`, ip: deriveClientIp(req),
  });
  res.json({ ok: true });
});

router.post("/crm/staff/me/sessions/revoke-all", requireStaff(), async (req: Request, res: Response) => {
  await revokeAllStaffSessions(req.staffAuth!.staff.id);
  res.clearCookie(STAFF_COOKIE_NAME, { ...staffCookieOptions(), maxAge: undefined });
  await recordStaffAudit({
    actorStaffId: req.staffAuth!.staff.id, actorLabel: req.staffAuth!.staff.email,
    action: "staff.session.revoked_all", ip: deriveClientIp(req),
  });
  res.json({ ok: true, signedOut: true });
});

// ── MFA enrolment ───────────────────────────────────────────────────────────

router.post("/crm/staff/me/mfa/start", requireStaff(), async (req: Request, res: Response) => {
  const staff = req.staffAuth!.staff;
  if (staff.mfaEnrolledAt) {
    res.status(409).json({ error: "Multi-factor authentication is already enabled." });
    return;
  }
  const secret = generateTotpSecret();
  // Stored but NOT active: mfaEnrolledAt stays null until a code is confirmed,
  // so a half-finished enrolment can never lock anybody out.
  await db.update(crmStaff).set({ mfaSecret: secret, updatedAt: new Date() }).where(eq(crmStaff.id, staff.id));
  res.json({ secret, otpauthUri: totpEnrolmentUri(secret, staff.email) });
});

router.post("/crm/staff/me/mfa/confirm", requireStaff(), async (req: Request, res: Response) => {
  const staff = req.staffAuth!.staff;
  const body = req.body as Record<string, unknown>;
  const code = typeof body["code"] === "string" ? body["code"] : "";
  if (staff.mfaEnrolledAt) { res.status(409).json({ error: "Already enabled." }); return; }
  if (!staff.mfaSecret) { res.status(400).json({ error: "Start enrolment first." }); return; }
  if (!verifyTotp(staff.mfaSecret, code)) {
    res.status(400).json({ error: "That code is not valid. Check your authenticator app's clock." });
    return;
  }
  const recoveryCodes = generateRecoveryCodes();
  await db.update(crmStaff).set({
    mfaEnrolledAt: new Date(),
    mfaRecoveryHashes: hashRecoveryCodes(recoveryCodes),
    updatedAt: new Date(),
  }).where(eq(crmStaff.id, staff.id));
  await db.update(crmStaffSessions).set({ mfaSatisfied: true }).where(eq(crmStaffSessions.id, req.staffAuth!.sessionId));
  await recordStaffAudit({
    actorStaffId: staff.id, actorLabel: staff.email, action: "staff.mfa.enrolled", ip: deriveClientIp(req),
  });
  // Shown exactly once — only hashes are kept.
  res.json({ recoveryCodes });
});

router.post("/crm/staff/me/mfa/disable", requireStaff(), async (req: Request, res: Response) => {
  const staff = req.staffAuth!.staff;
  const body = req.body as Record<string, unknown>;
  const password = typeof body["password"] === "string" ? body["password"] : "";
  if (!await verifyPassword(password, staff.passwordHash)) {
    res.status(401).json({ error: "Your password is not correct." });
    return;
  }
  await db.update(crmStaff).set({
    mfaSecret: null, mfaEnrolledAt: null, mfaRecoveryHashes: [], updatedAt: new Date(),
  }).where(eq(crmStaff.id, staff.id));
  await revokeAllStaffSessions(staff.id);
  res.clearCookie(STAFF_COOKIE_NAME, { ...staffCookieOptions(), maxAge: undefined });
  await recordStaffAudit({
    actorStaffId: staff.id, actorLabel: staff.email, action: "staff.mfa.disabled", ip: deriveClientIp(req),
  });
  res.json({ ok: true, signedOut: true });
});

// ── Administering people ────────────────────────────────────────────────────

router.get("/crm/staff", requireStaff("staff.read"), async (_req: Request, res: Response) => {
  const rows = await db.select().from(crmStaff).orderBy(asc(crmStaff.displayName));
  res.json({ staff: rows.map(publicStaff), permissionCatalog: PERMISSIONS });
});

router.post("/crm/staff", requireStaff("staff.invite"), async (req: Request, res: Response) => {
  const actor = req.staffAuth!.staff;
  const body = req.body as Record<string, unknown>;
  const email = normalizeEmail(body["email"]);
  const displayName = typeof body["displayName"] === "string" ? body["displayName"].trim() : "";
  const role = typeof body["role"] === "string" ? body["role"] : "operations_manager";

  if (!looksLikeEmail(email)) { res.status(400).json({ error: "Enter a valid email address." }); return; }
  if (displayName.length < 2) { res.status(400).json({ error: "Enter a display name." }); return; }
  if (!["owner", "technical_admin", "operations_manager"].includes(role)) {
    res.status(400).json({ error: "Unknown role." }); return;
  }
  // Only somebody who may assign roles may mint an account at a role above
  // operations — otherwise `staff.invite` alone would be an escalation path.
  if (role !== "operations_manager" && !req.staffAuth!.permissions.has("staff.role.assign")) {
    res.status(403).json({ error: "You may only invite operations managers." });
    return;
  }

  const [existing] = await db.select().from(crmStaff).where(eq(crmStaff.email, email)).limit(1);
  if (existing) { res.status(409).json({ error: "Someone with that email already exists." }); return; }

  const [created] = await db.insert(crmStaff).values({
    email, displayName, role, status: "invited", createdByStaffId: actor.id,
  }).returning();
  const token = await issueToken(created.id, "invite", INVITE_TTL_MS, actor.id);

  await recordStaffAudit({
    actorStaffId: actor.id, actorLabel: actor.email,
    action: "staff.invited", target: `staff:${created.id} role:${role}`, ip: deriveClientIp(req),
  });
  // Staff email delivery is not configured; the link is returned to the
  // inviter to pass on out of band rather than pretending a mail was sent.
  res.status(201).json({
    staff: publicStaff(created),
    activationToken: token,
    expiresInHours: Math.round(INVITE_TTL_MS / 3_600_000),
    delivery: "manual",
  });
});

router.post("/crm/staff/:id/invite", requireStaff("staff.invite"), async (req: Request, res: Response) => {
  const id = Number(req.params["id"]);
  const actor = req.staffAuth!.staff;
  const [staff] = await db.select().from(crmStaff).where(eq(crmStaff.id, id)).limit(1);
  if (!staff) { res.status(404).json({ error: "Not found." }); return; }
  if (staff.status === "disabled") { res.status(409).json({ error: "Reactivate the account first." }); return; }
  const token = await issueToken(staff.id, "invite", INVITE_TTL_MS, actor.id);
  await recordStaffAudit({
    actorStaffId: actor.id, actorLabel: actor.email,
    action: "staff.invite.resent", target: `staff:${staff.id}`, ip: deriveClientIp(req),
  });
  res.json({ activationToken: token, expiresInHours: Math.round(INVITE_TTL_MS / 3_600_000), delivery: "manual" });
});

router.patch("/crm/staff/:id", requireStaff("staff.read"), async (req: Request, res: Response) => {
  const id = Number(req.params["id"]);
  const actor = req.staffAuth!.staff;
  const body = req.body as Record<string, unknown>;

  const [target] = await db.select().from(crmStaff).where(eq(crmStaff.id, id)).limit(1);
  if (!target) { res.status(404).json({ error: "Not found." }); return; }

  const updates: Partial<typeof crmStaff.$inferInsert> = { updatedAt: new Date() };
  let epochBump = false;

  if (typeof body["displayName"] === "string") {
    const name = body["displayName"].trim();
    if (name.length < 2) { res.status(400).json({ error: "Display name is too short." }); return; }
    // Editing somebody else's name is an administrative act.
    if (target.id !== actor.id && !req.staffAuth!.permissions.has("staff.role.assign")) {
      res.status(403).json({ error: "You may not rename other people." }); return;
    }
    updates.displayName = name;
  }

  if (typeof body["role"] === "string" && body["role"] !== target.role) {
    const refusal = refuseRoleChange({
      actor: { ...actor, id: actor.id }, targetId: target.id,
      targetCurrentRole: target.role, nextRole: body["role"],
      activeOwnerCount: await activeOwnerCount(),
    });
    if (refusal) { res.status(403).json({ error: refusal }); return; }
    updates.role = body["role"];
    epochBump = true;
  }

  if (typeof body["status"] === "string" && body["status"] !== target.status) {
    const refusal = refuseStatusChange({
      actor: { ...actor, id: actor.id }, targetId: target.id,
      targetCurrentRole: target.role, nextStatus: body["status"],
      activeOwnerCount: await activeOwnerCount(),
    });
    if (refusal) { res.status(403).json({ error: refusal }); return; }
    updates.status = body["status"];
    updates.disabledAt = body["status"] === "disabled" ? new Date() : null;
    epochBump = true;
  }

  for (const field of ["extraPermissions", "revokedPermissions"] as const) {
    if (!Array.isArray(body[field])) continue;
    if (!req.staffAuth!.permissions.has("staff.role.assign")) {
      res.status(403).json({ error: "You may not change permission grants." }); return;
    }
    if (target.id === actor.id) {
      res.status(403).json({ error: "You cannot change your own permissions." }); return;
    }
    const values = (body[field] as unknown[])
      .filter((p): p is string => typeof p === "string")
      .filter((p) => (PERMISSIONS as readonly string[]).includes(p));
    updates[field] = values as Permission[];
    epochBump = true;
  }

  const [updated] = await db.update(crmStaff).set(updates).where(eq(crmStaff.id, id)).returning();
  if (epochBump) await revokeAllStaffSessions(id);

  await recordStaffAudit({
    actorStaffId: actor.id, actorLabel: actor.email,
    action: "staff.updated",
    target: `staff:${id} ${Object.keys(updates).filter((k) => k !== "updatedAt").join(",")}`,
    ip: deriveClientIp(req),
  });
  res.json({ staff: publicStaff(updated), sessionsRevoked: epochBump });
});

router.post("/crm/staff/:id/password-reset", requireStaff("staff.role.assign"), async (req: Request, res: Response) => {
  const id = Number(req.params["id"]);
  const actor = req.staffAuth!.staff;
  const [staff] = await db.select().from(crmStaff).where(eq(crmStaff.id, id)).limit(1);
  if (!staff) { res.status(404).json({ error: "Not found." }); return; }
  const token = await issueToken(staff.id, "password_reset", RESET_TTL_MS, actor.id);
  await recordStaffAudit({
    actorStaffId: actor.id, actorLabel: actor.email,
    action: "staff.reset.issued", target: `staff:${staff.id}`, ip: deriveClientIp(req),
  });
  res.json({ resetToken: token, expiresInMinutes: Math.round(RESET_TTL_MS / 60_000), delivery: "manual" });
});

// ── Activation and reset (unauthenticated, token-bearing) ───────────────────

router.get("/crm/staff/activation", async (req: Request, res: Response) => {
  const kind = req.query["kind"] === "password_reset" ? "password_reset" : "invite";
  const row = await consumeableToken(req.query["token"], kind);
  if (!row) { res.status(404).json({ error: "This link is invalid or has expired." }); return; }
  res.json({ email: row.staff.email, displayName: row.staff.displayName, kind });
});

/** Shared by invitation acceptance and password reset — both set a password once. */
async function completeTokenPasswordSet(req: Request, res: Response, kind: "invite" | "password_reset") {
  const ip = deriveClientIp(req);
  if (await isThrottled("ip", ip)) {
    res.status(429).json({ error: "Too many attempts. Try again later." }); return;
  }
  const body = req.body as Record<string, unknown>;
  const password = typeof body["password"] === "string" ? body["password"] : "";

  const row = await consumeableToken(body["token"], kind);
  if (!row) {
    await recordLoginAttempt("ip", ip);
    res.status(404).json({ error: "This link is invalid or has expired." });
    return;
  }
  const weak = refusePassword(password);
  if (weak) { res.status(400).json({ error: weak }); return; }

  // Consume first: a token is single-use even if a later step fails.
  const consumed = await db.update(crmStaffTokens)
    .set({ consumedAt: new Date() })
    .where(and(eq(crmStaffTokens.id, row.token.id), isNull(crmStaffTokens.consumedAt)))
    .returning({ id: crmStaffTokens.id });
  if (consumed.length === 0) {
    res.status(404).json({ error: "This link has already been used." });
    return;
  }

  await db.update(crmStaff).set({
    passwordHash: await hashPassword(password),
    passwordUpdatedAt: new Date(),
    status: "active",
    updatedAt: new Date(),
  }).where(eq(crmStaff.id, row.staff.id));
  // Any session issued before the credential changed is now dead.
  await revokeAllStaffSessions(row.staff.id);

  await recordStaffAudit({
    actorStaffId: row.staff.id, actorLabel: row.staff.email,
    action: kind === "invite" ? "staff.activated" : "staff.password.reset", ip,
  });
  res.json({ ok: true, email: row.staff.email });
}

router.post("/crm/staff/activation", (req, res) => completeTokenPasswordSet(req, res, "invite"));
router.post("/crm/staff/password-reset", (req, res) => completeTokenPasswordSet(req, res, "password_reset"));

/**
 * Break-glass recovery, authenticated by the deployment's ADMIN_PASSWORD.
 *
 * Deliberately NOT a self-service "email me a reset link" route: staff email
 * delivery is not configured, so such a route would store a token nobody could
 * receive while handing an unauthenticated writer to the internet. This is the
 * documented way back in when the last owner is locked out — it proves
 * possession of a server secret, and every use is audited.
 */
router.post("/crm/staff/recovery", async (req: Request, res: Response) => {
  const ip = deriveClientIp(req);
  if (await isThrottled("ip", ip)) {
    res.status(429).json({ error: "Too many attempts. Try again later." });
    return;
  }
  const body = req.body as Record<string, unknown>;
  const verdict = verifyAdminPassword(body["adminPassword"], process.env);
  if (verdict === "unconfigured") {
    res.status(503).json({ error: "Recovery is unavailable: ADMIN_PASSWORD is not configured." });
    return;
  }
  if (verdict === "mismatch") {
    await recordLoginAttempt("ip", ip);
    res.status(401).json({ error: "That admin password is not correct." });
    return;
  }

  const email = normalizeEmail(body["email"]);
  const [staff] = looksLikeEmail(email)
    ? await db.select().from(crmStaff).where(eq(crmStaff.email, email)).limit(1)
    : [];
  if (!staff || staff.status === "disabled") {
    res.status(404).json({ error: "No active staff account with that address." });
    return;
  }

  const token = await issueToken(staff.id, "password_reset", RESET_TTL_MS, null);
  await recordStaffAudit({
    actorStaffId: staff.id, actorLabel: staff.email,
    action: "staff.recovery.issued", target: `staff:${staff.id}`, ip,
  });
  res.json({ resetToken: token, expiresInMinutes: Math.round(RESET_TTL_MS / 60_000) });
});

// ── Audit trail ─────────────────────────────────────────────────────────────

router.get("/crm/staff/audit", requireStaff("security.audit.read"), async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query["limit"]) || 100, 500);
  const { crmAdminAuditLog } = await import("@workspace/db");
  const rows = await db.select().from(crmAdminAuditLog)
    .orderBy(desc(crmAdminAuditLog.createdAt))
    .limit(limit);
  res.json({ entries: rows });
});

export default router;
