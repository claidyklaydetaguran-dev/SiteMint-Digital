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
  btnGhost, btnQuiet, call, cardClass, failureText, filterIsSavable, formatWhen, patchJson, postJson,
  stateAfterSave,
  type AiAvailability, type ApiResult, type AudiencePreview, type Campaign,
  type Design, type MarketingSettings, type Preflight, type Segment,
} from "./shared";
import { type Load, failureReason, readAdminResource } from "@/lib/adminLoad";
import { LoadFailure, PageLoadFailures, dataOf, failedParts } from "@/components/crm/LoadState";
import {
  adoptServerCopy, draftFrom, forgetUnsaved, preserveUnsaved, recoverableDraft, sameDraft, saveAgainst, saveIndicator,
  type CampaignDraft, type RecoverableDraft, type SaveState,
} from "./campaignDraft";

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
//   Until the server has a change, this browser keeps it (campaignDraft.ts),
//   and opening the campaign again offers it back. Nothing is re-sent by itself.
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

const STEPS = [
  { id: 1, label: "Audience", hint: "Who gets this" },
  { id: 2, label: "Email", hint: "What it says" },
  { id: 3, label: "Preview & test", hint: "Check it" },
  { id: 4, label: "Send", hint: "Or schedule it" },
] as const;

// ── The two answers this screen may never guess ──────────────────────────────
//
// `setPreflight(r.ok ? r.data : null)` and `setAudience(r.ok ? r.data : null)`
// made a refused request, an unreachable server and a genuinely empty answer
// into the same value — and `call` reports a dropped connection as
// `{ ok: false, status: 0 }` rather than throwing, so it collapsed in there too.
//
// This sits one step before an irreversible send, which is what made it the
// worst instance of the rule: with a null preflight the checks silently vanish,
// the footer falls through to "No audience yet", and the send step reads "Goes
// to 0 people" above a Send button. Somebody could send a campaign believing it
// had been checked when nothing had answered.

function pickPreflight(body: unknown): Preflight | undefined {
  if (!body || typeof body !== "object") return undefined;
  const p = body as Partial<Preflight>;
  // `canSend` and `sendable` are what the send step reads. A body without them
  // is an answer we did not understand — never a campaign that cannot go out.
  if (typeof p.canSend !== "boolean" || typeof p.sendable !== "number") return undefined;
  return body as Preflight;
}

function pickAudience(body: unknown): AudiencePreview | undefined {
  if (!body || typeof body !== "object") return undefined;
  const a = body as Partial<AudiencePreview>;
  if (typeof a.label !== "string" || typeof a.eligibleCount !== "number") return undefined;
  return body as AudiencePreview;
}

/** A `call` result as a `Load`, for the one read here that has to be a POST. */
function loadFromCall<T>(r: ApiResult<unknown>, pick: (body: unknown) => T | undefined): Load<T> {
  if (r.status === 0) return { status: "error", httpStatus: null, reason: failureReason(null) };
  if (!r.ok) return { status: "error", httpStatus: r.status, reason: failureReason(r.status, r.data) };
  const data = pick(r.data);
  if (data === undefined) {
    return { status: "error", httpStatus: r.status, reason: "The server's answer was not in the expected shape." };
  }
  return { status: "ready", data };
}

