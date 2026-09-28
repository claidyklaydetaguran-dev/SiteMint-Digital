import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db, crmLeads, crmPortalAccounts, crmPortalInvitations, discoverySubmissions } from "@workspace/db";
import { generateToken, hashToken } from "./staffCredentials.js";
import { trySendStaffMail } from "./staffMail.js";

/** Link a persisted inquiry, never approve a project. Raw invitation tokens stay server-side. */
export async function inviteDiscoverySubmitter(submissionId: number) {
  const prepared = await db.transaction(async tx => {
    const [submission] = await tx.select().from(discoverySubmissions).where(eq(discoverySubmissions.id, submissionId)).limit(1);
    if (!submission) return null;
    const email = submission.email.trim().toLowerCase();
    // Serialize public intake for this address across replicas. Ambiguous CRM
    // contacts require staff review rather than guessing which tenant to grant.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`discovery-portal:${email}`}))`);
    const accounts = await tx.select().from(crmPortalAccounts).where(eq(crmPortalAccounts.email, email)).limit(2);
    const leads = await tx.select().from(crmLeads).where(sql`lower(${crmLeads.email}) = ${email}`).limit(2);
    if (accounts.length > 1 || leads.length > 1) return null;
    let leadId = accounts[0]?.leadId ?? leads[0]?.id;
    if (accounts[0] && leads[0] && accounts[0].leadId !== leads[0].id) return null;
    if (!leadId) {
      const [lead] = await tx.insert(crmLeads).values({name:submission.contactName,email,company:submission.companyName,phone:submission.phone,source:"Discovery Form",status:"Discovery Completed",serviceInterest:submission.serviceInterest,discoveryFormStatus:"Completed"}).returning();
      leadId = lead.id;
    }
    await tx.update(discoverySubmissions).set({leadId}).where(eq(discoverySubmissions.id, submissionId));
    if (accounts.length) return null; // Existing clients keep their current login.
    const [pending] = await tx.select().from(crmPortalInvitations).where(and(eq(crmPortalInvitations.leadId,leadId),isNull(crmPortalInvitations.acceptedAt),isNull(crmPortalInvitations.revokedAt),gt(crmPortalInvitations.expiresAt,new Date()))).limit(1);
    if (pending) return null; // A retry must not invalidate an invitation already emailed.
    const token = generateToken();
    const [invitation] = await tx.insert(crmPortalInvitations).values({leadId,email,tokenHash:hashToken(token),createdByLabel:"Discovery submission",expiresAt:new Date(Date.now()+72*3600_000),deliveryState:"pending"}).returning();
    return {id:invitation.id,token,email,name:submission.contactName};
  });
  if (!prepared) return;
  const base = process.env["CRM_PUBLIC_BASE_URL"] ?? process.env["CRM_BASE_URL"];
  if (!base || !/^https:\/\//.test(base)) {
    await db.update(crmPortalInvitations).set({deliveryState:"not_configured",deliveryDetail:"Set an HTTPS CRM_PUBLIC_BASE_URL, then resend the invitation from CRM."}).where(eq(crmPortalInvitations.id,prepared.id));
    return;
  }
  const url = `${base.replace(/\/+$/,"")}/portal/accept?token=${encodeURIComponent(prepared.token)}`;
  const outcome = await trySendStaffMail({to:prepared.email,subject:"Your SiteMint inquiry and client portal",text:`Hello ${prepared.name},\n\nWe received your project inquiry. Set up your client portal to track its progress:\n${url}\n\nThis invitation expires in 72 hours and works once. Your inquiry is awaiting review; a project will appear after approval. If you already have a portal account, sign in with your existing account.`,idempotencyKey:`portal-invite-${prepared.id}`});
  await db.update(crmPortalInvitations).set({deliveryState:outcome.sent?"sent":outcome.failure,deliveryDetail:outcome.sent?null:outcome.reason.slice(0,500)}).where(eq(crmPortalInvitations.id,prepared.id));
}
