// ── M3: documents, document requests, and controlled sharing ────────────────
//
// Files are private by default. Nothing is served from a public path, an
// unguessable URL is not treated as access control, and every download —
// staff or shared-link — is authorised and counted.
//
// What this deliberately does NOT do: call anything "signed". An uploaded PDF
// and an accepted proposal are both just files until a signing provider
// returns signer identity, a document version and an audit trail. That stays
// unavailable rather than being implied.

import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  db, crmAttachments, crmAttachmentBlobs, crmDocumentRequests, crmDocumentShares,
  crmLeads, crmProjects, crmDeals, crmStaff,
} from "@workspace/db";
import { requireCrmAuth, auditAction } from "../lib/staffAuth.js";
import { generateToken, hashToken } from "../lib/staffCredentials.js";

const router: IRouter = Router();

/** 25 MB. Large enough for contracts and decks, small enough to stay in Postgres. */
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Allowed types, by what the CRM actually handles. Everything else is refused
 * with a readable reason rather than stored and served back later.
 *
 * SVG is deliberately excluded: it is executable in a browser context, and a
 * document store that serves it invites stored XSS.
 */
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "text/plain", "text/csv", "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
]);

const ENTITY_TYPES = ["lead", "deal", "project", "ticket"] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

function actor(req: Request) {
  const s = req.staffAuth?.staff;
  return { id: s?.id ?? null, label: s?.displayName ?? s?.email ?? "admin" };
}

function isEntityType(v: unknown): v is EntityType {
  return typeof v === "string" && (ENTITY_TYPES as readonly string[]).includes(v);
}

/** Confirms the parent record exists, so a file cannot be orphaned on upload. */
async function entityExists(entityType: EntityType, entityId: number): Promise<boolean> {
  if (entityType === "lead") {
    const [r] = await db.select({ id: crmLeads.id }).from(crmLeads).where(eq(crmLeads.id, entityId)).limit(1);
    return !!r;
  }
  if (entityType === "project") {
    const [r] = await db.select({ id: crmProjects.id }).from(crmProjects).where(eq(crmProjects.id, entityId)).limit(1);
    return !!r;
  }
  if (entityType === "deal") {
    const [r] = await db.select({ id: crmDeals.id }).from(crmDeals).where(eq(crmDeals.id, entityId)).limit(1);
    return !!r;
  }
  return true; // tickets live in the helpdesk tables; presence is not enforced here yet
}

/** Metadata only — never the bytes. */
function publicAttachment(a: typeof crmAttachments.$inferSelect) {
  return {
    id: a.id, entityType: a.entityType, entityId: a.entityId,
    filename: a.filename, mimeType: a.mimeType, sizeBytes: a.sizeBytes,
    version: a.version, supersedesId: a.supersedesId,
    uploadedByLabel: a.uploadedByLabel, uploadedByStaffId: a.uploadedByStaffId,
    createdAt: a.createdAt,
    // Stated on every file, so nothing here can be mistaken for a signature.
    signatureStatus: "not_a_signature" as const,
  };
}

// ── Upload ──────────────────────────────────────────────────────────────────
//
// The body is base64 rather than multipart: the app already parses JSON, and
// adding a multipart parser would be a new dependency for no behavioural gain
// at this size limit. The 4/3 expansion is accounted for in the check.

