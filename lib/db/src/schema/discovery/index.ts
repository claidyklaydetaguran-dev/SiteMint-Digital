// Dedicated Project Discovery System schema barrel — Phase 2C.2B.
//
// Discoverable ONLY by the versioned discovery migration workflow
// (../../../drizzle.discovery.config.ts). Deliberately NOT re-exported from
// the shared application schema barrel (../index.ts), so the legacy CRM/
// intake `drizzle-kit push` config (../../../drizzle.config.ts, which scans
// ../index.ts) cannot discover, create, alter, or synchronize
// discovery_delivery_jobs or discovery_ai_briefs. Mirrors the existing
// voice-table isolation pattern exactly (../voice/index.ts, ADR-05 in
// docs/ai-receptionist/DATABASE_STRATEGY.md).
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
