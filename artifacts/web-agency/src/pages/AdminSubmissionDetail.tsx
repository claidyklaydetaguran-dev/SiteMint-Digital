import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, FileText, ClipboardList, Save, Printer, Copy, LogOut,
  Star, Tag, Package, Clock, DollarSign, User, Building, Mail, Phone,
  CheckCircle2, AlertCircle, ExternalLink, Loader2,
} from "lucide-react";

interface Submission {
  id: number;
  createdAt: string;
  updatedAt: string;
  contactName: string;
  companyName: string;
  email: string;
  phone: string | null;
  industry: string | null;
  serviceInterest: string | null;
  budget: string | null;
  timeline: string | null;
  leadScore: number;
  tags: string[];
  status: string;
  recommendedPackage: string | null;
  formData: Record<string, unknown>;
  generatedProposal: string | null;
  generatedSow: string | null;
  internalNotes: string | null;
}

const BUDGET_LABELS: Record<string, string> = {
  "under1k": "Under $1,000", "1k-2.5k": "$1,000–$2,500", "2.5k-5k": "$2,500–$5,000",
  "5k-10k": "$5,000–$10,000", "10k-plus": "$10,000+",
};
const TIMELINE_LABELS: Record<string, string> = {
  "asap": "ASAP", "30-days": "Within 30 Days", "60-days": "Within 60 Days",
  "90-days": "Within 90 Days", "flexible": "Flexible",
};
const SERVICE_LABELS: Record<string, string> = {
  "new-website": "New Website", "redesign": "Website Redesign", "web-app": "Web Application",
  "crm": "CRM Development", "seo": "SEO Services", "blog": "Blog Content",
  "maintenance": "Maintenance & Support", "automation": "AI Automation", "consultation": "Consultation",
};

