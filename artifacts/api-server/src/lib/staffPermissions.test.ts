import { describe, it, expect } from "vitest";
import {
  PERMISSIONS, OWNER_ONLY, effectivePermissions,
  refuseRoleChange, refuseStatusChange,
} from "./staffPermissions.js";

// ── The permission matrix, tested directly ──────────────────────────────────
//
// These are pure functions, so the interesting branches can be exercised
// exactly rather than approximated through HTTP.
//
// The last-active-owner branch is the reason this file exists. The route-level
// test that claimed to cover it ("refuses removing the last active owner") in
// fact had an owner act on their own account, which the separate self-
// protection rule refuses first — so the branch that actually protects the
// company from locking itself out was never executed. A guard nobody has run
// is not a guard.

const owner = (id: number) => ({ id, role: "owner", status: "active" });

describe("staff permission matrix", () => {
  it("gives an owner everything, including the owner-only powers", () => {
    const granted = effectivePermissions(owner(1));
    for (const p of PERMISSIONS) expect(granted.has(p)).toBe(true);
  });

  it("withholds owner-only powers from the other roles, even when granted explicitly", () => {
    for (const role of ["technical_admin", "operations_manager"]) {
      const granted = effectivePermissions({
        role, status: "active",
        // Somebody tries to side-load them. Revocation of the attempt is the
        // point: these are not grantable, they are role-bound.
        extraPermissions: [...OWNER_ONLY],
      });
      for (const p of OWNER_ONLY) {
        expect(granted.has(p), `${role} must not hold ${p}`).toBe(false);
      }
    }
  });

  it("grants no permission at all to an account that is not active", () => {
    for (const status of ["invited", "disabled"]) {
      expect(effectivePermissions({ role: "owner", status }).size).toBe(0);
    }
  });

  it("lets revocation beat both the role default and an explicit grant", () => {
    const granted = effectivePermissions({
      role: "owner", status: "active",
      extraPermissions: ["data.export"],
      revokedPermissions: ["data.export", "communications.send"],
    });
    expect(granted.has("data.export")).toBe(false);
    expect(granted.has("communications.send")).toBe(false);
  });

  it("separates filing a document from deleting one", () => {
    const ops = effectivePermissions({ role: "operations_manager", status: "active" });
    expect(ops.has("documents.read")).toBe(true);
    expect(ops.has("documents.write")).toBe(true);
    // Removing a client's file is not part of the role...
    expect(ops.has("documents.delete")).toBe(false);
    // ...but unlike the hard record deletes it is not owner-bound, so an owner
    // can hand it to one person without making them an owner.
    expect(OWNER_ONLY.includes("documents.delete" as never)).toBe(false);
    const trusted = effectivePermissions({
      role: "operations_manager", status: "active",
      extraPermissions: ["documents.delete"],
    });
    expect(trusted.has("documents.delete")).toBe(true);
  });
});

describe("the last active owner cannot be removed", () => {
  // An owner acting on a DIFFERENT owner, so the self-protection rule does not
  // fire and the last-owner branch is the thing under test.
  const actor = owner(1);
  const targetId = 2;

  it("refuses disabling the only remaining active owner", () => {
    const refusal = refuseStatusChange({
      actor, targetId, targetCurrentRole: "owner",
      nextStatus: "disabled", activeOwnerCount: 1,
    });
    expect(refusal).toBe("This is the last active owner. Promote another owner first.");
  });

  it("refuses demoting the only remaining active owner out of the role", () => {
    const refusal = refuseRoleChange({
      actor, targetId, targetCurrentRole: "owner",
      nextRole: "operations_manager", activeOwnerCount: 1,
    });
    expect(refusal).toBe("This is the last active owner. Promote another owner first.");
  });

  it("allows the same two changes once a second owner exists", () => {
    expect(refuseStatusChange({
      actor, targetId, targetCurrentRole: "owner",
      nextStatus: "disabled", activeOwnerCount: 2,
    })).toBeUndefined();
    expect(refuseRoleChange({
      actor, targetId, targetCurrentRole: "owner",
      nextRole: "operations_manager", activeOwnerCount: 2,
    })).toBeUndefined();
  });

  it("still allows re-enabling a disabled owner when only one is active", () => {
    // Recovering from a lockout must not be blocked by the lockout guard.
    expect(refuseStatusChange({
      actor, targetId, targetCurrentRole: "owner",
      nextStatus: "active", activeOwnerCount: 1,
    })).toBeUndefined();
  });

  it("does not block demoting a non-owner when one owner is active", () => {
    expect(refuseRoleChange({
      actor, targetId, targetCurrentRole: "operations_manager",
      nextRole: "technical_admin", activeOwnerCount: 1,
    })).toBeUndefined();
  });

  it("refuses both changes to your own account before counting owners at all", () => {
    expect(refuseStatusChange({
      actor, targetId: actor.id, targetCurrentRole: "owner",
      nextStatus: "disabled", activeOwnerCount: 5,
    })).toBe("You cannot change your own account status.");
    expect(refuseRoleChange({
      actor, targetId: actor.id, targetCurrentRole: "owner",
      nextRole: "operations_manager", activeOwnerCount: 5,
    })).toBe("You cannot change your own role.");
  });

  it("refuses an actor who lacks the permission outright", () => {
    const ops = { id: 9, role: "operations_manager", status: "active" };
    expect(refuseStatusChange({
      actor: ops, targetId, targetCurrentRole: "owner",
      nextStatus: "disabled", activeOwnerCount: 3,
    })).toBe("You do not have permission to change account status.");
    expect(refuseRoleChange({
      actor: ops, targetId, targetCurrentRole: "operations_manager",
      nextRole: "owner", activeOwnerCount: 3,
    })).toBe("You do not have permission to change roles.");
  });
});
