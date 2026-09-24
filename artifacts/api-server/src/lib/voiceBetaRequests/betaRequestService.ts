// V5 PR-4: public beta-access request storage (lib/db/src/schema/voice/voiceBetaRequests.ts).

import { desc, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { voiceBetaRequests, BETA_REQUEST_STATUSES, type BetaRequestStatus, type VoiceBetaRequest } from "@workspace/db/schema/voice";

export interface CreateBetaRequestInput {
  name: string;
  businessName: string;
  workEmail: string;
  phone?: string | null;
  message?: string | null;
  source: string;
}

export async function createBetaRequest(input: CreateBetaRequestInput): Promise<VoiceBetaRequest> {
  const [row] = await db
    .insert(voiceBetaRequests)
    .values({
      name: input.name,
      businessName: input.businessName,
      workEmail: input.workEmail.toLowerCase(),
      phone: input.phone ?? null,
      message: input.message ?? null,
      source: input.source,
    })
    .returning();
  if (!row) throw new Error("beta request insert returned no row");
  return row;
}

export async function listBetaRequests(): Promise<VoiceBetaRequest[]> {
  return db.select().from(voiceBetaRequests).orderBy(desc(voiceBetaRequests.createdAt)).limit(500);
}

export type UpdateStatusResult = { ok: true; row: VoiceBetaRequest } | { ok: false; reason: "invalid_status" | "not_found" };

export async function updateBetaRequestStatus(id: number, status: unknown): Promise<UpdateStatusResult> {
  if (typeof status !== "string" || !(BETA_REQUEST_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, reason: "invalid_status" };
  }
  const [row] = await db
    .update(voiceBetaRequests)
    .set({ status: status as BetaRequestStatus, updatedAt: new Date() })
    .where(eq(voiceBetaRequests.id, id))
    .returning();
  return row ? { ok: true, row } : { ok: false, reason: "not_found" };
}
