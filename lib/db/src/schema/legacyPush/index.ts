// Checkpoint A1: schema barrel used only by the legacy drizzle-kit push
// config (../../../drizzle.config.ts). Re-exports everything the shared
// application barrel (../index.ts) re-exports EXCEPT intake_conversations
// and intake_messages, which are excluded here and instead owned by the new
// versioned intake migration stream (../intakeVersioned/index.ts). This,
// together with drizzle.config.ts's explicit tablesFilter allowlist, is what
// stops `push` from discovering, altering, or dropping those two tables.
export * from "../submissions";
export * from "../formSubmissions";
export * from "../crmLeads";
export * from "../crmActivities";
export * from "../crmTasks";
export * from "../crmEmailTemplates";
export * from "../crmMessages";
export * from "../crmDeals";
export * from "../crmTransactions";
export * from "../crmProjects";
export * from "../crmCampaigns";
export * from "../crmBehavioralEvents";
export * from "../aiToolkitPurchases";
export * from "../landingPageViews";
export * from "../helpdeskContacts";
export * from "../helpdeskAgents";
export * from "../helpdeskTickets";
export * from "../helpdeskMessages";
export {
  intakeFirms,
  insertIntakeFirmSchema,
  intakeCases,
  insertIntakeCaseSchema,
  receptionistSessions,
} from "../intakeAgent";