router.post("/crm/documents", requireCrmAuth("documents.write"), async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const entityType = b["entityType"];
  const entityId = num(b["entityId"]);
  const filename = typeof b["filename"] === "string" ? b["filename"].trim() : "";
  const mimeType = typeof b["mimeType"] === "string" ? b["mimeType"].trim() : "";
  const base64 = typeof b["contentBase64"] === "string" ? b["contentBase64"] : "";

  if (!isEntityType(entityType) || !entityId) {
    res.status(400).json({ error: "Say which record this belongs to." }); return;
  }
  if (filename.length < 1 || filename.length > 255) {
    res.status(400).json({ error: "Give the file a name (1–255 characters)." }); return;
  }
  if (!ALLOWED_MIME.has(mimeType)) {
    res.status(415).json({
      error: `Files of type "${mimeType || "unknown"}" are not accepted.`,
      accepted: [...ALLOWED_MIME],
    });
    return;
  }
  if (!base64) { res.status(400).json({ error: "The file was empty." }); return; }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, "base64");
  } catch {
    res.status(400).json({ error: "The file content could not be read." }); return;
  }
  if (bytes.length === 0) { res.status(400).json({ error: "The file was empty." }); return; }
  if (bytes.length > MAX_BYTES) {
    res.status(413).json({
      error: `That file is ${(bytes.length / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_BYTES / 1024 / 1024} MB.`,
    });
    return;
  }
  if (!(await entityExists(entityType, entityId))) {
    res.status(404).json({ error: "That record does not exist." }); return;
  }

  const me = actor(req);
  const contentHash = crypto.createHash("sha256").update(bytes).digest("hex");

  // Versioning: re-uploading under the same name against the same record
  // supersedes the previous file rather than silently shadowing it.
  const [previous] = await db.select().from(crmAttachments).where(and(
    eq(crmAttachments.entityType, entityType),
    eq(crmAttachments.entityId, entityId),
    eq(crmAttachments.filename, filename),
    isNull(crmAttachments.deletedAt),
  )).orderBy(desc(crmAttachments.version)).limit(1);

  const [attachment] = await db.insert(crmAttachments).values({
    entityType, entityId, filename, mimeType,
    sizeBytes: bytes.length,
    // The blob table is the store; this records where, for a later adapter.
    storageKey: `db:crm_attachment_blobs`,
    contentHash,
    version: previous ? previous.version + 1 : 1,
    supersedesId: previous?.id ?? null,
    uploadedByStaffId: me.id,
    uploadedByLabel: me.label,
  }).returning();

  await db.insert(crmAttachmentBlobs).values({ attachmentId: attachment.id, bytes });

  // Satisfy an outstanding request for this record, oldest first.
  const requestId = num(b["documentRequestId"]);
  let satisfied: number | null = null;
  if (requestId) {
    const [updated] = await db.update(crmDocumentRequests).set({
      status: "received", receivedAt: new Date(),
      receivedAttachmentId: attachment.id, updatedAt: new Date(),
    }).where(and(
      eq(crmDocumentRequests.id, requestId),
      eq(crmDocumentRequests.status, "pending"),
    )).returning({ id: crmDocumentRequests.id });
    satisfied = updated?.id ?? null;
  }

  await auditAction(req, "document.uploaded",
    `attachment:${attachment.id} ${entityType}:${entityId} ${filename} v${attachment.version}`);

  res.status(201).json({
    attachment: publicAttachment(attachment),
    satisfiedRequestId: satisfied,
  });
});

// ── List ────────────────────────────────────────────────────────────────────

router.get("/crm/documents", requireCrmAuth("documents.read"), async (req: Request, res: Response) => {
  const entityType = req.query["entityType"];
  const entityId = num(req.query["entityId"]);
  if (!isEntityType(entityType) || !entityId) {
    res.status(400).json({ error: "Say which record to list." }); return;
  }
  const includeSuperseded = req.query["includeSuperseded"] === "true";

  const rows = await db.select().from(crmAttachments).where(and(
    eq(crmAttachments.entityType, entityType),
    eq(crmAttachments.entityId, entityId),
    isNull(crmAttachments.deletedAt),
  )).orderBy(desc(crmAttachments.createdAt));

  // By default show only the newest version of each filename.
  const superseded = new Set(rows.map((r) => r.supersedesId).filter((v): v is number => v != null));
  const visible = includeSuperseded ? rows : rows.filter((r) => !superseded.has(r.id));

  res.json({
    documents: visible.map(publicAttachment),
    supersededCount: rows.length - visible.length,
  });
});

// ── Download (staff, permission-checked) ────────────────────────────────────

