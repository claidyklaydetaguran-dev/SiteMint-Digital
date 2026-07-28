// Dedicated scheduling schema barrel — Checkpoint B (durable storage).
// Discoverable ONLY by the versioned scheduling migration workflow
// (drizzle.scheduling.config.ts). Deliberately NOT re-exported from the
// shared application schema barrel (../index.ts), so the legacy CRM/intake
// `drizzle-kit push` config (drizzle.config.ts, which scans ../index.ts)
// cannot discover, create, alter, or synchronize these tables. See
// docs/ai-receptionist/DATABASE_STRATEGY.md (ADR-05) and the voice-platform
// precedent at ../voice/index.ts.

export * from "../scheduling";
