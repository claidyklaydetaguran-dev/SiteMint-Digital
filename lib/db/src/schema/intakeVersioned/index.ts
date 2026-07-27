// Checkpoint A1: scoped barrel for the future versioned intake migration
// stream. Re-exports only the two tables that stream will ever manage.
// Not used by the shared application schema barrel (../index.ts), which
// still re-exports intakeAgent as a whole and is unaffected by this file —
// application imports of intakeConversations/intakeMessages via
// @workspace/db/schema continue to resolve exactly as before. Only the
// legacy-push barrel (../legacyPush/index.ts) excludes these two tables.
export { intakeConversations, intakeMessages } from "../intakeAgent";
