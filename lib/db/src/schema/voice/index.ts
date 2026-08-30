// Dedicated voice-platform schema barrel — Milestone 1 / Checkpoint C.
//
// Discoverable ONLY by the versioned voice migration workflow
// (drizzle.voice.config.ts). Deliberately NOT re-exported from the shared
// application schema barrel (../index.ts), so the legacy CRM/intake
// `drizzle-kit push` config (drizzle.config.ts, which scans ../index.ts)
// cannot create, alter, or synchronize these tables. See
// docs/ai-receptionist/DATABASE_STRATEGY.md (ADR-05).
//
// Absence from the barrel does NOT protect them from deletion. push
// reconciles the whole managed schema: anything it introspects that the
// barrel does not export is a drop candidate, which is how a second
// `migrate:fresh` removed all ten domain-migration-owned tables on staging
// (AR-001O correction 4). Deletion protection comes from the `!voice_*`
// entry in ./drizzle.config.ts's `tablesFilter`. Do not remove it.

export * from "../voiceAssistants";
export * from "../providerWebhookEvents";
export * from "../voiceIssues";
export * from "../voiceContactsSms";
export * from "../voiceNumbers";
export * from "../voiceMonitoring";
export * from "../voiceAccounts";
