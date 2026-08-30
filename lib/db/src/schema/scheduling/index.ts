// Dedicated scheduling schema barrel — Checkpoint B (durable storage).
// Discoverable ONLY by the versioned scheduling migration workflow
// (drizzle.scheduling.config.ts). Deliberately NOT re-exported from the
// shared application schema barrel (../index.ts), so the legacy CRM/intake
// `drizzle-kit push` config (drizzle.config.ts, which scans ../index.ts)
// cannot create, alter, or synchronize these tables. See
// docs/ai-receptionist/DATABASE_STRATEGY.md (ADR-05) and the voice-platform
// precedent at ../voice/index.ts.
//
// Absence from the barrel does NOT protect them from deletion. push
// reconciles the whole managed schema: anything it introspects that the
// barrel does not export is a drop candidate, which is how a second
// `migrate:fresh` removed all ten domain-migration-owned tables on staging
// (AR-001O correction 4). Deletion protection comes from the
// `!scheduling_*` entry in ./drizzle.config.ts's `tablesFilter`. Do not
// remove it.

export * from "../scheduling";
