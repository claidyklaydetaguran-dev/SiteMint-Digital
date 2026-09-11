import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { CrmLayout } from "./CrmLayout";
import {
  AlertCircle, AlertTriangle, ArrowLeft, Ban, BarChart2, Check, CheckCircle2,
  Clock, Layers, Loader2, Mail, Pause, Play, Plus, RefreshCw, Save, Send,
  Sparkles, Trash2, Users, X, XCircle,
} from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";
import SegmentBuilder, {
  emptyDefinition, type SegmentDefinition, type SegmentVocabulary,
} from "@/components/crm/SegmentBuilder";
import EmailDesigner, { type EmailBlock, type TokenProblem } from "@/components/crm/EmailDesigner";

// ── M4: the marketing workspace ──────────────────────────────────────────────
//
// Audience → design → review → send → results, in that order, because that is
// the order in which the questions actually get answered.
//
// The screen is built around the things that are normally hidden:
//
//   Review is not a formality. Every reason somebody will NOT receive this is
//   listed by name before anything goes out, and the same reasons are shown
//   afterwards. A count with no names behind it is where silent drops live.
//
//   Cancel says what it cannot do. "12 messages are already in people's
//   inboxes and cancelling does not recall them" is the only honest wording,
//   and it is on the button's confirmation, not buried in a note afterwards.
//
//   Results refuse to invent engagement. Opens and clicks are not tracked, so
//   the panel says so instead of showing 0%.
//
// The legacy multi-step sequence builder still lives at
// /admin/crm/campaigns?view=builder and is linked from here; this page does not
// replace it and does not touch its tables.

// ── The live API contract ────────────────────────────────────────────────────

interface Segment {
  id: number;
  name: string;
  description?: string | null;
  definition: SegmentDefinition;
  memberCount?: number;
  createdByLabel?: string | null;
}

interface Design {
  id: number;
  name: string;
  subject?: string | null;
  preheader?: string | null;
  blocks: EmailBlock[];
}

type CampaignStatus = "draft" | "scheduled" | "sending" | "paused" | "cancelled" | "sent";

interface Campaign {
  id: number;
  name: string;
  subject: string;
  preheader?: string | null;
  blocks: EmailBlock[];
  segmentId?: number | null;
  designId?: number | null;
  status: CampaignStatus;
  scheduledAt?: string | null;
  aiContentState: "none" | "draft" | "approved";
  aiApprovedByLabel?: string | null;
  aiApprovedAt?: string | null;
  updatedAt: string;
  counts?: Record<string, number>;
}

interface ExclusionBucket {
  reason: string;
  label: string;
  count: number;
  contacts: { id?: number; leadId?: number; name: string; email?: string | null; detail?: string | null }[];
}

interface Preflight {
  audienceSize: number;
  sendable: number;
  excluded: number;
  excludedByReason: ExclusionBucket[];
  fallbackWarnings: { field: string; count: number; share: number }[];
  blockers: string[];
  canSend: boolean;
  delivery: { configured: boolean; note: string };
}

interface Results {
  counts: { audience: number; sent: number; failed: number; excluded: number; neverAttempted: number; testSends: number };
  excludedByReason: ExclusionBucket[];
  recipients: { id: number; leadId: number; name: string; address: string | null; status: string; lastError?: string | null; sentAt?: string | null }[];
  engagement: { tracked: boolean; why: string };
  deliverySignal: { meaning: string; providerIdsRecorded: number };
  definitions: Record<string, string>;
}

interface AiAvailability { available: boolean; reason: string | null; missing: string[] }

const STATUS_STYLE: Record<CampaignStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-teal-50 text-teal-800 border border-teal-200",
  sending: "bg-teal-600 text-white",
  paused: "bg-amber-50 text-amber-800 border border-amber-200",
  cancelled: "bg-red-50 text-red-700 border border-red-200",
  sent: "bg-emerald-50 text-emerald-800 border border-emerald-200",
};

const btnPrimary =
  "flex items-center justify-center gap-2 px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-lg " +
  "hover:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors";
const btnGhost =
  "flex items-center justify-center gap-2 px-3 py-2 border border-border text-sm font-semibold rounded-lg " +
  "text-foreground hover:bg-accent disabled:opacity-50 transition-colors";

async function call<T>(path: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T & Record<string, any> }> {
  const res = await adminFetch(path, init);
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: data as T & Record<string, any> };
}