const STATUSES = ["New", "Reviewed", "Proposal Generated", "Follow-Up Needed", "Closed Won", "Closed Lost"];

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 8 ? "bg-green-100 text-green-700 border-green-200"
    : score >= 5 ? "bg-yellow-100 text-yellow-700 border-yellow-200"
    : "bg-red-100 text-red-700 border-red-200";
  const label = score >= 8 ? "Hot" : score >= 5 ? "Warm" : "Cold";
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold border ${color}`}>
      <Star className="w-3.5 h-3.5" /> {score}/10 · {label} Lead
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 py-3 border-b border-gray-100 last:border-0">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-40 shrink-0">{label}</span>
      <span className="text-sm text-foreground leading-relaxed">{value}</span>
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-4">
      <h3 className="font-serif font-bold text-base text-foreground mb-4 pb-3 border-b border-gray-100">{title}</h3>
      <div>{children}</div>
    </div>
  );
}

// ── Document Modal ────────────────────────────────────────────────────────────

function DocModal({ html, title, onClose }: { html: string; title: string; onClose: () => void }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handlePrint = () => {
    iframeRef.current?.contentWindow?.print();
  };

  const handleCopy = () => {
    const text = iframeRef.current?.contentDocument?.body?.innerText || "";
    navigator.clipboard.writeText(text).then(() => alert("Copied to clipboard!"));
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900/80 backdrop-blur-sm">
      {/* Toolbar */}
      <div className="bg-foreground text-background px-6 py-3 flex items-center justify-between gap-4 shrink-0">
        <h2 className="font-serif font-semibold text-base">{title}</h2>
        <div className="flex items-center gap-2">
          <Button onClick={handleCopy} variant="ghost" size="sm" className="text-background/70 hover:text-background hover:bg-white/10 gap-1">
            <Copy className="w-3.5 h-3.5" /> Copy Text
          </Button>
          <Button onClick={handlePrint} variant="ghost" size="sm" className="text-background/70 hover:text-background hover:bg-white/10 gap-1">
            <Printer className="w-3.5 h-3.5" /> Print / Save PDF
          </Button>
          <Button onClick={onClose} variant="outline" size="sm" className="border-white/20 text-background hover:bg-white/10">
            Close
          </Button>
        </div>
      </div>
      {/* Document iframe */}
      <div className="flex-1 overflow-hidden bg-gray-200 p-4">
        <iframe
          ref={iframeRef}
          srcDoc={html}
          className="w-full h-full bg-white rounded-lg shadow-xl"
          title={title}
        />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminSubmissionDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [generatingProp, setGeneratingProp] = useState(false);
  const [generatingSOW, setGeneratingSOW] = useState(false);
  const [docModal, setDocModal] = useState<{ html: string; title: string } | null>(null);
  const [toast, setToast] = useState("");
  const [crmLeadId, setCrmLeadId] = useState<number | null>(null);
  const [sendingToCrm, setSendingToCrm] = useState(false);

  const token = localStorage.getItem("adminToken") || "";

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const load = useCallback(async () => {
    if (!token) { navigate("/admin"); return; }
    try {
      const res = await fetch(`/api/admin/submissions/${params.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { localStorage.removeItem("adminToken"); navigate("/admin"); return; }
      if (!res.ok) { setError("Submission not found."); return; }
      const data = await res.json() as { submission: Submission };
      setSubmission(data.submission);
      setStatus(data.submission.status);
      setNotes(data.submission.internalNotes || "");
      // Check if this submission is already in CRM
      try {
        const crmRes = await fetch(
          `/api/crm/leads?search=${encodeURIComponent(data.submission.email)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (crmRes.ok) {
          const crmData = await crmRes.json() as { leads: { id: number; email: string; discoverySubmissionId: number | null }[] };
          const match = crmData.leads.find(l =>
            l.discoverySubmissionId === Number(params.id) ||
            l.email.toLowerCase() === data.submission.email.toLowerCase()
          );
          if (match) setCrmLeadId(match.id);
        }
      } catch {
        // non-critical — CRM check failure does not block the page
      }
    } catch {
      setError("Failed to load submission.");
    } finally {
      setLoading(false);
    }
  }, [token, params.id, navigate]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch(`/api/admin/submissions/${params.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status, internalNotes: notes }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { submission: Submission };
      setSubmission(data.submission);
      showToast("Changes saved successfully.");
    } catch {
      setSaveMsg("Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const generateProposal = async () => {
    setGeneratingProp(true);
    try {
      const res = await fetch(`/api/admin/submissions/${params.id}/proposal`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { proposal: string };
      setSubmission(prev => prev ? { ...prev, generatedProposal: data.proposal, status: "Proposal Generated" } : prev);
      setStatus("Proposal Generated");
      setDocModal({ html: data.proposal, title: "Project Proposal" });
      showToast("Proposal generated and saved.");
    } catch {
      showToast("Failed to generate proposal.");
    } finally {
      setGeneratingProp(false);
    }
  };

  const generateSOW = async () => {
    setGeneratingSOW(true);
    try {
      const res = await fetch(`/api/admin/submissions/${params.id}/sow`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const data = await res.json() as { sow: string };
      setSubmission(prev => prev ? { ...prev, generatedSow: data.sow } : prev);
      setDocModal({ html: data.sow, title: "Scope of Work" });
      showToast("Scope of Work generated and saved.");
    } catch {
      showToast("Failed to generate SOW.");
    } finally {
      setGeneratingSOW(false);
    }
  };

  const sendToCrmLead = async () => {
    setSendingToCrm(true);
    try {
      const res = await fetch(`/api/crm/import-discovery/${params.id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { imported: boolean; existing: boolean; leadId: number; message: string };
      if (res.ok) {
        setCrmLeadId(data.leadId);
        showToast(data.existing ? "Already in CRM — linked above." : data.message);
      } else {
        showToast("Failed to send to CRM. Please try again.");
      }
    } catch {
      showToast("Connection error. Please try again.");
    } finally {
      setSendingToCrm(false);
    }
  };

  const logout = () => { localStorage.removeItem("adminToken"); navigate("/admin"); };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center text-muted-foreground">Loading...</div>
  );
  if (error) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center text-red-500">{error}</div>
  );
  if (!submission) return null;

  const fd = submission.formData;
  const arr = (k: string): string[] => (fd[k] as string[]) || [];
  const str = (k: string): string => String(fd[k] || "");
  const serviceLabels = (arr("services")).map(s => SERVICE_LABELS[s] || s).join(", ");

  return (
    <>
      {/* Document modal */}
      {docModal && <DocModal html={docModal.html} title={docModal.title} onClose={() => setDocModal(null)} />}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-foreground text-background px-5 py-3 rounded-xl shadow-xl text-sm font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-green-400" /> {toast}
        </div>
      )}

      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-foreground text-background px-6 py-4 flex items-center justify-between shadow-sm sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <Link href="/admin/dashboard">
              <Button variant="ghost" size="sm" className="text-background/70 hover:text-background hover:bg-white/10 gap-1">
                <ArrowLeft className="w-4 h-4" /> Dashboard
              </Button>
            </Link>
            <span className="text-background/30 text-sm hidden sm:block">/</span>
            <span className="font-semibold text-sm hidden sm:block">{submission.contactName} — {submission.companyName}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={logout} className="text-background/70 hover:text-background hover:bg-white/10 gap-1">
            <LogOut className="w-3.5 h-3.5" /> Logout
          </Button>
        </header>

        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <div className="grid lg:grid-cols-[1fr_320px] gap-6">

            {/* Left column — form answers */}
            <div>
              {/* Hero card */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
                  <div>
                    <h1 className="text-2xl font-serif font-bold text-foreground">{submission.contactName}</h1>
                    <p className="text-muted-foreground">{submission.companyName} {submission.industry ? `· ${submission.industry}` : ""}</p>
                  </div>
                  <ScoreBadge score={submission.leadScore} />
                </div>
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {submission.tags.map(t => (
                    <span key={t} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent text-xs font-medium text-foreground border border-border/50">
                      <Tag className="w-2.5 h-2.5" /> {t}
                    </span>
                  ))}
                </div>
                <div className="grid sm:grid-cols-4 gap-3 text-sm">
                  {submission.email && <div className="flex items-center gap-1.5 text-muted-foreground"><Mail className="w-3.5 h-3.5" /><a href={`mailto:${submission.email}`} className="hover:text-primary">{submission.email}</a></div>}
                  {submission.phone && <div className="flex items-center gap-1.5 text-muted-foreground"><Phone className="w-3.5 h-3.5" /><a href={`tel:${submission.phone}`} className="hover:text-primary">{submission.phone}</a></div>}
                  {submission.budget && <div className="flex items-center gap-1.5 text-muted-foreground"><DollarSign className="w-3.5 h-3.5" />{BUDGET_LABELS[submission.budget] || submission.budget}</div>}
                  {submission.timeline && <div className="flex items-center gap-1.5 text-muted-foreground"><Clock className="w-3.5 h-3.5" />{TIMELINE_LABELS[submission.timeline] || submission.timeline}</div>}
                </div>
              </div>

              {/* Section 1: Business */}
              <FormSection title="Section 1: Business Information">
                <InfoRow label="Company" value={submission.companyName} />
                <InfoRow label="Contact" value={submission.contactName} />
                <InfoRow label="Email" value={submission.email} />
                <InfoRow label="Phone" value={submission.phone} />
                <InfoRow label="Website" value={str("websiteUrl")} />
                <InfoRow label="Industry" value={submission.industry} />
                <InfoRow label="Location" value={str("businessLocation")} />
                <InfoRow label="Years in Biz" value={str("yearsInBusiness")} />
              </FormSection>

              {/* Section 2: Project Type */}
              <FormSection title="Section 2: Project Type">
                <InfoRow label="Services" value={serviceLabels} />
                <InfoRow label="Project Goals" value={arr("projectGoals").map(g => g.replace(/-/g, " ")).join(", ")} />
              </FormSection>

              {/* Section 3: Current Situation */}
              <FormSection title="Section 3: Current Situation">
                <InfoRow label="Has Website?" value={str("hasWebsite")} />
                <InfoRow label="Likes About Site" value={str("websiteLikes")} />
                <InfoRow label="Frustrations" value={str("websiteFrustrations")} />
                <InfoRow label="What's Missing" value={str("websiteMissing")} />
                <InfoRow label="Customer Sources" value={arr("customerSources").join(", ")} />
              </FormSection>

              {/* Section 4: Business Goals */}
              <FormSection title="Section 4: Business Goals">
                <InfoRow label="Top 3 Goals" value={str("topGoals")} />
                <InfoRow label="Measure Success" value={str("measureSuccess")} />
                <InfoRow label="Success Outcome" value={str("successOutcome")} />
              </FormSection>

              {/* Section 5: Emotional Drivers */}
              <FormSection title="Section 5: Emotional Drivers">
                <InfoRow label="Why Now" value={str("whyNow")} />
                <InfoRow label="If Nothing Changes" value={arr("ifNothingChanges").map(v => v.replace(/-/g, " ")).join(", ")} />
                <InfoRow label="Biggest Frustration" value={str("biggestFrustration")} />
                <InfoRow label="Frustration Effect" value={str("frustrationEffect")} />
                <InfoRow label="Solve Perfectly" value={str("solvePerfectly")} />
                <InfoRow label="Success Feels Like" value={arr("successFeel").map(v => v.replace(/-/g, " ")).join(", ")} />
                <InfoRow label="Home Run" value={str("homeRun")} />
                <InfoRow label="Milestone" value={str("milestone")} />
              </FormSection>

              {/* Section 6: Target Audience */}
              <FormSection title="Section 6: Target Audience">
                <InfoRow label="Ideal Customer" value={str("idealCustomer")} />
                <InfoRow label="Problem Solved" value={str("problemSolved")} />
                <InfoRow label="Why Choose You" value={str("whyChooseYou")} />
                <InfoRow label="Competitors" value={str("competitors")} />
                <InfoRow label="Sites They Like" value={str("websitesYouLike")} />
                <InfoRow label="Why Those Sites" value={str("websiteLikesReason")} />
              </FormSection>

              {/* Section 7: Features */}
              <FormSection title="Section 7: Features & Integrations">
                {arr("marketingFeatures").length > 0 && <InfoRow label="Marketing" value={arr("marketingFeatures").join(", ")} />}
                {arr("salesFeatures").length > 0 && <InfoRow label="Sales" value={arr("salesFeatures").join(", ")} />}
                {arr("membershipFeatures").length > 0 && <InfoRow label="Membership" value={arr("membershipFeatures").join(", ")} />}
                {arr("automationFeatures").length > 0 && <InfoRow label="Automation" value={arr("automationFeatures").join(", ")} />}
                {arr("otherFeatures").length > 0 && <InfoRow label="Other" value={arr("otherFeatures").join(", ")} />}
                {arr("integrations").length > 0 && <InfoRow label="Integrations" value={arr("integrations").join(", ")} />}
              </FormSection>

              {/* Section 8 */}
              <FormSection title="Section 8: Content & Branding">
                <InfoRow label="Has Assets" value={arr("existingAssets").join(", ")} />
                <InfoRow label="Content Support" value={str("contentSupport").replace(/-/g, " ")} />
              </FormSection>

              {/* Sections 9-11 */}
              <FormSection title="Sections 9–11: Timeline, Budget & Final">
                <InfoRow label="Timeline" value={TIMELINE_LABELS[str("timeline")] || str("timeline")} />
                <InfoRow label="Launch Date" value={str("launchDate")} />
                <InfoRow label="Budget" value={BUDGET_LABELS[str("budget")] || str("budget")} />
                <InfoRow label="Decision Maker" value={str("decisionMaker").replace(/-/g, " ")} />
                <InfoRow label="Agency Exp." value={str("agencyExperience")} />
                <InfoRow label="Why Now" value={str("whyNowProject")} />
                <InfoRow label="Concerns" value={str("concerns")} />
                <InfoRow label="Anything Else" value={str("anythingElse")} />
              </FormSection>
            </div>

            {/* Right column — actions */}
            <div className="space-y-4">

              {/* Status & Notes */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 sticky top-24">
                <h3 className="font-serif font-bold text-sm text-foreground mb-4">Lead Management</h3>

                <div className="mb-4">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Status</label>
                  <select
                    value={status}
                    onChange={e => setStatus(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="mb-4">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Internal Notes</label>
                  <Textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Add notes, next steps, or follow-up reminders..."
                    className="min-h-[100px] text-sm resize-none"
                  />
                </div>

                {saveMsg && <p className="text-xs text-red-500 mb-2 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {saveMsg}</p>}

                <Button onClick={save} disabled={saving} className="w-full gap-2 mb-3" size="sm">
                  <Save className="w-3.5 h-3.5" /> {saving ? "Saving..." : "Save Changes"}
                </Button>

                <hr className="border-gray-100 my-4" />

                {/* Lead info summary */}
                <div className="space-y-2 mb-4">
                  {[
                    { icon: Package, label: "Recommended", value: submission.recommendedPackage || "—" },
                    { icon: DollarSign, label: "Budget", value: BUDGET_LABELS[submission.budget || ""] || submission.budget || "—" },
                    { icon: Clock, label: "Timeline", value: TIMELINE_LABELS[submission.timeline || ""] || submission.timeline || "—" },
                    { icon: User, label: "Decision", value: (submission.formData.decisionMaker as string || "—").replace(/-/g, " ") },
                    { icon: Building, label: "Industry", value: submission.industry || "—" },
                  ].map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1 text-muted-foreground"><Icon className="w-3 h-3" />{label}</span>
                      <span className="font-medium text-foreground">{value}</span>
                    </div>
                  ))}
                </div>

                <hr className="border-gray-100 my-4" />

                {/* Document generation */}
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Generate Documents</h4>

                <Button
                  onClick={generateProposal}
                  disabled={generatingProp}
                  variant={submission.generatedProposal ? "outline" : "default"}
                  className="w-full gap-2 mb-2"
                  size="sm"
                >
                  <FileText className="w-3.5 h-3.5" />
                  {generatingProp ? "Generating..." : submission.generatedProposal ? "Regenerate Proposal" : "Generate Proposal"}
                </Button>

                {submission.generatedProposal && (
                  <Button
                    onClick={() => setDocModal({ html: submission.generatedProposal!, title: "Project Proposal" })}
                    variant="ghost"
                    className="w-full gap-2 mb-2 text-primary hover:text-primary"
                    size="sm"
                  >
                    <Printer className="w-3.5 h-3.5" /> View / Print Proposal
                  </Button>
                )}

                <Button
                  onClick={generateSOW}
                  disabled={generatingSOW}
                  variant={submission.generatedSow ? "outline" : "default"}
                  className="w-full gap-2 mb-2"
                  size="sm"
                >
                  <ClipboardList className="w-3.5 h-3.5" />
                  {generatingSOW ? "Generating..." : submission.generatedSow ? "Regenerate SOW" : "Generate Scope of Work"}
                </Button>

                {submission.generatedSow && (
                  <Button
                    onClick={() => setDocModal({ html: submission.generatedSow!, title: "Scope of Work" })}
                    variant="ghost"
                    className="w-full gap-2 text-primary hover:text-primary"
                    size="sm"
                  >
                    <Printer className="w-3.5 h-3.5" /> View / Print SOW
                  </Button>
                )}

                <p className="text-xs text-muted-foreground text-center mt-3">
                  Use Print → Save as PDF in the viewer
                </p>
              </div>

              {/* CRM Bridge Card */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-5 h-5 rounded bg-emerald-100 flex items-center justify-center">
                    <ExternalLink className="w-3 h-3 text-emerald-600" />
                  </span>
                  <h3 className="font-serif font-bold text-sm text-foreground">CRM Lead</h3>
                </div>
                {crmLeadId ? (
                  <>
                    <div className="flex items-center gap-2 mb-3 text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      This submission is connected to CRM.
                    </div>
                    <Link href={`/admin/crm/leads/${crmLeadId}`}>
                      <Button size="sm" variant="outline" className="w-full gap-2 text-emerald-700 border-emerald-300 hover:bg-emerald-50">
                        <ExternalLink className="w-3.5 h-3.5" /> View CRM Lead
                      </Button>
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground mb-3">
                      Convert this discovery submission into a CRM lead to begin sales follow-up.
                    </p>
                    <Button
                      size="sm"
                      onClick={sendToCrmLead}
                      disabled={sendingToCrm}
                      className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                    >
                      {sendingToCrm
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <ExternalLink className="w-3.5 h-3.5" />}
                      {sendingToCrm ? "Sending to CRM…" : "Send to CRM"}
                    </Button>
                  </>
                )}
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Submitted {new Date(submission.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
              </p>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
