import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, ArrowLeft, ArrowRight, Check, CloudOff, Loader2, RefreshCw, Users,
} from "lucide-react";
import type { SegmentVocabulary } from "@/components/crm/SegmentBuilder";
import type { TokenProblem } from "@/components/crm/EmailDesigner";
import StepAudience from "./StepAudience";
import StepEmail from "./StepEmail";
import StepReview from "./StepReview";
import StepSend from "./StepSend";
import {
  btnGhost, btnQuiet, call, failureText, filterIsSavable, formatWhen, patchJson, postJson,
  type AiAvailability, type AudienceMode, type AudiencePreview, type Campaign,
  type Design, type EmailBlock, type MarketingSettings, type Preflight,
  type SegmentDefinition, type Segment,
} from "./shared";

// ── One campaign, four steps ─────────────────────────────────────────────────
//
// Audience → Email → Preview and test → Send or schedule. One draft object
// behind all four, so stepping back to fix something never costs anybody the
// work they did after it.
//
// The two things this component is really for:
//
//   Autosave that says what it is doing. "Saving…", "Saved at 14:32", or the
//   actual reason it could not — never a silent failure that looks like a save.
//
//   A refusal to overwrite somebody else. Every save carries the version it was
//   based on; if a colleague has moved the campaign since, the save is refused
//   and both versions are put in front of the person, with the colleague named.
//   Last-write-wins is not a merge strategy, it is a way of losing work quietly.

interface Props {
  campaign: Campaign;
  segments: Segment[];
  designs: Design[];
  vocabulary: SegmentVocabulary | null;
  mergeFields: Record<string, string>;
  settings: MarketingSettings | null;
  ai: AiAvailability | null;
  onClose: () => void;
  onCampaignChanged: (campaign: Campaign) => void;
  onSegmentsChanged: () => void;
  onDesignsChanged: () => void;
}

interface Draft {
  name: string;
  subject: string;
  preheader: string;
  blocks: EmailBlock[];
  audienceMode: AudienceMode;
  segmentId: number | null;
  audienceDefinition: SegmentDefinition | null;
  audienceLeadIds: number[];
}

const STEPS = [
  { id: 1, label: "Audience", hint: "Who gets this" },
  { id: 2, label: "Email", hint: "What it says" },
  { id: 3, label: "Preview & test", hint: "Check it" },
  { id: 4, label: "Send", hint: "Or schedule it" },
] as const;

const draftFrom = (c: Campaign): Draft => ({
  name: c.name,
  subject: c.subject ?? "",
  preheader: c.preheader ?? "",
  blocks: c.blocks ?? [],
  audienceMode: c.audienceMode ?? "segment",
  segmentId: c.segmentId ?? null,
  audienceDefinition: c.audienceDefinition ?? null,
  audienceLeadIds: c.audienceLeadIds ?? [],
});

