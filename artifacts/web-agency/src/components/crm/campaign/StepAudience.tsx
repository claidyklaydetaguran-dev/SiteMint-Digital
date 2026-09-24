import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, Check, ChevronDown, Loader2, RefreshCw, Search, Users, X,
} from "lucide-react";
import SegmentBuilder, {
  emptyDefinition, type SegmentDefinition, type SegmentVocabulary,
} from "@/components/crm/SegmentBuilder";
import {
  btnGhost, btnQuiet, call, cardClass, failureText, inputClass, postJson,
  type AudienceMode, type AudiencePreview, type Contact, type Segment,
} from "./shared";
import { type Load, readAdminResource } from "@/lib/adminLoad";
import { Figure, LoadFailure, dataOf } from "@/components/crm/LoadState";

// ── Step 1: who is this going to ─────────────────────────────────────────────
//
// Three ways to answer, and none of them is "first create a segment". That was
// the dead end: somebody who wanted to email eleven customers had to invent and
// name a reusable audience before they could write a word.
//
//   Choose contacts     search and tick. Nothing is ticked to begin with.
//   Saved audience      a segment somebody already made, re-evaluated at send.
//   Build a filter      conditions held on this campaign, saved as a segment
//                       only if somebody deliberately asks for that.
//
// Whichever is used, the panel underneath answers the same two questions from
// the same endpoint the send uses: who gets this, and who does not and why.

interface Props {
  campaignId: number;
  mode: AudienceMode;
  segmentId: number | null;
  definition: SegmentDefinition | null;
  leadIds: number[];
  segments: Segment[];
  vocabulary: SegmentVocabulary | null;
  readOnly?: boolean;
  onChange: (patch: {
    audienceMode?: AudienceMode;
    segmentId?: number | null;
    audienceDefinition?: SegmentDefinition | null;
    audienceLeadIds?: number[];
  }) => void;
  onSegmentsChanged: () => void;
  /**
   * Hands the resolved audience back up.
   *
   * The workspace needs the same answer — the footer, the AI brief and the
   * final step all name the audience — and asking the server twice for it
   * would be two numbers that can disagree for a moment. There is one request
   * and one answer.
   *
   * It is a `Load`, not `AudiencePreview | null`: a bare null told the
   * workspace "no audience" for a request that was refused, and it printed
   * that as "No audience yet".
   */
  onPreview?: (preview: Load<AudiencePreview>) => void;
}

function pickContacts(body: unknown): Contact[] | undefined {
  const list = body && typeof body === "object" ? (body as { contacts?: unknown }).contacts : undefined;
  return Array.isArray(list) ? list as Contact[] : undefined;
}

const MODES: { id: AudienceMode; label: string; hint: string }[] = [
  { id: "list", label: "Choose contacts", hint: "Search and tick the people this should go to." },
  { id: "segment", label: "Use a saved audience", hint: "A list somebody already set up, re-checked when the send starts." },
  { id: "filter", label: "Build a filter", hint: "Conditions kept on this campaign. No need to save it as anything." },
];

