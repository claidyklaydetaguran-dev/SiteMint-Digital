// Dedicated Project Discovery System schema barrel — Phase 2C.2B.
//
// Discoverable ONLY by the versioned discovery migration workflow
// (../../../drizzle.discovery.config.ts). Deliberately NOT re-exported from
// the shared application schema barrel (../index.ts), so the legacy CRM/
// intake `drizzle-kit push` config (../../../drizzle.config.ts, which scans
// ../index.ts) cannot create, alter, or synchronize
// discovery_delivery_jobs or discovery_ai_briefs. Mirrors the existing
// voice-table exclusion pattern exactly (../voice/index.ts, ADR-05 in
// docs/ai-receptionist/DATABASE_STRATEGY.md).
//
// Absence from the barrel does NOT protect them from deletion. push
// reconciles the whole managed schema: anything it introspects that the
// barrel does not export is a drop candidate, which is how a second
// `migrate:fresh` removed all ten domain-migration-owned tables on staging
// (AR-001O correction 4). Deletion protection comes from the exact-name
// `!discovery_ai_briefs` and `!discovery_delivery_jobs` entries in
// ./drizzle.config.ts's `tablesFilter`. A `discovery_*` wildcard would be
// wrong: discovery_submissions IS barrel-owned and must stay managed by
// push. Do not remove or widen these entries.
//
// discoverySubmissions itself is re-exported here too (from ../submissions)
// only so this barrel's migration diff includes its Phase 2C.2B additive
// columns — the table's canonical export path for application code remains
// ../index.ts (the shared barrel), unchanged.
//
// Never run `drizzle-kit push` with drizzle.discovery.config.ts — these
// tables are versioned-migration-only.

export * from "../submissions";
export * from "../discoveryDeliveryJobs";
export * from "../discoveryAiBriefs";
