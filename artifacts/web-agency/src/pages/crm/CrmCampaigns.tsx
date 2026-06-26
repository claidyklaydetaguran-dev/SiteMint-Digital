import { useEffect, useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { CrmLayout } from "./CrmLayout";
import {
  Mail, Users, Eye, Send, ChevronRight, ChevronLeft,
  AlertTriangle, CheckCircle2, Info, Zap, RefreshCw, X,
  Plus, Trash2, Clock, FileText, ArrowLeft, Save, Loader2,
  SkipForward, XCircle, BarChart2, Lightbulb, Award, ShieldCheck, AlertCircle, TrendingUp,
} from "lucide-react";
import {
  computeSimplifiedDisc,
  DISC_META,
  type DiscStyle,
} from "@/lib/discEngine";
import {
  personalizeCampaignEmail,
  createDiscVariants,
  previewPersonalizedEmail,
  type PersonalizedEmail,
} from "@/lib/campaignPersonalization";

const tok = () => localStorage.getItem("adminToken") || "";
const authH = () => ({ Authorization: `Bearer ${tok()}`, "Content-Type": "application/json" });

// ── Types ─────────────────────────────────────────────────────────────────────

interface Lead {
  id: number;
  name: string;
  email: string;
  company?: string;
  status: string;
  priority: string;
  source?: string;
  serviceInterest?: string;
  estimatedValue?: string | null;
  lastContactedAt?: string | null;
  nextFollowUpAt?: string | null;
  proposalStatus?: string;
  smsConsent?: boolean;
}

interface EmailTemplate {
  id: number;
  name: string;
  type: string;
  subject: string;
  body: string;
}

interface Campaign {
  id: number;
  name: string;
  subject: string;
  body: string;
  status: "draft" | "ready" | "archived";
  createdAt: string;
  updatedAt: string;
  recipientCount?: number;
}

interface RecipientSendResult {
  recipientId: number;
  leadId: number;
  email: string;
  status: "sent" | "failed" | "skipped";
  error?: string;
}

interface CampaignSendResult {
  sent: number;
  failed: number;
  skipped: number;
  results: RecipientSendResult[];
  testMode: boolean;
}

interface DiscBreakdownItem {
  style: string;
  count: number;
  sent: number;
  failed: number;
  skipped: number;
}

interface CampaignAnalytics {
  campaign: Campaign;
  totals: {
    recipients: number;
    sent: number;
    failed: number;
    skipped: number;
    selected: number;
    sendRate: number;
    failureRate: number;
  };
  discBreakdown: DiscBreakdownItem[];
  recentRecipients: Array<{
    leadId: number;
    name: string;
    email: string;
    discStyleUsed: string | null;
    status: string;
    sentAt: string | null;
    lastError: string | null;
  }>;
  replyEstimate: {
    count: number;
    total: number;
    rate: number;
  };
  eventMetrics?: {
    hasEvents: boolean;
    opened: number;
    clicked: number;
    bounced: number;
    deliveryFailed: number;
    uniqueOpeners: number;
    uniqueClickers: number;
    openRate: number;
    clickRate: number;
    bounceRate: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StepBadge({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
        done ? "bg-emerald-500 text-white" : active ? "bg-[#1e293b] text-white" : "bg-gray-100 text-gray-400"
      }`}>
        {done ? <CheckCircle2 className="w-4 h-4" /> : n}
      </div>
      <span className={`text-xs font-semibold transition-all ${
        active ? "text-foreground" : done ? "text-emerald-600" : "text-muted-foreground"
      }`}>{label}</span>
    </div>
  );
}

function EmailCard({ subject, body, badge, badgeColor }: { subject: string; body: string; badge?: string; badgeColor?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      {badge && (
        <div className={`px-4 py-1.5 text-[10px] font-bold tracking-widest uppercase ${badgeColor ?? "bg-gray-100 text-gray-500"}`}>
          {badge}
        </div>
      )}
      <div className="px-4 pt-3 pb-1 border-b border-gray-100">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Subject</p>
        <p className="text-sm font-semibold text-foreground">{subject || "(no subject)"}</p>
      </div>
      <div className="px-4 py-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Body</p>
        <pre className="text-xs text-foreground whitespace-pre-wrap leading-relaxed font-sans max-h-48 overflow-y-auto">
          {body || "(no content)"}
        </pre>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft:    "bg-gray-100 text-gray-600",
    ready:    "bg-blue-100 text-blue-700",
    archived: "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${map[status] ?? "bg-gray-100 text-gray-500"}`}>
      {status}
    </span>
  );
}

// ── Campaign Insights (rule-based, no AI) ─────────────────────────────────────

function generateInsights(a: CampaignAnalytics): string[] {
  const ins: string[] = [];
  const { totals, discBreakdown, replyEstimate } = a;

  // Send completion
  if (totals.recipients === 0) {
    ins.push("Add recipients to start sending this campaign.");
  } else if (totals.sendRate === 100) {
    ins.push("Campaign fully delivered — all recipients reached successfully.");
  } else if (totals.sendRate === 0 && totals.selected > 0) {
    ins.push("Campaign has not been sent yet. Use Step 3 in the builder to send.");
  } else if (totals.sendRate === 0 && totals.selected === 0 && totals.recipients > 0) {
    ins.push("Campaign has been sent. All recipients are in a terminal state (sent / skipped / failed).");
  } else if (totals.sendRate < 50) {
    ins.push(`Only ${totals.sendRate}% of recipients were reached. Review failed and skipped contacts before resending.`);
  } else if (totals.sendRate >= 80) {
    ins.push(`Strong delivery — ${totals.sendRate}% of recipients received this campaign.`);
  }

  // Data quality / skipped
  const skippedRate = totals.recipients > 0 ? Math.round((totals.skipped / totals.recipients) * 100) : 0;
  if (skippedRate > 30) {
    ins.push(`High skipped rate (${skippedRate}%). Many leads are missing valid email addresses — clean up contacts before the next send.`);
  } else if (skippedRate > 10) {
    ins.push(`${skippedRate}% of recipients were skipped. Check contact records for leads without valid emails.`);
  }

  // Failures
  if (totals.failureRate > 10) {
    ins.push(`${totals.failureRate}% of sends failed. Check the error column in the recipient table and use Resend on failed contacts.`);
  }

  // DISC audience composition
  const activeDisc = discBreakdown.filter(d => d.count > 0).sort((x, y) => y.count - x.count);
  if (activeDisc.length > 0 && totals.recipients > 0) {
    const top = activeDisc[0];
    const pct = Math.round((top.count / totals.recipients) * 100);
    const COPY: Record<string, string> = {
      Driver:     "Keep future campaigns concise with a direct CTA and clear next step.",
      Expressive: "Use energetic language and big-picture outcomes to engage this audience.",
      Amiable:    "Lead with relationship and trust. A warmer, reassuring CTA may perform better.",
      Analytical: "Support future campaigns with proof, data points, timelines, and pricing details.",
    };
    ins.push(`Most recipients (${pct}%) are ${top.style}-style leads. ${COPY[top.style] ?? ""}`);
  }

  // Best vs worst DISC delivery
  const withSent = discBreakdown.filter(d => d.count > 0 && d.sent > 0);
  if (withSent.length >= 2) {
    const best  = [...withSent].sort((x, y) => (y.sent / y.count) - (x.sent / x.count))[0];
    const worst = [...discBreakdown.filter(d => d.count > 0)].sort((x, y) => {
      return ((y.failed + y.skipped) / y.count) - ((x.failed + x.skipped) / x.count);
    })[0];
    ins.push(`${best.style} leads had the highest delivery success in this campaign.`);
    if (worst.style !== best.style && (worst.failed + worst.skipped) > 0) {
      ins.push(`${worst.style} leads had the most delivery issues — review their contact records.`);
    }
  }

  // Reply estimate
  if (replyEstimate.total > 0) {
    if (replyEstimate.rate >= 10) {
      ins.push(`Strong estimated reply activity — ${replyEstimate.rate}% of sent recipients have since sent inbound messages.`);
    } else if (replyEstimate.count === 0) {
      ins.push("No estimated replies detected yet. Consider a follow-up campaign or a direct SMS touchpoint to re-engage.");
    }
  }

  return ins;
}

// ── Campaign Quality Score ─────────────────────────────────────────────────────

interface QualityScore {
  score: number;
  badge: "Excellent" | "Good" | "Needs Cleanup" | "Risky";
  reasons: string[];
}

function computeQualityScore(a: CampaignAnalytics): QualityScore {
  const { totals, replyEstimate } = a;
  const reasons: string[] = [];

  if (totals.recipients === 0) {
    return { score: 0, badge: "Risky", reasons: ["No recipients added to this campaign"] };
  }

  let score = 0;

  // Send rate → up to 40 pts
  score += Math.round(totals.sendRate * 0.4);
  if (totals.sendRate === 100)      reasons.push("All recipients successfully reached (+40)");
  else if (totals.sendRate >= 80)   reasons.push(`${totals.sendRate}% send rate — strong delivery`);
  else if (totals.sendRate >= 50)   reasons.push(`${totals.sendRate}% send rate — moderate delivery`);
  else if (totals.sendRate > 0)     reasons.push(`${totals.sendRate}% send rate — many recipients not reached`);
  else                              reasons.push("Campaign not yet sent — send rate is 0%");

  // Failure rate → deduct up to 20 pts
  if (totals.failureRate > 0) {
    const pen = Math.min(20, Math.round(totals.failureRate * 0.4));
    score -= pen;
    reasons.push(`${totals.failureRate}% failure rate (−${pen} pts)`);
  }

  // Skipped rate → deduct up to 15 pts
  const skippedRate = Math.round((totals.skipped / totals.recipients) * 100);
  if (skippedRate > 30) {
    score -= 15;
    reasons.push(`${skippedRate}% skipped — many leads lack valid emails (−15 pts)`);
  } else if (skippedRate > 10) {
    score -= 5;
    reasons.push(`${skippedRate}% skipped — some leads need email cleanup (−5 pts)`);
  }

  // Recipient count → up to 10 pts
  if (totals.recipients >= 20)     { score += 10; reasons.push("Large audience (20+ recipients, +10)"); }
  else if (totals.recipients >= 5) { score += 5;  reasons.push("Reasonable audience size (+5)"); }
  else                             { reasons.push("Small audience — consider adding more recipients"); }

  // Reply estimate bonus → up to 10 pts
  if (replyEstimate.total > 0 && replyEstimate.rate >= 10) {
    score += 10;
    reasons.push(`Estimated ${replyEstimate.rate}% reply rate — strong engagement signal (+10)`);
  } else if (replyEstimate.total > 0 && replyEstimate.rate >= 5) {
    score += 5;
    reasons.push(`Estimated ${replyEstimate.rate}% reply rate (+5)`);
  }

  score = Math.max(0, Math.min(100, score));

  let badge: QualityScore["badge"];
  if (score >= 80)      badge = "Excellent";
  else if (score >= 60) badge = "Good";
  else if (score >= 40) badge = "Needs Cleanup";
  else                  badge = "Risky";

  return { score, badge, reasons };
}

// ── Main page ─────────────────────────────────────────────────────────────────

const STATUSES   = ["New","Contacted","Follow-up","Proposal Sent","Negotiating","Won","Lost","Nurture"];
const PRIORITIES = ["Low","Medium","High"];
const DISC_STYLES: DiscStyle[] = ["Driver","Expressive","Amiable","Analytical"];

export default function CrmCampaigns() {
  const [, navigate] = useLocation();

  // ── Global data ──
  const [allLeads, setAllLeads]     = useState<Lead[]>([]);
  const [templates, setTemplates]   = useState<EmailTemplate[]>([]);
  const [campaigns, setCampaigns]   = useState<Campaign[]>([]);
  const [loading, setLoading]       = useState(true);

  // ── View: "history" | "builder" | "execution" | "analytics" ──
  const [view, setView] = useState<"history" | "builder" | "execution" | "analytics">("history");

  // ── Persistence state ──
  const [campaignId, setCampaignId]           = useState<number | null>(null);
  const [campaignStatus, setCampaignStatus]   = useState<"draft"|"ready"|"archived">("draft");
  const [savedAt, setSavedAt]                 = useState<Date | null>(null);
  const [isDirty, setIsDirty]                 = useState(false);
  const [saving, setSaving]                   = useState(false);
  const [saveError, setSaveError]             = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting]               = useState(false);

  // ── Wizard step ──
  const [step, setStep] = useState(0);

  // ── Step 1 — Campaign setup ──
  const [campaignName, setCampaignName]     = useState("");
  const [baseSubject, setBaseSubject]       = useState("");
  const [baseBody, setBaseBody]             = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");

  // ── Step 2 — Audience ──
  const [filterStatus, setFilterStatus]     = useState("");
  const [filterDisc, setFilterDisc]         = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [emailOnly, setEmailOnly]           = useState(true);
  const [selectedLeads, setSelectedLeads]   = useState<Set<number>>(new Set());

  // ── Step 3 — Preview & Send ──
  const [previewLeadId, setPreviewLeadId]   = useState<number | null>(null);
  const [activeDiscTab, setActiveDiscTab]   = useState<DiscStyle>("Driver");
  const [testEmail, setTestEmail]           = useState("");
  const [testSending, setTestSending]       = useState(false);
  const [testResult, setTestResult]         = useState<{ ok: boolean; message: string } | null>(null);

  // ── Analytics ──
  const [analyticsData, setAnalyticsData]       = useState<CampaignAnalytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError]     = useState("");

  // ── Send execution ──
  const [showSendConfirm, setShowSendConfirm]     = useState(false);
  const [sendConfirmChecked, setSendConfirmChecked] = useState(false);
  const [sending, setSending]                     = useState(false);
  const [sendResult, setSendResult]               = useState<CampaignSendResult | null>(null);
  const [resendingId, setResendingId]             = useState<number | null>(null);

  // ── Load initial data ──
  useEffect(() => {
    if (!tok()) { navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
    const h = { Authorization: `Bearer ${tok()}` };
    Promise.all([
      fetch("/api/crm/leads",            { headers: h }).then(r => r.json()),
      fetch("/api/crm/email-templates",  { headers: h }).then(r => r.json()),
      fetch("/api/crm/campaigns",        { headers: h }).then(r => r.json()),
    ])
      .then(([ld, td, cd]) => {
        setAllLeads((ld.leads ?? []).slice().sort((a: Lead, b: Lead) => a.name.localeCompare(b.name)));
        setTemplates(td.templates ?? []);
        setCampaigns(cd.campaigns ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [navigate]);

  const refreshCampaigns = useCallback(async () => {
    const r = await fetch("/api/crm/campaigns", { headers: { Authorization: `Bearer ${tok()}` } });
    const d = await r.json();
    setCampaigns(d.campaigns ?? []);
  }, []);

  // ── DISC map ──
  const discMap = useMemo(() => {
    const m = new Map<number, DiscStyle>();
    allLeads.forEach(l => m.set(l.id, computeSimplifiedDisc(l)));
    return m;
  }, [allLeads]);

  // ── Filtered audience ──
  const filteredLeads = useMemo(() =>
    allLeads
      .filter(l => !emailOnly    || (l.email && !l.email.includes("@imported.local")))
      .filter(l => !filterStatus   || l.status   === filterStatus)
      .filter(l => !filterPriority || l.priority === filterPriority)
      .filter(l => !filterDisc     || discMap.get(l.id) === filterDisc),
  [allLeads, filterStatus, filterPriority, filterDisc, emailOnly, discMap]);

  // ── Preview derived state ──
  const previewLead      = previewLeadId ? allLeads.find(l => l.id === previewLeadId) ?? null : null;
  const previewDiscStyle = previewLead ? discMap.get(previewLead.id) ?? "Amiable" : "Amiable";

  const previewResult = useMemo(() =>
    previewLead && baseSubject && baseBody
      ? previewPersonalizedEmail(baseSubject, baseBody, previewLead.name, previewDiscStyle)
      : null,
  [previewLead, baseSubject, baseBody, previewDiscStyle]);

  const discVariants = useMemo(() =>
    previewLead && baseSubject && baseBody
      ? createDiscVariants(baseSubject, baseBody, previewLead.name)
      : null,
  [previewLead, baseSubject, baseBody]);

  const activeVariant: PersonalizedEmail | null = discVariants?.[activeDiscTab] ?? null;

  // ── Toggle lead selection ──
  const toggleAll = () => {
    setSelectedLeads(selectedLeads.size === filteredLeads.length
      ? new Set()
      : new Set(filteredLeads.map(l => l.id)));
    setIsDirty(true);
  };
  const toggleLead = (id: number) => {
    const s = new Set(selectedLeads);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedLeads(s);
    setIsDirty(true);
  };

  // ── Mark dirty on field changes ──
  const mark = (fn: (v: string) => void) => (v: string) => { fn(v); setIsDirty(true); };

  // ── Load template ──
  const loadTemplate = (id: string) => {
    const t = templates.find(t => String(t.id) === id);
    if (t) { setBaseSubject(t.subject); setBaseBody(t.body); setSelectedTemplate(id); setIsDirty(true); }
  };

  // ── Open a saved campaign ──
  const openCampaign = async (c: Campaign) => {
    setSaveError("");
    const r = await fetch(`/api/crm/campaigns/${c.id}`, { headers: { Authorization: `Bearer ${tok()}` } });
    const d = await r.json();
    if (!r.ok) return;
    const { campaign, recipients } = d as { campaign: Campaign; recipients: Array<{ leadId: number; discStyleUsed?: string }> };
    setCampaignId(campaign.id);
    setCampaignName(campaign.name);
    setBaseSubject(campaign.subject);
    setBaseBody(campaign.body);
    setCampaignStatus(campaign.status);
    setSelectedLeads(new Set(recipients.map((rec: { leadId: number }) => rec.leadId)));
    setSavedAt(new Date(campaign.updatedAt));
    setIsDirty(false);
    setStep(0);
    setTestResult(null);
    setView("builder");
  };

  // ── Open analytics ──
  const openAnalytics = async (c: Campaign) => {
    setCampaignId(c.id);
    setCampaignName(c.name);
    setCampaignStatus(c.status);
    setAnalyticsData(null);
    setAnalyticsError("");
    setAnalyticsLoading(true);
    setView("analytics");
    try {
      const r = await fetch(`/api/crm/campaigns/${c.id}/analytics`, {
        headers: { Authorization: `Bearer ${tok()}` },
      });
      const d = await r.json();
      if (r.ok) setAnalyticsData(d);
      else setAnalyticsError(d.error ?? "Failed to load analytics");
    } catch {
      setAnalyticsError("Network error loading analytics");
    } finally {
      setAnalyticsLoading(false);
    }
  };

  // ── New campaign ──
  const newCampaign = () => {
    setCampaignId(null);
    setCampaignName("");
    setBaseSubject("");
    setBaseBody("");
    setCampaignStatus("draft");
    setSelectedLeads(new Set());
    setSavedAt(null);
    setIsDirty(false);
    setSelectedTemplate("");
    setStep(0);
    setTestResult(null);
    setView("builder");
  };

  // ── Save draft ──
  const saveDraft = async () => {
    if (!campaignName.trim() || !baseSubject.trim() || !baseBody.trim()) {
      setSaveError("Campaign name, subject, and body are required to save."); return;
    }
    setSaving(true);
    setSaveError("");
    try {
      let id = campaignId;
      if (!id) {
        // Create
        const r = await fetch("/api/crm/campaigns", {
          method: "POST",
          headers: authH(),
          body: JSON.stringify({ name: campaignName, subject: baseSubject, body: baseBody, status: campaignStatus }),
        });
        const d = await r.json();
        if (!r.ok) { setSaveError(d.error ?? "Failed to save"); return; }
        id = d.campaign.id;
        setCampaignId(id);
      } else {
        // Update
        const r = await fetch(`/api/crm/campaigns/${id}`, {
          method: "PATCH",
          headers: authH(),
          body: JSON.stringify({ name: campaignName, subject: baseSubject, body: baseBody, status: campaignStatus }),
        });
        const d = await r.json();
        if (!r.ok) { setSaveError(d.error ?? "Failed to save"); return; }
      }
      // Save recipients with personalized versions
      const recipients = [...selectedLeads].map(leadId => {
        const lead      = allLeads.find(l => l.id === leadId);
        const style     = discMap.get(leadId) ?? "Amiable";
        const personalized = lead
          ? personalizeCampaignEmail(baseSubject, baseBody, lead.name, style)
          : null;
        return {
          leadId,
          discStyleUsed:       style,
          personalizedSubject: personalized?.subject,
          personalizedBody:    personalized?.body,
        };
      });
      await fetch(`/api/crm/campaigns/${id}/recipients`, {
        method: "POST",
        headers: authH(),
        body: JSON.stringify({ recipients }),
      });
      setSavedAt(new Date());
      setIsDirty(false);
      await refreshCampaigns();
    } finally {
      setSaving(false);
    }
  };

  // ── Send campaign ──
  const sendCampaign = async () => {
    if (!campaignId) return;
    setSending(true);
    setSendResult(null);
    setShowSendConfirm(false);
    setSendConfirmChecked(false);
    setSaveError("");
    try {
      const r = await fetch(`/api/crm/campaigns/${campaignId}/send`, {
        method: "POST",
        headers: authH(),
      });
      const d = await r.json();
      if (r.ok) {
        setSendResult(d as CampaignSendResult);
        setView("execution");
        await refreshCampaigns();
      } else {
        setSaveError(d.error ?? "Failed to send campaign");
      }
    } catch {
      setSaveError("Network error during send — please try again");
    } finally {
      setSending(false);
    }
  };

  // ── Resend one failed/skipped recipient ──
  const resendRecipient = async (recipientId: number) => {
    if (!campaignId || !sendResult) return;
    setResendingId(recipientId);
    try {
      const r = await fetch(`/api/crm/campaigns/${campaignId}/recipients/${recipientId}/resend`, {
        method: "POST",
        headers: authH(),
      });
      const d = await r.json();
      if (r.ok) {
        setSendResult(prev => {
          if (!prev) return prev;
          const wasFailedOrSkipped = prev.results.find(x => x.recipientId === recipientId && (x.status === "failed" || x.status === "skipped"));
          return {
            ...prev,
            sent:   prev.sent   + (d.status === "sent" ? 1 : 0),
            failed: prev.failed - (wasFailedOrSkipped?.status === "failed" ? 1 : 0) + (d.status === "failed" ? 1 : 0),
            results: prev.results.map(res =>
              res.recipientId === recipientId
                ? { ...res, status: d.status as "sent" | "failed" | "skipped", error: d.error }
                : res
            ),
          };
        });
      }
    } catch { /* silent */ }
    finally { setResendingId(null); }
  };

  // ── Delete campaign ──
  const deleteCampaign = async () => {
    if (!campaignId) { setView("history"); setShowDeleteConfirm(false); return; }
    setDeleting(true);
    try {
      await fetch(`/api/crm/campaigns/${campaignId}`, { method: "DELETE", headers: authH() });
      await refreshCampaigns();
      setView("history");
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  // ── Test send ──
  const sendTestEmail = async () => {
    if (!testEmail || !baseSubject || !baseBody) return;
    setTestSending(true);
    setTestResult(null);
    try {
      // If we have a saved campaign, use the persisted endpoint
      const url = campaignId
        ? `/api/crm/campaigns/${campaignId}/test-send`
        : "/api/crm/campaigns/test-send";

      const body = campaignId
        ? JSON.stringify({ to: testEmail })
        : (() => {
            const style      = previewDiscStyle;
            const personalized = previewLead
              ? personalizeCampaignEmail(baseSubject, baseBody, previewLead.name, style)
              : { subject: baseSubject, body: baseBody };
            return JSON.stringify({ to: testEmail, subject: personalized.subject, body: personalized.body });
          })();

      const r = await fetch(url, { method: "POST", headers: authH(), body });
      const d = await r.json();
      setTestResult({
        ok: r.ok,
        message: r.ok
          ? (d.testMode
              ? `Test mode — simulated send to ${testEmail} (no email actually sent).`
              : `Test email sent to ${testEmail} ✓`)
          : (d.error ?? "Failed to send test email"),
      });
    } catch {
      setTestResult({ ok: false, message: "Network error — please try again" });
    } finally {
      setTestSending(false);
    }
  };

  // ── Validations ──
  const step1Valid = campaignName.trim() && baseSubject.trim() && baseBody.trim();
  const step2Valid = selectedLeads.size > 0;

  // ── Loading state ──
  if (loading) {
    return (
      <CrmLayout>
        <div className="p-6 max-w-5xl mx-auto animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="h-4 w-64 bg-gray-100 rounded" />
          <div className="h-32 bg-gray-100 rounded-xl" />
        </div>
      </CrmLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // EXECUTION VIEW — shown after a campaign send completes
  // ════════════════════════════════════════════════════════════════════════════

  if (view === "execution" && sendResult) {
    const total    = sendResult.results.length;
    const pctDone  = total > 0 ? Math.round(((sendResult.sent + sendResult.skipped) / total) * 100) : 0;
    const hasFailed = sendResult.failed > 0;

    return (
      <CrmLayout>
        <div className="p-6 max-w-5xl mx-auto space-y-5">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setView("builder")}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Campaign
              </button>
              <span className="text-gray-300">/</span>
              <h1 className="text-sm font-bold text-foreground truncate max-w-xs">{campaignName}</h1>
              <StatusBadge status={campaignStatus} />
            </div>
            <button
              onClick={() => setView("history")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              All Campaigns
            </button>
          </div>

          {/* Test mode notice */}
          {sendResult.testMode && (
            <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <p className="text-xs text-amber-800">
                <strong>Test mode active.</strong> No emails were actually sent externally. Recipient statuses have been updated in the database as if sent. Set <code className="bg-amber-100 px-1 rounded">CRM_EMAIL_TEST_MODE=false</code> to enable live sending.
              </p>
            </div>
          )}

          {/* Summary tiles */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Total",   value: total,              color: "bg-gray-50   border-gray-200  text-gray-700" },
              { label: "Sent",    value: sendResult.sent,    color: "bg-emerald-50 border-emerald-200 text-emerald-700" },
              { label: "Failed",  value: sendResult.failed,  color: sendResult.failed  > 0 ? "bg-red-50   border-red-200   text-red-700"   : "bg-gray-50 border-gray-200 text-gray-400" },
              { label: "Skipped", value: sendResult.skipped, color: sendResult.skipped > 0 ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-gray-50 border-gray-200 text-gray-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className={`border rounded-xl p-4 text-center ${color}`}>
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs font-semibold mt-0.5 opacity-80">{label}</p>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-foreground">Send Progress</p>
              <p className="text-xs text-muted-foreground">{pctDone}% complete</p>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${hasFailed ? "bg-amber-400" : "bg-emerald-500"}`}
                style={{ width: `${pctDone}%` }}
              />
            </div>
            {hasFailed && (
              <p className="text-xs text-red-600 mt-2 font-medium">
                {sendResult.failed} recipient{sendResult.failed !== 1 ? "s" : ""} failed — use "Resend" below.
              </p>
            )}
          </div>

          {/* Per-recipient results table */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-bold text-foreground">Recipient Results</h2>
              <span className="text-xs text-muted-foreground ml-1">({total} total)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {["Lead","Email","DISC Style","Status","Sent At","Error",""].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sendResult.results.map(res => {
                    const lead = allLeads.find(l => l.id === res.leadId);
                    const disc = lead ? discMap.get(lead.id) : undefined;
                    const meta = disc ? DISC_META[disc] : null;
                    const isBusy = resendingId === res.recipientId;
                    return (
                      <tr key={res.recipientId} className={`transition-colors ${
                        res.status === "sent"    ? "bg-emerald-50/30" :
                        res.status === "failed"  ? "bg-red-50/30"     :
                        "bg-gray-50/30"
                      }`}>
                        <td className="px-4 py-3 font-medium text-foreground text-xs">{lead?.name ?? `Lead #${res.leadId}`}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[140px]">{res.email || "—"}</td>
                        <td className="px-4 py-3">
                          {meta && disc
                            ? <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${meta.bgColor} ${meta.textColor} ${meta.borderColor}`}>{meta.emoji} {disc}</span>
                            : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          {res.status === "sent" && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3" /> Sent
                            </span>
                          )}
                          {res.status === "failed" && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                              <XCircle className="w-3 h-3" /> Failed
                            </span>
                          )}
                          {res.status === "skipped" && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                              <SkipForward className="w-3 h-3" /> Skipped
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">—</td>
                        <td className="px-4 py-3 text-xs text-red-500 max-w-[160px] truncate" title={res.error}>{res.error ?? ""}</td>
                        <td className="px-4 py-3">
                          {(res.status === "failed" || (res.status === "skipped" && res.error !== "Already sent")) && (
                            <button
                              onClick={() => resendRecipient(res.recipientId)}
                              disabled={isBusy || resendingId !== null}
                              className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded-lg hover:bg-blue-50 disabled:opacity-40 transition-colors"
                            >
                              {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                              {isBusy ? "Sending…" : "Resend"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </CrmLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ANALYTICS VIEW
  // ════════════════════════════════════════════════════════════════════════════

  if (view === "analytics") {
    const a = analyticsData;
    const DISC_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
      Driver:     { bg: "bg-red-50",    text: "text-red-700",    bar: "bg-red-400"    },
      Expressive: { bg: "bg-amber-50",  text: "text-amber-700",  bar: "bg-amber-400"  },
      Amiable:    { bg: "bg-green-50",  text: "text-green-700",  bar: "bg-green-400"  },
      Analytical: { bg: "bg-blue-50",   text: "text-blue-700",   bar: "bg-blue-400"   },
    };
    return (
      <CrmLayout>
        <div className="p-6 max-w-5xl mx-auto space-y-5">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setView("history")}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Campaigns
              </button>
              <span className="text-gray-300">/</span>
              <span className="text-sm font-semibold text-foreground truncate max-w-xs">{campaignName}</span>
              <StatusBadge status={campaignStatus} />
              <span className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 bg-violet-100 px-2.5 py-0.5 rounded-full border border-violet-200">
                <BarChart2 className="w-3 h-3" /> Analytics
              </span>
            </div>
            <button
              onClick={() => openCampaign({ id: campaignId!, name: campaignName, subject: "", body: "", status: campaignStatus, createdAt: "", updatedAt: "" })}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
            >
              Open Builder
            </button>
          </div>

          {/* Loading / error */}
          {analyticsLoading && (
            <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Loading analytics…</span>
            </div>
          )}
          {analyticsError && (
            <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <XCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-xs text-red-700">{analyticsError}</p>
            </div>
          )}

          {a && (
            <>
              {/* Open/click/bounce tracking — shows real event cards or setup notice */}
              {a.eventMetrics?.hasEvents ? (
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    <h2 className="text-sm font-bold text-foreground">Email Engagement</h2>
                    <span className="ml-auto text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      Tracked by Resend webhooks
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 mb-4">
                      {/* Opens — unique openers primary, total events sub-label */}
                      <div className="border rounded-xl p-3 text-center bg-blue-50 border-blue-200 text-blue-700">
                        <p className="text-xl font-bold">{a.eventMetrics.uniqueOpeners}</p>
                        <p className="text-[10px] font-semibold mt-0.5 opacity-70 uppercase tracking-wide">Unique Opens</p>
                        {a.eventMetrics.opened !== a.eventMetrics.uniqueOpeners && (
                          <p className="text-[9px] opacity-50 mt-0.5">{a.eventMetrics.opened} total events</p>
                        )}
                      </div>
                      {/* Clicks — unique clickers primary, total events sub-label */}
                      <div className="border rounded-xl p-3 text-center bg-violet-50 border-violet-200 text-violet-700">
                        <p className="text-xl font-bold">{a.eventMetrics.uniqueClickers}</p>
                        <p className="text-[10px] font-semibold mt-0.5 opacity-70 uppercase tracking-wide">Unique Clicks</p>
                        {a.eventMetrics.clicked !== a.eventMetrics.uniqueClickers && (
                          <p className="text-[9px] opacity-50 mt-0.5">{a.eventMetrics.clicked} total events</p>
                        )}
                      </div>
                      {/* Bounces, rates */}
                      {[
                        { label: "Bounces",     value: a.eventMetrics.bounced,       color: a.eventMetrics.bounced > 0 ? "bg-red-50   border-red-200   text-red-700"   : "bg-gray-50 border-gray-200 text-gray-400" },
                        { label: "Open Rate",   value: `${a.eventMetrics.openRate}%`,   color: "bg-blue-50   border-blue-200   text-blue-700" },
                        { label: "Click Rate",  value: `${a.eventMetrics.clickRate}%`,  color: "bg-violet-50 border-violet-200 text-violet-700" },
                        { label: "Bounce Rate", value: `${a.eventMetrics.bounceRate}%`, color: a.eventMetrics.bounced > 0 ? "bg-red-50   border-red-200   text-red-700"   : "bg-gray-50 border-gray-200 text-gray-400" },
                      ].map(({ label, value, color }) => (
                        <div key={label} className={`border rounded-xl p-3 text-center ${color}`}>
                          <p className="text-xl font-bold">{value}</p>
                          <p className="text-[10px] font-semibold mt-0.5 opacity-70 uppercase tracking-wide">{label}</p>
                        </div>
                      ))}
                    </div>
                    {a.eventMetrics.deliveryFailed > 0 && (
                      <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        {a.eventMetrics.deliveryFailed} delivery failure{a.eventMetrics.deliveryFailed !== 1 ? "s" : ""} reported by Resend.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-start gap-2.5 px-4 py-3">
                    <Info className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-xs text-gray-500">
                        <strong className="text-gray-600">Open and click tracking are not configured yet, or no events have been received.</strong>{" "}
                        Analytics below are based on send-time recipient status only.
                      </p>
                      <p className="text-[10px] text-gray-400">
                        Webhook URL: <code className="font-mono bg-white border border-gray-200 rounded px-1">/api/crm/webhooks/resend</code>
                        {" · "}Required env: <code className="font-mono bg-white border border-gray-200 rounded px-1">RESEND_WEBHOOK_SECRET</code>
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Summary tiles — 6 cards */}
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                {[
                  { label: "Recipients", value: a.totals.recipients,  color: "bg-gray-50   border-gray-200  text-gray-700" },
                  { label: "Sent",       value: a.totals.sent,        color: a.totals.sent     > 0 ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-gray-50 border-gray-200 text-gray-400" },
                  { label: "Failed",     value: a.totals.failed,      color: a.totals.failed   > 0 ? "bg-red-50   border-red-200   text-red-700"   : "bg-gray-50 border-gray-200 text-gray-400" },
                  { label: "Skipped",    value: a.totals.skipped,     color: a.totals.skipped  > 0 ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-gray-50 border-gray-200 text-gray-400" },
                  { label: "Send Rate",  value: `${a.totals.sendRate}%`,    color: "bg-violet-50 border-violet-200 text-violet-700" },
                  { label: "Fail Rate",  value: `${a.totals.failureRate}%`, color: a.totals.failureRate > 0 ? "bg-red-50 border-red-200 text-red-700" : "bg-gray-50 border-gray-200 text-gray-400" },
                ].map(({ label, value, color }) => (
                  <div key={label} className={`border rounded-xl p-3 text-center ${color}`}>
                    <p className="text-xl font-bold">{value}</p>
                    <p className="text-[10px] font-semibold mt-0.5 opacity-70 uppercase tracking-wide">{label}</p>
                  </div>
                ))}
              </div>

              {/* ── Quality Score ───────────────────────────────────────────── */}
              {(() => {
                const qs = computeQualityScore(a);
                const badgeStyles: Record<string, string> = {
                  Excellent:       "bg-emerald-100 text-emerald-800 border-emerald-200",
                  Good:            "bg-blue-100 text-blue-800 border-blue-200",
                  "Needs Cleanup": "bg-amber-100 text-amber-800 border-amber-200",
                  Risky:           "bg-red-100 text-red-800 border-red-200",
                };
                const trackColor: Record<string, string> = {
                  Excellent: "bg-emerald-500", Good: "bg-blue-500",
                  "Needs Cleanup": "bg-amber-400", Risky: "bg-red-400",
                };
                return (
                  <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                      <Award className="w-4 h-4 text-muted-foreground" />
                      <h2 className="text-sm font-bold text-foreground">Campaign Quality Score</h2>
                      <span className="text-[10px] text-muted-foreground ml-auto">Not AI · Rule-based</span>
                    </div>
                    <div className="p-5 flex gap-6 items-start">
                      <div className="shrink-0 text-center">
                        <p className="text-5xl font-black text-foreground leading-none">{qs.score}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">out of 100</p>
                        <span className={`mt-2 inline-block text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${badgeStyles[qs.badge]}`}>
                          {qs.badge}
                        </span>
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${trackColor[qs.badge]}`} style={{ width: `${qs.score}%` }} />
                        </div>
                        <ul className="space-y-1.5 mt-3">
                          {qs.reasons.map((r, i) => (
                            <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                              <TrendingUp className="w-3 h-3 shrink-0 mt-0.5 text-gray-400" />
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ── Campaign Insights ────────────────────────────────────────── */}
              {(() => {
                const insights = generateInsights(a);
                return (
                  <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                      <Lightbulb className="w-4 h-4 text-amber-500" />
                      <h2 className="text-sm font-bold text-foreground">Campaign Insights</h2>
                      <span className="text-[10px] text-muted-foreground ml-auto">Rule-based · Not AI generated</span>
                    </div>
                    <div className="p-4">
                      {insights.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No insights available — send the campaign to see results.</p>
                      ) : (
                        <ul className="space-y-2.5">
                          {insights.map((ins, i) => (
                            <li key={i} className="flex items-start gap-3 text-xs text-foreground">
                              <span className="w-5 h-5 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0 mt-0.5">
                                <Lightbulb className="w-2.5 h-2.5 text-amber-600" />
                              </span>
                              {ins}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {/* DISC Performance Cards — enhanced */}
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-muted-foreground" />
                    <h2 className="text-sm font-bold text-foreground">DISC Performance</h2>
                  </div>
                  <div className="p-4 space-y-3">
                    {a.discBreakdown.map(d => {
                      const dc   = DISC_COLORS[d.style] ?? { bg: "bg-gray-50", text: "text-gray-700", bar: "bg-gray-400" };
                      const meta = DISC_META[d.style as DiscStyle];
                      const successRate = d.count > 0 ? Math.round((d.sent / d.count) * 100) : 0;
                      const skippedRate = d.count > 0 ? Math.round((d.skipped / d.count) * 100) : 0;
                      const RECO: Record<string, string> = {
                        Driver:     "Use short copy, direct CTA, clear next step.",
                        Analytical: "Add proof, pricing details, timelines, and supporting data.",
                        Amiable:    "Use warmer language, reassurance, and relationship-building.",
                        Expressive: "Use energetic language, visuals, and big-picture outcomes.",
                      };
                      return (
                        <div key={d.style} className={`rounded-xl p-3 border ${dc.bg} ${d.count === 0 ? "opacity-50" : ""}`} style={{ borderColor: "transparent" }}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className={`text-xs font-bold ${dc.text} flex items-center gap-1.5`}>
                              {meta?.emoji ?? ""} {d.style}
                            </span>
                            <span className="text-[10px] text-muted-foreground">{d.count} recipient{d.count !== 1 ? "s" : ""}</span>
                          </div>
                          {d.count === 0 ? (
                            <p className="text-[10px] text-muted-foreground italic">No recipients with this style</p>
                          ) : (
                            <>
                              {/* Progress bar — success rate */}
                              <div className="h-1.5 bg-white/60 rounded-full overflow-hidden mb-2">
                                <div className={`h-full rounded-full ${dc.bar}`} style={{ width: `${successRate}%` }} />
                              </div>
                              <div className="grid grid-cols-3 gap-1 text-[10px] font-semibold mb-2">
                                <span className="text-emerald-700">{d.sent} sent ({successRate}%)</span>
                                <span className={d.failed > 0 ? "text-red-600" : "text-gray-400"}>{d.failed} failed</span>
                                <span className={d.skipped > 0 ? "text-amber-600" : "text-gray-400"}>{d.skipped} skipped ({skippedRate}%)</span>
                              </div>
                              <p className={`text-[10px] ${dc.text} opacity-80 italic`}>{RECO[d.style] ?? ""}</p>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Reply Estimate */}
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-muted-foreground" />
                    <h2 className="text-sm font-bold text-foreground">Reply Estimate</h2>
                    <span className="text-[10px] font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
                      Estimated
                    </span>
                  </div>
                  <div className="p-5 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Based on inbound CRM messages received from sent recipients <strong>after</strong> their campaign send time.
                      This is an approximation — messages may not be direct replies to the campaign.
                    </p>
                    {a.totals.sent === 0 ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <Mail className="w-8 h-8 mx-auto mb-2 opacity-20" />
                        <p className="text-xs">No emails sent yet — reply estimate unavailable.</p>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-end gap-3">
                          <span className="text-4xl font-bold text-foreground">{a.replyEstimate.count}</span>
                          <span className="text-sm text-muted-foreground mb-1.5">
                            of {a.replyEstimate.total} sent ({a.replyEstimate.rate}%)
                          </span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-violet-400 rounded-full transition-all"
                            style={{ width: `${a.replyEstimate.rate}%` }}
                          />
                        </div>
                        {a.replyEstimate.count === 0 && (
                          <p className="text-xs text-muted-foreground italic">
                            No inbound messages detected from campaign recipients yet.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Recipient Status Table */}
              <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <h2 className="text-sm font-bold text-foreground">Recipient Status</h2>
                  <span className="text-xs text-muted-foreground ml-1">({a.recentRecipients.length})</span>
                </div>
                {a.recentRecipients.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <Users className="w-6 h-6 mx-auto mb-2 opacity-20" />
                    <p className="text-xs">No recipients added to this campaign yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50">
                          {["Name","Email","DISC Style","Status","Sent At","Error"].map(h => (
                            <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {a.recentRecipients.map(rec => {
                          const style = rec.discStyleUsed as DiscStyle | null;
                          const meta  = style ? DISC_META[style] : null;
                          return (
                            <tr key={rec.leadId} className={`transition-colors ${
                              rec.status === "sent"    ? "bg-emerald-50/30" :
                              rec.status === "failed"  ? "bg-red-50/30"     :
                              rec.status === "skipped" ? "bg-amber-50/20"   : ""
                            }`}>
                              <td className="px-4 py-3 font-medium text-xs text-foreground">{rec.name}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[140px]">{rec.email || "—"}</td>
                              <td className="px-4 py-3">
                                {meta && style
                                  ? <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${meta.bgColor} ${meta.textColor} ${meta.borderColor}`}>{meta.emoji} {style}</span>
                                  : <span className="text-gray-300 text-xs">—</span>}
                              </td>
                              <td className="px-4 py-3">
                                {rec.status === "sent" && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                                    <CheckCircle2 className="w-3 h-3" /> Sent
                                  </span>
                                )}
                                {rec.status === "failed" && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                                    <XCircle className="w-3 h-3" /> Failed
                                  </span>
                                )}
                                {rec.status === "skipped" && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                                    <SkipForward className="w-3 h-3" /> Skipped
                                  </span>
                                )}
                                {rec.status === "selected" && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                                    <Clock className="w-3 h-3" /> Pending
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">
                                {rec.sentAt ? new Date(rec.sentAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}
                              </td>
                              <td className="px-4 py-3 text-xs text-red-500 max-w-[160px] truncate" title={rec.lastError ?? ""}>
                                {rec.lastError ?? ""}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      </CrmLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // HISTORY VIEW
  // ════════════════════════════════════════════════════════════════════════════

  if (view === "history") {
    return (
      <CrmLayout>
        <div className="p-6 max-w-5xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <Mail className="w-5 h-5 text-muted-foreground" />
                <h1 className="text-xl font-bold font-serif text-foreground">Email Campaigns</h1>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                  Draft Only
                </span>
              </div>
              <p className="text-sm text-muted-foreground ml-8">
                Compose DISC-personalized email campaigns. No bulk sending — test send only.
              </p>
            </div>
            <button
              onClick={newCampaign}
              className="flex items-center gap-2 px-4 py-2 bg-[#1e293b] text-white text-sm font-semibold rounded-lg hover:bg-[#2d3e53] transition-colors"
            >
              <Plus className="w-4 h-4" /> New Campaign
            </button>
          </div>

          {/* Safety banner */}
          <div className="flex items-center gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <Info className="w-4 h-4 text-blue-500 shrink-0" />
            <p className="text-xs text-blue-800">
              <strong>Manual sending is enabled.</strong> Open a campaign, add recipients, and use the "Send Campaign" button in Step 3.
              Scheduling and automation are still disabled. Test send always goes to a manually entered address only.
            </p>
          </div>

          {/* Campaign list */}
          {campaigns.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm py-16 text-center">
              <FileText className="w-8 h-8 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">No campaigns yet</p>
              <p className="text-xs text-muted-foreground mb-4">
                Create your first campaign to start building DISC-personalized emails.
              </p>
              <button
                onClick={newCampaign}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#1e293b] text-white text-sm font-semibold rounded-lg hover:bg-[#2d3e53] transition-colors"
              >
                <Plus className="w-4 h-4" /> New Campaign
              </button>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-bold text-foreground">Campaign Drafts</h2>
                <span className="text-xs text-muted-foreground ml-1">({campaigns.length})</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    {["Name","Status","Recipients","Created","Updated",""].map(h => (
                      <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {campaigns.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-foreground">{c.name}</td>
                      <td className="px-5 py-3.5"><StatusBadge status={c.status} /></td>
                      <td className="px-5 py-3.5 text-muted-foreground text-xs">
                        {c.recipientCount ?? 0} leads
                      </td>
                      <td className="px-5 py-3.5 text-xs text-muted-foreground">{fmtDate(c.createdAt)}</td>
                      <td className="px-5 py-3.5 text-xs text-muted-foreground">{fmtDate(c.updatedAt)}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openCampaign(c)}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-2.5 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                          >
                            Open
                          </button>
                          <button
                            onClick={() => openAnalytics(c)}
                            className="flex items-center gap-1 text-xs font-semibold text-violet-600 hover:text-violet-800 px-2.5 py-1 rounded-lg hover:bg-violet-50 transition-colors"
                          >
                            <BarChart2 className="w-3 h-3" /> Analytics
                          </button>
                          <DeleteCampaignBtn
                            onConfirm={async () => {
                              await fetch(`/api/crm/campaigns/${c.id}`, { method: "DELETE", headers: authH() });
                              await refreshCampaigns();
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CrmLayout>
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // BUILDER VIEW
  // ════════════════════════════════════════════════════════════════════════════

  return (
    <CrmLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-4">

        {/* ── Builder top bar ───────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView("history")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Campaigns
            </button>
            <span className="text-gray-300">/</span>
            <span className="text-sm font-semibold text-foreground truncate max-w-[200px]">
              {campaignName || "New Campaign"}
            </span>
            <StatusBadge status={campaignStatus} />
            {isDirty && (
              <span className="flex items-center gap-1 text-[10px] text-amber-600 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" /> Unsaved changes
              </span>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            {savedAt && !isDirty && (
              <span className="flex items-center gap-1 text-[10px] text-emerald-600">
                <Clock className="w-3 h-3" /> Saved at {fmtTime(savedAt)}
              </span>
            )}
            {saveError && (
              <span className="text-[10px] text-red-500">{saveError}</span>
            )}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 border border-red-200 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {campaignId ? "Delete" : "Discard"}
            </button>
            <button
              onClick={saveDraft}
              disabled={saving || !campaignName.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-[#1e293b] text-white text-xs font-semibold rounded-lg hover:bg-[#2d3e53] disabled:opacity-40 transition-colors"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {saving ? "Saving…" : "Save Draft"}
            </button>
          </div>
        </div>

        {/* ── Safety banner ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
          <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <p className="text-xs text-blue-800">
            <strong>Manual sending is enabled.</strong> Use "Send Campaign" in Step 3 to send to saved recipients.
            Scheduling and automation are still disabled.
          </p>
        </div>

        {/* ── Step indicator ─────────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-3.5 shadow-sm">
          <div className="flex items-center gap-6">
            <StepBadge n={1} label="Setup"          active={step === 0} done={step > 0} />
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
            <StepBadge n={2} label="Audience"       active={step === 1} done={step > 1} />
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
            <StepBadge n={3} label="Preview & Send" active={step === 2} done={false} />
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            STEP 1 — SETUP
        ══════════════════════════════════════════════════════════════════════ */}
        {step === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-bold text-foreground">Step 1 — Campaign Setup</h2>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  Campaign Name <span className="text-red-500">*</span>
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="e.g. Q3 Re-engagement Campaign"
                  value={campaignName}
                  onChange={e => mark(setCampaignName)(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Status</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none bg-white"
                    value={campaignStatus}
                    onChange={e => { setCampaignStatus(e.target.value as "draft"|"ready"|"archived"); setIsDirty(true); }}
                  >
                    <option value="draft">Draft</option>
                    <option value="ready">Ready</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                {templates.length > 0 && (
                  <div className="flex-1">
                    <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Load from Template</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none bg-white"
                      value={selectedTemplate}
                      onChange={e => loadTemplate(e.target.value)}
                    >
                      <option value="">— Choose —</option>
                      {templates.map(t => (
                        <option key={t.id} value={String(t.id)}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  Base Subject Line <span className="text-red-500">*</span>
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="e.g. Let's talk about growing your business online"
                  value={baseSubject}
                  onChange={e => mark(setBaseSubject)(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Personalized per DISC style (Driver: trimmed · Analytical: "Details: …" · Expressive: "🚀 …")
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  Base Email Body <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 min-h-[160px] resize-y font-mono"
                  placeholder={"Write your core message here.\n\nThe personalization engine wraps this with a DISC-appropriate greeting, tone, and CTA for each lead."}
                  value={baseBody}
                  onChange={e => mark(setBaseBody)(e.target.value)}
                />
              </div>

              {/* Live DISC preview */}
              {baseSubject && baseBody && (
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    <p className="text-xs font-bold text-foreground">Live DISC Preview</p>
                    <span className="text-[10px] text-muted-foreground">— how this adapts per style</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {DISC_STYLES.map(style => {
                      const meta    = DISC_META[style];
                      const preview = personalizeCampaignEmail(baseSubject, baseBody, "First Name", style);
                      return (
                        <div key={style} className={`rounded-lg border p-3 ${meta.bgColor} ${meta.borderColor}`}>
                          <p className={`text-[10px] font-bold mb-1 ${meta.textColor}`}>{meta.emoji} {style}</p>
                          <p className="text-[10px] font-semibold text-foreground truncate">{preview.subject}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{preview.body.slice(0, 80)}…</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={saveDraft}
                  disabled={saving || !campaignName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors"
                >
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save Draft
                </button>
                <button
                  onClick={() => setStep(1)}
                  disabled={!step1Valid}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#1e293b] text-white text-sm font-semibold rounded-lg hover:bg-[#2d3e53] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next: Audience <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            STEP 2 — AUDIENCE
        ══════════════════════════════════════════════════════════════════════ */}
        {step === 1 && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-bold text-foreground">Step 2 — Select Audience</h2>
              </div>
              <span className="text-xs text-muted-foreground">{selectedLeads.size} of {filteredLeads.length} selected</span>
            </div>

            {/* Filters */}
            <div className="px-6 py-3.5 border-b border-gray-100 bg-gray-50 flex flex-wrap gap-3 items-center">
              {[
                { label: "All Stages",     val: filterStatus,   set: setFilterStatus,   opts: STATUSES },
                { label: "All Priorities", val: filterPriority, set: setFilterPriority, opts: PRIORITIES },
              ].map(f => (
                <select key={f.label}
                  className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none"
                  value={f.val} onChange={e => f.set(e.target.value)}
                >
                  <option value="">{f.label}</option>
                  {f.opts.map(o => <option key={o}>{o}</option>)}
                </select>
              ))}
              <select
                className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none"
                value={filterDisc} onChange={e => setFilterDisc(e.target.value)}
              >
                <option value="">All DISC Styles</option>
                {DISC_STYLES.map(s => <option key={s} value={s}>{DISC_META[s].emoji} {s}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input type="checkbox" checked={emailOnly} onChange={e => setEmailOnly(e.target.checked)} className="rounded" />
                Valid email only
              </label>
              {(filterStatus || filterPriority || filterDisc) && (
                <button onClick={() => { setFilterStatus(""); setFilterPriority(""); setFilterDisc(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <X className="w-3 h-3" /> Clear
                </button>
              )}
            </div>

            {/* Lead table */}
            {filteredLeads.length === 0 ? (
              <div className="py-14 text-center text-sm text-muted-foreground">No leads match the current filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-4 py-2.5 text-left">
                        <input type="checkbox"
                          checked={selectedLeads.size === filteredLeads.length && filteredLeads.length > 0}
                          onChange={toggleAll} className="rounded" />
                      </th>
                      {["Name","Email","Company","Stage","Priority","DISC Style","Service"].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredLeads.map(lead => {
                      const style   = discMap.get(lead.id);
                      const meta    = style ? DISC_META[style] : null;
                      const noEmail = !lead.email || lead.email.includes("@imported.local");
                      const checked = selectedLeads.has(lead.id);
                      return (
                        <tr key={lead.id}
                          className={`transition-colors ${noEmail ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50/60 cursor-pointer"} ${checked ? "bg-blue-50/40" : ""}`}
                          onClick={() => !noEmail && toggleLead(lead.id)}
                        >
                          <td className="px-4 py-3">
                            <input type="checkbox" checked={checked} disabled={noEmail}
                              onChange={() => !noEmail && toggleLead(lead.id)}
                              onClick={e => e.stopPropagation()} className="rounded" />
                          </td>
                          <td className="px-4 py-3 font-medium text-foreground">{lead.name}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {noEmail ? <span className="text-red-400">No valid email</span>
                              : <span className="truncate block max-w-[150px]">{lead.email}</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{lead.company ?? "—"}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              lead.status === "Won" ? "bg-green-100 text-green-700" :
                              lead.status === "Lost" ? "bg-red-100 text-red-600" :
                              lead.status === "New"  ? "bg-blue-100 text-blue-700" :
                              "bg-gray-100 text-gray-600"
                            }`}>{lead.status}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              lead.priority === "High" ? "bg-red-100 text-red-700" :
                              lead.priority === "Medium" ? "bg-yellow-100 text-yellow-700" :
                              "bg-gray-100 text-gray-500"
                            }`}>{lead.priority}</span>
                          </td>
                          <td className="px-4 py-3">
                            {meta && style
                              ? <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${meta.bgColor} ${meta.textColor} ${meta.borderColor}`}>{meta.emoji} {style}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[110px]">{lead.serviceInterest ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {selectedLeads.size} lead{selectedLeads.size !== 1 ? "s" : ""} selected
                </span>
                {selectedLeads.size > 0 && (
                  <button onClick={() => { setSelectedLeads(new Set()); setIsDirty(true); }}
                    className="text-xs text-muted-foreground hover:text-foreground">Clear</button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button onClick={saveDraft} disabled={saving || !campaignName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-sm font-medium rounded-lg hover:bg-white disabled:opacity-40 transition-colors">
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save & Continue
                </button>
                <button onClick={() => setStep(0)}
                  className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button onClick={() => {
                  const first = [...selectedLeads][0];
                  if (first) setPreviewLeadId(first);
                  setStep(2);
                }}
                  disabled={!step2Valid}
                  className="flex items-center gap-2 px-5 py-2 bg-[#1e293b] text-white text-sm font-semibold rounded-lg hover:bg-[#2d3e53] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  Preview <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            STEP 3 — PREVIEW & SEND
        ══════════════════════════════════════════════════════════════════════ */}
        {step === 2 && (
          <div className="space-y-5">
            <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-5 py-3.5">
              <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-blue-800 mb-0.5">Manual Sending Enabled · No Scheduling</p>
                <p className="text-xs text-blue-700">
                  <strong>Test Send</strong> goes only to the address you enter below.
                  <strong> Send Campaign</strong> sends to all saved recipients — one at a time — after you confirm.
                  Scheduling and automation are disabled.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

              {/* ── Left: preview selector + DISC tabs ── */}
              <div className="lg:col-span-3 space-y-4">
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                    <Eye className="w-4 h-4 text-muted-foreground" />
                    <h2 className="text-sm font-bold text-foreground">Personalization Preview</h2>
                  </div>
                  <div className="p-5 space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Preview for lead</label>
                      <select
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none bg-white"
                        value={previewLeadId ?? ""}
                        onChange={e => setPreviewLeadId(Number(e.target.value))}
                      >
                        <option value="">— Select a lead —</option>
                        {allLeads.filter(l => selectedLeads.has(l.id)).map(l => {
                          const style = discMap.get(l.id);
                          const meta  = style ? DISC_META[style] : null;
                          return (
                            <option key={l.id} value={l.id}>
                              {l.name}{meta ? ` · ${meta.emoji} ${style}` : ""}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    {previewLead && (
                      <div className={`rounded-lg p-3 border ${DISC_META[previewDiscStyle].bgColor} ${DISC_META[previewDiscStyle].borderColor}`}>
                        <p className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground mb-0.5">Detected DISC</p>
                        <p className={`text-sm font-bold ${DISC_META[previewDiscStyle].textColor}`}>
                          {DISC_META[previewDiscStyle].emoji} {previewDiscStyle}
                        </p>
                        <p className={`text-xs ${DISC_META[previewDiscStyle].textColor} opacity-80`}>
                          {DISC_META[previewDiscStyle].shortDesc}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* DISC variant tabs */}
                {previewLead && discVariants && (
                  <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" />
                      <h2 className="text-sm font-bold text-foreground">All 4 DISC Variants</h2>
                      <span className="text-[10px] text-muted-foreground ml-1">— how this email adapts to each personality</span>
                    </div>
                    <div className="flex border-b border-gray-100">
                      {DISC_STYLES.map(style => {
                        const meta   = DISC_META[style];
                        const active = activeDiscTab === style;
                        return (
                          <button key={style} onClick={() => setActiveDiscTab(style)}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-all border-b-2 ${
                              active ? `border-current ${meta.textColor} ${meta.bgColor}` : "border-transparent text-muted-foreground hover:bg-gray-50"
                            }`}>
                            <span>{meta.emoji}</span><span>{style}</span>
                          </button>
                        );
                      })}
                    </div>
                    {activeVariant && (
                      <div className="p-5 space-y-4">
                        <EmailCard
                          subject={activeVariant.subject}
                          body={activeVariant.body}
                          badge={`${DISC_META[activeDiscTab].emoji} ${activeDiscTab} Version`}
                          badgeColor={`${DISC_META[activeDiscTab].bgColor} ${DISC_META[activeDiscTab].textColor}`}
                        />
                        <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
                          <div className="flex items-center gap-1.5 mb-2">
                            <Info className="w-3.5 h-3.5 text-blue-500" />
                            <p className="text-xs font-semibold text-foreground">Personalization applied</p>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">{activeVariant.explanation}</p>
                          <ul className="space-y-0.5">
                            {activeVariant.changes.map((c, i) => (
                              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                                <span className="text-emerald-500 shrink-0">✓</span> {c}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!previewLead && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 text-center text-sm text-muted-foreground">
                    Select a lead above to preview their personalized email.
                  </div>
                )}
              </div>

              {/* ── Right: original vs personalized + test send ── */}
              <div className="lg:col-span-2 space-y-4">

                {/* Pre-Send Quality Check */}
                {(() => {
                  const validEmailLeads = [...selectedLeads].filter(id => {
                    const lead = allLeads.find(l => l.id === id);
                    return lead?.email && !lead.email.includes("@imported.local");
                  });
                  const skippedRisk = selectedLeads.size - validEmailLeads.length;
                  const hasSubject    = baseSubject.trim().length > 0;
                  const hasBody       = baseBody.trim().length > 0;
                  const hasRecipients = selectedLeads.size > 0;
                  const hasEmail      = validEmailLeads.length > 0;
                  const hasPersonalization = hasSubject && hasBody;
                  const testDone      = !!(testResult?.ok);

                  const checks: Array<{ label: string; pass: boolean; warn: boolean; detail?: string }> = [
                    { label: "Subject line",          pass: hasSubject,        warn: false },
                    { label: "Email body",            pass: hasBody,           warn: false },
                    { label: "Recipients selected",   pass: hasRecipients,     warn: false, detail: hasRecipients ? `${selectedLeads.size} lead${selectedLeads.size !== 1 ? "s" : ""}` : "None" },
                    { label: "Valid email coverage",  pass: hasEmail,          warn: !hasEmail, detail: hasRecipients ? `${validEmailLeads.length} of ${selectedLeads.size} have email` : undefined },
                    { label: "DISC personalization",  pass: hasPersonalization, warn: false },
                    ...(skippedRisk > 0 ? [{ label: `${skippedRisk} lead${skippedRisk !== 1 ? "s" : ""} may be skipped (no email)`, pass: false, warn: true }] : []),
                    { label: "Test send completed",   pass: testDone, warn: !testDone, detail: testDone ? "Verified" : "Recommended" },
                  ];

                  const hasErrors = checks.some(c => !c.pass && !c.warn);
                  const hasWarnings = checks.some(c => c.warn && !c.pass);
                  const statusLabel = hasErrors ? "Needs Attention" : hasWarnings ? "Warning" : "Ready";
                  const statusStyle = hasErrors
                    ? "bg-red-50 border-red-200 text-red-700"
                    : hasWarnings
                    ? "bg-amber-50 border-amber-200 text-amber-700"
                    : "bg-emerald-50 border-emerald-200 text-emerald-700";
                  const StatusIcon = hasErrors ? XCircle : hasWarnings ? AlertCircle : CheckCircle2;

                  return (
                    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-muted-foreground" />
                        <h2 className="text-sm font-bold text-foreground">Pre-Send Quality Check</h2>
                        <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${statusStyle}`}>
                          <StatusIcon className="w-3 h-3" /> {statusLabel}
                        </span>
                      </div>
                      <ul className="divide-y divide-gray-50">
                        {checks.map((c, i) => (
                          <li key={i} className="flex items-center justify-between px-4 py-2.5 gap-3">
                            <span className="flex items-center gap-2 text-xs text-foreground">
                              {c.pass
                                ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                : c.warn
                                ? <AlertCircle  className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                : <XCircle      className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                              {c.label}
                            </span>
                            {c.detail && (
                              <span className="text-[10px] text-muted-foreground shrink-0">{c.detail}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })()}
                {previewResult && (
                  <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-gray-100">
                      <h2 className="text-sm font-bold text-foreground">Original vs Personalized</h2>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        For {previewLead?.name} — {previewDiscStyle} style
                      </p>
                    </div>
                    <div className="p-4 space-y-3">
                      <EmailCard subject={previewResult.original.subject} body={previewResult.original.body}
                        badge="Original (base)" badgeColor="bg-gray-100 text-gray-500" />
                      <EmailCard subject={previewResult.personalized.subject} body={previewResult.personalized.body}
                        badge={`${DISC_META[previewDiscStyle].emoji} Personalized`}
                        badgeColor={`${DISC_META[previewDiscStyle].bgColor} ${DISC_META[previewDiscStyle].textColor}`}
                      />
                      <div className="flex items-start gap-2 bg-blue-50 rounded-lg border border-blue-200 p-3">
                        <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-blue-800">{previewResult.diffSummary}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Test send panel */}
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                    <Send className="w-4 h-4 text-muted-foreground" />
                    <h2 className="text-sm font-bold text-foreground">Test Send</h2>
                  </div>
                  <div className="p-5 space-y-4">
                    <div className="flex items-start gap-2 bg-amber-50 rounded-lg border border-amber-200 p-3">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-800">
                        Test email goes <strong>only</strong> to the address below — not to any selected leads.
                      </p>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                        Send test to this address
                      </label>
                      <input type="email"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        placeholder="your@email.com"
                        value={testEmail}
                        onChange={e => setTestEmail(e.target.value)}
                      />
                    </div>
                    {previewLead && (
                      <p className="text-[10px] text-muted-foreground">
                        Uses <strong>{previewDiscStyle}</strong>-personalized version for <strong>{previewLead.name}</strong>.
                        {campaignId && <span className="ml-1 text-emerald-600">(from saved campaign)</span>}
                      </p>
                    )}
                    <button onClick={sendTestEmail}
                      disabled={testSending || !testEmail || !baseSubject || !baseBody}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      {testSending
                        ? <><RefreshCw className="w-4 h-4 animate-spin" /> Sending…</>
                        : <><Send className="w-4 h-4" /> Send Test Email</>}
                    </button>
                    {testResult && (
                      <div className={`flex items-start gap-2 rounded-lg border p-3 ${testResult.ok ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                        {testResult.ok
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          : <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
                        <p className={`text-xs ${testResult.ok ? "text-emerald-800" : "text-red-800"}`}>{testResult.message}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Summary */}
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
                  <h3 className="text-xs font-bold text-foreground mb-3">Campaign Summary</h3>
                  <dl className="space-y-1.5 text-xs">
                    {[
                      ["Campaign",        campaignName || "—"],
                      ["Status",         campaignStatus],
                      ["Selected leads", String(selectedLeads.size)],
                      ["Saved",          savedAt ? fmtTime(savedAt) : "Not yet saved"],
                      ["Auto-send",      "Disabled"],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className={`font-medium ${k === "Auto-send" ? "text-red-500" : k === "Status" ? "" : "text-foreground"} truncate ml-4 max-w-[120px]`}>{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button onClick={() => setStep(1)}
                className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                <ChevronLeft className="w-4 h-4" /> Back to Audience
              </button>
              <div className="flex items-center gap-3">
                <button onClick={saveDraft} disabled={saving || !campaignName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-40 transition-colors">
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save Draft
                </button>
                {campaignId && selectedLeads.size > 0 && baseSubject && baseBody && (
                  <button
                    onClick={() => { setSendConfirmChecked(false); setShowSendConfirm(true); }}
                    disabled={sending || isDirty}
                    className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    title={isDirty ? "Save your changes first before sending" : ""}
                  >
                    {sending
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</>
                      : <><Send className="w-4 h-4" /> Send Campaign</>}
                  </button>
                )}
                {isDirty && campaignId && (
                  <span className="text-[10px] text-amber-600 font-semibold">Save changes first</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Delete confirm modal ───────────────────────────────────────────── */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <Trash2 className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">
                    {campaignId ? "Delete Campaign?" : "Discard Draft?"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {campaignId
                      ? `"${campaignName}" and all its saved recipients will be permanently deleted.`
                      : "Your unsaved draft will be discarded."}
                  </p>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-2 border border-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button onClick={deleteCampaign} disabled={deleting}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 disabled:opacity-40 transition-colors">
                  {deleting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  {deleting ? "Deleting…" : campaignId ? "Delete" : "Discard"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Send confirm modal ─────────────────────────────────────────────── */}
        {showSendConfirm && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <Send className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-base font-bold text-foreground">Confirm Campaign Send</p>
                  <p className="text-xs text-muted-foreground mt-0.5">This action will send emails to real recipients.</p>
                </div>
              </div>

              <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Campaign</span>
                  <span className="font-semibold text-foreground truncate max-w-[200px]">{campaignName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Recipients</span>
                  <span className="font-semibold text-foreground">{selectedLeads.size} lead{selectedLeads.size !== 1 ? "s" : ""}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Send mode</span>
                  <span className={`font-semibold ${process.env.NODE_ENV === "production" ? "text-emerald-600" : "text-amber-600"}`}>
                    One at a time · No scheduling
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Already-sent leads</span>
                  <span className="font-semibold text-foreground">Skipped automatically</span>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Emails will be sent individually to each selected recipient using their DISC-personalized version. This cannot be undone.
                </p>
              </div>

              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={sendConfirmChecked}
                  onChange={e => setSendConfirmChecked(e.target.checked)}
                  className="mt-0.5 rounded border-gray-300 cursor-pointer"
                />
                <span className="text-xs text-foreground font-medium group-hover:text-gray-700">
                  I understand this will send emails to {selectedLeads.size} selected recipient{selectedLeads.size !== 1 ? "s" : ""}.
                </span>
              </label>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setShowSendConfirm(false); setSendConfirmChecked(false); }}
                  className="flex-1 px-4 py-2 border border-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={sendCampaign}
                  disabled={!sendConfirmChecked}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-4 h-4" />
                  Send to {selectedLeads.size} Recipient{selectedLeads.size !== 1 ? "s" : ""}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </CrmLayout>
  );
}

// ── Inline delete button for history rows ─────────────────────────────────────

function DeleteCampaignBtn({ onConfirm }: { onConfirm: () => Promise<void> }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy]       = useState(false);
  if (!confirm) {
    return (
      <button onClick={() => setConfirm(true)}
        className="text-xs font-semibold text-red-500 hover:text-red-700 px-2.5 py-1 rounded-lg hover:bg-red-50 transition-colors">
        Delete
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-[10px] text-red-600 font-semibold">Sure?</span>
      <button onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }}
        disabled={busy}
        className="text-[10px] font-bold text-red-600 hover:text-red-800 disabled:opacity-40">
        {busy ? "…" : "Yes"}
      </button>
      <button onClick={() => setConfirm(false)} className="text-[10px] text-muted-foreground hover:text-foreground">No</button>
    </span>
  );
}