router.get("/crm/documents/:id/download", requireCrmAuth("documents.read"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }

  const [attachment] = await db.select().from(crmAttachments)
    .where(and(eq(crmAttachments.id, id), isNull(crmAttachments.deletedAt))).limit(1);
  if (!attachment) { res.status(404).json({ error: "Not found." }); return; }

  const [blob] = await db.select().from(crmAttachmentBlobs)
    .where(eq(crmAttachmentBlobs.attachmentId, id)).limit(1);
  if (!blob) { res.status(404).json({ error: "The file content is missing." }); return; }

  await auditAction(req, "document.downloaded", `attachment:${id} ${attachment.filename}`);
  sendFile(res, attachment.filename, attachment.mimeType, blob.bytes);
});

/**
 * Always an attachment, never inline. Serving user-uploaded bytes inline lets
 * a crafted file execute in this origin; `Content-Disposition: attachment`
 * plus `nosniff` keeps the browser from being clever about it.
 */
function sendFile(res: Response, filename: string, mimeType: string, bytes: Buffer): void {
  const safe = filename.replace(/[^\w. -]/g, "_");
  res.setHeader("Content-Type", mimeType);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("Content-Disposition", `attachment; filename="${safe}"`);
  res.setHeader("Content-Length", String(bytes.length));
  res.end(bytes);
}

router.delete("/crm/documents/:id", requireCrmAuth("documents.delete"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  // Soft delete: the metadata row stays so history and request links survive.
  const [deleted] = await db.update(crmAttachments)
    .set({ deletedAt: new Date() })
    .where(and(eq(crmAttachments.id, id), isNull(crmAttachments.deletedAt)))
    .returning();
  if (!deleted) { res.status(404).json({ error: "Not found." }); return; }
  await db.delete(crmAttachmentBlobs).where(eq(crmAttachmentBlobs.attachmentId, id));
  await db.update(crmDocumentShares).set({ revokedAt: new Date() })
    .where(and(eq(crmDocumentShares.attachmentId, id), isNull(crmDocumentShares.revokedAt)));
  await auditAction(req, "document.deleted", `attachment:${id} ${deleted.filename}`);
  res.json({ ok: true });
});

// ── Document requests ───────────────────────────────────────────────────────

router.get("/crm/document-requests", requireCrmAuth("documents.read"), async (req: Request, res: Response) => {
  const entityType = req.query["entityType"];
  const entityId = num(req.query["entityId"]);
  const status = typeof req.query["status"] === "string" ? req.query["status"] : undefined;

  const where = [
    ...(isEntityType(entityType) && entityId
      ? [eq(crmDocumentRequests.entityType, entityType), eq(crmDocumentRequests.entityId, entityId)]
      : []),
    ...(status ? [eq(crmDocumentRequests.status, status)] : []),
  ];

  const rows = await db.select().from(crmDocumentRequests)
    .where(where.length ? and(...where) : undefined)
    .orderBy(asc(crmDocumentRequests.dueDate), desc(crmDocumentRequests.requestedAt))
    .limit(200);

  // Resolve owners and the parent record's name in one pass each.
  const staffIds = [...new Set(rows.map((r) => r.ownerStaffId).filter((v): v is number => v != null))];
  const leadIds = [...new Set(rows.filter((r) => r.entityType === "lead").map((r) => r.entityId))];
  const projectIds = [...new Set(rows.filter((r) => r.entityType === "project").map((r) => r.entityId))];
  const [people, leads, projects] = await Promise.all([
    staffIds.length ? db.select({ id: crmStaff.id, displayName: crmStaff.displayName })
      .from(crmStaff).where(inArray(crmStaff.id, staffIds)) : [],
    leadIds.length ? db.select({ id: crmLeads.id, name: crmLeads.name, company: crmLeads.company })
      .from(crmLeads).where(inArray(crmLeads.id, leadIds)) : [],
    projectIds.length ? db.select({ id: crmProjects.id, name: crmProjects.name })
      .from(crmProjects).where(inArray(crmProjects.id, projectIds)) : [],
  ]);
  const peopleMap = new Map(people.map((p) => [p.id, p.displayName]));
  const leadMap = new Map(leads.map((l) => [l.id, l]));
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  res.json({
    requests: rows.map((r) => ({
      ...r,
      ownerName: r.ownerStaffId ? peopleMap.get(r.ownerStaffId) ?? null : null,
      // Name whatever the request hangs off. Without this a project request
      // reads as "project #37" on screen, which tells the reader nothing and
      // makes them go and look it up.
      subject: r.entityType === "lead" ? leadMap.get(r.entityId) ?? null
        : r.entityType === "project" ? projectMap.get(r.entityId) ?? null
        : null,
      subjectHref: r.entityType === "lead" ? `/admin/crm/leads/${r.entityId}`
        : r.entityType === "project" ? `/admin/crm/projects` : null,
      overdue: r.status === "pending" && r.dueDate != null && r.dueDate.getTime() < Date.now(),
    })),
  });
});

