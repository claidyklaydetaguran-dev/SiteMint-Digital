import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { CrmLayout } from "./CrmLayout";
import {
  AlertCircle, AlertTriangle, ArrowUpRight, BarChart2, Ban, Copy, Loader2, Mail,
  Pause, Pencil, Play, Plus, RefreshCw, Search, Settings2, Trash2, Users, Workflow,
} from "lucide-react";
import type { SegmentVocabulary } from "@/components/crm/SegmentBuilder";
import CampaignWorkspace from "@/components/crm/campaign/CampaignWorkspace";
import CampaignResults from "@/components/crm/campaign/CampaignResults";
import {
  btnGhost, btnPrimary, btnQuiet, call, cardClass, failureText, formatWhen,
  inputClass, postJson,
  type AiAvailability, type Campaign, type Design, type MarketingSettings, type Segment,
} from "@/components/crm/campaign/shared";

// ── M5: Marketing ────────────────────────────────────────────────────────────
//
// The problem this screen was rebuilt to solve is a naming one that had become
// a usability one. Two different systems were both called "campaign":
//
//   /admin/crm/campaigns        the SEQUENCE engine — several messages over
//                               days, contacts enrolled into it, follow-up
//                               automated. Draft / Ready / Archived.
//   /admin/crm/campaign-builder this — one email to a list of people, once.
//
// Both had a "New campaign" button, and only one of them was called Marketing.
// So the first decision an operator faced was one nobody had explained to them,
// between two words that were the same word.
//
// Neither system is wrong and neither is going away. What changed is that this
// page is now unambiguously the front door for "send one email", says so in
// those words, and names the other system — with a link — instead of competing
// with it silently.
//
// Everything else follows from making one job easy:
//
//   ONE primary button. Create campaign. Not two.
//
//   States an operator recognises. Draft, Scheduled, Sending, Completed,
//   Needs attention — where "needs attention" includes the case this product
//   used to hide: scheduled on a server where nothing starts a scheduled send.
//
//   Templates, saved audiences and settings are secondary. They are things you
//   occasionally set up, not things you do; they live behind tabs, not beside
//   the list as equals.

type Tab = "campaigns" | "templates" | "audiences" | "settings";
type StateFilter = "all" | "draft" | "scheduled" | "sending" | "completed" | "attention" | "cancelled";

interface DisplayState {
  key: Exclude<StateFilter, "all">;
  label: string;
  className: string;
  /** Shown under the name when something is not as it looks. */
  note: string | null;
}

/**
 * What state a campaign is really in, from the operator's point of view.
 *
 * The stored status is not enough on its own. "Scheduled" is a promise, and on
 * a server where nothing starts a scheduled send it is a promise nobody will
 * keep — so it is reported as needing attention, with the reason, rather than
 * as a quiet success.
 */
export function displayState(c: Campaign, autosend: boolean): DisplayState {
  const failed = c.counts?.["failed"] ?? 0;
  const attention = "bg-amber-50 text-amber-900 border border-amber-300";

  if (c.status === "paused") {
    return { key: "attention", label: "Needs attention", className: attention, note: "Paused part-way through a send." };
  }
  if (c.status === "scheduled" && !autosend) {
    return {
      key: "attention", label: "Needs attention", className: attention,
      note: `Scheduled for ${formatWhen(c.scheduledAt, c.scheduledTimezone)}, but nothing on this server will start it — somebody has to press Send.`,
    };
  }
  if (failed > 0 && (c.status === "sent" || c.status === "cancelled")) {
    return {
      key: "attention", label: "Needs attention", className: attention,
      note: `${failed} ${failed === 1 ? "message was" : "messages were"} refused by the mail provider.`,
    };
  }
  if (c.status === "scheduled") {
    return {
      key: "scheduled", label: "Scheduled", className: "bg-teal-50 text-teal-900 border border-teal-200",
      note: `Starts on its own at ${formatWhen(c.scheduledAt, c.scheduledTimezone)}.`,
    };
  }
  if (c.status === "sending") {
    return { key: "sending", label: "Sending", className: "bg-teal-700 text-white", note: null };
  }
  if (c.status === "sent") {
    return { key: "completed", label: "Completed", className: "bg-emerald-50 text-emerald-900 border border-emerald-200", note: null };
  }
  if (c.status === "cancelled") {
    return { key: "cancelled", label: "Cancelled", className: "bg-muted text-muted-foreground border border-border", note: null };
  }
  return { key: "draft", label: "Draft", className: "bg-muted text-muted-foreground border border-border", note: null };
}

