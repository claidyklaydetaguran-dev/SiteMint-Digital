import type { DiscoverySubmissionContract } from "@workspace/discovery-contract";

/**
 * UI-only presentation content for the Project Scope step. The contract's
 * `projectScope.features[].key` is deliberately a bounded free string (not
 * an enum), because the real option catalog varies by
 * `projectDirection.primaryType`. This file is that catalog -- plain
 * label/key pairs for the form to render as checkable rows -- and is not a
 * duplicate of, or a schema for, `@workspace/discovery-contract`.
 */

export interface FeatureCatalogItem {
  key: string;
  label: string;
}

type PrimaryType = DiscoverySubmissionContract["projectDirection"]["primaryType"];

const GENERAL_FEATURES: FeatureCatalogItem[] = [
  { key: "contact_forms", label: "Contact / inquiry forms" },
  { key: "appointment_scheduling", label: "Appointment scheduling" },
  { key: "online_payments", label: "Online payments" },
  { key: "blog_articles", label: "Blog / articles" },
  { key: "seo_optimization", label: "Search engine optimization" },
  { key: "live_chat", label: "Live chat / AI receptionist" },
  { key: "email_marketing", label: "Email marketing / newsletters" },
  { key: "customer_accounts", label: "Customer accounts / login" },
  { key: "multi_language", label: "Multiple languages" },
  { key: "analytics_reporting", label: "Analytics and reporting" },
];

const CRM_FEATURES: FeatureCatalogItem[] = [
  { key: "lead_pipeline", label: "Lead / deal pipeline" },
  { key: "task_management", label: "Task management" },
  { key: "team_calendar", label: "Shared team calendar" },
  { key: "reporting_dashboards", label: "Reporting dashboards" },
  { key: "role_based_access", label: "Role-based staff access" },
];

const AUTOMATION_FEATURES: FeatureCatalogItem[] = [
  { key: "workflow_triggers", label: "Automated workflow triggers" },
  { key: "notification_routing", label: "Notification routing" },
  { key: "third_party_integrations", label: "Third-party integrations" },
];

const AI_RECEPTIONIST_FEATURES: FeatureCatalogItem[] = [
  { key: "call_answering", label: "Automated call answering" },
  { key: "appointment_booking_by_phone", label: "Appointment booking by phone" },
  { key: "call_transcripts", label: "Call transcripts and summaries" },
];

/** primaryType -> the feature catalog shown for that project direction (falls back to GENERAL_FEATURES). */
const FEATURE_CATALOG_BY_PRIMARY_TYPE: Partial<Record<NonNullable<PrimaryType>, FeatureCatalogItem[]>> = {
  internal_crm: [...GENERAL_FEATURES, ...CRM_FEATURES],
  business_operations_system: [...GENERAL_FEATURES, ...CRM_FEATURES, ...AUTOMATION_FEATURES],
  workflow_automation: [...GENERAL_FEATURES, ...AUTOMATION_FEATURES],
  ai_receptionist: [...GENERAL_FEATURES, ...AI_RECEPTIONIST_FEATURES],
  customer_portal: [...GENERAL_FEATURES, ...CRM_FEATURES],
  multiple_connected_systems: [...GENERAL_FEATURES, ...CRM_FEATURES, ...AUTOMATION_FEATURES, ...AI_RECEPTIONIST_FEATURES],
};

export function getFeatureCatalog(primaryType: PrimaryType | undefined): FeatureCatalogItem[] {
  if (!primaryType) return GENERAL_FEATURES;
  return FEATURE_CATALOG_BY_PRIMARY_TYPE[primaryType] ?? GENERAL_FEATURES;
}