router.post("/crm/document-requests", requireCrmAuth("documents.write"), async (req: Request, res: Response) => {
  const b = req.body as Record<string, unknown>;
  const entityType = b["entityType"];
  const entityId = num(b["entityId"]);
  const title = typeof b["title"] === "string" ? b["title"].trim() : "";
  if (!isEntityType(entityType) || !entityId) {
    res.status(400).json({ error: "Say which record this is for." }); return;
  }
  if (title.length < 2) { res.status(400).json({ error: "Say what you are asking for." }); return; }
  if (!(await entityExists(entityType, entityId))) {
    res.status(404).json({ error: "That record does not exist." }); return;
  }

  const me = actor(req);
  const dueRaw = b["dueDate"];
  const dueDate = dueRaw ? new Date(String(dueRaw)) : null;
  if (dueDate && !Number.isFinite(dueDate.getTime())) {
    res.status(400).json({ error: "Invalid due date." }); return;
  }

  const [request] = await db.insert(crmDocumentRequests).values({
    entityType, entityId, title,
    description: typeof b["description"] === "string" ? b["description"] : null,
    dueDate,
    ownerStaffId: num(b["ownerStaffId"]) ?? me.id,
    requestedByStaffId: me.id,
    requestedByLabel: me.label,
  }).returning();

  res.status(201).json({ request });
});

router.patch("/crm/document-requests/:id", requireCrmAuth("documents.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const b = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (typeof b["title"] === "string" && b["title"].trim()) updates["title"] = b["title"].trim();
  if ("description" in b) updates["description"] = typeof b["description"] === "string" ? b["description"] : null;
  if ("notes" in b) updates["notes"] = typeof b["notes"] === "string" ? b["notes"] : null;
  if ("ownerStaffId" in b) updates["ownerStaffId"] = b["ownerStaffId"] === null ? null : num(b["ownerStaffId"]) ?? null;
  if ("dueDate" in b) {
    const d = b["dueDate"] ? new Date(String(b["dueDate"])) : null;
    if (d && !Number.isFinite(d.getTime())) { res.status(400).json({ error: "Invalid due date." }); return; }
    updates["dueDate"] = d;
  }
  if (typeof b["status"] === "string") {
    if (!["pending", "received", "cancelled"].includes(b["status"])) {
      res.status(400).json({ error: "Unknown status." }); return;
    }
    updates["status"] = b["status"];
    updates["cancelledAt"] = b["status"] === "cancelled" ? new Date() : null;
    // Marking received by hand is allowed, but it records no file — the
    // distinction between "somebody says it arrived" and "here it is" matters.
    if (b["status"] === "received") updates["receivedAt"] = new Date();
  }

  const [request] = await db.update(crmDocumentRequests).set(updates)
    .where(eq(crmDocumentRequests.id, id)).returning();
  if (!request) { res.status(404).json({ error: "Not found." }); return; }
  res.json({ request });
});

// ── Share links ─────────────────────────────────────────────────────────────

