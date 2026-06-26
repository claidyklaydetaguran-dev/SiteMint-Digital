import { useEffect, useState, useMemo } from "react";
import { useLocation } from "wouter";
import { CrmLayout } from "./CrmLayout";
import {
  Mail, Users, Eye, Send, ChevronRight, ChevronLeft,
  AlertTriangle, CheckCircle2, Info, Zap, RefreshCw, X,
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

const token = () => localStorage.getItem("adminToken") || "";

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

// ── Step indicator ────────────────────────────────────────────────────────────

function StepBadge({
  n, label, active, done,
}: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all ${
        done   ? "bg-emerald-500 text-white" :
        active ? "bg-[#1e293b] text-white" :
                 "bg-gray-100 text-gray-400"
      }`}>
        {done ? <CheckCircle2 className="w-4 h-4" /> : n}
      </div>
      <span className={`text-xs font-semibold transition-all ${
        active ? "text-foreground" : done ? "text-emerald-600" : "text-muted-foreground"
      }`}>{label}</span>
    </div>
  );
}

// ── Email body display ────────────────────────────────────────────────────────

function EmailCard({
  subject, body, badge, badgeColor,
}: { subject: string; body: string; badge?: string; badgeColor?: string }) {
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
        <pre className="text-xs text-foreground whitespace-pre-wrap leading-relaxed font-sans">
          {body || "(no content)"}
        </pre>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CrmCampaigns() {
  const [, navigate] = useLocation();

  // ── Data ──
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Wizard step (0=Setup, 1=Audience, 2=Preview) ──
  const [step, setStep] = useState(0);

  // ── Step 1 — Campaign setup ──
  const [campaignName, setCampaignName] = useState("");
  const [baseSubject, setBaseSubject] = useState("");
  const [baseBody, setBaseBody] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");

  // ── Step 2 — Audience ──
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDisc, setFilterDisc] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [emailOnly, setEmailOnly] = useState(true);
  const [selectedLeads, setSelectedLeads] = useState<Set<number>>(new Set());

  // ── Step 3 — Preview & Send ──
  const [previewLeadId, setPreviewLeadId] = useState<number | null>(null);
  const [activeDiscTab, setActiveDiscTab] = useState<DiscStyle>("Driver");
  const [testEmail, setTestEmail] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; testMode?: boolean } | null>(null);

  // ── Load data ──
  useEffect(() => {
    if (!token()) {
      navigate(`/admin?redirect=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    const h = { Authorization: `Bearer ${token()}` };
    Promise.all([
      fetch("/api/crm/leads", { headers: h }).then(r => r.json()),
      fetch("/api/crm/email-templates", { headers: h }).then(r => r.json()),
    ])
      .then(([ld, td]) => {
        setAllLeads((ld.leads ?? []).slice().sort((a: Lead, b: Lead) =>
          a.name.localeCompare(b.name),
        ));
        setTemplates(td.templates ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [navigate]);

  // ── DISC map (computed from lead fields, no extra API) ──
  const discMap = useMemo(() => {
    const map = new Map<number, DiscStyle>();
    allLeads.forEach(l => map.set(l.id, computeSimplifiedDisc(l)));
    return map;
  }, [allLeads]);

  // ── Filtered audience ──
  const filteredLeads = useMemo(() => {
    return allLeads
      .filter(l => !emailOnly || (l.email && !l.email.includes("@imported.local")))
      .filter(l => !filterStatus   || l.status === filterStatus)
      .filter(l => !filterPriority || l.priority === filterPriority)
      .filter(l => !filterDisc     || discMap.get(l.id) === filterDisc);
  }, [allLeads, filterStatus, filterPriority, filterDisc, emailOnly, discMap]);

  // ── Preview lead ──
  const previewLead = previewLeadId
    ? allLeads.find(l => l.id === previewLeadId) ?? null
    : null;

  const previewDiscStyle = previewLead ? discMap.get(previewLead.id) ?? "Amiable" : "Amiable";

  const previewResult = useMemo(() => {
    if (!previewLead || !baseSubject || !baseBody) return null;
    return previewPersonalizedEmail(baseSubject, baseBody, previewLead.name, previewDiscStyle);
  }, [previewLead, baseSubject, baseBody, previewDiscStyle]);

  const discVariants = useMemo(() => {
    if (!previewLead || !baseSubject || !baseBody) return null;
    return createDiscVariants(baseSubject, baseBody, previewLead.name);
  }, [previewLead, baseSubject, baseBody]);

  const activeVariant: PersonalizedEmail | null = discVariants?.[activeDiscTab] ?? null;

  // ── Select all / none ──
  const toggleAll = () => {
    if (selectedLeads.size === filteredLeads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(filteredLeads.map(l => l.id)));
    }
  };

  const toggleLead = (id: number) => {
    const s = new Set(selectedLeads);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedLeads(s);
  };

  // ── Test send ──
  const sendTestEmail = async () => {
    if (!testEmail || !baseSubject || !baseBody) return;
    setTestSending(true);
    setTestResult(null);
    try {
      // Use the preview lead's personalized version if available, else base
      const targetStyle = previewDiscStyle;
      const personalized = previewLead
        ? personalizeCampaignEmail(baseSubject, baseBody, previewLead.name, targetStyle)
        : { subject: baseSubject, body: baseBody };

      const r = await fetch("/api/crm/campaigns/test-send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token()}`,
        },
        body: JSON.stringify({
          to: testEmail,
          subject: personalized.subject,
          body: personalized.body,
        }),
      });
      const data = await r.json();
      if (r.ok) {
        setTestResult({
          ok: true,
          message: data.testMode
            ? `Test mode — email simulated (not actually sent). Would have gone to ${testEmail}.`
            : `Test email sent to ${testEmail} ✓`,
          testMode: data.testMode,
        });
      } else {
        setTestResult({ ok: false, message: data.error ?? "Failed to send test email" });
      }
    } catch {
      setTestResult({ ok: false, message: "Network error — please try again" });
    } finally {
      setTestSending(false);
    }
  };

  // ── Load template ──
  const loadTemplate = (id: string) => {
    const tmpl = templates.find(t => String(t.id) === id);
    if (tmpl) {
      setBaseSubject(tmpl.subject);
      setBaseBody(tmpl.body);
      setSelectedTemplate(id);
    }
  };

  // ── Step 1 validation ──
  const step1Valid = campaignName.trim() && baseSubject.trim() && baseBody.trim();
  // ── Step 2 validation ──
  const step2Valid = selectedLeads.size > 0;

  if (loading) {
    return (
      <CrmLayout>
        <div className="p-6 max-w-5xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-48 bg-gray-200 rounded" />
            <div className="h-4 w-64 bg-gray-100 rounded" />
          </div>
        </div>
      </CrmLayout>
    );
  }

  const STATUSES  = ["New","Contacted","Follow-up","Proposal Sent","Negotiating","Won","Lost","Nurture"];
  const PRIORITIES = ["Low","Medium","High"];
  const DISC_STYLES: DiscStyle[] = ["Driver","Expressive","Amiable","Analytical"];

  return (
    <CrmLayout>
      <div className="p-6 max-w-6xl mx-auto space-y-6">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Mail className="w-5 h-5 text-muted-foreground" />
            <h1 className="text-xl font-bold font-serif text-foreground">Email Campaigns</h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
              Draft Only
            </span>
          </div>
          <p className="text-sm text-muted-foreground ml-8">
            Compose personality-aware campaigns. No emails are sent automatically — test send only.
          </p>
        </div>

        {/* ── Test mode banner ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-xs text-amber-800">
            <strong>Safe mode active.</strong> This builder creates drafts and sends test emails only.
            No emails will be sent to selected leads until a future Campaign Automation module is enabled.
          </p>
        </div>

        {/* ── Step indicator ───────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl px-6 py-4 shadow-sm">
          <div className="flex items-center gap-6">
            <StepBadge n={1} label="Setup"            active={step === 0} done={step > 0} />
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
            <StepBadge n={2} label="Audience"         active={step === 1} done={step > 1} />
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
            <StepBadge n={3} label="Preview & Send"   active={step === 2} done={false} />
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            STEP 1 — SETUP
        ════════════════════════════════════════════════════════════════════ */}
        {step === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-bold text-foreground">Step 1 — Campaign Setup</h2>
            </div>
            <div className="p-6 space-y-5">

              {/* Campaign name */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  Campaign Name <span className="text-red-500">*</span>
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="e.g. Q3 Re-engagement Campaign"
                  value={campaignName}
                  onChange={e => setCampaignName(e.target.value)}
                />
              </div>

              {/* Load from template */}
              {templates.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                    Load from Email Template (optional)
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none bg-white"
                    value={selectedTemplate}
                    onChange={e => loadTemplate(e.target.value)}
                  >
                    <option value="">— Choose a template —</option>
                    {templates.map(t => (
                      <option key={t.id} value={String(t.id)}>{t.name} ({t.type})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Base subject */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  Base Subject Line <span className="text-red-500">*</span>
                </label>
                <input
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="e.g. Let's talk about growing your business online"
                  value={baseSubject}
                  onChange={e => setBaseSubject(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  This will be personalized per DISC style (e.g. Driver gets a shorter version, Expressive gets a 🚀 prefix)
                </p>
              </div>

              {/* Base body */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                  Base Email Body <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 min-h-[180px] resize-y font-mono"
                  placeholder={"Write your core message here.\n\nThe personalization engine will wrap this with a DISC-appropriate greeting, tone, and CTA for each lead.\n\nKeep this focused on your core value proposition."}
                  value={baseBody}
                  onChange={e => setBaseBody(e.target.value)}
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  This is the core message. DISC personalization adds greeting, tone layer, and CTA around it.
                </p>
              </div>

              {/* Live DISC preview panel */}
              {baseSubject && baseBody && (
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    <p className="text-xs font-bold text-foreground">Live DISC Preview</p>
                    <span className="text-[10px] text-muted-foreground">— how this base message adapts per style</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {DISC_STYLES.map(style => {
                      const meta = DISC_META[style];
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

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setStep(1)}
                  disabled={!step1Valid}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#1e293b] text-white text-sm font-semibold rounded-lg hover:bg-[#2d3e53] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next: Choose Audience <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            STEP 2 — AUDIENCE
        ════════════════════════════════════════════════════════════════════ */}
        {step === 1 && (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-bold text-foreground">Step 2 — Select Audience</h2>
              </div>
              <span className="text-xs text-muted-foreground">
                {selectedLeads.size} of {filteredLeads.length} selected
              </span>
            </div>

            {/* Filters */}
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex flex-wrap gap-3 items-center">
              <select
                className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none"
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
              >
                <option value="">All Stages</option>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
              <select
                className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none"
                value={filterPriority}
                onChange={e => setFilterPriority(e.target.value)}
              >
                <option value="">All Priorities</option>
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
              <select
                className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none"
                value={filterDisc}
                onChange={e => setFilterDisc(e.target.value)}
              >
                <option value="">All DISC Styles</option>
                {DISC_STYLES.map(s => <option key={s} value={s}>{DISC_META[s].emoji} {s}</option>)}
              </select>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={emailOnly}
                  onChange={e => setEmailOnly(e.target.checked)}
                  className="rounded"
                />
                Valid email only
              </label>
              {(filterStatus || filterPriority || filterDisc) && (
                <button
                  onClick={() => { setFilterStatus(""); setFilterPriority(""); setFilterDisc(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Clear filters
                </button>
              )}
            </div>

            {/* Lead selection table */}
            {filteredLeads.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                No leads match the current filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="px-4 py-2.5 text-left">
                        <input
                          type="checkbox"
                          checked={selectedLeads.size === filteredLeads.length && filteredLeads.length > 0}
                          onChange={toggleAll}
                          className="rounded"
                        />
                      </th>
                      {["Name","Email","Company","Stage","Priority","DISC Style","Service"].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredLeads.map(lead => {
                      const style  = discMap.get(lead.id);
                      const meta   = style ? DISC_META[style] : null;
                      const noEmail = !lead.email || lead.email.includes("@imported.local");
                      const checked = selectedLeads.has(lead.id);
                      return (
                        <tr
                          key={lead.id}
                          className={`transition-colors ${noEmail ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50/60 cursor-pointer"} ${checked ? "bg-blue-50/40" : ""}`}
                          onClick={() => !noEmail && toggleLead(lead.id)}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={noEmail}
                              onChange={() => !noEmail && toggleLead(lead.id)}
                              onClick={e => e.stopPropagation()}
                              className="rounded"
                            />
                          </td>
                          <td className="px-4 py-3 font-medium text-foreground">{lead.name}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {noEmail ? (
                              <span className="text-red-400">No valid email</span>
                            ) : (
                              <span className="truncate block max-w-[160px]">{lead.email}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{lead.company ?? "—"}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              lead.status === "Won"  ? "bg-green-100 text-green-700" :
                              lead.status === "Lost" ? "bg-red-100 text-red-600" :
                              lead.status === "New"  ? "bg-blue-100 text-blue-700" :
                              "bg-gray-100 text-gray-600"
                            }`}>{lead.status}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              lead.priority === "High"   ? "bg-red-100 text-red-700" :
                              lead.priority === "Medium" ? "bg-yellow-100 text-yellow-700" :
                              "bg-gray-100 text-gray-500"
                            }`}>{lead.priority}</span>
                          </td>
                          <td className="px-4 py-3">
                            {meta && style ? (
                              <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${meta.bgColor} ${meta.textColor} ${meta.borderColor}`}>
                                {meta.emoji} {style}
                              </span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[120px]">
                            {lead.serviceInterest ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">
                  {selectedLeads.size} lead{selectedLeads.size !== 1 ? "s" : ""} selected
                </span>
                {selectedLeads.size > 0 && (
                  <button
                    onClick={() => setSelectedLeads(new Set())}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear selection
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setStep(0)}
                  className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
                <button
                  onClick={() => {
                    // Default preview lead to first selected
                    const first = [...selectedLeads][0];
                    if (first) setPreviewLeadId(first);
                    setStep(2);
                  }}
                  disabled={!step2Valid}
                  className="flex items-center gap-2 px-5 py-2 bg-[#1e293b] text-white text-sm font-semibold rounded-lg hover:bg-[#2d3e53] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next: Preview <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            STEP 3 — PREVIEW & TEST SEND
        ════════════════════════════════════════════════════════════════════ */}
        {step === 2 && (
          <div className="space-y-5">

            {/* Safety warning */}
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-800 mb-0.5">Test Send Only</p>
                <p className="text-xs text-amber-700">
                  This preview shows how each lead's email will be personalized.
                  The <strong>Send Test Email</strong> button sends only to the address you specify — never to selected leads.
                  Bulk send is not available in this phase.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

              {/* ── Left panel: Preview selector + DISC tabs ── */}
              <div className="lg:col-span-3 space-y-4">

                {/* Lead selector */}
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2">
                    <Eye className="w-4 h-4 text-muted-foreground" />
                    <h2 className="text-sm font-bold text-foreground">Personalization Preview</h2>
                  </div>
                  <div className="p-5 space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground block mb-1.5">
                        Preview for lead
                      </label>
                      <select
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none bg-white"
                        value={previewLeadId ?? ""}
                        onChange={e => setPreviewLeadId(Number(e.target.value))}
                      >
                        <option value="">— Select a lead —</option>
                        {allLeads
                          .filter(l => selectedLeads.has(l.id))
                          .map(l => {
                            const style = discMap.get(l.id);
                            const meta  = style ? DISC_META[style] : null;
                            return (
                              <option key={l.id} value={l.id}>
                                {l.name} {meta ? `· ${meta.emoji} ${style}` : ""}
                              </option>
                            );
                          })
                        }
                      </select>
                    </div>

                    {previewLead && (
                      <div className={`rounded-lg p-3 border ${DISC_META[previewDiscStyle].bgColor} ${DISC_META[previewDiscStyle].borderColor}`}>
                        <p className="text-[10px] uppercase tracking-wide font-medium text-muted-foreground mb-0.5">Detected DISC style</p>
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

                    {/* Tab bar */}
                    <div className="flex border-b border-gray-100">
                      {DISC_STYLES.map(style => {
                        const meta = DISC_META[style];
                        const active = activeDiscTab === style;
                        return (
                          <button
                            key={style}
                            onClick={() => setActiveDiscTab(style)}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold transition-all border-b-2 ${
                              active
                                ? `border-current ${meta.textColor} ${meta.bgColor}`
                                : "border-transparent text-muted-foreground hover:bg-gray-50"
                            }`}
                          >
                            <span>{meta.emoji}</span>
                            <span>{style}</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Variant content */}
                    {activeVariant && (
                      <div className="p-5 space-y-4">
                        <EmailCard
                          subject={activeVariant.subject}
                          body={activeVariant.body}
                          badge={`${DISC_META[activeDiscTab].emoji} ${activeDiscTab} Version`}
                          badgeColor={`${DISC_META[activeDiscTab].bgColor} ${DISC_META[activeDiscTab].textColor}`}
                        />

                        {/* Changes list */}
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
                    Select a lead above to preview their personalized email version.
                  </div>
                )}
              </div>

              {/* ── Right panel: Original vs Personalized + Test Send ── */}
              <div className="lg:col-span-2 space-y-4">

                {/* Original vs personalized comparison */}
                {previewResult && (
                  <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-gray-100">
                      <h2 className="text-sm font-bold text-foreground">Original vs Personalized</h2>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        For {previewLead?.name} — {previewDiscStyle} style
                      </p>
                    </div>
                    <div className="p-4 space-y-3">
                      <EmailCard
                        subject={previewResult.original.subject}
                        body={previewResult.original.body}
                        badge="Original (base)"
                        badgeColor="bg-gray-100 text-gray-500"
                      />
                      <EmailCard
                        subject={previewResult.personalized.subject}
                        body={previewResult.personalized.body}
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
                        Send test to this email address
                      </label>
                      <input
                        type="email"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        placeholder="your@email.com"
                        value={testEmail}
                        onChange={e => setTestEmail(e.target.value)}
                      />
                    </div>

                    {previewLead && (
                      <p className="text-[10px] text-muted-foreground">
                        Will send the <strong>{previewDiscStyle}</strong>-personalized version
                        for <strong>{previewLead.name}</strong>.
                      </p>
                    )}

                    <button
                      onClick={sendTestEmail}
                      disabled={testSending || !testEmail || !baseSubject || !baseBody}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {testSending ? (
                        <><RefreshCw className="w-4 h-4 animate-spin" /> Sending…</>
                      ) : (
                        <><Send className="w-4 h-4" /> Send Test Email</>
                      )}
                    </button>

                    {testResult && (
                      <div className={`flex items-start gap-2 rounded-lg border p-3 ${
                        testResult.ok
                          ? "bg-emerald-50 border-emerald-200"
                          : "bg-red-50 border-red-200"
                      }`}>
                        {testResult.ok
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          : <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                        }
                        <p className={`text-xs ${testResult.ok ? "text-emerald-800" : "text-red-800"}`}>
                          {testResult.message}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Campaign summary */}
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-5">
                  <h3 className="text-xs font-bold text-foreground mb-3">Campaign Summary</h3>
                  <dl className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Campaign</dt>
                      <dd className="font-medium text-foreground truncate ml-4">{campaignName}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Selected leads</dt>
                      <dd className="font-medium text-foreground">{selectedLeads.size}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Status</dt>
                      <dd className="font-medium text-amber-600">Draft only</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Auto-send</dt>
                      <dd className="font-medium text-red-500">Disabled</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>

            {/* Footer nav */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Back to Audience
              </button>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Info className="w-3.5 h-3.5" />
                Bulk send will be available in a future Campaign Automation update.
              </div>
            </div>
          </div>
        )}
      </div>
    </CrmLayout>
  );
}
