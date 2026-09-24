/**
 * Frontend V2 Phase 9 — the Current SMS Receptionist workspace, as pure
 * functions.
 *
 * Same arrangement Phases 5–8 established (`signupContract.ts`,
 * `loginContract.ts`, `overviewContract.ts`, `conversationsContract.ts`):
 * everything the route asserts, validates or decides is derived here, so it can
 * be executed and asserted in a plain `tsx` process with no DOM, no renderer
 * and no new dependency. No imports, so the module stays trivially portable.
 *
 * ── The endpoints, unchanged ──────────────────────────────────────────────
 *   GET   /api/receptionist/agent-config   → `{ firm: { … } }`
 *   PATCH /api/receptionist/agent-config   → `{ firm: { … } }`
 *
 * Both live in the protected `receptionistAgentConfig.ts`, read and not
 * modified. Same paths, same methods, same payload keys, same response shapes,
 * same cookie session, same query key. Firm scoping stays entirely server-side
 * (`req.firmId` from the session); this layer never sends a firm identifier and
 * could not target another tenant if it tried.
 *
 * ── The defect this corrects ──────────────────────────────────────────────
 * The server answers **wrapped in a `firm` object**. The previous page read the
 * fields off the top level (`apiFetch<AgentConfigData>(…)` then `config.name`,
 * `config.greetingMessage`, …), so every field was `undefined`: the business
 * name rendered blank, both textareas showed only their placeholders, and the
 * questions list said "No questions yet" to firms that had in fact configured
 * all three. Worse, the first save then PATCHed those empty values over real
 * configuration. Phase 7 corrected exactly this misread on the overview
 * (`overviewContract.ts`); this route still had it. `readAgentConfig` below
 * reads the documented shape and tolerates a flat one. **Frontend misread
 * only** — the request, the endpoint and the response are untouched.
 *
 * ── What this route deliberately does not claim ───────────────────────────
 * No status, no phone number, no activation control, no test harness.
 *
 *  • **There is no receptionist status field.** Nothing in `intake_firms` or in
 *    any endpoint this session can reach reports whether the receptionist is
 *    running, paused or reachable. The previous page printed a hardcoded
 *    "Active" badge next to the title. It was an assertion, not a reading, and
 *    it is gone. What can be known — whether the configuration this route owns
 *    is complete — is what is shown.
 *  • **The SMS number is not readable here.** `intake_firms.twilioNumber`
 *    exists, but the only endpoint that returns it is `receptionistAdmin.ts`,
 *    which is behind CRM Bearer auth, not the receptionist cookie session.
 *    Neither `/auth/me` nor `/agent-config` includes it. So the number is not
 *    displayed at all rather than guessed, and no endpoint was added to fetch
 *    one.
 *  • **There is no test/preview capability.** The previous page carried a
 *    disabled "Test" tab labelled "Coming soon", and a mock phone rendering an
 *    invented customer message ("Hi, I need help with…") beside an invented
 *    reply. Both implied a product that does not exist. Both are gone.
 */

// ─── Server limits, mirrored exactly ───────────────────────────────────────
// These are the constants in receptionistAgentConfig.ts. Client validation
// exists to explain a rejection before it happens; it never replaces the
// server's, which still runs and is still authoritative.

export const LIMITS = {
  greeting: 500,
  description: 1000,
  questions: 6,
  questionLength: 200,
} as const;

// ─── Reading the response ──────────────────────────────────────────────────

/** The configuration, flattened out of the server's `{ firm: … }` wrapper. */
export interface AgentConfigFields {
  /** Read-only here: returned by GET, not accepted by PATCH. */
  name: string | null;
  /** Read-only here: returned by GET, not accepted by PATCH. */
  industry: string | null;
  greetingMessage: string | null;
  businessDescription: string | null;
  qualifyingQuestions: string[];
}

/**
 * Read the agent-config response. The documented shape is `{ firm: { … } }`; a
 * flat body is accepted too so the route cannot silently regress to reporting
 * "nothing is configured" if that wrapper ever moves. An unrecognised body
 * yields `null`, which the page renders as "configuration could not be read" —
 * never as an empty form over a firm's real settings.
 */
export function readAgentConfig(body: unknown): AgentConfigFields | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const source =
    record["firm"] && typeof record["firm"] === "object"
      ? (record["firm"] as Record<string, unknown>)
      : record;

  const recognised =
    "greetingMessage" in source ||
    "businessDescription" in source ||
    "qualifyingQuestions" in source;
  if (!recognised) return null;

  const questions = source["qualifyingQuestions"];
  return {
    name: typeof source["name"] === "string" ? source["name"] : null,
    industry: typeof source["industry"] === "string" ? source["industry"] : null,
    greetingMessage:
      typeof source["greetingMessage"] === "string" ? source["greetingMessage"] : null,
    businessDescription:
      typeof source["businessDescription"] === "string" ? source["businessDescription"] : null,
    qualifyingQuestions: Array.isArray(questions)
      ? questions.filter((q): q is string => typeof q === "string")
      : [],
  };
}