const FILTERS: { id: StateFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Draft" },
  { id: "scheduled", label: "Scheduled" },
  { id: "sending", label: "Sending" },
  { id: "completed", label: "Completed" },
  { id: "attention", label: "Needs attention" },
  { id: "cancelled", label: "Cancelled" },
];

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
  const [settings, setSettings] = useState<MarketingSettings | null>(null);
  const [ai, setAi] = useState<AiAvailability | null>(null);
  const [autosend, setAutosend] = useState(false);

  const [tab, setTab] = useState<Tab>("campaigns");
  const [filter, setFilter] = useState<StateFilter>("all");
  const [search, setSearch] = useState("");

  const [openId, setOpenId] = useState<number | null>(null);
  const [resultsId, setResultsId] = useState<number | null>(null);
  const [busyRow, setBusyRow] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [showAdminDetail, setShowAdminDetail] = useState(false);

  // ── Loading ────────────────────────────────────────────────────────────────

  const loadCampaigns = useCallback(async () => {
    const r = await call<{ campaigns: Campaign[]; autosendEnabled?: boolean }>("/api/crm/marketing/campaigns");
    if (!r.ok) return false;
    setCampaigns(r.data.campaigns ?? []);
    setAutosend(r.data.autosendEnabled === true);
    return true;
  }, []);

  const loadSegments = useCallback(async () => {
    const r = await call<{
      segments: Segment[]; fields: string[];
      fieldOperators: Record<string, string[]>; fieldValues: Record<string, string[]>;
    }>("/api/crm/marketing/segments");
    if (!r.ok) return false;
    setSegments(r.data.segments ?? []);
    setVocabulary({
      fields: r.data.fields ?? [],
      fieldOperators: r.data.fieldOperators ?? {},
      fieldValues: r.data.fieldValues ?? {},
    });
    return true;
  }, []);

  const loadDesigns = useCallback(async () => {
    const r = await call<{ designs: Design[]; mergeFields: Record<string, string> }>("/api/crm/marketing/designs");
    if (!r.ok) return false;
    setDesigns(r.data.designs ?? []);
    setMergeFields(r.data.mergeFields ?? {});
    return true;
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [c, s, d, settingsRes, aiRes] = await Promise.all([
        loadCampaigns(), loadSegments(), loadDesigns(),
        call<MarketingSettings>("/api/crm/marketing/settings"),
        call<AiAvailability>("/api/crm/marketing/ai/availability"),
      ]);
      if (!c || !s || !d) { setLoadError("Marketing could not be loaded."); return; }
      if (settingsRes.ok) {
        setSettings(settingsRes.data);
        setAutosend(settingsRes.data.autosend.enabled);
      }
      setAi(aiRes.ok ? aiRes.data : { available: false });
    } catch {
      setLoadError("Marketing could not be loaded — the server did not answer.");
    } finally {
      setLoading(false);
    }
  }, [loadCampaigns, loadSegments, loadDesigns]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // ── Row actions ────────────────────────────────────────────────────────────

  const createCampaign = async () => {
    setCreating(true);
    setBanner(null);
    const stamp = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const r = await call<{ campaign: Campaign }>("/api/crm/marketing/campaigns", postJson({
      name: `Untitled campaign — ${stamp}`,
      // A new campaign opens on "choose contacts" rather than on the list of
      // saved audiences. The saved-audience list is what the old screen opened
      // on, and it is the dead end: somebody who wants to email eleven people
      // was shown a list that did not contain them and an instruction to go
      // make one. Nothing is selected — the mode is just the least surprising
      // place to start.
      audienceMode: "list",
      audienceLeadIds: [],
    }));
    setCreating(false);
    if (!r.ok) { setBanner({ tone: "bad", text: failureText(r, "The campaign could not be created.") }); return; }
    setCampaigns((list) => [r.data.campaign, ...list]);
    setOpenId(r.data.campaign.id);
  };

  const rowAction = async (id: number, action: "duplicate" | "pause" | "resume" | "cancel") => {
    setBusyRow(id);
    setBanner(null);
    const r = await call<{ campaign: Campaign; note?: string }>(
      `/api/crm/marketing/campaigns/${id}/${action}`, postJson({}),
    );
    setBusyRow(null);
    if (!r.ok) { setBanner({ tone: "bad", text: failureText(r, `That campaign could not be ${action}d.`) }); return; }
    await loadCampaigns();
    if (action === "duplicate") {
      setBanner({ tone: "ok", text: r.data.note ?? "Copied into a new draft." });
      setOpenId(r.data.campaign.id);
      return;
    }
    setBanner({ tone: action === "cancel" ? "warn" : "ok", text: r.data.note ?? "Done." });
  };

  const archive = async (kind: "segments" | "designs", id: number, name: string) => {
    const r = await call<Record<string, unknown>>(`/api/crm/marketing/${kind}/${id}`, { method: "DELETE" });
    if (!r.ok) { setBanner({ tone: "bad", text: failureText(r, "That could not be archived.") }); return; }
    setBanner({ tone: "ok", text: `"${name}" is archived. Campaigns that already used it still name it.` });
    if (kind === "segments") await loadSegments(); else await loadDesigns();
  };

  // ── The list ───────────────────────────────────────────────────────────────

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return campaigns.filter((c) => {
      const state = displayState(c, autosend);
      if (filter !== "all" && state.key !== filter) return false;
      if (!term) return true;
      return [c.name, c.subject, c.audienceLabel, c.createdByLabel, c.updatedByLabel]
        .filter(Boolean).some((v) => String(v).toLowerCase().includes(term));
    });
  }, [campaigns, filter, search, autosend]);

  const attentionCount = useMemo(
    () => campaigns.filter((c) => displayState(c, autosend).key === "attention").length,
    [campaigns, autosend],
  );

  const open = openId === null ? null : campaigns.find((c) => c.id === openId) ?? null;
  const results = resultsId === null ? null : campaigns.find((c) => c.id === resultsId) ?? null;

  // ── Shell states ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <CrmLayout>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading Marketing…
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
          <button type="button" onClick={() => void loadAll()} className={btnGhost}>
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
        </div>
      </CrmLayout>
    );
  }

  if (open) {
    return (
      <CrmLayout>
        <div className="p-4 sm:p-6 max-w-6xl mx-auto">
          <CampaignWorkspace
            key={open.id}
            campaign={open}
            segments={segments}
            designs={designs}
            vocabulary={vocabulary}
            mergeFields={mergeFields}
            settings={settings}
            ai={ai}
            onClose={() => { setOpenId(null); void loadCampaigns(); }}
            onCampaignChanged={(next) => setCampaigns((list) => list.map((c) => (c.id === next.id ? { ...c, ...next } : c)))}
            onSegmentsChanged={() => void loadSegments()}
            onDesignsChanged={() => void loadDesigns()}
          />
        </div>
      </CrmLayout>
    );
  }

  if (results) {
    return (
      <CrmLayout>
        <div className="p-4 sm:p-6 max-w-4xl mx-auto">
          <CampaignResults campaign={results} onClose={() => setResultsId(null)} />
        </div>
      </CrmLayout>
    );
  }

  return (
    <CrmLayout>
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
        {/* ══ Header ══ */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Mail className="w-5 h-5 text-teal-700" /> Marketing
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              One email, sent once, to a list of people.
            </p>
          </div>
          <button type="button" className={btnPrimary} disabled={creating} onClick={() => void createCampaign()}>
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create campaign
          </button>
        </div>

        {/* ══ The other thing called "campaign" ══ */}
        <div className="rounded-xl border border-border bg-muted/40 px-3.5 py-3">
          <p className="text-sm text-foreground flex items-start gap-2">
            <Workflow className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
            <span>
              <strong className="font-semibold">Looking for multi-step follow-up?</strong>{" "}
              A <em>sequence</em> is the other thing — several messages over days, with contacts
              enrolled into it. It lives in its own screens and is not affected by anything here.
            </span>
          </p>
          <div className="flex flex-wrap gap-2 mt-2 pl-6">
            <button type="button" className={btnQuiet} onClick={() => navigate("/admin/crm/campaigns")}>
              Open sequences <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
            <button type="button" className={btnQuiet} onClick={() => navigate("/admin/crm/campaign-queue")}>
              Sequence message queue <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {banner && (
          <div className={`rounded-xl border px-3.5 py-3 text-sm ${
            banner.tone === "bad" ? "border-red-200 bg-red-50 text-red-800"
              : banner.tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}>
            {banner.text}
          </div>
        )}

        {/* ══ Tabs — the list is the page; the rest is setup ══ */}
        <div className="flex flex-wrap items-center gap-1 border-b border-border">
          {([
            ["campaigns", "Campaigns"],
            ["templates", `Templates (${designs.length})`],
            ["audiences", `Saved audiences (${segments.length})`],
            ["settings", "Settings"],
          ] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={tab === id ? "page" : undefined}
              className={`px-3 py-2.5 text-sm font-semibold border-b-2 -mb-px min-h-[44px] ${
                tab === id
                  ? "border-teal-700 text-teal-900"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ══ Campaigns ══ */}
        {tab === "campaigns" && (
          <>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  className={`${inputClass} pl-9`}
                  placeholder="Search campaigns by name, subject, audience or who edited them"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <button type="button" className={btnGhost} onClick={() => void loadCampaigns()}>
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  aria-pressed={filter === f.id}
                  className={`px-3 py-2 rounded-full text-xs font-semibold border min-h-[36px] ${
                    filter === f.id
                      ? "border-teal-600 bg-teal-50 text-teal-900"
                      : "border-border bg-card text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {f.label}
                  {f.id === "attention" && attentionCount > 0 && (
                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-900">{attentionCount}</span>
                  )}
                </button>
              ))}
            </div>

            {visible.length === 0 ? (
              <div className={`${cardClass} p-8 text-center`}>
                <Mail className="w-8 h-8 text-muted-foreground mx-auto" />
                <p className="text-sm text-foreground mt-2">
                  {campaigns.length === 0
                    ? "No campaigns yet."
                    : "No campaign matches what you are looking for."}
                </p>
                {campaigns.length === 0 && (
                  <button type="button" className={`${btnPrimary} mx-auto mt-3`} onClick={() => void createCampaign()}>
                    <Plus className="w-4 h-4" /> Create your first campaign
                  </button>
                )}
              </div>
            ) : (
              <ul className="space-y-2">
                {visible.map((c) => {
                  const state = displayState(c, autosend);
                  const sent = c.counts?.["sent"] ?? 0;
                  const failedCount = c.counts?.["failed"] ?? 0;
                  const excluded = c.counts?.["excluded"] ?? 0;
                  const editable = c.status === "draft" || c.status === "scheduled";
                  return (
                    <li key={c.id} className={`${cardClass} p-3.5`}>
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => (editable ? setOpenId(c.id) : setResultsId(c.id))}
                              className="text-base font-semibold text-foreground hover:text-teal-800 text-left truncate"
                            >
                              {c.name}
                            </button>
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${state.className}`}>
                              {state.label}
                            </span>
                          </div>
                          {c.subject && (
                            <p className="text-sm text-muted-foreground truncate mt-0.5">“{c.subject}”</p>
                          )}
                          {state.note && (
                            <p className="text-xs text-amber-900 mt-1 flex items-start gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {state.note}
                            </p>
                          )}
                          <dl className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Users className="w-3.5 h-3.5" />
                              <dt className="sr-only">Audience</dt>
                              <dd>{c.audienceLabel ?? "No audience yet"}</dd>
                            </div>
                            <div>
                              <dt className="sr-only">Results</dt>
                              <dd>
                                {c.status === "draft" || c.status === "scheduled"
                                  ? "Not sent yet"
                                  : `${sent} delivered${failedCount ? `, ${failedCount} failed` : ""}${excluded ? `, ${excluded} left out` : ""}`}
                              </dd>
                            </div>
                            <div>
                              <dt className="sr-only">Last edited</dt>
                              <dd>
                                Edited {formatWhen(c.updatedAt)}
                                {c.updatedByLabel ? ` by ${c.updatedByLabel}` : ""}
                              </dd>
                            </div>
                          </dl>
                        </div>

                        <div className="flex flex-wrap items-center gap-1 shrink-0">
                          {editable && (
                            <button type="button" className={btnQuiet} onClick={() => setOpenId(c.id)}>
                              <Pencil className="w-3.5 h-3.5" /> Edit
                            </button>
                          )}
                          <button
                            type="button" className={btnQuiet}
                            disabled={busyRow === c.id}
                            onClick={() => void rowAction(c.id, "duplicate")}
                          >
                            <Copy className="w-3.5 h-3.5" /> Duplicate
                          </button>
                          {c.status === "sending" && (
                            <button type="button" className={btnQuiet} disabled={busyRow === c.id} onClick={() => void rowAction(c.id, "pause")}>
                              <Pause className="w-3.5 h-3.5" /> Pause
                            </button>
                          )}
                          {c.status === "paused" && (
                            <button type="button" className={btnQuiet} disabled={busyRow === c.id} onClick={() => void rowAction(c.id, "resume")}>
                              <Play className="w-3.5 h-3.5" /> Resume
                            </button>
                          )}
                          {c.status !== "sent" && c.status !== "cancelled" && (
                            <button type="button" className={btnQuiet} disabled={busyRow === c.id} onClick={() => void rowAction(c.id, "cancel")}>
                              <Ban className="w-3.5 h-3.5" /> Cancel
                            </button>
                          )}
                          {c.status !== "draft" && (
                            <button type="button" className={btnQuiet} onClick={() => setResultsId(c.id)}>
                              <BarChart2 className="w-3.5 h-3.5" /> Results
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {/* ══ Templates ══ */}
        {tab === "templates" && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Saved emails you can start a campaign from. Create one from inside a campaign, on the
              Email step.
            </p>
            {designs.length === 0 ? (
              <div className={`${cardClass} p-6 text-center text-sm text-muted-foreground`}>
                No templates yet.
              </div>
            ) : (
              <ul className="space-y-2">
                {designs.map((d) => (
                  <li key={d.id} className={`${cardClass} p-3.5 flex items-start justify-between gap-3`}>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{d.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {d.subject ? `“${d.subject}”` : `${(d.blocks ?? []).length} blocks`}
                      </p>
                    </div>
                    <button type="button" className={btnQuiet} onClick={() => void archive("designs", d.id, d.name)}>
                      <Trash2 className="w-3.5 h-3.5" /> Archive
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ══ Saved audiences ══ */}
        {tab === "audiences" && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Reusable audiences. You do not need one to send a campaign — pick contacts or build a
              filter inside the campaign instead. Counts are worked out now, from the conditions;
              nothing stores a member list.
            </p>
            {segments.length === 0 ? (
              <div className={`${cardClass} p-6 text-center text-sm text-muted-foreground`}>
                No saved audiences yet.
              </div>
            ) : (
              <ul className="space-y-2">
                {segments.map((s) => (
                  <li key={s.id} className={`${cardClass} p-3.5 flex items-start justify-between gap-3`}>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.memberCount ?? 0} contacts match right now
                        {s.createdByLabel ? ` · made by ${s.createdByLabel}` : ""}
                      </p>
                    </div>
                    <button type="button" className={btnQuiet} onClick={() => void archive("segments", s.id, s.name)}>
                      <Trash2 className="w-3.5 h-3.5" /> Archive
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ══ Settings ══ */}
        {tab === "settings" && settings && (
          <div className="space-y-2">
            <div className={`${cardClass} p-3.5`}>
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-teal-700" /> Automatic sending
              </p>
              <p className="text-sm text-muted-foreground mt-1">{settings.autosend.operatorNote}</p>
            </div>

            <div className={`${cardClass} p-3.5`}>
              <p className="text-sm font-semibold text-foreground">Mail delivery</p>
              <p className="text-sm text-muted-foreground mt-1">{settings.delivery.operatorNote}</p>
              <p className="text-xs text-muted-foreground mt-1.5">
                Emails are sent from <span className="text-foreground">{settings.sender.address}</span>.
              </p>
            </div>

            <div className={`${cardClass} p-3.5`}>
              <p className="text-sm font-semibold text-foreground">Test addresses</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                A test send can only reach one of these — never a customer.
              </p>
              <ul className="mt-1.5 space-y-0.5">
                {settings.testAddresses.map((s) => (
                  <li key={s.id} className="text-sm text-muted-foreground">
                    {s.displayName ?? s.email} <span className="text-xs">— {s.email}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className={`${cardClass} p-3.5`}>
              <button
                type="button"
                onClick={() => setShowAdminDetail((v) => !v)}
                aria-expanded={showAdminDetail}
                className={`${btnQuiet} -ml-2.5`}
              >
                Setup detail for whoever administers this system
              </button>
              {showAdminDetail && (
                <ul className="mt-1.5 space-y-1.5">
                  {[settings.autosend.adminNote, settings.delivery.adminNote]
                    .filter((v): v is string => !!v)
                    .map((note) => (
                      <li key={note} className="text-xs text-muted-foreground font-mono break-words">{note}</li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </CrmLayout>
  );
}