export default function CampaignWorkspace(props: Props) {
  const {
    segments, designs, vocabulary, mergeFields, settings, ai,
    onClose, onCampaignChanged, onSegmentsChanged, onDesignsChanged,
  } = props;

  const [campaign, setCampaign] = useState<Campaign>(props.campaign);
  const [draft, setDraft] = useState<CampaignDraft>(() => draftFrom(props.campaign));
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [saveState, setSaveState] = useState<SaveState>("clean");
  /** Set once this browser is holding changes the server does not have. */
  const [keptAt, setKeptAt] = useState<number | null>(null);
  /** Changes an earlier visit kept and never saved, waiting for a person's decision. */
  const [recovery, setRecovery] = useState<RecoverableDraft | null>(() => recoverableDraft(props.campaign));
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ by: string | null; at: string; theirs: Campaign } | null>(null);
  const [filterHeld, setFilterHeld] = useState(false);

  const [preflightLoad, setPreflightLoad] = useState<Load<Preflight>>({ status: "loading" });
  const [audienceLoad, setAudienceLoad] = useState<Load<AudiencePreview>>({ status: "loading" });
  // Re-check flags, not "loading": each answer stays on screen while the next
  // one is on its way, so an autosave — which re-runs both — never blanks the
  // step somebody is reading.
  const [preflightChecking, setPreflightChecking] = useState(false);
  const [audienceChecking, setAudienceChecking] = useState(false);

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
  const [progress, setProgress] = useState<
    { sent: number; failed: number; unconfirmed: number; notDelivered: number; remaining: number } | null
  >(null);

  const readOnly = campaign.status === "sending" || campaign.status === "sent" || campaign.status === "cancelled";
  const versionRef = useRef(campaign.updatedAt);
  versionRef.current = campaign.updatedAt;
  // The draft as it is NOW, readable from inside an in-flight save.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  // The version unsaved changes were made on top of, when that is not simply
  // the version on screen: restored changes keep the version they came from, so
  // saving them can still be refused in a colleague's favour.
  const baseRef = useRef<string | null>(null);

  const adopt = useCallback((next: Campaign) => {
    setCampaign(next);
    onCampaignChanged(next);
  }, [onCampaignChanged]);

  // ── Autosave ───────────────────────────────────────────────────────────────

  const save = useCallback(async (state: CampaignDraft, expected: string): Promise<void> => {
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
    baseRef.current = null;
    setSavedAt(new Date().toISOString());
    // Anything typed while this request was in flight is NOT on the server.
    // Saying "Saved" would be untrue and would also stop the autosave, because
    // it only re-arms from `pending`.
    const next = stateAfterSave(state, draftRef.current);
    setSaveState(next);
    if (next === "saved") {
      // The server holds exactly what the editor holds; the kept copy is done.
      forgetUnsaved(campaign.id);
      setKeptAt(null);
    }
  }, [adopt, campaign.id]);

  const patchDraft = useCallback((patch: Partial<CampaignDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setSaveState("pending");
  }, []);

  useEffect(() => {
    if (saveState !== "pending" || readOnly || conflict || recovery) return;
    const t = setTimeout(() => { void save(draft, saveAgainst(baseRef.current, versionRef.current)); }, 1100);
    return () => clearTimeout(t);
  }, [draft, saveState, readOnly, conflict, recovery, save]);

  // While a change is waiting, in flight, or refused, the server does not have
  // it — so this browser keeps it, against the version it was made on, until the
  // server does. A scratch copy for a person to restore; never replayed.
  useEffect(() => {
    if (readOnly || recovery) return;
    if (saveState !== "pending" && saveState !== "saving" && saveState !== "error") return;
    const stamp = preserveUnsaved(campaign.id, draft, saveAgainst(baseRef.current, versionRef.current));
    setKeptAt((k) => k ?? stamp);
  }, [draft, saveState, readOnly, recovery, campaign.id]);

  const restoreKept = () => {
    if (!recovery) return;
    const kept = recovery;
    setRecovery(null);
    setDraft(kept.draft);
    setKeptAt(kept.preservedAt);
    baseRef.current = kept.baseUpdatedAt;
    // Saved against the version the changes were made on. If anybody has saved
    // since, the server refuses and names them, and the conflict panel puts both
    // versions in front of the person — nothing is overwritten quietly.
    void save(kept.draft, kept.baseUpdatedAt);
  };

  const discardKept = () => {
    forgetUnsaved(campaign.id);
    setRecovery(null);
  };

  // ── Preflight, audience and preview ────────────────────────────────────────

  const loadPreflight = useCallback(async () => {
    setPreflightChecking(true);
    setPreflightLoad(await readAdminResource(
      `/api/crm/marketing/campaigns/${campaign.id}/preflight`, pickPreflight,
    ));
    setPreflightChecking(false);
  }, [campaign.id]);

  const loadAudience = useCallback(async () => {
    setAudienceChecking(true);
    const r = await call<AudiencePreview>("/api/crm/marketing/audience/preview", postJson({
      audienceMode: draft.audienceMode,
      segmentId: draft.segmentId,
      audienceDefinition: draft.audienceDefinition,
      audienceLeadIds: draft.audienceLeadIds,
      campaignId: campaign.id,
    }));
    setAudienceLoad(loadFromCall(r, pickAudience));
    setAudienceChecking(false);
  }, [campaign.id, draft.audienceMode, draft.segmentId, draft.audienceDefinition, draft.audienceLeadIds]);

  /** Re-runs only the parts that actually failed. */
  const retryFailed = useCallback(() => {
    if (audienceLoad.status === "error") void loadAudience();
    if (preflightLoad.status === "error") void loadPreflight();
  }, [audienceLoad.status, preflightLoad.status, loadAudience, loadPreflight]);

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
    baseRef.current = null;
    const server = draftFrom(r.data.campaign);
    // The rewritten copy is the server's. A name or audience changed here and
    // not saved yet is not what the AI was asked for, so it stays — and stays
    // unsaved, which re-arms the autosave for it.
    const next = adoptServerCopy(draftRef.current, server);
    setDraft(next);
    if (sameDraft(next, server)) {
      setSaveState("saved");
      setSavedAt(new Date().toISOString());
      forgetUnsaved(campaign.id);
      setKeptAt(null);
    } else {
      setSaveState("pending");
    }
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
    let underway = false;
    try {
      for (let i = 0; i < 200; i += 1) {
        const r = await call<{
          campaign: Campaign; sent: number; failed: number; unconfirmed?: number;
          remaining: number; finished: boolean;
        }>(`/api/crm/marketing/campaigns/${campaign.id}/send`, postJson({ batchSize: 25 }));
        if (!r.ok) {
          setActionError(failureText(r, underway
            ? "The send stopped part-way. Nobody who was already sent to will be sent to again — press Send to carry on with the rest."
            : "The send could not be started."));
          break;
        }
        underway = true;
        adopt(r.data.campaign);
        setProgress((p) => {
          const failed = (p?.failed ?? 0) + r.data.failed;
          // An older backend does not split these out. Reading a missing field
          // as zero would silently re-assert "all of them definitely failed",
          // so the unknown half stays folded into `failed` rather than being
          // claimed as a non-delivery.
          const unconfirmed = (p?.unconfirmed ?? 0) + (r.data.unconfirmed ?? 0);
          return { sent: (p?.sent ?? 0) + r.data.sent, failed, unconfirmed, notDelivered: failed - unconfirmed, remaining: r.data.remaining };
        });
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
    // Taking their version is choosing to let these changes go.
    baseRef.current = null;
    forgetUnsaved(campaign.id);
    setKeptAt(null);
  };

  const keepMine = () => {
    if (!conflict) return;
    const expected = conflict.theirs.updatedAt;
    setCampaign(conflict.theirs);
    setConflict(null);
    baseRef.current = null;
    void save(draft, expected);
  };

  const audiencePreview = dataOf(audienceLoad);
  // Never "No audience yet" for an audience nobody managed to read. The stored
  // label on the campaign is a real answer and is used when there is one; only
  // when there is nothing at all does this say which kind of nothing it is.
  const audienceLabel =
    audiencePreview?.label
    ?? campaign.audienceLabel
    ?? (audienceLoad.status === "error" ? "The audience could not be checked" : "No audience yet");

  const failures = failedParts([
    ["The audience", audienceLoad],
    ["The pre-send checks", preflightLoad],
  ]);

  const saveLabel = useMemo(() => saveIndicator({
    state: saveState,
    readOnly,
    savedAt,
    lastSavedAt: campaign.updatedAt,
    message: saveMessage,
    keptInBrowser: keptAt !== null,
    format: (iso) => formatWhen(iso),
  }), [readOnly, saveState, savedAt, saveMessage, campaign.updatedAt, keptAt]);

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
            disabled={readOnly || !!recovery}
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
              <button type="button" className="underline font-semibold" onClick={() => void save(draft, saveAgainst(baseRef.current, versionRef.current))}>
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

      {/* ══ Changes an earlier visit kept and never saved ══ */}
      {recovery && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5">
          <p className="text-sm font-semibold text-amber-900 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="min-w-0">This browser kept changes to this campaign that were never saved.</span>
          </p>
          <p className="text-sm text-amber-900/80 mt-1 break-words">
            Kept {formatWhen(new Date(recovery.preservedAt).toISOString())}. Their subject line is “{recovery.draft.subject || "(none)"}”.
            {readOnly
              ? " This campaign has already started sending, so they can no longer be applied to it."
              : recovery.changedSince
                ? " The campaign has been saved since, so restoring them will ask whose version to keep."
                : " Restore them to carry on where you left off."}
          </p>
          <div className="flex flex-wrap gap-2 mt-2.5">
            {!readOnly && (
              <button type="button" className={btnGhost} onClick={restoreKept}>
                <RefreshCw className="w-4 h-4" /> Restore my changes
              </button>
            )}
            <button type="button" className={btnGhost} onClick={discardKept}>
              Discard them
            </button>
          </div>
        </div>
      )}

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

      {/* Nothing can be edited until kept changes are restored or discarded, so
          new typing can never land on top of them and be lost along with them. */}
      {!recovery && (<>
      {/* ══ What could not be read, named rather than zeroed ══ */}
      {failures.length > 0 && (
        <PageLoadFailures
          failures={failures}
          onRetry={retryFailed}
          retrying={audienceChecking || preflightChecking}
        />
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
          onPreview={setAudienceLoad}
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
        preflightLoad.status === "ready" ? (
        <StepReview
          blocks={draft.blocks}
          subject={draft.subject}
          preheader={draft.preheader}
          preflight={preflightLoad.data}
          audience={audiencePreview}
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
        ) : (
          <ChecksNotAvailable
            load={preflightLoad}
            onRetry={() => { void loadPreflight(); }}
            retrying={preflightChecking}
          />
        )
      )}

      {step === 4 && (
        preflightLoad.status === "ready" ? (
        <StepSend
          campaign={campaign}
          preflight={preflightLoad.data}
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
        ) : (
          <ChecksNotAvailable
            load={preflightLoad}
            onRetry={() => { void loadPreflight(); }}
            retrying={preflightChecking}
          />
        )
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
      </>)}
    </div>
  );
}

