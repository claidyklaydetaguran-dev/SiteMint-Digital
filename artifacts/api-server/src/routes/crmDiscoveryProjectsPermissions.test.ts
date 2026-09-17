// Route wiring regression: permissions must be checked before touching any
// record. Staff session/CSRF resolution has separate DB-backed integration tests.
import http from "node:http";
import type { AddressInfo } from "node:net";
import express, { type NextFunction, type Request, type Response } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { effectivePermissions, type Permission } from "../lib/staffPermissions.js";

const h = vi.hoisted(() => ({ database: vi.fn(() => { throw new Error("Unexpected database access"); }) }));
vi.mock("@workspace/db", async () => ({
  ...await import("@workspace/db/schema"),
  db: { select: h.database, insert: h.database, update: h.database, delete: h.database },
}));
vi.mock("../lib/staffAuth.js", () => ({
  auditAction: vi.fn(),
  requireCrmAuth: (permission?: Permission) => (req: Request, res: Response, next: NextFunction) => {
    const role = req.headers["x-test-role"];
    if (typeof role !== "string") { res.sendStatus(401); return; }
    const revokedPermissions = String(req.headers["x-test-revoked"] ?? "").split(",");
    const permissions = effectivePermissions({ role, revokedPermissions, status: "active" });
    if (permission && !permissions.has(permission)) { res.status(403).json({ permission }); return; }
    next();
  },
}));
import discovery from "./crmDiscovery.js";
import projects from "./crmProjects.js";

let server: http.Server;
let base: string;
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use(discovery); app.use(projects);
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); });
beforeEach(() => vi.clearAllMocks());

const cases: Array<[string, string, Permission]> = [
  ["GET", "/crm/projects", "projects.read"],
  ["GET", "/crm/projects/1", "projects.read"],
  ["POST", "/crm/projects", "projects.write"],
  ["POST", "/crm/projects", "tasks.write"],
  ["PATCH", "/crm/projects/1", "projects.write"],
  ["POST", "/crm/projects/1/tasks", "tasks.write"],
  ["PATCH", "/crm/projects/1/tasks/1", "tasks.write"],
  ["DELETE", "/crm/projects/1/tasks/1", "tasks.write"],
  ["DELETE", "/crm/projects/1/tasks/1", "projects.write"],
  ["GET", "/crm/discovery-submissions", "leads.read"],
  ["GET", "/crm/discovery-submissions/1", "leads.read"],
  ["POST", "/crm/discovery-submissions", "leads.write"],
  ["PATCH", "/crm/discovery-submissions/1", "leads.write"],
  ["POST", "/crm/discovery-submissions/1/generate-proposal", "leads.write"],
  ["POST", "/crm/discovery-submissions/1/convert-to-project", "leads.write"],
  ["POST", "/crm/discovery-submissions/1/convert-to-project", "projects.write"],
  ["POST", "/crm/discovery-submissions/1/convert-to-project", "tasks.write"],
];
describe("Discovery and Projects enforce capabilities", () => {
  it.each(cases)("%s %s refuses revoked %s before database access", async (method, path, permission) => {
    const response = await fetch(base + path, { method, headers: { "x-test-role": "operations_manager", "x-test-revoked": permission } });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ permission });
    expect(h.database).not.toHaveBeenCalled();
  });
  it.each(["/crm/projects", "/crm/discovery-submissions"])("%s still requires staff authentication", async (path) => {
    expect((await fetch(base + path)).status).toBe(401);
    expect(h.database).not.toHaveBeenCalled();
  });
  it("a permitted operations manager still reaches the handler's input validation", async () => {
    const response = await fetch(base + "/crm/projects/bad/tasks/bad", { method: "PATCH", headers: { "x-test-role": "operations_manager" } });
    expect(response.status).toBe(400);
    expect(h.database).not.toHaveBeenCalled();
  });
});
