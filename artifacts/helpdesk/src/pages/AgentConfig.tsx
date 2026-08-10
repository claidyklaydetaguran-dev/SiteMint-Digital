/**
 * Frontend V2 Phase 9 — the Current SMS Receptionist workspace.
 *
 * Mounted at `ROUTES.receptionist` (`/receptionist`, base-relative) inside the
 * Phase 7 `DashboardShell`. It inherits that shell's navigation rail, its
 * `<main>` landmark, its skip link, its palette and its motion system; it adds
 * no second design system and no chrome of its own.
 *
 * ── Requests, unchanged ───────────────────────────────────────────────────
 * One authenticated GET and one authenticated PATCH, exactly as before:
 *   • `GET   /api/receptionist/agent-config`
 *   • `PATCH /api/receptionist/agent-config`  `{greetingMessage,
 *      businessDescription, qualifyingQuestions}`
 * Same paths, same methods, same payload keys, same response shapes, same
 * `["agent-config"]` query key, same cookie session, same default caching and
 * retry. No polling was added — this route has no refetch interval, exactly as
 * it had none before. Firm scoping stays server-side; nothing here sends a firm
 * identifier.
 *
 * Every claim, limit, validation rule and piece of copy lives in
 * `receptionistContract.ts`, which documents the evidence for each. The three
 * things this page will not say — that the receptionist is "Active", what the
 * SMS number is, and that it can be tested — are argued there in full.
 *
 * ── Defects in the previous workspace that this fixes ─────────────────────
 *  1. **Every field rendered blank.** The server wraps the configuration in a
 *     `firm` object; the page read the fields off the top level, so a fully
 *     configured firm saw an empty form — and a first save PATCHed those empty
 *     values over its real settings. `readAgentConfig` reads the documented
 *     shape.
 *  2. **A hardcoded "Active" badge.** No status field exists anywhere in the
 *     product. Replaced by what can actually be read: whether the three
 *     settings this route owns are saved.
 *  3. **A fake SMS preview** rendering an invented customer message and an
 *     invented AI reply. Removed; nothing on this page simulates a
 *     conversation.
 *  4. **A background refetch could silently wipe an in-progress edit**, because
 *     the form re-seeded from the query on every change. It now re-seeds only
 *     when the form is clean, or when the account itself changes.
 *  5. **Blank question rows vanished on save** — they were filtered out of the
 *     payload without a word. A blank row is a validation error now, and the
 *     owner's text stays put.
 *  6. **Over-long text was silently truncated** by `.slice()` before sending.
 *     It is a validation error now, so nothing is discarded without saying so.
 *  7. **A save failure said only "Save failed — please try again."** with no
 *     distinction between a rejection, an expired session and a server error.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, ArrowRight, Check, Plus, RefreshCw, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { AGENT_TEMPLATES } from "@/lib/agentTemplates";
import {
  AGENT_CONFIG_PATH,
  AGENT_CONFIG_QUERY_KEY,
  LIMITS,
  buildPayload,
  deriveStatus,
  diffDraft,
  draftFrom,
  hasErrors,
  overwriteWarning,
  readAgentConfig,
  readFailure,
  readOnlyFields,
  saveAnnouncement,
  saveFailure,
  saveGate,
  validateDraft,
  type AgentConfigFields,
  type Draft,
  type SaveStatus,
} from "@/pages/receptionist/receptionistContract";
import "@/styles/v2-dashboard.css";
import "@/styles/v2-receptionist.css";

function statusOf(error: unknown): number | undefined {
  return typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: number }).status
    : undefined;
}

export default function AgentConfig() {
  const queryClient = useQueryClient();
  const headingId = useId();

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: [AGENT_CONFIG_QUERY_KEY],
    queryFn: () => apiFetch<unknown>(AGENT_CONFIG_PATH),
  });

  const config: AgentConfigFields | null = useMemo(
    () => (data === undefined ? null : readAgentConfig(data)),
    [data],
  );

  // ── The draft ────────────────────────────────────────────────────────────
  // Seeded from saved configuration, and re-seeded only when it is safe to:
  // when the form has no unsaved work, or when the account itself changed.
  // A background refetch must never take an owner's half-written text away.

  const [draft, setDraft] = useState<Draft | null>(null);
  const seededFor = useRef<string | null>(null);
  const draftRef = useRef<Draft | null>(null);
  draftRef.current = draft;

  useEffect(() => {
    if (!config) return;
    const identity = config.name ?? "";
    const current = draftRef.current;
    const accountChanged = seededFor.current !== null && seededFor.current !== identity;
    const clean = current === null || !diffDraft(current, config).dirty;
    if (current === null || accountChanged || clean) {
      setDraft(draftFrom(config));
      seededFor.current = identity;
    }
  }, [config]);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [showTemplateWarning, setShowTemplateWarning] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const saveRegionRef = useRef<HTMLDivElement | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  const diff = config && draft ? diffDraft(draft, config) : null;
  const errors = useMemo(
    () => (draft ? validateDraft(draft) : { questions: {} }),
    [draft],
  );

  // A synchronous in-flight latch. `mutation.isPending` and the button's
  // `disabled` attribute both settle on a later render, so three clicks
  // dispatched in one tick all read the stale value and all send — verified
  // against a real build before this ref existed. A ref updates immediately, so
  // the second and third clicks are refused by the same turn of the event loop.
  const inFlight = useRef(false);

  const mutation = useMutation({
    mutationFn: (payload: Draft) =>
      apiFetch<unknown>(AGENT_CONFIG_PATH, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: (updated) => {
      // The server's own response is the new truth. The draft is not treated as
      // saved until this arrives — there is no optimistic update anywhere here.
      const next = readAgentConfig(updated);
      if (next) {
        queryClient.setQueryData([AGENT_CONFIG_QUERY_KEY], updated);
        setDraft(draftFrom(next));
        seededFor.current = next.name ?? "";
      }
      setSaveStatus("saved");
      setSubmitAttempted(false);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveStatus("idle"), 6000);
    },
    onError: () => setSaveStatus("error"),
    onSettled: () => {
      inFlight.current = false;
    },
  });

  const gate = saveGate({
    dirty: Boolean(diff?.dirty),
    saving: mutation.isPending,
    configLoaded: Boolean(config && draft),
  });

  const handleSave = useCallback(() => {
    if (!draft) return;
    setSubmitAttempted(true);
    // Three guards against a duplicate save, in order of how quickly they act:
    // the synchronous latch, the pending flag, and the button's disabled state.
    if (inFlight.current || mutation.isPending) return;
    if (hasErrors(validateDraft(draft))) {
      // The button stays live when the form is invalid precisely so this can
      // happen: the errors appear and focus moves to the first one, rather than
      // the owner pressing a dead control and being told nothing.
      requestAnimationFrame(() => {
        const firstInvalid = document.querySelector<HTMLElement>('[aria-invalid="true"]');
        firstInvalid?.focus();
      });
      return;
    }
    if (!diff?.dirty) return;
    inFlight.current = true;
    setSaveStatus("saving");
    mutation.mutate(buildPayload(draft));
  }, [draft, diff, mutation]);

  const update = useCallback((patch: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setSaveStatus((s) => (s === "saved" ? "idle" : s));
  }, []);

  const setQuestion = useCallback((index: number, value: string) => {
    setDraft((d) =>
      d
        ? { ...d, qualifyingQuestions: d.qualifyingQuestions.map((q, i) => (i === index ? value : q)) }
        : d,
    );
    setSaveStatus((s) => (s === "saved" ? "idle" : s));
  }, []);

  // ── Loading ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="sr-page" aria-busy="true">
        <div className="sd-page__head">
          <h1 className="sd-page__title">SMS receptionist</h1>
        </div>
        <p className="sr-loading" role="status">
          Loading your receptionist&rsquo;s settings…
        </p>
        <div className="sr-skeleton sr-skeleton--band" aria-hidden="true" />
        <div className="sr-skeleton sr-skeleton--group" aria-hidden="true" />
        <div className="sr-skeleton sr-skeleton--group" aria-hidden="true" />
      </div>
    );
  }

  // ── The configuration could not be read ──────────────────────────────────

  if (isError || !config) {
    const failure = readFailure(isError ? statusOf(error) : undefined);
    return (
      <div className="sr-page sd-enter">
        <div className="sd-page__head">
          <h1 className="sd-page__title">SMS receptionist</h1>
        </div>
        <section className="sd-error" role="alert">
          <AlertTriangle className="sd-error__icon" aria-hidden="true" />
          <div className="sd-error__body">
            <span className="sd-error__title">{failure.title}</span>
            <p className="sd-error__detail">{failure.detail}</p>
          </div>
          {failure.sessionExpired ? (
            <Link href="/login" className="sd-error__action">
              Sign in
            </Link>
          ) : (
            <button type="button" className="sd-error__action" onClick={() => refetch()}>
              Try again
            </button>
          )}
        </section>
      </div>
    );
  }

  const status = deriveStatus(config);
  const identity = readOnlyFields(config);
  // `apiFetch` does not surface the server's message body, so the 400 branch
  // falls back to its own wording rather than inventing the server's.
  const saveFailureCopy = mutation.isError ? saveFailure(statusOf(mutation.error)) : null;

  return (
    <div className="sr-page sd-enter">
      <div className="sd-page__head">
        <h1 className="sd-page__title" id={headingId}>
          SMS receptionist
        </h1>
        <span className="sd-page__meta">
          What it says when someone texts your business
        </span>
      </div>

      {/* ── A. Configuration status ────────────────────────────────────── */}

      <section className="sd-status sr-status" data-state={status.state} aria-labelledby={`${headingId}-status`}>
        <div className="sd-status__head">
          <span className="sd-status__dot" aria-hidden="true" />
          <div className="sd-status__body">
            <h2 className="sd-status__title" id={`${headingId}-status`}>
              {status.title}
            </h2>
            <p className="sd-status__detail">{status.detail}</p>
          </div>
        </div>
        {status.groups.length > 0 && (
          <ul className="sr-ledger">
            {status.groups.map((group) => (
              <li className="sr-ledger__item" key={group.key} data-set={group.set ? "true" : "false"}>
                <span className="sr-ledger__mark" aria-hidden="true">
                  {group.set ? <Check className="sr-ledger__icon" /> : null}
                </span>
                <span className="sr-ledger__label">{group.label}</span>
                <span className="sr-ledger__state">{group.set ? "Saved" : "Not set"}</span>
              </li>
            ))}
          </ul>
        )}
        {status.next && (
          <p className="sr-status__next">
            <a className="sd-link sr-status__link" href={`#${headingId}-${status.next.key}`}>
              Next: {status.next.label.toLowerCase()}
              <ArrowRight className="sd-navlink__icon" aria-hidden="true" />
            </a>
          </p>
        )}
      </section>

      {/* ── B. Receptionist behaviour ──────────────────────────────────── */}

      <form
        className="sr-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
      >
        {identity.length > 0 && (
          <section className="sr-group" aria-labelledby={`${headingId}-identity`}>
            <div className="sr-group__head">
              <h2 className="sd-h2" id={`${headingId}-identity`}>
                Business identity
              </h2>
              <span className="sr-group__badge">Read-only here</span>
            </div>
            <dl className="sr-facts">
              {identity.map((field) => (
                <div className="sr-facts__row" key={field.key}>
                  <dt className="sr-facts__label">{field.label}</dt>
                  <dd className="sr-facts__value">
                    {field.value}
                    <span className="sr-facts__note">{field.note}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <TemplateControl
          onApply={(id) => {
            const template = AGENT_TEMPLATES.find((t) => t.id === id);
            if (!template) return;
            setDraft({
              greetingMessage: template.greetingMessage,
              businessDescription: template.businessDescription,
              qualifyingQuestions: [...template.qualifyingQuestions],
            });
            setSaveStatus("idle");
            setShowTemplateWarning(null);
          }}
          warning={overwriteWarning(config)}
          pendingWarning={showTemplateWarning}
          setPendingWarning={setShowTemplateWarning}
          headingId={headingId}
        />

        {/* Opening message */}
        <section className="sr-group" aria-labelledby={`${headingId}-greeting`}>
          <div className="sr-group__head">
            <h2 className="sd-h2" id={`${headingId}-greeting`} tabIndex={-1}>
              Opening message
            </h2>
            {diff?.greeting && <span className="sr-group__changed">Unsaved change</span>}
          </div>
          <TextAreaField
            id={`${headingId}-greeting-input`}
            label="The first text someone receives when they message your number"
            value={draft?.greetingMessage ?? ""}
            onChange={(v) => update({ greetingMessage: v })}
            max={LIMITS.greeting}
            rows={4}
            error={submitAttempted ? errors.greetingMessage : undefined}
            help="Say who is replying and invite them to describe what they need."
          />
        </section>

        {/* Business context */}
        <section className="sr-group" aria-labelledby={`${headingId}-description`}>
          <div className="sr-group__head">
            <h2 className="sd-h2" id={`${headingId}-description`} tabIndex={-1}>
              What your business does
            </h2>
            {diff?.description && <span className="sr-group__changed">Unsaved change</span>}
          </div>
          <TextAreaField
            id={`${headingId}-description-input`}
            label="The context your receptionist uses to answer questions"
            value={draft?.businessDescription ?? ""}
            onChange={(v) => update({ businessDescription: v })}
            max={LIMITS.description}
            rows={6}
            error={submitAttempted ? errors.businessDescription : undefined}
            help="Services, prices, areas you cover, how long things take. Specific detail produces better answers."
          />
        </section>

        {/* Qualifying questions */}
        <section className="sr-group" aria-labelledby={`${headingId}-questions`} id={`${headingId}-questions`}>
          <div className="sr-group__head">
            <h2 className="sd-h2" id={`${headingId}-questions`} tabIndex={-1}>
              Questions it asks
            </h2>
            {diff?.questions && <span className="sr-group__changed">Unsaved change</span>}
          </div>
          <p className="sr-group__help">
            Asked after the opening message, in this order, to work out what each person needs.
            Up to {LIMITS.questions}.
          </p>

          {errors.questionsList && submitAttempted && (
            <p className="sr-fielderror" role="alert">
              {errors.questionsList}
            </p>
          )}

          {(draft?.qualifyingQuestions.length ?? 0) === 0 ? (
            <p className="sr-empty">No questions yet. Your receptionist will reply, but it won&rsquo;t ask anything back.</p>
          ) : (
            <ol className="sr-questions">
              {draft?.qualifyingQuestions.map((question, index) => (
                <QuestionRow
                  key={index}
                  index={index}
                  total={draft.qualifyingQuestions.length}
                  value={question}
                  error={submitAttempted ? errors.questions[index] : undefined}
                  idBase={`${headingId}-q`}
                  onChange={(v) => setQuestion(index, v)}
                  onRemove={() =>
                    update({
                      qualifyingQuestions: draft.qualifyingQuestions.filter((_, i) => i !== index),
                    })
                  }
                  onMove={(direction) => {
                    const next = [...draft.qualifyingQuestions];
                    const target = direction === "up" ? index - 1 : index + 1;
                    if (target < 0 || target >= next.length) return;
                    [next[index], next[target]] = [next[target], next[index]];
                    update({ qualifyingQuestions: next });
                  }}
                />
              ))}
            </ol>
          )}

          <button
            type="button"
            className="sr-addbtn"
            onClick={() =>
              update({ qualifyingQuestions: [...(draft?.qualifyingQuestions ?? []), ""] })
            }
            disabled={(draft?.qualifyingQuestions.length ?? 0) >= LIMITS.questions}
          >
            <Plus className="sr-addbtn__icon" aria-hidden="true" />
            Add a question
          </button>
          {(draft?.qualifyingQuestions.length ?? 0) >= LIMITS.questions && (
            <p className="sr-group__help">
              That&rsquo;s the maximum of {LIMITS.questions}. Remove one to add another.
            </p>
          )}
        </section>

        {/* ── C. Save and feedback ────────────────────────────────────── */}

        <div
          className="sr-savebar"
          data-dirty={diff?.dirty ? "true" : "false"}
          data-actions={
            diff?.dirty || mutation.isPending || saveStatus === "saved" || mutation.isError
              ? "true"
              : "false"
          }
        >
          <div className="sr-savebar__inner">
            <div className="sr-savebar__state" ref={saveRegionRef}>
              <p className="sd-sr" role="status" aria-live="polite">
                {saveAnnouncement(saveStatus, saveFailureCopy ?? undefined)}
              </p>
              {mutation.isPending ? (
                <span className="sr-savebar__text">
                  <RefreshCw className="sr-spin" aria-hidden="true" /> Saving…
                </span>
              ) : saveStatus === "saved" ? (
                <span className="sr-savebar__text" data-tone="ok">
                  <Check className="sr-savebar__icon" aria-hidden="true" /> Changes saved
                </span>
              ) : diff?.dirty ? (
                <span className="sr-savebar__text">
                  {diff.count} unsaved change{diff.count === 1 ? "" : "s"}
                </span>
              ) : (
                <span className="sr-savebar__text" data-tone="quiet">
                  {isFetching ? "Checking for changes…" : "No unsaved changes"}
                </span>
              )}
            </div>
            <div className="sr-savebar__actions">
              {diff?.dirty && !mutation.isPending && (
                <button
                  type="button"
                  className="sr-btn sr-btn--quiet"
                  onClick={() => {
                    setDraft(draftFrom(config));
                    setSubmitAttempted(false);
                    setSaveStatus("idle");
                    mutation.reset();
                  }}
                >
                  Discard changes
                </button>
              )}
              <button
                type="submit"
                className="sr-btn sr-btn--primary"
                disabled={!gate.enabled}
                aria-describedby={gate.reason ? `${headingId}-gate` : undefined}
              >
                Save changes
              </button>
              {gate.reason && (
                <span className="sd-sr" id={`${headingId}-gate`}>
                  {gate.reason}
                </span>
              )}
            </div>
          </div>

          {saveFailureCopy && !mutation.isPending && (
            <div className="sr-savefail" role="alert">
              <AlertTriangle className="sr-savefail__icon" aria-hidden="true" />
              <div>
                <span className="sr-savefail__title">{saveFailureCopy.title}</span>
                <p className="sr-savefail__detail">{saveFailureCopy.detail}</p>
              </div>
              {saveFailureCopy.sessionExpired ? (
                <Link href="/login" className="sr-btn sr-btn--quiet">
                  Sign in
                </Link>
              ) : saveFailureCopy.retryable ? (
                <button type="button" className="sr-btn sr-btn--quiet" onClick={handleSave}>
                  Retry
                </button>
              ) : null}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

// ─── Fields ────────────────────────────────────────────────────────────────

function TextAreaField({
  id,
  label,
  value,
  onChange,
  max,
  rows,
  error,
  help,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  max: number;
  rows: number;
  error?: string;
  help: string;
}) {
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const over = value.length > max;
  return (
    <div className="sr-field">
      <label className="sr-field__label" htmlFor={id}>
        {label}
      </label>
      <p className="sr-field__help" id={helpId}>
        {help}
      </p>
      <textarea
        id={id}
        className="sr-input sr-input--area"
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={error ? `${errorId} ${helpId} ${id}-count` : `${helpId} ${id}-count`}
        aria-invalid={error ? "true" : undefined}
      />
      <div className="sr-field__foot">
        {error ? (
          <p className="sr-fielderror" id={errorId} role="alert">
            {error}
          </p>
        ) : (
          <span />
        )}
        <span className="sr-count" id={`${id}-count`} data-over={over ? "true" : "false"}>
          {value.length} of {max}
        </span>
      </div>
    </div>
  );
}

function QuestionRow({
  index,
  total,
  value,
  error,
  idBase,
  onChange,
  onRemove,
  onMove,
}: {
  index: number;
  total: number;
  value: string;
  error?: string;
  idBase: string;
  onChange: (value: string) => void;
  onRemove: () => void;
  onMove: (direction: "up" | "down") => void;
}) {
  const id = `${idBase}-${index}`;
  const errorId = `${id}-error`;
  return (
    <li className="sr-question">
      <label className="sr-question__label" htmlFor={id}>
        Question {index + 1}
      </label>
      <div className="sr-question__row">
        <input
          id={id}
          className="sr-input"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={error ? errorId : undefined}
          aria-invalid={error ? "true" : undefined}
        />
        <div className="sr-question__tools">
          <button
            type="button"
            className="sr-iconbtn"
            onClick={() => onMove("up")}
            disabled={index === 0}
            aria-label={`Move question ${index + 1} earlier`}
          >
            <span aria-hidden="true">↑</span>
          </button>
          <button
            type="button"
            className="sr-iconbtn"
            onClick={() => onMove("down")}
            disabled={index === total - 1}
            aria-label={`Move question ${index + 1} later`}
          >
            <span aria-hidden="true">↓</span>
          </button>
          <button
            type="button"
            className="sr-iconbtn sr-iconbtn--danger"
            onClick={onRemove}
            aria-label={`Remove question ${index + 1}`}
          >
            <Trash2 className="sr-iconbtn__icon" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="sr-field__foot">
        {error ? (
          <p className="sr-fielderror" id={errorId} role="alert">
            {error}
          </p>
        ) : (
          <span />
        )}
        <span className="sr-count" data-over={value.length > LIMITS.questionLength ? "true" : "false"}>
          {value.length} of {LIMITS.questionLength}
        </span>
      </div>
    </li>
  );
}

// ─── Starting drafts ───────────────────────────────────────────────────────
//
// Local example copy, not a server capability. Applying one fills the form and
// saves nothing; when there is existing configuration to lose, it says so and
// asks first.

function TemplateControl({
  onApply,
  warning,
  pendingWarning,
  setPendingWarning,
  headingId,
}: {
  onApply: (id: string) => void;
  warning: string | null;
  pendingWarning: string | null;
  setPendingWarning: (id: string | null) => void;
  headingId: string;
}) {
  const [selected, setSelected] = useState(AGENT_TEMPLATES[0]?.id ?? "");
  const selectId = `${headingId}-template`;

  return (
    <section className="sr-group sr-group--quiet" aria-labelledby={`${headingId}-template-title`}>
      <div className="sr-group__head">
        <h2 className="sd-h2" id={`${headingId}-template-title`}>
          Start from an example
        </h2>
      </div>
      <p className="sr-group__help">
        Fills the three settings below with example wording for a type of business, for you to edit.
        Nothing is saved until you choose Save changes.
      </p>
      <div className="sr-template">
        <label className="sr-field__label" htmlFor={selectId}>
          Type of business
        </label>
        <div className="sr-template__row">
          <select
            id={selectId}
            className="sr-input sr-select"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {AGENT_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="sr-btn sr-btn--quiet"
            onClick={() => (warning ? setPendingWarning(selected) : onApply(selected))}
          >
            Use this example
          </button>
        </div>
      </div>

      {pendingWarning && warning && (
        <div className="sr-confirm" role="alert">
          <p className="sr-confirm__text">{warning}</p>
          <div className="sr-confirm__actions">
            <button type="button" className="sr-btn sr-btn--quiet" onClick={() => setPendingWarning(null)}>
              Keep what I have
            </button>
            <button type="button" className="sr-btn sr-btn--primary" onClick={() => onApply(pendingWarning)}>
              Replace the form
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
