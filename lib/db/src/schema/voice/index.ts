// Dedicated voice-platform schema barrel — Milestone 1 / Checkpoint C.
//
// Discoverable ONLY by the versioned voice migration workflow
// (drizzle.voice.config.ts). Deliberately NOT re-exported from the shared
// application schema barrel (../index.ts), so the legacy CRM/intake
// `drizzle-kit push` config (drizzle.config.ts, which scans ../index.ts)
// cannot discover, create, alter, or synchronize these tables. See
// docs/ai-receptionist/DATABASE_STRATEGY.md (ADR-05).

export * from "../voiceAssistants";
export * from "../providerWebhookEvents";
export * from "../voiceIssues";