// ─── The editable draft ────────────────────────────────────────────────────

/** Exactly the three fields PATCH accepts. Nothing else is editable here. */
export interface Draft {
  greetingMessage: string;
  businessDescription: string;
  qualifyingQuestions: string[];
}

/** Seed the form from saved configuration. Never invents a value. */
export function draftFrom(config: AgentConfigFields): Draft {
  return {
    greetingMessage: config.greetingMessage ?? "",
    businessDescription: config.businessDescription ?? "",
    qualifyingQuestions: [...config.qualifyingQuestions],
  };
}

/** Which fields differ from what is saved. Drives the "changed" markers. */
export interface DraftDiff {
  greeting: boolean;
  description: boolean;
  questions: boolean;
  count: number;
  dirty: boolean;
}

export function diffDraft(draft: Draft, config: AgentConfigFields): DraftDiff {
  const greeting = draft.greetingMessage !== (config.greetingMessage ?? "");
  const description = draft.businessDescription !== (config.businessDescription ?? "");
  const questions =
    draft.qualifyingQuestions.length !== config.qualifyingQuestions.length ||
    draft.qualifyingQuestions.some((q, i) => q !== config.qualifyingQuestions[i]);
  const count = [greeting, description, questions].filter(Boolean).length;
  return { greeting, description, questions, count, dirty: count > 0 };
}

// ─── Validation, mirroring the server's rules ──────────────────────────────

export interface FieldErrors {
  greetingMessage?: string;
  businessDescription?: string;
  /** Keyed by index, so an error is announced against the right input. */
  questions: Record<number, string>;
  questionsList?: string;
}

/**
 * The server rejects: a greeting over 500, a description over 1000, more than
 * six questions, and any question that is empty after trimming or over 200.
 *
 * The blank-question rule matters. The previous page silently dropped blank
 * rows from the payload (`.filter(Boolean)`), so a row the owner had typed a
 * heading into and not finished simply vanished on save with no explanation.
 * A blank row is now a validation error against that row, and the owner's text
 * stays exactly where they left it.
 */
export function validateDraft(draft: Draft): FieldErrors {
  const errors: FieldErrors = { questions: {} };

  if (draft.greetingMessage.length > LIMITS.greeting) {
    errors.greetingMessage = `Shorten the opening message to ${LIMITS.greeting} characters or fewer. It is ${draft.greetingMessage.length} now.`;
  }
  if (draft.businessDescription.length > LIMITS.description) {
    errors.businessDescription = `Shorten what your business does to ${LIMITS.description} characters or fewer. It is ${draft.businessDescription.length} now.`;
  }
  if (draft.qualifyingQuestions.length > LIMITS.questions) {
    errors.questionsList = `Remove a question. You can save up to ${LIMITS.questions}.`;
  }
  draft.qualifyingQuestions.forEach((q, i) => {
    if (q.trim().length === 0) {
      errors.questions[i] = "Write a question here, or remove the row.";
    } else if (q.length > LIMITS.questionLength) {
      errors.questions[i] = `Shorten this question to ${LIMITS.questionLength} characters or fewer. It is ${q.length} now.`;
    }
  });

  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Boolean(
    errors.greetingMessage ||
      errors.businessDescription ||
      errors.questionsList ||
      Object.keys(errors.questions).length > 0,
  );
}

// ─── The request ───────────────────────────────────────────────────────────

/**
 * The PATCH body. Exactly the three keys the endpoint has always accepted, in
 * the shape it has always accepted them. No firm identifier is sent — scoping
 * is the session's job, server-side.
 *
 * Values are sent as typed. The previous page ran `.slice()` on every field,
 * which silently truncated an over-long message instead of telling the owner;
 * validation blocks that case now, so nothing is quietly discarded.
 */
export function buildPayload(draft: Draft): Draft {
  return {
    greetingMessage: draft.greetingMessage,
    businessDescription: draft.businessDescription,
    qualifyingQuestions: [...draft.qualifyingQuestions],
  };
}

export const AGENT_CONFIG_PATH = "/receptionist/agent-config";
export const AGENT_CONFIG_METHOD = "PATCH";
export const AGENT_CONFIG_QUERY_KEY = "agent-config";

