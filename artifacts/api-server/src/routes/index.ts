import { Router, type IRouter } from "express";
import healthRouter from "./health";
import discoveryRouter from "./discovery";
import discoveryV1Router from "./discoveryV1";
import adminRouter from "./admin";
import contactRouter from "./contact";
import crmRouter from "./crm";
import crmContactsRouter from "./crmContacts";
import crmLeadAssignmentRouter from "./crmLeadAssignment";
import crmProjectsRouter from "./crmProjects";
import crmDiscoveryRouter from "./crmDiscovery";
import crmStaffRouter from "./crmStaff";
import crmOperationsRouter from "./crmOperations";
import crmCommandCenterRouter from "./crmCommandCenter";
import crmDocumentsRouter from "./crmDocuments";
import crmBillingRouter from "./crmBilling";
import crmCalendarRouter from "./crmCalendar";
import crmInboxRouter from "./crmInbox";
import crmEmailInboundRouter from "./crmEmailInbound";
import crmSalesRouter from "./crmSales";
import crmSupportRouter from "./crmSupport";
import crmPortalRouter from "./crmPortal";
import crmHistoryRouter from "./crmHistory";
import crmReportsRouter from "./crmReports";
import crmMarketingRouter from "./crmMarketing";
import crmAutomationRouter from "./crmAutomation";
import phoneRouter from "./phone";
import copilotRouter from "./copilot";
import aiCampaignGenerateRouter from "./aiCampaignGenerate";
import aiToolkitRouter from "./aiToolkit";
import landingTestRouter from "./landingTest";
import intakeAgentRouter from "./intakeAgent";
import receptionistAuthRouter from "./receptionistAuth";
import receptionistConversationsRouter from "./receptionistConversations";
import receptionistAdminRouter from "./receptionistAdmin";
import receptionistBillingRouter from "./receptionistBilling";
import receptionistAgentConfigRouter from "./receptionistAgentConfig";
import receptionistVoiceAssistantsRouter from "./receptionistVoiceAssistants";
import receptionistVoiceWebhookRouter from "./receptionistVoiceWebhook";
import receptionistVoiceCallsRouter from "./receptionistVoiceCalls";
import receptionistVoiceMessagesRouter from "./receptionistVoiceMessages";
import receptionistVoiceCapabilitiesRouter from "./receptionistVoiceCapabilities";
import receptionistTransferContactsRouter from "./receptionistTransferContacts";
import receptionistAvailabilityRouter from "./receptionistAvailability";
import receptionistCalendarRouter from "./receptionistCalendar";
import voiceSmsWebhookRouter from "./voiceSmsWebhook";
import receptionistNumbersRouter from "./receptionistNumbers";
import receptionistMonitoringRouter from "./receptionistMonitoring";
import monitoringRouter from "./monitoring";
import receptionistAccountRouter from "./receptionistAccount";
import adminVoiceDiagnosticsRouter from "./adminVoiceDiagnostics";
import voiceBillingWebhookRouter from "./voiceBillingWebhook";
import publicSchedulingRouter from "./publicScheduling";
import helpdeskRouter from "./helpdesk";
import receptionistOnboardingRouter from "./receptionistOnboarding";
import receptionistContactsRouter from "./receptionistContacts";
import receptionistInvitesRouter from "./receptionistInvites";
import receptionistSupportRouter from "./receptionistSupport";
import adminSupportRouter from "./adminSupport";
import publicBetaRequestsRouter from "./publicBetaRequests";
import publicDemoRouter from "./publicDemo";
import adminVoiceNumbersRouter from "./adminVoiceNumbers";
import adminVoiceIssuesRouter from "./adminVoiceIssues";

const router: IRouter = Router();

router.use(healthRouter);
router.use(discoveryRouter);
router.use(discoveryV1Router);
router.use(adminRouter);
router.use(contactRouter);
// Staff auth is registered BEFORE the CRM routers: /crm/staff/* must match its
// own handlers rather than falling into a /crm/:something parameterised route.
router.use(crmStaffRouter);
router.use(crmOperationsRouter);
router.use(crmCommandCenterRouter);
router.use(crmDocumentsRouter);
// Before crmRouter: /crm/quotes/* and /crm/invoices/* must match their own
// handlers rather than falling into a legacy parameterised /crm/:something.
router.use(crmBillingRouter);
router.use(crmCalendarRouter);
router.use(crmInboxRouter);
router.use(crmEmailInboundRouter);
router.use(crmSalesRouter);
router.use(crmSupportRouter);
// Before crmRouter: /crm/portal/* must match its own handlers rather than
// falling into one of the legacy parameterised /crm/:something routes.
router.use(crmPortalRouter);
// Before crmRouter for the same reason as the others: /crm/history/* and
// /crm/reports/* must reach their own handlers rather than a legacy
// parameterised /crm/:something route.
router.use(crmHistoryRouter);
router.use(crmReportsRouter);
// Before crmRouter: /crm/marketing/* must match its own handlers rather than
// falling into one of the legacy parameterised /crm/:something routes.
router.use(crmMarketingRouter);
router.use(crmAutomationRouter);
// Before crmRouter, and for exactly the reason 3508a43 documents: crm.ts owns
// several parameterised `/crm/:something/...` routes, so a literal path such as
// `/crm/contacts/export.csv` registered after it would be resolved as one of
// those routes' `:id` and answered 400 instead of reaching its own handler.
router.use(crmContactsRouter);
// Before crmRouter for the same reason: /crm/lead-assignment/* is a literal
// prefix and must reach its own handlers, not a parameterised /crm/:something.
router.use(crmLeadAssignmentRouter);
router.use(crmRouter);
router.use(crmProjectsRouter);
router.use(crmDiscoveryRouter);
router.use(phoneRouter);
router.use(copilotRouter);
router.use(aiCampaignGenerateRouter);
router.use(aiToolkitRouter);
router.use(landingTestRouter);
router.use(intakeAgentRouter);
router.use(receptionistAuthRouter);
router.use(receptionistConversationsRouter);
router.use(receptionistAdminRouter);
router.use(receptionistBillingRouter);
router.use(receptionistAgentConfigRouter);
router.use(receptionistVoiceAssistantsRouter);
router.use(receptionistVoiceWebhookRouter);
router.use(receptionistVoiceCallsRouter);
router.use(receptionistVoiceMessagesRouter);
router.use(receptionistVoiceCapabilitiesRouter);
router.use(receptionistTransferContactsRouter);
router.use(receptionistAvailabilityRouter);
router.use(receptionistCalendarRouter);
router.use(voiceSmsWebhookRouter);
router.use(receptionistNumbersRouter);
router.use(receptionistMonitoringRouter);
router.use(monitoringRouter);
router.use(receptionistAccountRouter);
router.use(adminVoiceDiagnosticsRouter);
router.use(voiceBillingWebhookRouter);
router.use(publicSchedulingRouter);
router.use(helpdeskRouter);
router.use(receptionistOnboardingRouter);
router.use(receptionistContactsRouter);
router.use(receptionistInvitesRouter);
router.use(receptionistSupportRouter);
router.use(adminSupportRouter);
router.use(publicBetaRequestsRouter);
router.use(publicDemoRouter);
router.use(adminVoiceIssuesRouter);
router.use(adminVoiceNumbersRouter);

export default router;
