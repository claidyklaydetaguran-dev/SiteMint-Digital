// Checkpoint A1: scoped barrel for the future versioned intake migration
// stream. Re-exports only the two tables that stream will ever manage.
// Deliberately NOT re-exported from the shared application schema barrel
// (../index.ts) or the legacy-push barrel (../legacyPush/index.ts).
export { intakeConversations, intakeMessages } from "../intakeAgent";