export default function CampaignWorkspace(props: Props) {
  const {
    segments, designs, vocabulary, mergeFields, settings, ai,
    onClose, onCampaignChanged, onSegmentsChanged, onDesignsChanged,
  } = props;

  const [campaign, setCampaign] = useState<Campaign>(props.campaign);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(props.campaign));
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [saveState, setSaveState] = useState<"clean" | "pending" | "saving" | "saved" | "error">("clean");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ by: string | null; at: string; theirs: Campaign } | null>(null);
  const [filterHeld, setFilterHeld] = useState(false);

  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [audience, setAudience] = useState<AudiencePreview | null>(null);

  const [previewLeadId, setPreviewLeadId] = useState<number | null>(null);
  const [preview, setPreview] = useState<{
    html: string | null; subject: string | null; as: { id: number; name: string } | null;
    fallbacks: string[]; problems: TokenProblem[];
  }>({ html: null, subject: null, as: null, fallbacks: [], problems: [] });
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [testTo, setTestTo] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ sent: number; failed: number; remaining: number } | null>(null);

  const readOnly = campaign.status === "sending" || campaign.status === "sent" || campaign.status === "cancelled";
  const versionRef = useRef(campaign.updatedAt);
  versionRef.current = campaign.updatedAt;

  const adopt = useCallback((next: Campaign) => {
    setCampaign(next);
    onCampaignChanged(next);
  }, [onCampaignChanged]);

  // ── Autosave ───────────────────────────────────────────────────────────────

  const save = useCallback(async (state: Draft, expected: string): Promise<void> => {
    setSaveState("saving");
    setSaveMessage(null);

    const holdFilter = state.audienceMode === "filter" && !filterIsSavable(state.audienceDefinition);
    setFilterHeld(holdFilter);

    const body: Record<string, unknown> = {
      name: state.name,
      subject: state.subject,
      preheader: state.preheader,
      blocks: state.blocks,
      audienceMode: state.audienceMode,
      segmentId: state.segmentId,
      audienceLeadIds: state.audienceLeadIds,
      expectedUpdatedAt: expected,
    };
    // A half-typed filter is left out rather than failing the whole save and
    // taking the subject line down with it.
    if (!holdFilter) body["audienceDefinition"] = state.audienceDefinition;

    const r = await call<{ campaign: Campaign; conflict?: { by: string | null; at: string } }>(
      `/api/crm/marketing/campaigns/${campaign.id}`, patchJson(body),
    );

    if (r.status === 409 && r.data.conflict) {
      setSaveState("error");
      setSaveMessage(failureText(r, "Somebody else changed this campaign."));
      setConflict({ by: r.data.conflict.by ?? null, at: r.data.conflict.at, theirs: r.data.campaign });
      return;
    }
    if (!r.ok) {
      setSaveState("error");
      setSaveMessage(failureText(r, "This could not be saved."));
      return;
    }
    adopt(r.data.campaign);
    setSaveState("saved");
    setSavedAt(new Date().toISOString());
  }, [adopt, campaign.id]);

  const patchDraft = useCallback((patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaveState("pending");
  }, []);

  useEffect(() => {
    if (saveState !== "pending" || readOnly || conflict) return;
    const t = setTimeout(() => { void save(draft, versionRef.current); }, 1100);
    return () => clearTimeout(t);
  }, [draft, saveState, readOnly, conflict, save]);

  // ── Preflight, audience and preview ────────────────────────────────────────

  const loadPreflight = useCallback(async () => {
    const r = await call<Preflight>(`/api/crm/marketing/campaigns/${campaign.id}/preflight`);
    setPreflight(r.ok ? r.data : null);
  }, [campaign.id]);

  const loadAudience = useCallback(async () => {
    const r = await call<AudiencePreview>("/api/crm/marketing/audience/preview", postJson({
      audienceMode: draft.audienceMode,
      segmentId: draft.segmentId,
      audienceDefinition: draft.audienceDefinition,
      audienceLeadIds: draft.audienceLeadIds,
      campaignId: campaign.id,
    }));
    setAudience(r.ok ? r.data : null);
  }, [campaign.id, draft.audienceMode, draft.segmentId, draft.audienceDefinition, draft.audienceLeadIds]);

  const loadPreview = useCallback(async (leadId: number | null) => {
    setPreviewLoading(true);
    setPreviewError(null);
    const q = leadId ? `?leadId=${leadId}` : "";
    const r = await call<{
      html: string; subject: string; as: { id: number; name: string } | null;
      fallbacksUsed: string[]; tokenProblems: TokenProblem[];
    }>(`/api/crm/marketing/campaigns/${campaign.id}/preview${q}`);
    setPreviewLoading(false);
    if (!r.ok) { setPreviewError(failureText(r, "The preview could not be rendered.")); return; }
    setPreview({
      html: r.data.html, subject: r.data.subject, as: r.data.as,
      fallbacks: r.data.fallbacksUsed ?? [], problems: r.data.tokenProblems ?? [],
    });
  }, [campaign.id]);

  // The preview and the checks follow the SAVED campaign, not the keystroke:
  // they are server renders of what is actually stored, and showing them
  // against unsaved text would be the one place this screen could lie.
  useEffect(() => { void loadPreview(previewLeadId); }, [loadPreview, previewLeadId, campaign.updatedAt]);
  useEffect(() => { if (step >= 3) void loadPreflight(); }, [step, loadPreflight, campaign.updatedAt]);
  // Step 1 hands its own answer up rather than being asked again; the later
  // steps, where that component is not mounted, ask for themselves.
  useEffect(() => { if (step >= 3) void loadAudience(); }, [step, loadAudience]);

  // ── AI ─────────────────────────────────────────────────────────────────────

  const draftWithAi = async (brief: {
    purpose: string; keyMessage: string; action: string; audienceNote: string; tone: string; length: string;
  }) => {
    setAiBusy(true);
    setAiError(null);
    const r = await call<{ campaign: Campaign }>(
      `/api/crm/marketing/campaigns/${campaign.id}/ai-draft`,
      postJson({
        purpose: brief.purpose, keyMessage: brief.keyMessage, action: brief.action,
        audienceNote: brief.audienceNote, tone: brief.tone, length: brief.length,
      }),
    );
    setAiBusy(false);
    if (!r.ok) { setAiError(failureText(r, "A draft could not be written.")); return; }
    adopt(r.data.campaign);
    setDraft(draftFrom(r.data.campaign));
    setSaveState("saved");
    setSavedAt(new Date().toISOString());
  };

  const approveAi = async () => {
    setAiBusy(true);
    setAiError(null);
    const r = await call<{ campaign: Campaign }>(
      `/api/crm/marketing/campaigns/${campaign.id}/ai-draft/approve`, postJson({}),
    );
    setAiBusy(false);
    if (!r.ok) { setAiError(failureText(r, "That could not be approved.")); return; }
    adopt(r.data.campaign);
    void loadPreflight();
  };

  // ── Test send ──────────────────────────────────────────────────────────────

  const sendTest = async () => {
    setTestBusy(true);
    setTestResult(null);
    const r = await call<{ sent: boolean; to: string; reason: string | null; operatorReason?: string | null }>(
      `/api/crm/marketing/campaigns/${campaign.id}/test-send`,
      postJson({ to: testTo, asLeadId: previewLeadId ?? undefined }),
    );
    setTestBusy(false);
    if (!r.ok) { setTestResult({ ok: false, text: failureText(r, "The test could not be sent.") }); return; }
    setTestResult(r.data.sent
      ? { ok: true, text: `A copy is on its way to ${r.data.to}. It is marked as a test and no customer received it.` }
      // The operator sentence, never the mail layer's one — that one names
      // environment variables, which is administrator detail.
      : { ok: false, text: r.data.operatorReason ?? "Nothing was sent. The mail provider refused it." });
  };

  // ── Sending ────────────────────────────────────────────────────────────────

  /**
   * Drives the batched send to the end.
   *
   * The backend deliberately processes a batch per call and reports what is
   * left, so a send can be stopped. Something has to keep calling it; that is
   * this loop, and it stops the moment the campaign is no longer `sending`.
   */
  const drive = async () => {
    setBusy("send");
    setActionError(null);
    try {
      for (let i = 0; i < 200; i += 1) {
        const r = await call<{
          campaign: Campaign; sent: number; failed: number; remaining: number; finished: boolean;
        }>(`/api/crm/marketing/campaigns/${campaign.id}/send`, postJson({ batchSize: 25 }));
        if (!r.ok) { setActionError(failureText(r, "The send could not be started.")); break; }
        adopt(r.data.campaign);
        setProgress((p) => ({
          sent: (p?.sent ?? 0) + r.data.sent,
          failed: (p?.failed ?? 0) + r.data.failed,
          remaining: r.data.remaining,
        }));
        if (r.data.finished || r.data.campaign.status !== "sending") break;
      }
      void loadPreflight();
    } finally {
      setBusy(null);
    }
  };

  const schedule = async (iso: string, timezone: string) => {
    setBusy("schedule");
    setActionError(null);
    const r = await call<{ campaign: Campaign }>(
      `/api/crm/marketing/campaigns/${campaign.id}/schedule`,
      postJson({ scheduledAt: iso, timezone }),
    );
    setBusy(null);
    if (!r.ok) { setActionError(failureText(r, "This could not be scheduled.")); return; }
    adopt(r.data.campaign);
  };

  const unschedule = async () => {
    setBusy("schedule");
    setActionError(null);
    const r = await call<{ campaign: Campaign }>(
      `/api/crm/marketing/campaigns/${campaign.id}/schedule`, postJson({ scheduledAt: null }),
    );
    setBusy(null);
    if (!r.ok) { setActionError(failureText(r, "This could not be put back to a draft.")); return; }
    adopt(r.data.campaign);
  };

  // ── Conflict resolution ────────────────────────────────────────────────────

  const takeTheirs = () => {
    if (!conflict) return;
    adopt(conflict.theirs);
    setDraft(draftFrom(conflict.theirs));
    setConflict(null);
    setSaveState("clean");
    setSaveMessage(null);
  };

  const keepMine = () => {
    if (!conflict) return;
    const expected = conflict.theirs.updatedAt;
    setCampaign(conflict.theirs);
    setConflict(null);
    void save(draft, expected);
  };

  const audienceLabel = audience?.label ?? campaign.audienceLabel ?? "No audience yet";

  const saveLabel = useMemo(() => {
    if (readOnly) return "This campaign can no longer be edited";
    switch (saveState) {
      case "saving": return "Saving…";
      case "pending": return "Unsaved changes";
      case "saved": return `Saved ${formatWhen(savedAt)}`;
      case "error": return saveMessage ?? "Not saved";
      default: return `Last saved ${formatWhen(campaign.updatedAt)}`;
    }
  }, [readOnly, saveState, savedAt, saveMessage, campaign.updatedAt]);

  return (
    <div className="space-y-4">
      {/* ══ Header ══ */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <button type="button" onClick={onClose} className={`${btnQuiet} -ml-2.5`}>
            <ArrowLeft className="w-4 h-4" /> All campaigns
          </button>
          <input
            className="mt-1 w-full bg-transparent border-0 border-b border-transparent hover:border-border focus:border-teal-600 text-xl sm:text-2xl font-bold text-foreground px-0 py-1 focus:outline-none disabled:opacity-70"
            value={draft.name}
            disabled={readOnly}
            aria-label="Campaign name"
            onChange={(e) => patchDraft({ name: e.target.value })}
          />
          <p className={`text-xs mt-0.5 flex items-center gap-1.5 ${
            saveState === "error" ? "text-red-700" : "text-muted-foreground"
          }`}>
            {saveState === "saving" && <Loader2 className="w-3 h-3 animate-spin" />}
            {saveState === "saved" && <Check className="w-3 h-3" />}
            {saveState === "error" && <CloudOff className="w-3 h-3" />}
            {saveLabel}
            {saveState === "error" && !conflict && (
              <button type="button" className="underline font-semibold" onClick={() => void save(draft, versionRef.current)}>
                Try again
              </button>
            )}
          </p>
          {filterHeld && (
            <p className="text-xs text-amber-800 mt-0.5">
              The filter is not finished, so it has not been saved yet. Everything else has.
            </p>
          )}
        </div>
      </div>

      {/* ══ Somebody else got there first ══ */}
      {conflict && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5">
          <p className="text-sm font-semibold text-amber-900 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {conflict.by ?? "Somebody else"} changed this campaign at {formatWhen(conflict.at)}.
          </p>
          <p className="text-sm text-amber-900/80 mt-1">
            Nothing you typed has been saved. Their subject line is “{conflict.theirs.subject || "(none)"}”.
            Take their version, or save yours over it — whichever you choose, the other is gone.
          </p>
          <div className="flex flex-wrap gap-2 mt-2.5">
            <button type="button" className={btnGhost} onClick={takeTheirs}>
              <RefreshCw className="w-4 h-4" /> Load their version
            </button>
            <button type="button" className={btnGhost} onClick={keepMine}>
              Save mine over theirs
            </button>
          </div>
        </div>
      )}

      {/* ══ Steps ══ */}
      <ol className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Campaign steps">
        {STEPS.map((s) => (
          <li key={s.id} className="shrink-0">
            <button
              type="button"
              onClick={() => setStep(s.id)}
              aria-current={step === s.id ? "step" : undefined}
              className={`px-3 py-2 rounded-lg border text-left min-h-[48px] ${
                step === s.id
                  ? "border-teal-600 bg-teal-50 ring-1 ring-teal-600/30"
                  : "border-border bg-card hover:bg-accent"
              }`}
            >
              <span className={`block text-xs font-semibold ${step === s.id ? "text-teal-900" : "text-foreground"}`}>
                {s.id}. {s.label}
              </span>
              <span className="block text-[11px] text-muted-foreground">{s.hint}</span>
            </button>
          </li>
        ))}
      </ol>

      {/* ══ The step ══ */}
      {step === 1 && (
        <StepAudience
          campaignId={campaign.id}
          mode={draft.audienceMode}
          segmentId={draft.segmentId}
          definition={draft.audienceDefinition}
          leadIds={draft.audienceLeadIds}
          segments={segments}
          vocabulary={vocabulary}
          readOnly={readOnly}
          onChange={(p) => patchDraft({
            ...(p.audienceMode !== undefined ? { audienceMode: p.audienceMode } : {}),
            ...(p.segmentId !== undefined ? { segmentId: p.segmentId } : {}),
            ...(p.audienceDefinition !== undefined ? { audienceDefinition: p.audienceDefinition } : {}),
            ...(p.audienceLeadIds !== undefined ? { audienceLeadIds: p.audienceLeadIds } : {}),
          })}
          onSegmentsChanged={onSegmentsChanged}
          onPreview={setAudience}
        />
      )}

      {step === 2 && (
        <StepEmail
          campaign={campaign}
          subject={draft.subject}
          preheader={draft.preheader}
          blocks={draft.blocks}
          designs={designs}
          mergeFields={mergeFields}
          tokenProblems={preview.problems}
          audienceLabel={audienceLabel}
          ai={ai}
          aiBusy={aiBusy}
          aiError={aiError}
          readOnly={readOnly}
          onChange={(p) => patchDraft({
            ...(p.subject !== undefined ? { subject: p.subject } : {}),
            ...(p.preheader !== undefined ? { preheader: p.preheader } : {}),
            ...(p.blocks !== undefined ? { blocks: p.blocks } : {}),
          })}
          onDraftWithAi={(b) => void draftWithAi(b)}
          onApproveAi={() => void approveAi()}
          onDesignsChanged={onDesignsChanged}
          previewHtml={preview.html}
          previewLoading={previewLoading}
          previewError={previewError}
          previewSubject={preview.subject}
          previewAs={preview.as}
          fallbacksUsed={preview.fallbacks}
          onRefreshPreview={() => void loadPreview(previewLeadId)}
        />
      )}

      {step === 3 && (
        <StepReview
          blocks={draft.blocks}
          subject={draft.subject}
          preheader={draft.preheader}
          preflight={preflight}
          audience={audience}
          settings={settings}
          previewHtml={preview.html}
          previewLoading={previewLoading}
          previewError={previewError}
          previewAs={preview.as}
          previewLeadId={previewLeadId}
          fallbacksUsed={preview.fallbacks}
          onPreviewAs={setPreviewLeadId}
          onRefreshPreview={() => void loadPreview(previewLeadId)}
          testTo={testTo}
          onTestTo={setTestTo}
          onTestSend={() => void sendTest()}
          testBusy={testBusy}
          testResult={testResult}
          readOnly={readOnly}
        />
      )}

      {step === 4 && (
        <StepSend
          campaign={campaign}
          preflight={preflight}
          settings={settings}
          audienceLabel={audienceLabel}
          busy={busy}
          error={actionError}
          progress={progress}
          readOnly={readOnly}
          onSendNow={() => void drive()}
          onSchedule={(iso, tz) => void schedule(iso, tz)}
          onUnschedule={() => void unschedule()}
        />
      )}

      {/* ══ Move between steps ══ */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          className={btnGhost}
          disabled={step === 1}
          onClick={() => setStep(((step - 1) || 1) as 1 | 2 | 3 | 4)}
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <p className="text-xs text-muted-foreground hidden sm:flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" /> {audienceLabel}
        </p>
        <button
          type="button"
          className={btnGhost}
          disabled={step === 4}
          onClick={() => setStep((step + 1) as 1 | 2 | 3 | 4)}
        >
          Next <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