const json = (body: unknown): RequestInit => ({
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
const patch = (body: unknown): RequestInit => ({
  method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

export default function CrmCampaignBuilderPage() {
  const [, navigate] = useLocation();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: "ok" | "warn" | "bad"; text: string } | null>(null);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [designs, setDesigns] = useState<Design[]>([]);
  const [vocabulary, setVocabulary] = useState<SegmentVocabulary | null>(null);
  const [mergeFields, setMergeFields] = useState<Record<string, string>>({});
  const [ai, setAi] = useState<AiAvailability | null>(null);

  const [openId, setOpenId] = useState<number | null>(null);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [tab, setTab] = useState<"audience" | "design" | "review" | "results">("audience");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [results, setResults] = useState<Results | null>(null);

  const [previewLeadId, setPreviewLeadId] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ html: string | null; subject: string | null; as: { id: number; name: string } | null; fallbacks: string[]; problems: TokenProblem[] }>({
    html: null, subject: null, as: null, fallbacks: [], problems: [],
  });
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [newSegment, setNewSegment] = useState<{ name: string; definition: SegmentDefinition } | null>(null);
  const [testTo, setTestTo] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [aiGoal, setAiGoal] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  const readOnly = !!campaign && campaign.status !== "draft" && campaign.status !== "scheduled";

  // ── Loading ────────────────────────────────────────────────────────────────

  const loadIndex = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [c, s, d, a] = await Promise.all([
        call<{ campaigns: Campaign[] }>("/api/crm/marketing/campaigns"),
        call<{ segments: Segment[]; fields: string[]; fieldOperators: Record<string, string[]>; fieldValues: Record<string, string[]> }>("/api/crm/marketing/segments"),
        call<{ designs: Design[]; mergeFields: Record<string, string> }>("/api/crm/marketing/designs"),
        call<AiAvailability>("/api/crm/marketing/ai/availability"),
      ]);
      if (!c.ok || !s.ok || !d.ok) throw new Error("load failed");
      setCampaigns(c.data.campaigns ?? []);
      setSegments(s.data.segments ?? []);
      setVocabulary({ fields: s.data.fields ?? [], fieldOperators: s.data.fieldOperators ?? {}, fieldValues: s.data.fieldValues ?? {} });
      setDesigns(d.data.designs ?? []);
      setMergeFields(d.data.mergeFields ?? {});
      setAi(a.ok ? a.data : { available: false, reason: "The availability of AI drafting could not be checked.", missing: [] });
    } catch {
      setLoadError("The marketing workspace could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadIndex(); }, [loadIndex]);

  const loadCampaign = useCallback(async (id: number) => {
    const r = await call<{ campaign: Campaign }>(`/api/crm/marketing/campaigns/${id}`);
    if (!r.ok) { setBanner({ tone: "bad", text: r.data.error ?? "That campaign could not be opened." }); return; }
    setCampaign(r.data.campaign);
    setDirty(false);
  }, []);

  const loadPreflight = useCallback(async (id: number) => {
    const r = await call<Preflight>(`/api/crm/marketing/campaigns/${id}/preflight`);
    setPreflight(r.ok ? r.data : null);
  }, []);

  const loadResults = useCallback(async (id: number) => {
    const r = await call<Results>(`/api/crm/marketing/campaigns/${id}/results`);
    setResults(r.ok ? r.data : null);
  }, []);

  const loadPreview = useCallback(async (id: number, leadId: number | null) => {
    setPreviewLoading(true);
    setPreviewError(null);
    const q = leadId ? `?leadId=${leadId}` : "";
    const r = await call<{ html: string; subject: string; as: { id: number; name: string } | null; fallbacksUsed: string[]; tokenProblems: TokenProblem[] }>(
      `/api/crm/marketing/campaigns/${id}/preview${q}`,
    );
    setPreviewLoading(false);
    if (!r.ok) { setPreviewError(r.data.error ?? "The preview could not be rendered."); return; }
    setPreview({
      html: r.data.html, subject: r.data.subject, as: r.data.as,
      fallbacks: r.data.fallbacksUsed ?? [], problems: r.data.tokenProblems ?? [],
    });
  }, []);

  useEffect(() => {
    if (openId === null) return;
    void loadCampaign(openId);
    void loadPreflight(openId);
    void loadResults(openId);
  }, [openId, loadCampaign, loadPreflight, loadResults]);

  useEffect(() => {
    if (openId === null || tab !== "design") return;
    void loadPreview(openId, previewLeadId);
  }, [openId, tab, previewLeadId, loadPreview]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const save = async () => {
    if (!campaign) return;
    setSaving(true);
    const r = await call<{ campaign: Campaign }>(`/api/crm/marketing/campaigns/${campaign.id}`, patch({
      name: campaign.name, subject: campaign.subject, preheader: campaign.preheader ?? "",
      segmentId: campaign.segmentId ?? null, blocks: campaign.blocks,
    }));
    setSaving(false);
    if (!r.ok) { setBanner({ tone: "bad", text: r.data.error ?? "Nothing was saved." }); return; }
    setCampaign(r.data.campaign);
    setDirty(false);
    setBanner({ tone: "ok", text: "Saved." });
    void loadPreflight(campaign.id);
    if (tab === "design") void loadPreview(campaign.id, previewLeadId);
  };

  const act = async (path: string, body: unknown, label: string) => {
    if (!campaign) return;
    setBusy(label);
    const r = await call<Record<string, any>>(`/api/crm/marketing/campaigns/${campaign.id}${path}`, json(body));
    setBusy(null);
    if (!r.ok) {
      const blockers = Array.isArray(r.data.blockers) ? ` ${r.data.blockers.join(" ")}` : "";
      setBanner({ tone: "bad", text: `${r.data.error ?? "That did not work."}${blockers}` });
    } else {
      setBanner({ tone: "ok", text: String(r.data.note ?? "Done.") });
    }
    await loadCampaign(campaign.id);
    await loadPreflight(campaign.id);
    await loadResults(campaign.id);
    await loadIndex();
    return r;
  };

  const createCampaign = async () => {
    const name = `New campaign — ${new Date().toLocaleDateString()}`;
    const r = await call<{ campaign: Campaign }>("/api/crm/marketing/campaigns", json({ name, blocks: [] }));
    if (!r.ok) { setBanner({ tone: "bad", text: r.data.error ?? "The campaign could not be created." }); return; }
    await loadIndex();
    setOpenId(r.data.campaign.id);
    setTab("audience");
  };

  const saveSegment = async () => {
    if (!newSegment?.name.trim()) { setBanner({ tone: "bad", text: "Give the audience a name." }); return; }
    const r = await call<{ segment: Segment }>("/api/crm/marketing/segments", json(newSegment));
    if (!r.ok) {
      const problems = Array.isArray(r.data.problems) ? ` ${r.data.problems.map((p: any) => p.problem).join(" ")}` : "";
      setBanner({ tone: "bad", text: `${r.data.error ?? "The audience could not be saved."}${problems}` });
      return;
    }
    setNewSegment(null);
    await loadIndex();
    if (campaign) {
      setCampaign({ ...campaign, segmentId: r.data.segment.id });
      setDirty(true);
    }
    setBanner({ tone: "ok", text: `Audience "${r.data.segment.name}" saved.` });
  };

  const applyDesign = (design: Design) => {
    if (!campaign) return;
    setCampaign({
      ...campaign,
      subject: design.subject ?? campaign.subject,
      preheader: design.preheader ?? campaign.preheader,
      blocks: design.blocks ?? [],
      designId: design.id,
    });
    setDirty(true);
  };

  const saveAsTemplate = async () => {
    if (!campaign) return;
    const name = window.prompt("Name this template", campaign.name);
    if (!name) return;
    const r = await call<{ design: Design }>("/api/crm/marketing/designs", json({
      name, subject: campaign.subject, preheader: campaign.preheader, blocks: campaign.blocks,
    }));
    if (!r.ok) { setBanner({ tone: "bad", text: r.data.error ?? "The template could not be saved." }); return; }
    await loadIndex();
    setBanner({ tone: "ok", text: "Template saved. It reopens as editable blocks, not as finished HTML." });
  };

  const askAi = async () => {
    if (!campaign || !aiGoal.trim()) return;
    setBusy("ai");
    const r = await call<Record<string, any>>(`/api/crm/marketing/campaigns/${campaign.id}/ai-draft`, json({ goal: aiGoal }));
    setBusy(null);
    if (!r.ok) {
      const claims = Array.isArray(r.data.claims) ? ` ${r.data.claims.map((c: any) => c.why).join(" ")}` : "";
      setBanner({ tone: "bad", text: `${r.data.error ?? "No draft was produced."}${claims}` });
      return;
    }
    setBanner({ tone: "warn", text: String(r.data.note ?? "A draft was written. It needs approving before this can be sent.") });
    await loadCampaign(campaign.id);
    await loadPreflight(campaign.id);
    setTab("design");
  };

  const selectedSegment = useMemo(
    () => segments.find((s) => s.id === campaign?.segmentId) ?? null,
    [segments, campaign?.segmentId],
  );

  // ── Chrome ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <CrmLayout>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading the marketing workspace…
        </div>
      </CrmLayout>
    );
  }

  if (loadError) {
    return (
      <CrmLayout>
        <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
          <AlertCircle className="w-8 h-8 text-red-600" />
          <p className="text-sm text-foreground">{loadError}</p>
          <button onClick={() => void loadIndex()} className={btnGhost}>
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
        </div>
      </CrmLayout>
    );
  }

  // ══════════════════ Campaign list ══════════════════

  if (openId === null || !campaign) {
    return (
      <CrmLayout>
        <div className="flex flex-col h-full">
          <header className="px-4 sm:px-6 py-4 border-b border-border bg-card flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <h1 className="text-lg font-bold font-serif text-foreground">Marketing</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Saved audiences, a visual email builder, and an honest account of who received what.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => navigate("/admin/crm/campaigns?view=builder")} className={btnGhost}>
                <Layers className="w-4 h-4" /> <span className="hidden sm:inline">Sequence builder</span>
              </button>
              <button onClick={() => void createCampaign()} className={btnPrimary}>
                <Plus className="w-4 h-4" /> New campaign
              </button>
            </div>
          </header>

          <Banner banner={banner} onClose={() => setBanner(null)} />

          <div className="flex-1 overflow-auto p-4 sm:p-6">
            {campaigns.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <Mail className="w-7 h-7 mx-auto text-teal-700 mb-2" />
                <p className="text-sm font-semibold text-foreground">No broadcasts yet.</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                  A broadcast is one email to a saved audience. Multi-step nurture sequences live in the
                  sequence builder and are unaffected by anything here.
                </p>
              </div>
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {campaigns.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setOpenId(c.id); setTab(c.status === "draft" ? "audience" : "results"); }}
                    className="text-left rounded-lg border border-border bg-card p-3.5 hover:border-teal-400 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground line-clamp-2">{c.name}</span>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLE[c.status]}`}>
                        {c.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{c.subject || "No subject yet"}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 text-[11px] text-muted-foreground">
                      <span>{c.counts?.sent ?? 0} sent</span>
                      <span>{c.counts?.excluded ?? 0} excluded</span>
                      {(c.counts?.failed ?? 0) > 0 && <span className="text-red-700">{c.counts?.failed} failed</span>}
                      {c.aiContentState === "draft" && (
                        <span className="text-amber-700 font-semibold">AI draft not approved</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </CrmLayout>
    );
  }

  // ══════════════════ One campaign ══════════════════

  return (
    <CrmLayout>
      <div className="flex flex-col h-full">
        <header className="px-4 sm:px-6 py-3 border-b border-border bg-card shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button onClick={() => { setOpenId(null); setCampaign(null); setBanner(null); }}
                aria-label="Back to campaigns" className="p-1.5 rounded-md text-muted-foreground hover:bg-accent">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <input
                className="min-w-0 flex-1 text-base font-bold font-serif text-foreground bg-transparent border-0 border-b border-transparent hover:border-border focus:border-teal-500 focus:outline-none px-0.5"
                value={campaign.name}
                disabled={readOnly}
                onChange={(e) => { setCampaign({ ...campaign, name: e.target.value }); setDirty(true); }}
              />
              <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ${STATUS_STYLE[campaign.status]}`}>
                {campaign.status}
              </span>
            </div>
            {!readOnly && (
              <button onClick={() => void save()} disabled={!dirty || saving} className={btnPrimary}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {dirty ? "Save" : "Saved"}
              </button>
            )}
          </div>

          <nav className="flex gap-0 mt-2 -mb-3 overflow-x-auto">
            {(["audience", "design", "review", "results"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 sm:px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-colors ${
                  tab === t ? "border-teal-700 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t === "audience" ? "Audience" : t === "design" ? "Design" : t === "review" ? "Review & send" : "Results"}
              </button>
            ))}
          </nav>
        </header>

        <Banner banner={banner} onClose={() => setBanner(null)} />

        {readOnly && (
          <p className="px-4 sm:px-6 py-2 text-xs text-muted-foreground bg-muted/50 border-b border-border">
            This campaign is <strong className="text-foreground">{campaign.status}</strong>, so its content is locked.
            Part of the audience may already hold the version that went out, and editing it here would make
            the record disagree with what people actually received.
          </p>
        )}

        <div className="flex-1 overflow-auto p-4 sm:p-6">

          {/* ══════════ Audience ══════════ */}
          {tab === "audience" && (
            <div className="space-y-4 max-w-3xl">
              <section className="rounded-lg border border-border bg-card p-3.5">
                <h2 className="text-sm font-bold text-foreground mb-2">Who is this going to?</h2>
                <select
                  className="w-full px-2.5 py-2 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30 disabled:opacity-60"
                  value={campaign.segmentId ?? ""}
                  disabled={readOnly}
                  onChange={(e) => { setCampaign({ ...campaign, segmentId: e.target.value ? Number(e.target.value) : null }); setDirty(true); }}
                >
                  <option value="">— choose a saved audience —</option>
                  {segments.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}{typeof s.memberCount === "number" ? ` (${s.memberCount} now)` : ""}
                    </option>
                  ))}
                </select>

                {selectedSegment && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {selectedSegment.description || "No description."}{" "}
                    The list is worked out again when the send starts, so this count is today's, not the send's.
                  </p>
                )}

                {!readOnly && (
                  <button
                    onClick={() => setNewSegment({ name: "", definition: emptyDefinition() })}
                    className={`${btnGhost} mt-2.5`}
                  >
                    <Plus className="w-3.5 h-3.5" /> Build a new audience
                  </button>
                )}
              </section>

              {newSegment && (
                <section className="rounded-lg border border-teal-300 bg-card p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-sm font-bold text-foreground">New audience</h2>
                    <button onClick={() => setNewSegment(null)} aria-label="Discard"
                      className="p-1 rounded text-muted-foreground hover:bg-accent"><X className="w-4 h-4" /></button>
                  </div>
                  <input
                    className="w-full px-2.5 py-1.5 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                    placeholder="Name it, e.g. Qualified leads not contacted in 30 days"
                    value={newSegment.name}
                    onChange={(e) => setNewSegment({ ...newSegment, name: e.target.value })}
                  />
                  <SegmentBuilder
                    definition={newSegment.definition}
                    vocabulary={vocabulary}
                    onChange={(definition) => setNewSegment({ ...newSegment, definition })}
                  />
                  <button onClick={() => void saveSegment()} className={btnPrimary}>
                    <Save className="w-4 h-4" /> Save audience
                  </button>
                </section>
              )}

              {/* ── Exclusions ── */}
              <section className="rounded-lg border border-border bg-card p-3.5">
                <h2 className="text-sm font-bold text-foreground mb-1">Leave somebody out of this one</h2>
                <p className="text-xs text-muted-foreground mb-2">
                  A one-off decision about this campaign. It is separate from the suppression list —
                  a bounce, a spam complaint or an unsubscribe applies to every campaign, forever, and is
                  applied automatically.
                </p>
                <p className="text-xs text-muted-foreground mb-2">
                  There is no one-click unsubscribe link yet. The email footer asks people to reply with
                  “unsubscribe”; those replies land in the CRM inbox and somebody has to record the
                  unsubscribe, which then applies everywhere at once.
                </p>
                <ExclusionEditor
                  campaignId={campaign.id}
                  disabled={readOnly}
                  onChanged={() => { void loadPreflight(campaign.id); }}
                  onError={(text) => setBanner({ tone: "bad", text })}
                />
              </section>
            </div>
          )}

          {/* ══════════ Design ══════════ */}
          {tab === "design" && (
            <div className="space-y-4">
              {/* AI drafting */}
              <section className="rounded-lg border border-border bg-card p-3.5">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-bold text-foreground">Draft it with AI</h2>
                    {ai?.available === false ? (
                      <p className="text-xs text-muted-foreground mt-1">
                        <span className="font-semibold text-amber-800">Unavailable.</span> {ai.reason}
                      </p>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground mt-1">
                          The model is given only verified information about SiteMint and a description of this
                          audience — never a customer record, never a price, never a figure. Anything it writes is a
                          draft until somebody approves it, and a draft that invents a claim is refused rather than
                          quietly trimmed.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2 mt-2">
                          <input
                            className="flex-1 min-w-0 px-2.5 py-1.5 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                            placeholder="What is this campaign for?"
                            value={aiGoal}
                            disabled={readOnly}
                            onChange={(e) => setAiGoal(e.target.value)}
                          />
                          <button onClick={() => void askAi()} disabled={readOnly || !aiGoal.trim() || busy === "ai"} className={btnPrimary}>
                            {busy === "ai" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                            Draft
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {campaign.aiContentState === "draft" && (
                  <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2.5">
                    <p className="text-xs text-amber-900 flex items-start gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                      <span>
                        This campaign contains AI-written copy that nobody has approved. It cannot be sent
                        until somebody reads it and says so.
                      </span>
                    </p>
                    <button
                      onClick={() => void act("/ai-draft/approve", {}, "approve")}
                      disabled={busy === "approve"}
                      className={`${btnPrimary} mt-2`}
                    >
                      {busy === "approve" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      I have read it — approve
                    </button>
                  </div>
                )}
                {campaign.aiContentState === "approved" && (
                  <p className="mt-2 text-xs text-emerald-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    AI copy approved by {campaign.aiApprovedByLabel ?? "a member of staff"}.
                  </p>
                )}
              </section>

              {/* Templates */}
              <section className="rounded-lg border border-border bg-card p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-foreground">Templates</h2>
                  <button onClick={() => void saveAsTemplate()} disabled={readOnly} className={btnGhost}>
                    <Save className="w-3.5 h-3.5" /> Save this as a template
                  </button>
                </div>
                {designs.length === 0 ? (
                  <p className="text-xs text-muted-foreground mt-1.5">No saved templates yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {designs.map((d) => (
                      <button key={d.id} onClick={() => applyDesign(d)} disabled={readOnly}
                        className="px-2.5 py-1 rounded-full border border-border text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-50">
                        {d.name}
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* Preview-as picker */}
              <section className="rounded-lg border border-border bg-card p-3.5">
                <label className="block text-xs font-semibold text-foreground mb-1">Preview as a real contact</label>
                <ContactPicker
                  value={previewLeadId}
                  onChange={setPreviewLeadId}
                  onError={(text) => setBanner({ tone: "bad", text })}
                />
              </section>

              <EmailDesigner
                subject={campaign.subject}
                preheader={campaign.preheader ?? ""}
                blocks={campaign.blocks ?? []}
                mergeFields={mergeFields}
                tokenProblems={preview.problems}
                readOnly={readOnly}
                onChange={(p) => { setCampaign({ ...campaign, ...p }); setDirty(true); }}
                previewHtml={preview.html}
                previewLoading={previewLoading}
                previewError={previewError}
                previewSubject={preview.subject}
                previewAs={preview.as}
                fallbacksUsed={preview.fallbacks}
                onRefreshPreview={() => void loadPreview(campaign.id, previewLeadId)}
              />
            </div>
          )}

          {/* ══════════ Review & send ══════════ */}
          {tab === "review" && (
            <div className="space-y-4 max-w-3xl">
              {!preflight ? (
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-sm text-muted-foreground">The pre-send check could not be loaded.</p>
                  <button onClick={() => void loadPreflight(campaign.id)} className={`${btnGhost} mt-2`}>
                    <RefreshCw className="w-3.5 h-3.5" /> Try again
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <Stat label="In the audience" value={preflight.audienceSize} />
                    <Stat label="Will be sent to" value={preflight.sendable} tone="ok" />
                    <Stat label="Excluded" value={preflight.excluded} tone={preflight.excluded > 0 ? "warn" : undefined} />
                  </div>

                  {preflight.blockers.length > 0 && (
                    <section className="rounded-lg border border-red-300 bg-red-50 p-3.5">
                      <h2 className="text-sm font-bold text-red-900 flex items-center gap-1.5">
                        <XCircle className="w-4 h-4" /> Not ready to send
                      </h2>
                      <ul className="mt-1.5 space-y-1">
                        {preflight.blockers.map((b, i) => (
                          <li key={i} className="text-xs text-red-800">• {b}</li>
                        ))}
                      </ul>
                    </section>
                  )}

                  <ExcludedPanel buckets={preflight.excludedByReason} total={preflight.excluded} />

                  {preflight.fallbackWarnings.length > 0 && (
                    <section className="rounded-lg border border-amber-300 bg-amber-50 p-3.5">
                      <h2 className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" /> Some people will see the fallback wording
                      </h2>
                      <ul className="mt-1.5 space-y-1">
                        {preflight.fallbackWarnings.map((w) => (
                          <li key={w.field} className="text-xs text-amber-900">
                            <strong>{w.field}</strong> is missing for {w.count} of {preflight.sendable} recipients
                            ({w.share}%). They will see whatever you wrote after the bar.
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  <section className="rounded-lg border border-border bg-card p-3.5">
                    <h2 className="text-sm font-bold text-foreground">Send a test to yourself first</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      A test can only go to an active staff account. It is marked as a test in the subject and in
                      the message, and it never counts as a delivery.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 mt-2">
                      <input
                        className="flex-1 min-w-0 px-2.5 py-1.5 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                        placeholder="your.name@… (staff address)"
                        value={testTo}
                        onChange={(e) => setTestTo(e.target.value)}
                      />
                      <button
                        onClick={() => void act("/test-send", { to: testTo, asLeadId: previewLeadId ?? undefined }, "test")}
                        disabled={!testTo.trim() || busy === "test"}
                        className={btnGhost}
                      >
                        {busy === "test" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                        Send test
                      </button>
                    </div>
                  </section>

                  <section className={`rounded-lg border p-3.5 ${preflight.delivery.configured ? "border-border bg-card" : "border-amber-300 bg-amber-50"}`}>
                    <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                      <Send className="w-4 h-4" /> Send
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">{preflight.delivery.note}</p>

                    {campaign.status === "scheduled" && (
                      <p className="mt-2 text-xs text-amber-900 bg-amber-50 border border-amber-300 rounded-md px-2.5 py-2 flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                        <span>
                          Scheduled for{" "}
                          <strong>{campaign.scheduledAt ? new Date(campaign.scheduledAt).toLocaleString() : "an unknown time"}</strong>.
                          Nothing starts this send on its own — there is no background worker for broadcasts yet,
                          so somebody has to come back and press Send. The time is a reminder and a record of
                          intent, not an alarm clock.
                        </span>
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2 mt-3">
                      {(campaign.status === "draft" || campaign.status === "scheduled") && (
                        <button
                          onClick={() => void act("/send", { batchSize: 50 }, "send")}
                          disabled={!preflight.canSend || busy === "send"}
                          className={btnPrimary}
                        >
                          {busy === "send" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          Send now to {preflight.sendable}
                        </button>
                      )}
                      {campaign.status === "sending" && (
                        <>
                          <button onClick={() => void act("/send", { batchSize: 50 }, "send")} disabled={busy === "send"} className={btnPrimary}>
                            {busy === "send" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                            Continue sending
                          </button>
                          <button onClick={() => void act("/pause", {}, "pause")} disabled={busy === "pause"} className={btnGhost}>
                            <Pause className="w-4 h-4" /> Pause
                          </button>
                        </>
                      )}
                      {campaign.status === "paused" && (
                        <button onClick={() => void act("/resume", {}, "resume")} disabled={busy === "resume"} className={btnPrimary}>
                          <Play className="w-4 h-4" /> Resume
                        </button>
                      )}
                      {campaign.status !== "cancelled" && campaign.status !== "sent" && (
                        <button onClick={() => setConfirmCancel(true)} className={`${btnGhost} text-red-700 border-red-200 hover:bg-red-50`}>
                          <Ban className="w-4 h-4" /> Cancel
                        </button>
                      )}
                    </div>

                    {campaign.status === "draft" && preflight.canSend && (
                      <div className="flex flex-col sm:flex-row gap-2 mt-3 pt-3 border-t border-border">
                        <input
                          type="datetime-local"
                          aria-label="When to send"
                          className="flex-1 min-w-0 px-2.5 py-1.5 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                          value={scheduleAt}
                          onChange={(e) => setScheduleAt(e.target.value)}
                        />
                        <button
                          onClick={() => {
                            if (!scheduleAt) { setBanner({ tone: "bad", text: "Pick a time first." }); return; }
                            void act("/schedule", { scheduledAt: new Date(scheduleAt).toISOString() }, "schedule");
                          }}
                          disabled={busy === "schedule"}
                          className={btnGhost}
                        >
                          <Clock className="w-4 h-4" /> Schedule instead
                        </button>
                      </div>
                    )}
                  </section>

                  {confirmCancel && (
                    <section className="rounded-lg border border-red-300 bg-red-50 p-3.5">
                      <h2 className="text-sm font-bold text-red-900">Cancel this campaign?</h2>
                      <p className="text-xs text-red-800 mt-1">
                        {(results?.counts.sent ?? 0) > 0
                          ? `${results?.counts.sent} messages have already been handed to the mail provider and are in people's inboxes. Cancelling stops the rest — it does not and cannot recall those.`
                          : "Nothing has been handed to the mail provider yet, so nobody will have received this."}
                      </p>
                      <div className="flex gap-2 mt-2.5">
                        <button
                          onClick={() => { setConfirmCancel(false); void act("/cancel", {}, "cancel"); }}
                          className="flex items-center gap-2 px-4 py-2 bg-red-700 text-white text-sm font-semibold rounded-lg hover:bg-red-800"
                        >
                          <Ban className="w-4 h-4" /> Cancel the campaign
                        </button>
                        <button onClick={() => setConfirmCancel(false)} className={btnGhost}>Keep it</button>
                      </div>
                    </section>
                  )}
                </>
              )}
            </div>
          )}

          {/* ══════════ Results ══════════ */}
          {tab === "results" && (
            <div className="space-y-4 max-w-4xl">
              {!results ? (
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-sm text-muted-foreground">Results could not be loaded.</p>
                  <button onClick={() => void loadResults(campaign.id)} className={`${btnGhost} mt-2`}>
                    <RefreshCw className="w-3.5 h-3.5" /> Try again
                  </button>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    <Stat label="Audience" value={results.counts.audience} />
                    <Stat label="Sent" value={results.counts.sent} tone="ok" />
                    <Stat label="Failed" value={results.counts.failed} tone={results.counts.failed ? "bad" : undefined} />
                    <Stat label="Excluded" value={results.counts.excluded} tone={results.counts.excluded ? "warn" : undefined} />
                    <Stat label="Never attempted" value={results.counts.neverAttempted} />
                  </div>

                  <p className="text-xs text-muted-foreground">{results.deliverySignal.meaning}</p>

                  <ExcludedPanel buckets={results.excludedByReason} total={results.counts.excluded} />

                  <section className="rounded-lg border border-border bg-muted/40 p-3.5">
                    <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                      <BarChart2 className="w-4 h-4" /> Opens and clicks — not tracked
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">{results.engagement.why}</p>
                  </section>

                  <section className="rounded-lg border border-border bg-card overflow-hidden">
                    <h2 className="text-sm font-bold text-foreground px-3.5 py-2.5 border-b border-border">
                      Every recipient ({results.recipients.length})
                    </h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/60">
                          <tr>
                            <th className="text-left px-3 py-1.5 font-semibold text-foreground">Contact</th>
                            <th className="text-left px-3 py-1.5 font-semibold text-foreground hidden sm:table-cell">Address</th>
                            <th className="text-left px-3 py-1.5 font-semibold text-foreground">Outcome</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.recipients.map((r) => (
                            <tr key={r.id} className="border-t border-border">
                              <td className="px-3 py-1.5 text-foreground whitespace-nowrap">{r.name}</td>
                              <td className="px-3 py-1.5 text-muted-foreground hidden sm:table-cell truncate max-w-[200px]">{r.address ?? "—"}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">
                                {r.status}
                                {r.lastError ? <span className="text-red-700"> — {r.lastError}</span> : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <dl className="rounded-lg border border-border bg-muted/40 p-3.5 space-y-1.5">
                    {Object.entries(results.definitions).map(([k, v]) => (
                      <div key={k} className="text-xs">
                        <dt className="inline font-semibold text-foreground">{k}: </dt>
                        <dd className="inline text-muted-foreground">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </CrmLayout>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────────────

function Banner({ banner, onClose }: { banner: { tone: "ok" | "warn" | "bad"; text: string } | null; onClose: () => void }) {
  if (!banner) return null;
  const tone =
    banner.tone === "ok" ? "border-emerald-300 bg-emerald-50 text-emerald-900"
      : banner.tone === "warn" ? "border-amber-300 bg-amber-50 text-amber-900"
        : "border-red-300 bg-red-50 text-red-900";
  return (
    <div className={`mx-4 sm:mx-6 mt-3 rounded-lg border px-3 py-2 flex items-start gap-2 ${tone}`}>
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <p className="text-xs flex-1">{banner.text}</p>
      <button onClick={onClose} aria-label="Dismiss" className="shrink-0 p-0.5 rounded hover:bg-black/5">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" | "bad" }) {
  const colour =
    tone === "ok" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : tone === "bad" ? "text-red-700" : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className={`text-xl font-bold ${colour}`}>{value}</p>
      <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
    </div>
  );
}

/** Excluded contacts, always by reason, always with the names behind the count. */
function ExcludedPanel({ buckets, total }: { buckets: ExclusionBucket[]; total: number }) {
  if (total === 0) {
    return (
      <section className="rounded-lg border border-border bg-card p-3.5">
        <p className="text-xs text-muted-foreground">
          Nobody in this audience is excluded. If that changes — a bounce, a spam complaint, an
          unsubscribe — they will appear here with the reason.
        </p>
      </section>
    );
  }
  return (
    <section className="rounded-lg border border-border bg-card overflow-hidden">
      <h2 className="text-sm font-bold text-foreground px-3.5 py-2.5 border-b border-border flex items-center gap-1.5">
        <Users className="w-4 h-4" /> {total} excluded, and why
      </h2>
      <div className="divide-y divide-border">
        {buckets.map((b) => (
          <details key={b.reason} className="px-3.5 py-2.5">
            <summary className="text-xs font-semibold text-foreground cursor-pointer">
              {b.count} — {b.label}
            </summary>
            <ul className="mt-1.5 space-y-0.5">
              {b.contacts.map((c, i) => (
                <li key={`${c.leadId ?? c.id}-${i}`} className="text-xs text-muted-foreground">
                  {c.name}{c.email ? ` · ${c.email}` : ""}{c.detail ? ` — ${c.detail}` : ""}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}

/** Searches contacts by name or address, using the existing CRM leads route. */
function ContactPicker({
  value, onChange, onError,
}: { value: number | null; onChange: (id: number | null) => void; onError: (text: string) => void }) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<{ id: number; name: string; email: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await adminFetch(`/api/crm/leads?search=${encodeURIComponent(query)}&limit=20`);
        const data = await res.json().catch(() => ({}));
        if (!live) return;
        if (!res.ok) { onError("Contacts could not be searched."); setOptions([]); return; }
        const rows = (Array.isArray(data.leads) ? data.leads : []) as { id: number; name: string; email: string }[];
        setOptions(rows.slice(0, 20));
      } catch {
        if (live) { onError("Contacts could not be searched."); setOptions([]); }
      } finally {
        if (live) setLoading(false);
      }
    }, 300);
    return () => { live = false; clearTimeout(t); };
  }, [query, onError]);

  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <input
        className="flex-1 min-w-0 px-2.5 py-1.5 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
        placeholder="Search contacts by name or address"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <select
        className="flex-1 min-w-0 px-2.5 py-1.5 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      >
        <option value="">{loading ? "Searching…" : "— tokens shown as written —"}</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name} · {o.email}</option>)}
      </select>
    </div>
  );
}

/** Adds and removes the one-off "not this person, not this time" exclusions. */
function ExclusionEditor({
  campaignId, disabled, onChanged, onError,
}: { campaignId: number; disabled?: boolean; onChanged: () => void; onError: (text: string) => void }) {
  const [rows, setRows] = useState<{ leadId: number; name: string; email: string; reason?: string | null }[]>([]);
  const [leadId, setLeadId] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const res = await adminFetch(`/api/crm/marketing/campaigns/${campaignId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { onError("The exclusions could not be loaded."); return; }
    setRows(Array.isArray(data.exclusions) ? data.exclusions : []);
  }, [campaignId, onError]);

  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    if (!leadId) return;
    const res = await adminFetch(`/api/crm/marketing/campaigns/${campaignId}/exclusions`, json({ leadId, reason }));
    if (!res.ok) { onError("That contact could not be excluded."); return; }
    setLeadId(null); setReason("");
    await load();
    onChanged();
  };

  const remove = async (id: number) => {
    const res = await adminFetch(`/api/crm/marketing/campaigns/${campaignId}/exclusions/${id}`, { method: "DELETE" });
    if (!res.ok) { onError("That exclusion could not be removed."); return; }
    await load();
    onChanged();
  };

  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.leadId} className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5">
              <span className="text-xs text-foreground min-w-0 truncate">
                {r.name} <span className="text-muted-foreground">· {r.email}</span>
                {r.reason ? <span className="text-muted-foreground"> — {r.reason}</span> : null}
              </span>
              <button onClick={() => void remove(r.leadId)} disabled={disabled} aria-label="Put them back in"
                className="shrink-0 p-1 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 disabled:opacity-40">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <>
          <ContactPicker value={leadId} onChange={setLeadId} onError={onError} />
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              className="flex-1 min-w-0 px-2.5 py-1.5 border border-input rounded-md bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/30"
              placeholder="Why are they being left out? (recorded)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button onClick={() => void add()} disabled={!leadId} className={btnGhost}>
              <Plus className="w-3.5 h-3.5" /> Exclude
            </button>
          </div>
        </>
      )}
    </div>
  );
}