router.post("/crm/documents/:id/share", requireCrmAuth("documents.write"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const [attachment] = await db.select().from(crmAttachments)
    .where(and(eq(crmAttachments.id, id), isNull(crmAttachments.deletedAt))).limit(1);
  if (!attachment) { res.status(404).json({ error: "Not found." }); return; }

  const b = req.body as Record<string, unknown>;
  const hours = Math.min(Math.max(num(b["expiresInHours"]) ?? 72, 1), 24 * 30);
  const maxDownloads = num(b["maxDownloads"]) ?? null;
  const me = actor(req);

  const token = generateToken();
  const [share] = await db.insert(crmDocumentShares).values({
    attachmentId: id,
    tokenHash: hashToken(token),
    createdByStaffId: me.id,
    expiresAt: new Date(Date.now() + hours * 3600_000),
    maxDownloads,
    sharedWithLabel: typeof b["sharedWithLabel"] === "string" ? b["sharedWithLabel"] : null,
  }).returning();

  await auditAction(req, "document.shared", `attachment:${id} share:${share.id} hours:${hours}`);
  // The raw token is returned exactly once, here.
  res.status(201).json({
    share: { id: share.id, expiresAt: share.expiresAt, maxDownloads: share.maxDownloads },
    shareToken: token,
    sharePath: `/api/crm/documents/shared/${token}`,
  });
});

router.get("/crm/documents/:id/shares", requireCrmAuth("documents.read"), async (req: Request, res: Response) => {
  const id = num(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id." }); return; }
  const rows = await db.select({
    id: crmDocumentShares.id, createdAt: crmDocumentShares.createdAt,
    expiresAt: crmDocumentShares.expiresAt, revokedAt: crmDocumentShares.revokedAt,
    maxDownloads: crmDocumentShares.maxDownloads, downloadCount: crmDocumentShares.downloadCount,
    lastDownloadedAt: crmDocumentShares.lastDownloadedAt, sharedWithLabel: crmDocumentShares.sharedWithLabel,
  }).from(crmDocumentShares).where(eq(crmDocumentShares.attachmentId, id))
    .orderBy(desc(crmDocumentShares.createdAt));
  res.json({ shares: rows });
});

router.post("/crm/documents/shares/:shareId/revoke", requireCrmAuth("documents.write"), async (req: Request, res: Response) => {
  const shareId = num(req.params["shareId"]);
  if (!shareId) { res.status(400).json({ error: "Invalid id." }); return; }
  const [revoked] = await db.update(crmDocumentShares)
    .set({ revokedAt: new Date() })
    .where(and(eq(crmDocumentShares.id, shareId), isNull(crmDocumentShares.revokedAt)))
    .returning({ id: crmDocumentShares.id, attachmentId: crmDocumentShares.attachmentId });
  if (!revoked) { res.status(404).json({ error: "No active share with that id." }); return; }
  await auditAction(req, "document.share_revoked", `share:${shareId}`);
  res.json({ ok: true });
});

/**
 * The only unauthenticated route here. The token IS the credential: it is
 * high-entropy, stored only as a hash, single-purpose, expiring, countable and
 * revocable. Every refusal answers the same way so the endpoint cannot be used
 * to probe which tokens exist.
 */
router.get("/crm/documents/shared/:token", async (req: Request, res: Response) => {
  const raw = String(req.params["token"] ?? "");
  const refuse = () => res.status(404).json({ error: "This link is not valid." });
  if (raw.length < 20) { refuse(); return; }

  const [row] = await db.select({ share: crmDocumentShares, attachment: crmAttachments })
    .from(crmDocumentShares)
    .innerJoin(crmAttachments, eq(crmDocumentShares.attachmentId, crmAttachments.id))
    .where(and(
      eq(crmDocumentShares.tokenHash, hashToken(raw)),
      isNull(crmDocumentShares.revokedAt),
      isNull(crmAttachments.deletedAt),
      sql`${crmDocumentShares.expiresAt} > now()`,
    )).limit(1);
  if (!row) { refuse(); return; }

  if (row.share.maxDownloads != null && row.share.downloadCount >= row.share.maxDownloads) {
    refuse(); return;
  }

  const [blob] = await db.select().from(crmAttachmentBlobs)
    .where(eq(crmAttachmentBlobs.attachmentId, row.attachment.id)).limit(1);
  if (!blob) { refuse(); return; }

  await db.update(crmDocumentShares).set({
    downloadCount: sql`${crmDocumentShares.downloadCount} + 1`,
    lastDownloadedAt: new Date(),
  }).where(eq(crmDocumentShares.id, row.share.id));

  sendFile(res, row.attachment.filename, row.attachment.mimeType, blob.bytes);
});

export default router;