// ─── Can this be saved right now ───────────────────────────────────────────

export interface SaveGate {
  enabled: boolean;
  /** Why not, in the owner's terms. `null` when the button is enabled. */
  reason: string | null;
}

/**
 * Save is disabled for two real reasons only: nothing has changed, or a save is
 * already in flight. The second is what prevents a double submission; there is
 * no other guard and no optimistic update.
 *
 * **Invalid input is deliberately not one of them.** Disabling the button when
 * a field is invalid produces a dead control: the owner cannot press it, and
 * pressing it is the only thing that would have told them what is wrong. So an
 * invalid form keeps a live Save button, and pressing it reveals the errors and
 * moves focus to the first one instead of sending the request.
 */
export function saveGate(args: {
  dirty: boolean;
  saving: boolean;
  configLoaded: boolean;
}): SaveGate {
  if (!args.configLoaded) return { enabled: false, reason: "Your configuration hasn't loaded yet." };
  if (args.saving) return { enabled: false, reason: "Saving." };
  if (!args.dirty) return { enabled: false, reason: "No changes to save." };
  return { enabled: true, reason: null };
}

// ─── Configuration state — what is actually set ────────────────────────────

export type GroupKey = "greeting" | "description" | "questions";

export interface ConfigurationGroup {
  key: GroupKey;
  label: string;
  /** True when the saved configuration has a usable value for this group. */
  set: boolean;
}

/**
 * The three things that decide whether the receptionist can answer usefully,
 * read from saved configuration — the same three the Phase 7 overview
 * checklist reports, so the two surfaces cannot disagree.
 */
export function configurationGroups(config: AgentConfigFields): ConfigurationGroup[] {
  return [
    {
      key: "greeting",
      label: "Opening message",
      set: Boolean(config.greetingMessage?.trim()),
    },
    {
      key: "description",
      label: "What your business does",
      set: Boolean(config.businessDescription?.trim()),
    },
    {
      key: "questions",
      label: "Questions it asks",
      set: config.qualifyingQuestions.some((q) => q.trim().length > 0),
    },
  ];
}

export type ReceptionistState =
  /** Configuration could not be read. Neither "ready" nor "not set up". */
  | "unknown"
  /** Nothing at all is configured yet. */
  | "unconfigured"
  /** Some of the three are set. */
  | "incomplete"
  /** All three are set. */
  | "configured";

export interface StatusModel {
  state: ReceptionistState;
  groups: ConfigurationGroup[];
  completed: number;
  total: number;
  title: string;
  detail: string;
  /** The first outstanding group, for the "next action" control. */
  next: ConfigurationGroup | null;
}

/**
 * The status band.
 *
 * Every word here is a statement about the configuration this route owns, and
 * nothing else. It does not say the receptionist is active, live, running,
 * connected, answering, operational or receiving messages, because no reading
 * available to this session supports any of those.
 *
 * The completed state says **"Setup complete"** and nothing stronger. An
 * earlier draft said "Ready to answer"; owner review rejected it, correctly —
 * "answer" is a claim about delivery, and delivery depends on the firm's SMS
 * number and its provider webhook, neither of which this authenticated route
 * can read. What is provably true is that the three settings are saved, so
 * that is exactly what the heading claims.
 */
export function deriveStatus(config: AgentConfigFields | null): StatusModel {
  if (!config) {
    return {
      state: "unknown",
      groups: [],
      completed: 0,
      total: 3,
      title: "Your settings couldn't be loaded",
      detail:
        "This is a problem reading them, not a sign that anything is missing. Your saved configuration is untouched.",
      next: null,
    };
  }

  const groups = configurationGroups(config);
  const completed = groups.filter((g) => g.set).length;
  const next = groups.find((g) => !g.set) ?? null;

  if (completed === 0) {
    return {
      state: "unconfigured",
      groups,
      completed,
      total: groups.length,
      title: "Nothing is configured yet",
      detail:
        "Your receptionist has no message to send and nothing to say about your business. Fill in the three settings below and save.",
      next,
    };
  }
  if (completed < groups.length) {
    return {
      state: "incomplete",
      groups,
      completed,
      total: groups.length,
      title: `Setup incomplete — ${completed} of ${groups.length} settings saved`,
      detail: `Still to do: ${groups
        .filter((g) => !g.set)
        .map((g) => g.label.toLowerCase())
        .join(", ")}.`,
      next,
    };
  }
  return {
    state: "configured",
    groups,
    completed,
    total: groups.length,
    title: "Setup complete",
    detail:
      "All three settings are saved. This page controls what your SMS Receptionist says. Review replies under Conversations.",
    next: null,
  };
}