/**
 * Steps 3 and 4 stand entirely on the server's own checks, so until those
 * checks answer nothing may be rendered in their place.
 *
 * With a null preflight, StepReview's header reads "Nothing is stopping this
 * from going out" under a green tick and StepSend reads "Goes to 0 people"
 * above a Send button — a screen stating that a campaign passed checks that
 * never ran. The step is withheld instead, and the reason is stated: no count,
 * no blocker list and no Send control while the checks are unavailable.
 */
function ChecksNotAvailable({ load, onRetry, retrying }: {
  load: Load<unknown>;
  onRetry: () => void;
  retrying: boolean;
}) {
  if (load.status === "loading") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`${cardClass} p-5 flex items-center gap-2 text-sm text-muted-foreground`}
      >
        <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden="true" />
        Running the checks on this campaign…
      </div>
    );
  }
  return (
    <LoadFailure
      what="The pre-send checks"
      reason={load.status === "error" ? load.reason : failureReason(null)}
      onRetry={onRetry}
      retrying={retrying}
    >
      <p className="mt-2 min-w-0 break-words text-sm text-muted-foreground">
        Who this goes to, what is wrong with it and whether it can be sent all come from these
        checks, so none of them is shown or guessed at here — and it cannot be sent from this
        screen until they answer.
      </p>
    </LoadFailure>
  );
}
