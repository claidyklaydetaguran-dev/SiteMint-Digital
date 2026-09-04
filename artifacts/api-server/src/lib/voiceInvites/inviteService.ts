// V5 S-1: invite-only signup codes (lib/db/src/schema/voice/voiceInvites.ts,
// migration 0007 — not yet applied; see MIGRATION-PACKET.md).
//
// Token discipline matches lib/accountSecurity/accountTokens.ts: only the
// sha256 HEX of the raw code is ever stored; the raw value is returned to
// the admin who created it EXACTLY ONCE and never logged. Redemption is a
// single guarded UPDATE (redeemed_at IS NULL AND expires_at > now()) so two
// concurrent redeemers of the same code cannot both win.

import crypto from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@workspace/db";
import { voiceInvites, type VoiceInvite } from "@workspace/db/schema/voice";

/** 14 days — long enough for an invited owner to get to signing up, short enough that a leaked code doesn't stay live indefinitely. */
export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function hashInviteCode(raw: string): string {
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

/** Human-typeable: 10 uppercase base32 characters, e.g. "K7QX9M2F3P". */
export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — avoids transcription errors
  const bytes = crypto.randomBytes(10);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export interface CreateInviteInput {
  email?: string | null;
  note?: string | null;
  createdBy: string;
}

export interface CreatedInvite {
  id: number;
  code: string;
  expiresAt: Date;
}

export async function createInvite(input: CreateInviteInput): Promise<CreatedInvite> {
  const now = new Date();
  const code = generateInviteCode();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_MS);
  const [row] = await db
    .insert(voiceInvites)
    .values({
      codeHash: hashInviteCode(code),
      email: input.email ? input.email.trim().toLowerCase() : null,
      note: input.note?.trim() || null,
      createdBy: input.createdBy,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: voiceInvites.id });
  if (!row) throw new Error("invite insert returned no row");
  return { id: row.id, code, expiresAt };
}

export type RedeemResult = { ok: true; inviteId: number } | { ok: false; reason: "invalid_or_expired" };

/**
 * Consumes a raw invite code in one guarded update (redeemed_at IS NULL AND
 * expires_at > now) — single-use, race-safe. `redeemedFirmId` is attached
 * SEPARATELY, after the firm row is created (see `attachInviteToFirm`),
 * because the firm cannot exist before the invite is proven valid AND
 * consumed: consuming first (rather than after firm creation) is what
 * makes it structurally impossible for two concurrent signups to both
 * complete against the same code, at the cost of an invite that stays
 * "burned" with no attached firm if firm creation subsequently fails (e.g.
 * a duplicate email) — an admin mints a fresh invite in that case.
 */
export async function consumeInviteCode(rawCode: unknown, now: Date = new Date()): Promise<RedeemResult> {
  if (typeof rawCode !== "string" || rawCode.trim().length < 6 || rawCode.trim().length > 64) {
    return { ok: false, reason: "invalid_or_expired" };
  }
  const codeHash = hashInviteCode(rawCode.trim().toUpperCase());
  const [row] = await db
    .update(voiceInvites)
    .set({ redeemedAt: now, updatedAt: now })
    .where(and(eq(voiceInvites.codeHash, codeHash), isNull(voiceInvites.redeemedAt), gt(voiceInvites.expiresAt, now)))
    .returning({ id: voiceInvites.id });
  return row ? { ok: true, inviteId: row.id } : { ok: false, reason: "invalid_or_expired" };
}

/** Records which firm an already-consumed invite produced. Best-effort audit link; the invite is already spent regardless of this call's outcome. */
export async function attachInviteToFirm(inviteId: number, firmId: number): Promise<void> {
  await db.update(voiceInvites).set({ redeemedFirmId: firmId, updatedAt: new Date() }).where(eq(voiceInvites.id, inviteId));
}

/** Read-only check (no redemption) — used to give the signup form an honest "this code is valid" signal before the account is created, if ever needed. Not currently wired to a route. */
export async function peekInvite(rawCode: unknown, now: Date = new Date()): Promise<VoiceInvite | undefined> {
  if (typeof rawCode !== "string" || rawCode.trim().length === 0) return undefined;
  const codeHash = hashInviteCode(rawCode.trim().toUpperCase());
  const [row] = await db
    .select()
    .from(voiceInvites)
    .where(and(eq(voiceInvites.codeHash, codeHash), isNull(voiceInvites.redeemedAt), gt(voiceInvites.expiresAt, now)))
    .limit(1);
  return row;
}

export interface InviteListItem {
  id: number;
  email: string | null;
  note: string | null;
  createdBy: string;
  expiresAt: string;
  redeemedAt: string | null;
  redeemedFirmId: number | null;
  createdAt: string;
}

export async function listInvites(): Promise<InviteListItem[]> {
  const rows = await db.select().from(voiceInvites).orderBy(desc(voiceInvites.createdAt)).limit(200);
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    note: r.note,
    createdBy: r.createdBy,
    expiresAt: r.expiresAt.toISOString(),
    redeemedAt: r.redeemedAt ? r.redeemedAt.toISOString() : null,
    redeemedFirmId: r.redeemedFirmId,
    createdAt: r.createdAt.toISOString(),
  }));
}