// ─── Failure, stated honestly ──────────────────────────────────────────────

export interface FailureCopy {
  title: string;
  detail: string;
  /** False when retrying cannot help — an expired session, for instance. */
  retryable: boolean;
  /** Set when the only way forward is to sign in again. */
  sessionExpired: boolean;
}

/** Why the configuration could not be read. */
export function readFailure(status?: number): FailureCopy {
  if (status === 401) {
    return {
      title: "Your session has expired",
      detail: "Sign in again to see and change your receptionist's settings.",
      retryable: false,
      sessionExpired: true,
    };
  }
  return {
    title: "Your settings couldn't be loaded",
    detail:
      "The request didn't complete. Your saved configuration is untouched — try again.",
    retryable: true,
    sessionExpired: false,
  };
}

/**
 * Why a save failed. Each case says what happened to the owner's text, because
 * that is the question they are actually asking. Nothing is ever discarded on
 * failure: the draft stays in the form in every branch.
 */
export function saveFailure(status?: number, serverMessage?: string): FailureCopy {
  if (status === 401) {
    return {
      title: "Your session expired before this saved",
      detail:
        "Your changes are still on this page. Sign in again in another tab, then save.",
      retryable: false,
      sessionExpired: true,
    };
  }
  if (status === 400) {
    return {
      title: "The server rejected these changes",
      detail: serverMessage?.trim()
        ? serverMessage
        : "Check the highlighted fields and save again. Nothing was changed.",
      retryable: true,
      sessionExpired: false,
    };
  }
  if (status === 404) {
    return {
      title: "This account couldn't be found",
      detail: "Nothing was changed. Sign out and back in, then try again.",
      retryable: false,
      sessionExpired: false,
    };
  }
  return {
    title: "Your changes weren't saved",
    detail:
      "The request didn't complete, and nothing on the server changed. Your changes are still here — try again.",
    retryable: true,
    sessionExpired: false,
  };
}

// ─── Read-only fields ──────────────────────────────────────────────────────

export interface ReadOnlyField {
  key: "name" | "industry";
  label: string;
  value: string;
  /** Where the owner can actually change it, or why they cannot. */
  note: string;
}

/**
 * Fields the server returns but this endpoint will not update. They are shown
 * as text, not as disabled inputs: a greyed-out box implies a control that
 * would become editable under some condition, and neither of these ever does.
 * A field the server did not send is omitted entirely rather than rendered
 * with a placeholder.
 */
export function readOnlyFields(config: AgentConfigFields): ReadOnlyField[] {
  const fields: ReadOnlyField[] = [];
  if (config.name?.trim()) {
    fields.push({
      key: "name",
      label: "Business name",
      value: config.name,
      note: "Your receptionist refers to your business by this name. Change it in Settings.",
    });
  }
  if (config.industry?.trim()) {
    fields.push({
      key: "industry",
      label: "Industry",
      value: industryLabel(config.industry),
      note: "Set when your account was created. It shapes how replies are scored.",
    });
  }
  return fields;
}

/** Presentational only — an unrecognised value is shown as sent, never dropped. */
export function industryLabel(value: string): string {
  const known: Record<string, string> = {
    "law-firm": "Law firm",
    "home-services": "Home services",
    "real-estate": "Real estate",
    "medical-dental": "Medical / dental",
    "salon-spa": "Salon & spa",
    "general-business": "General business",
  };
  return known[value] ?? value;
}

// ─── Starting drafts ───────────────────────────────────────────────────────

/**
 * The industry starting drafts are local, hardcoded example copy — they are not
 * read from, checked against, or sent to any server. Applying one only fills
 * the form; nothing is saved until the owner saves. Because it overwrites work
 * already in the form, `overwriteWarning` is shown before it is applied.
 */
export function overwriteWarning(config: AgentConfigFields): string | null {
  const anySaved = configurationGroups(config).some((g) => g.set);
  if (!anySaved) return null;
  return "This replaces the opening message, business description and questions currently in the form. Nothing is saved until you choose Save changes.";
}

// ─── Announcements ─────────────────────────────────────────────────────────

export type SaveStatus = "idle" | "saving" | "saved" | "error";

/**
 * What the live region says. Only save results and read failures are
 * announced — the form itself is not a live region, so typing is never
 * narrated.
 */
export function saveAnnouncement(status: SaveStatus, failure?: FailureCopy): string {
  switch (status) {
    case "saving":
      return "Saving your changes.";
    case "saved":
      return "Changes saved.";
    case "error":
      return failure ? `${failure.title}. ${failure.detail}` : "Your changes weren't saved.";
    default:
      return "";
  }
}
