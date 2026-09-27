import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ reads: [] as unknown[][], writes: [] as any[], sent: [] as any[] }));
vi.mock("@workspace/db", () => {
  const table = (name: string) => ({ name, id: name + ".id", email: name + ".email", leadId: name + ".leadId", acceptedAt: "acceptedAt", revokedAt: "revokedAt", expiresAt: "expiresAt" });
  const db: any = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => state.reads.shift() ?? [] }) }) }),
    execute: async () => undefined,
    update: (table: any) => ({ set: (value: any) => ({ where: async () => { state.writes.push({ table: table.name, value }); } }) }),
    insert: (table: any) => ({ values: (value: any) => ({ returning: async () => { state.writes.push({ table: table.name, value }); return [{ id: 7, ...value }]; } }) }),
    transaction: async (fn: any) => fn(db),
  };
  return { db, discoverySubmissions: table("discovery"), crmLeads: table("leads"), crmPortalAccounts: table("accounts"), crmPortalInvitations: table("invitations") };
});
vi.mock("./staffMail.js", () => ({ trySendStaffMail: async (message: any) => { state.sent.push(message); return { sent: true }; } }));
import { inviteDiscoverySubmitter } from "./discoveryPortal";

const inquiry = { id: 4, email: "CLIENT@example.test", contactName: "Client", companyName: "Example", phone: null, serviceInterest: "Website" };
beforeEach(() => { state.reads = []; state.writes = []; state.sent = []; vi.stubEnv("CRM_PUBLIC_BASE_URL", "https://example.test"); });
describe("discovery portal invitation", () => {
  it("links a new inquiry and emails only a single-use invitation, not a password", async () => {
    state.reads = [[inquiry], [], [], []];
    await inviteDiscoverySubmitter(4);
    expect(state.writes.find(w => w.table === "discovery").value).toEqual({ leadId: 7 });
    const invite = state.writes.find(w => w.table === "invitations").value;
    expect(invite.tokenHash).toHaveLength(64);
    expect(invite).not.toHaveProperty("token");
    expect(state.sent).toHaveLength(1);
    expect(state.sent[0].to).toBe("client@example.test");
    expect(state.sent[0].text).toContain("/portal/accept?token=");
    expect(state.writes.some(w => w.table === "projects")).toBe(false);
  });
  it("reuses a verified existing account without another invitation", async () => {
    state.reads = [[inquiry], [{ leadId: 12 }], [{ id: 12 }]];
    await inviteDiscoverySubmitter(4);
    expect(state.writes[0].value).toEqual({ leadId: 12 });
    expect(state.sent).toHaveLength(0);
  });
  it("does not guess between duplicate CRM contacts", async () => {
    state.reads = [[inquiry], [], [{ id: 12 }, { id: 13 }]];
    await inviteDiscoverySubmitter(4);
    expect(state.writes).toHaveLength(0);
    expect(state.sent).toHaveLength(0);
  });
  it("does not replace an unexpired invitation on a retry", async () => {
    state.reads = [[inquiry], [], [{ id: 12 }], [{ id: 20 }]];
    await inviteDiscoverySubmitter(4);
    expect(state.writes).toHaveLength(1);
    expect(state.sent).toHaveLength(0);
  });
  it("retains the inquiry and records a delivery problem without an HTTPS origin", async () => {
    vi.stubEnv("CRM_PUBLIC_BASE_URL", "http://example.test");
    state.reads = [[inquiry], [], [], []];
    await inviteDiscoverySubmitter(4);
    expect(state.sent).toHaveLength(0);
    expect(state.writes.at(-1).value.deliveryState).toBe("not_configured");
  });
});
