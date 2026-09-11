// ── M1: the SiteMint CRM permission matrix ──────────────────────────────────
//
// One place defines what each staff role may do, and every route asks this
// module rather than re-deciding. Holding an admin session is NOT itself
// authority: reaching the workspace and being allowed to export data, change
// security settings, or delete records are separate questions.
//
// Layering, in order: role defaults → per-person `extraPermissions` →
// per-person `revokedPermissions` (revocation always wins). That keeps the
// three roles meaningful while letting the owner tailor one person's access
// without inventing a fourth role.

import type { CrmStaffRole } from "@workspace/db";

export const PERMISSIONS = [
  // Reaching the admin workspace at all.
  "crm.access",

  // Sales records.
  "leads.read", "leads.write", "leads.delete",
  "deals.read", "deals.write", "deals.delete",

  // Delivery.
  "projects.read", "projects.write", "projects.delete",
  "tasks.write",            // create/edit/complete one's own work
  "tasks.assign",           // assign work to somebody else
  "tasks.read.team",        // see other people's queues (My Day team view)

  // Customer contact. `communications.send` is the line between reading a
  // thread and actually contacting a customer.
  "communications.read", "communications.send",
  "campaigns.read", "campaigns.write", "campaigns.send",

  // Supporting surfaces.
  "documents.read", "documents.write",
  "reports.read",
  "data.export",            // bulk egress of customer data — deliberately scarce
  "settings.read", "settings.write",
  "integrations.manage",

  // Administration of people and security.
  "staff.read", "staff.invite", "staff.role.assign", "staff.disable",
  "security.audit.read",
  "billing.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

/**
 * Everything an operations manager does day to day. Deliberately excludes
 * every destructive delete, all bulk export, security/billing administration,
 * and `campaigns.send` — bulk customer contact is owner-granted per person
 * rather than implied by the role.
 */
const OPERATIONS: Permission[] = [
  "crm.access",
  "leads.read", "leads.write",
  "deals.read", "deals.write",
  "projects.read", "projects.write",
  "tasks.write", "tasks.assign", "tasks.read.team",
  "communications.read", "communications.send",
  "campaigns.read", "campaigns.write",
  "documents.read", "documents.write",
  "reports.read",
  "settings.read",
];

/**
 * Operations plus the technical surfaces: integrations, settings writes, the
 * security audit trail, and inviting people. Still excludes role assignment,
 * disabling staff, billing, and destructive deletes — a technical
 * administrator maintains the system without unilateral authority over people
 * or client records.
 */
const TECHNICAL_ADMIN: Permission[] = [
  ...OPERATIONS,
  "settings.write",
  "integrations.manage",
  "security.audit.read",
  "staff.read", "staff.invite",
  "data.export",
];

export const ROLE_PERMISSIONS: Record<CrmStaffRole, Permission[]> = {
  owner: ALL,
  technical_admin: TECHNICAL_ADMIN,
  operations_manager: OPERATIONS,
};

/** Permissions only an owner may ever hold, even via a per-person grant. */
export const OWNER_ONLY: Permission[] = [
  "staff.role.assign", "staff.disable", "billing.manage",
  "leads.delete", "deals.delete", "projects.delete",
];

export interface StaffGrantSource {
  role: string;
  extraPermissions?: string[] | null;
  revokedPermissions?: string[] | null;
  status?: string;
}

function isRole(value: string): value is CrmStaffRole {
  return value === "owner" || value === "technical_admin" || value === "operations_manager";
}

/**
 * The effective permission set for one person. A non-active account resolves
 * to NO permissions regardless of role, so disabling somebody is immediate and
 * total rather than a UI-only change.
 */
export function effectivePermissions(staff: StaffGrantSource): Set<Permission> {
  if (staff.status && staff.status !== "active") return new Set();
  if (!isRole(staff.role)) return new Set();

  const granted = new Set<Permission>(ROLE_PERMISSIONS[staff.role]);

  for (const raw of staff.extraPermissions ?? []) {
    const perm = raw as Permission;
    if (!PERMISSIONS.includes(perm)) continue;
    // An owner-only power cannot be side-loaded onto a non-owner by a grant.
    if (staff.role !== "owner" && OWNER_ONLY.includes(perm)) continue;
    granted.add(perm);
  }
  for (const raw of staff.revokedPermissions ?? []) {
    granted.delete(raw as Permission);
  }
  return granted;
}

export function hasPermission(staff: StaffGrantSource, permission: Permission): boolean {
  return effectivePermissions(staff).has(permission);
}

/**
 * Guards role assignment. Returns a reason string when the change must be
 * refused, or undefined when it is allowed.
 *
 * Three rules, each closing a real escalation path:
 *  1. Only a `staff.role.assign` holder may change any role at all.
 *  2. Nobody may change their OWN role — otherwise the first rule is a
 *     self-promotion button.
 *  3. The last remaining active owner cannot be demoted, or the install is
 *     left with nobody able to administer it.
 */
export function refuseRoleChange(args: {
  actor: StaffGrantSource & { id: number };
  targetId: number;
  targetCurrentRole: string;
  nextRole: string;
  activeOwnerCount: number;
}): string | undefined {
  const { actor, targetId, targetCurrentRole, nextRole, activeOwnerCount } = args;

  if (!isRole(nextRole)) return "Unknown role.";
  if (!hasPermission(actor, "staff.role.assign")) return "You do not have permission to change roles.";
  if (actor.id === targetId) return "You cannot change your own role.";
  if (targetCurrentRole === "owner" && nextRole !== "owner" && activeOwnerCount <= 1) {
    return "This is the last active owner. Promote another owner first.";
  }
  return undefined;
}

/** Same shape for disable/reactivate: never disable yourself, never the last owner. */
export function refuseStatusChange(args: {
  actor: StaffGrantSource & { id: number };
  targetId: number;
  targetCurrentRole: string;
  nextStatus: string;
  activeOwnerCount: number;
}): string | undefined {
  const { actor, targetId, targetCurrentRole, nextStatus, activeOwnerCount } = args;

  if (!hasPermission(actor, "staff.disable")) return "You do not have permission to change account status.";
  if (actor.id === targetId) return "You cannot change your own account status.";
  if (nextStatus === "disabled" && targetCurrentRole === "owner" && activeOwnerCount <= 1) {
    return "This is the last active owner. Promote another owner first.";
  }
  if (nextStatus !== "active" && nextStatus !== "disabled") return "Unknown status.";
  return undefined;
}