export default function StepAudience(props: Props) {
  const {
    campaignId, mode, segmentId, definition, leadIds, segments, vocabulary,
    readOnly, onChange, onSegmentsChanged, onPreview,
  } = props;

  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactTotal, setContactTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [chosen, setChosen] = useState<Load<Contact[]>>({ status: "loading" });

  const [preview, setPreview] = useState<AudiencePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [openReason, setOpenReason] = useState<string | null>(null);

  const [saveAsName, setSaveAsName] = useState("");
  const [savingSegment, setSavingSegment] = useState(false);
  const [saveSegmentNote, setSaveSegmentNote] = useState<string | null>(null);
  const [showSaveAs, setShowSaveAs] = useState(false);

  const requestId = useRef(0);

  // ── The chosen contacts, by name rather than by id ──
  //
  // A row of numbers is not an audience anybody can check. The ids on the
  // campaign are resolved back into people so the step can show who is in it.
  // A failed read used to leave this list empty and the chips simply absent,
  // while the panel below went on stating the real audience size — two
  // contradictory answers about one campaign on one screen. The last good list
  // is kept while a new one is on its way, so ticking somebody never flashes
  // the chips away.
  const loadChosen = useCallback(async (ids: number[]) => {
    if (ids.length === 0) { setChosen({ status: "ready", data: [] }); return; }
    setChosen(await readAdminResource(`/api/crm/marketing/contacts?ids=${ids.join(",")}`, pickContacts));
  }, []);

  useEffect(() => { void loadChosen(leadIds); }, [loadChosen, leadIds.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Contact search ──
  const runSearch = useCallback(async (term: string) => {
    setSearching(true);
    setSearchError(null);
    try {
      const r = await call<{ contacts: Contact[]; total: number }>(
        `/api/crm/marketing/contacts?limit=25&search=${encodeURIComponent(term)}`,
      );
      if (!r.ok) { setSearchError(failureText(r, "Contacts could not be searched.")); setContacts([]); return; }
      setContacts(r.data.contacts ?? []);
      setContactTotal(Number(r.data.total ?? 0));
    } catch {
      setSearchError("Contacts could not be searched — the server did not answer.");
      setContacts([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (mode !== "list") return;
    const t = setTimeout(() => { void runSearch(search); }, 300);
    return () => clearTimeout(t);
  }, [search, mode, runSearch]);

  // ── The audience, evaluated by the same endpoint the send uses ──
  const audienceKey = useMemo(
    () => JSON.stringify({ mode, segmentId, definition, leadIds }),
    [mode, segmentId, definition, leadIds],
  );

  const runPreview = useCallback(async () => {
    const mine = ++requestId.current;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const r = await call<AudiencePreview>("/api/crm/marketing/audience/preview", postJson({
        audienceMode: mode,
        segmentId,
        audienceDefinition: definition,
        audienceLeadIds: leadIds,
        campaignId,
      }));
      if (mine !== requestId.current) return;
      if (!r.ok) {
        const reason = failureText(r, "This audience could not be checked.");
        setPreview(null);
        setPreviewError(reason);
        // The workspace is told it failed, and why — not handed a null it
        // would render as an empty audience.
        onPreview?.({ status: "error", httpStatus: r.status === 0 ? null : r.status, reason });
        return;
      }
      setPreview(r.data);
      onPreview?.({ status: "ready", data: r.data });
    } catch {
      if (mine !== requestId.current) return;
      const reason = "This audience could not be checked — the server did not answer.";
      setPreview(null);
      setPreviewError(reason);
      onPreview?.({ status: "error", httpStatus: null, reason });
    } finally {
      if (mine === requestId.current) setPreviewLoading(false);
    }
  }, [mode, segmentId, definition, leadIds, campaignId, onPreview]);

  useEffect(() => {
    const t = setTimeout(() => { void runPreview(); }, 350);
    return () => clearTimeout(t);
  }, [audienceKey, runPreview]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosenContacts = dataOf(chosen);
  const chosenIds = new Set(leadIds);
  const toggle = (contact: Contact) => {
    if (readOnly) return;
    const next = chosenIds.has(contact.id)
      ? leadIds.filter((id) => id !== contact.id)
      : [...leadIds, contact.id];
    onChange({ audienceMode: "list", audienceLeadIds: next });
  };

  const saveFilterAsSegment = async () => {
    if (!definition || !saveAsName.trim()) return;
    setSavingSegment(true);
    setSaveSegmentNote(null);
    const r = await call<{ segment: Segment }>("/api/crm/marketing/segments", postJson({
      name: saveAsName.trim(), definition,
    }));
    setSavingSegment(false);
    if (!r.ok) { setSaveSegmentNote(failureText(r, "That audience could not be saved.")); return; }
    setSaveSegmentNote(`Saved as "${r.data.segment.name}". This campaign still uses its own filter — nothing changed about who it goes to.`);
    setSaveAsName("");
    onSegmentsChanged();
  };

  return (
    <div className="space-y-4">
      {/* ══ How to choose ══ */}
      <div className="flex flex-col sm:flex-row gap-2" role="tablist" aria-label="How to choose the audience">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            disabled={readOnly}
            onClick={() => onChange({ audienceMode: m.id })}
            className={`flex-1 text-left px-3.5 py-3 rounded-xl border transition-colors min-h-[44px] disabled:opacity-60 ${
              mode === m.id
                ? "border-teal-600 bg-teal-50 ring-1 ring-teal-600/30"
                : "border-border bg-card hover:bg-accent"
            }`}
          >
            <span className={`block text-sm font-semibold ${mode === m.id ? "text-teal-900" : "text-foreground"}`}>
              {m.label}
            </span>
            <span className="block text-xs text-muted-foreground mt-0.5">{m.hint}</span>
          </button>
        ))}
      </div>

      {/* ══ Choose contacts ══ */}
      {mode === "list" && (
        <div className={`${cardClass} p-3.5 space-y-3`}>
          {chosen.status === "error" && (
            <LoadFailure
              variant="inline"
              what="The chosen contacts"
              reason={chosen.reason}
              onRetry={() => { void loadChosen(leadIds); }}
            >
              <p className="mt-1 min-w-0 break-words text-xs text-muted-foreground">
                {leadIds.length} contact{leadIds.length === 1 ? " is" : "s are"} chosen on this
                campaign — their names could not be read, so none are listed here. Who this goes
                to has not changed.
              </p>
            </LoadFailure>
          )}

          {chosenContacts && chosenContacts.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-1.5">
                Chosen — {chosenContacts.length} contact{chosenContacts.length === 1 ? "" : "s"}
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {chosenContacts.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => toggle(c)}
                      className={`inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-full border text-xs min-h-[32px] ${
                        c.eligible
                          ? "border-teal-200 bg-teal-50 text-teal-900"
                          : "border-amber-200 bg-amber-50 text-amber-900"
                      } disabled:opacity-60`}
                      title={c.eligible ? `Remove ${c.name}` : (c.exclusionDetail ?? "This contact will be left out.")}
                    >
                      {c.name}
                      {!c.eligible && <AlertCircle className="w-3 h-3" aria-label="will be left out" />}
                      <X className="w-3.5 h-3.5 opacity-70" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              className={`${inputClass} pl-9`}
              placeholder="Search contacts by name, company or email"
              value={search}
              disabled={readOnly}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {searchError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-sm text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {searchError}
              </p>
              <button type="button" className={`${btnGhost} mt-2`} onClick={() => void runSearch(search)}>
                <RefreshCw className="w-3.5 h-3.5" /> Try again
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              {searching && contacts.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Searching…
                </p>
              ) : contacts.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  {search ? `Nobody matches "${search}".` : "No contacts yet."}
                </p>
              ) : (
                <ul className="divide-y divide-border max-h-80 overflow-y-auto">
                  {contacts.map((c) => {
                    const picked = chosenIds.has(c.id);
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          disabled={readOnly}
                          onClick={() => toggle(c)}
                          aria-pressed={picked}
                          className="w-full flex items-start gap-3 px-3 py-3 text-left hover:bg-accent disabled:opacity-60 min-h-[52px]"
                        >
                          <span className={`mt-0.5 w-5 h-5 shrink-0 rounded border flex items-center justify-center ${
                            picked ? "bg-teal-700 border-teal-700 text-white" : "border-input bg-background"
                          }`}>
                            {picked && <Check className="w-3.5 h-3.5" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-foreground truncate">{c.name}</span>
                            <span className="block text-xs text-muted-foreground truncate">
                              {c.email ?? "no email address"}{c.company ? ` · ${c.company}` : ""}
                            </span>
                            {!c.eligible && (
                              <span className="block text-xs text-amber-800 mt-0.5">
                                Will be left out — {c.exclusionDetail ?? c.exclusionLabel}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {contacts.length > 0 && contactTotal > contacts.length && (
                <p className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
                  Showing {contacts.length} of {contactTotal}. Narrow the search to see the rest.
                </p>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Nobody is ticked for you. A hand-picked list is the one audience that is not re-checked
            against conditions later — but anyone who unsubscribes before the send is still left out.
          </p>
        </div>
      )}

      {/* ══ Saved audience ══ */}
      {mode === "segment" && (
        <div className={`${cardClass} p-3.5 space-y-2`}>
          {segments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No saved audiences yet. Build a filter instead — you can save it as a reusable audience
              from there if it turns out to be worth keeping.
            </p>
          ) : (
            <ul className="space-y-2">
              {segments.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => onChange({ audienceMode: "segment", segmentId: s.id })}
                    aria-pressed={segmentId === s.id}
                    className={`w-full text-left px-3 py-3 rounded-lg border transition-colors min-h-[52px] disabled:opacity-60 ${
                      segmentId === s.id
                        ? "border-teal-600 bg-teal-50 ring-1 ring-teal-600/30"
                        : "border-border bg-card hover:bg-accent"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-foreground truncate">{s.name}</span>
                        {s.description && (
                          <span className="block text-xs text-muted-foreground truncate">{s.description}</span>
                        )}
                      </span>
                      {/* A segment whose size the server did not send is not a
                          segment with nobody in it. */}
                      <span className="text-xs font-semibold text-teal-800 shrink-0">
                        <Figure value={s.memberCount ?? null} /> now
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ══ Build a filter ══ */}
      {mode === "filter" && (
        <div className={`${cardClass} p-3.5 space-y-3`}>
          <SegmentBuilder
            definition={definition ?? emptyDefinition()}
            vocabulary={vocabulary}
            disabled={readOnly}
            hideSummary
            onChange={(next) => onChange({ audienceMode: "filter", audienceDefinition: next })}
          />

          <div className="pt-1 border-t border-border">
            <button
              type="button"
              className={btnQuiet}
              onClick={() => setShowSaveAs((v) => !v)}
              aria-expanded={showSaveAs}
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSaveAs ? "rotate-180" : ""}`} />
              Keep this filter as a reusable audience
            </button>
            {showSaveAs && (
              <div className="mt-2 flex flex-col sm:flex-row gap-2">
                <input
                  className={inputClass}
                  placeholder="Name it, e.g. Qualified dental clients"
                  value={saveAsName}
                  disabled={readOnly}
                  onChange={(e) => setSaveAsName(e.target.value)}
                />
                <button
                  type="button"
                  className={btnGhost}
                  disabled={readOnly || savingSegment || !saveAsName.trim() || !definition}
                  onClick={() => void saveFilterAsSegment()}
                >
                  {savingSegment ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save audience
                </button>
              </div>
            )}
            {saveSegmentNote && <p className="mt-2 text-xs text-muted-foreground">{saveSegmentNote}</p>}
          </div>
        </div>
      )}

      {/* ══ Who gets this, and who does not ══ */}
      <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <Users className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {previewLoading && !preview
                  ? "Working out who this goes to…"
                  : previewError
                    ? "This audience could not be checked"
                    : preview?.problem
                      ? preview.problem
                      : `${preview?.eligibleCount ?? 0} ${preview?.eligibleCount === 1 ? "person gets" : "people get"} this email`}
              </p>
              {preview && !preview.problem && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {preview.excludedCount > 0
                    ? `${preview.excludedCount} of the ${preview.audienceSize} matched are left out — every one for a reason you can read below.`
                    : "Nobody in this audience is being left out."}
                  {preview.reevaluated
                    ? " This is checked again when the send actually starts."
                    : " This list is fixed, but anyone who unsubscribes before the send is still left out."}
                </p>
              )}
              {preview?.note && <p className="text-xs text-amber-800 mt-1">{preview.note}</p>}
            </div>
          </div>
          <button type="button" onClick={() => void runPreview()} className={`${btnQuiet} shrink-0`}>
            {previewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">Recheck</span>
          </button>
        </div>

        {previewError && (
          <div className="mt-2">
            <p className="text-xs text-red-700 flex items-start gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {previewError}
            </p>
            <button type="button" className={`${btnGhost} mt-2`} onClick={() => void runPreview()}>
              <RefreshCw className="w-3.5 h-3.5" /> Try again
            </button>
          </div>
        )}

        {preview && preview.eligible.length > 0 && (
          <div className="mt-3 rounded-lg border border-teal-200 bg-card max-h-56 overflow-y-auto">
            <ul className="divide-y divide-border">
              {preview.eligible.map((c) => (
                <li key={c.id} className="px-3 py-2 flex items-baseline justify-between gap-3">
                  <span className="text-sm text-foreground truncate">{c.name}</span>
                  <span className="text-xs text-muted-foreground truncate">{c.email}</span>
                </li>
              ))}
            </ul>
            {preview.eligibleCount > preview.eligibleShown && (
              <p className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
                Showing the first {preview.eligibleShown} of {preview.eligibleCount}.
              </p>
            )}
          </div>
        )}

        {preview && preview.excludedByReason.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {preview.excludedByReason.map((bucket) => (
              <li key={bucket.reason} className="rounded-lg border border-amber-200 bg-amber-50/70">
                <button
                  type="button"
                  onClick={() => setOpenReason(openReason === bucket.reason ? null : bucket.reason)}
                  aria-expanded={openReason === bucket.reason}
                  className="w-full flex items-start gap-2 px-3 py-2.5 text-left min-h-[44px]"
                >
                  <ChevronDown className={`w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-800 transition-transform ${
                    openReason === bucket.reason ? "rotate-180" : ""
                  }`} />
                  <span className="text-xs text-amber-900">
                    <strong>{bucket.count} left out</strong> — {bucket.label}
                  </span>
                </button>
                {openReason === bucket.reason && (
                  <ul className="px-3 pb-2.5 space-y-1">
                    {bucket.contacts.map((c) => (
                      <li key={c.id ?? c.leadId} className="text-xs text-amber-900/90">
                        {c.name}{c.email ? ` — ${c.email}` : ""}
                        {c.detail && <span className="block text-amber-900/70">{c.detail}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
