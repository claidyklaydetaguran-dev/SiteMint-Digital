// Canonical SiteMint Digital agency CRM taxonomies — single source of truth for
// the frontend. Keep in sync with lib/db/src/schema (crmLeads / crmProjects).

export const LEAD_STATUSES = [
  "New Inquiry", "Discovery Sent", "Discovery Completed", "Qualified",
  "Proposal Needed", "Proposal Sent", "Follow-Up Needed", "Won",
  "Lost", "On Hold", "Client", "Maintenance Client",
] as const;
export type LeadStatus = typeof LEAD_STATUSES[number];

export const PROJECT_TYPES = [
  "Website Design", "Website Redesign", "Web Application", "CRM Development",
  "SEO", "Blog Content", "Maintenance & Support", "AI Automation",
  "Consultation", "E-commerce", "Landing Page", "Branding", "Website Audit",
] as const;
export type ProjectType = typeof PROJECT_TYPES[number];

export const PROJECT_STAGES = [
  "New Lead", "Discovery", "Proposal", "Contract / Deposit", "Strategy",
  "Design", "Development", "Content", "Review", "Revision",
  "Launch Prep", "Launched", "Maintenance", "Completed",
] as const;
export type ProjectStage = typeof PROJECT_STAGES[number];

// Maps any legacy status string to the canonical agency status.
export function normalizeLeadStatus(s?: string | null): LeadStatus {
  if (!s) return "New Inquiry";
  if ((LEAD_STATUSES as readonly string[]).includes(s)) return s as LeadStatus;
  const legacy: Record<string, LeadStatus> = {
    New: "New Inquiry",
    Contacted: "Follow-Up Needed",
    "Follow-up": "Follow-Up Needed",
    Negotiating: "Qualified",
    Nurture: "On Hold",
  };
  return legacy[s] ?? "New Inquiry";
}

interface StatusStyle { topBorder: string; header: string; pill: string; }

/* Stage colors follow the SiteMint ops discipline (owner directive
   2026-09-08 §6): the mint/teal family carries pipeline PROGRESS — the
   signature `primary` token marks the Qualified milestone — while red,
   amber and green keep their semantic meanings (lost / needs action /
   won). No decorative purple/indigo/violet/pink, no raw neutrals. */
export const LEAD_STATUS_STYLES: Record<LeadStatus, StatusStyle> = {
  "New Inquiry":         { topBorder: "border-t-sky-500",     header: "bg-sky-50 text-sky-700",          pill: "bg-sky-100 text-sky-700" },
  "Discovery Sent":      { topBorder: "border-t-cyan-500",    header: "bg-cyan-50 text-cyan-700",        pill: "bg-cyan-100 text-cyan-700" },
  "Discovery Completed": { topBorder: "border-t-teal-500",    header: "bg-teal-50 text-teal-700",        pill: "bg-teal-100 text-teal-700" },
  "Qualified":           { topBorder: "border-t-primary",     header: "bg-primary/20 text-teal-800",     pill: "bg-primary text-primary-foreground" },
  "Proposal Needed":     { topBorder: "border-t-amber-500",   header: "bg-amber-50 text-amber-700",      pill: "bg-amber-100 text-amber-700" },
  "Proposal Sent":       { topBorder: "border-t-teal-600",    header: "bg-teal-50 text-teal-800",        pill: "bg-teal-100 text-teal-800" },
  "Follow-Up Needed":    { topBorder: "border-t-yellow-500",  header: "bg-yellow-50 text-yellow-700",    pill: "bg-yellow-100 text-yellow-700" },
  "Won":                 { topBorder: "border-t-green-500",   header: "bg-green-50 text-green-700",      pill: "bg-green-100 text-green-700" },
  "Lost":                { topBorder: "border-t-red-500",     header: "bg-red-50 text-red-700",          pill: "bg-red-100 text-red-700" },
  "On Hold":             { topBorder: "border-t-border",      header: "bg-muted text-muted-foreground",  pill: "bg-muted text-muted-foreground" },
  "Client":              { topBorder: "border-t-emerald-500", header: "bg-emerald-50 text-emerald-700",  pill: "bg-emerald-100 text-emerald-700" },
  "Maintenance Client":  { topBorder: "border-t-teal-400",    header: "bg-accent text-teal-800",         pill: "bg-accent text-teal-800" },
};

interface StageStyle { bg: string; text: string; border: string; accent: string; }

/* Same discipline for delivery stages: cool mint/teal family for build
   phases, amber/orange/yellow for the review loop (attention states),
   green family for launch/completion. */
export const PROJECT_STAGE_STYLES: Record<ProjectStage, StageStyle> = {
  "New Lead":          { bg: "bg-sky-50",     text: "text-sky-700",     border: "border-sky-200",     accent: "#0ea5e9" },
  "Discovery":         { bg: "bg-cyan-50",    text: "text-cyan-700",    border: "border-cyan-200",    accent: "#06b6d4" },
  "Proposal":          { bg: "bg-teal-50",    text: "text-teal-700",    border: "border-teal-200",    accent: "#14b8a6" },
  "Contract / Deposit":{ bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", accent: "#10b981" },
  "Strategy":          { bg: "bg-cyan-50",    text: "text-cyan-800",    border: "border-cyan-200",    accent: "#0891b2" },
  "Design":            { bg: "bg-teal-50",    text: "text-teal-800",    border: "border-teal-200",    accent: "#0d9488" },
  "Development":       { bg: "bg-sky-50",     text: "text-sky-800",     border: "border-sky-200",     accent: "#0284c7" },
  "Content":           { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   accent: "#f59e0b" },
  "Review":            { bg: "bg-orange-50",  text: "text-orange-700",  border: "border-orange-200",  accent: "#f97316" },
  "Revision":          { bg: "bg-yellow-50",  text: "text-yellow-700",  border: "border-yellow-200",  accent: "#eab308" },
  "Launch Prep":       { bg: "bg-lime-50",    text: "text-lime-700",    border: "border-lime-200",    accent: "#84cc16" },
  "Launched":          { bg: "bg-green-50",   text: "text-green-700",   border: "border-green-200",   accent: "#22c55e" },
  "Maintenance":       { bg: "bg-teal-50",    text: "text-teal-700",    border: "border-teal-200",    accent: "#14b8a6" },
  "Completed":         { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", accent: "#10b981" },
};
