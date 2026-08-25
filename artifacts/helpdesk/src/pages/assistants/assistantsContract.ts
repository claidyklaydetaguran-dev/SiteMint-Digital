/**
 * AR-001I — every string and every rule the Assistants journey displays, in
 * one module with no React and no network access.
 *
 * ── What this journey is ──────────────────────────────────────────────────
 * A **builder for voice assistants**, plus a single publish step and a
 * browser-microphone test of what was published. It reaches only the
 * documented assistant endpoints (list, create, read, update, duplicate,
 * delete, publish). There is no endpoint behind this journey that assigns a
 * phone number, places or receives a PSTN call, sends an SMS or an email,
 * connects a calendar, or registers a webhook. So the wording here stays
 * inside that boundary, and the contract test beside this file walks the
 * surface exhaustively to prove no stronger claim is reachable.
 *
 * ── What was corrected (AR-001I) ──────────────────────────────────────────
 * Three product-truth defects, each of which promised something the journey
 * cannot do:
 *
 *  1. Two row controls named "Test" and "Publish" that only navigated. Both
 *     called navigate() to the same builder tab — activating them started no
 *     test and published nothing. They are replaced by one control that says
 *     what it does: Open.
 *  2. Hard-coded phone-number content. A "Phone number" column, a card line,
 *     an "Assigned phone number" builder block and two banner sentences all
 *     rendered one fixed string — not a value from any response, and a
 *     readiness claim for a capability that does not exist. All of it is
 *     gone. Nothing replaces it: no number, no field, no endpoint, and no
 *     promise of one.
 *  3. A selectable "Custom" preset that cannot be published. The server's
 *     preset catalog is deliberately the frontend list *minus* custom (see
 *     runtimeCatalog.ts), so choosing it produced a 422 unsupported_preset
 *     at the very end of the journey. Custom is removed from the active
 *     choices; a config that already stores it gets a truthful recovery
 *     state instead of a silent rewrite.
 *
 * Why a separate module at all: the phrases that matter most here are the
 * ones that must *never* appear, and a phrase inlined in JSX can only be
 * checked by reading the component. Centralising them gives the test one
 * enumerable surface — everyRenderableString() at the foot of this file.
 */

/* ── Voice presets ─────────────────────────────────────────────────────────
   SUPPORTED_VOICE_PRESET_IDS must stay equal to the api-server's
   SITEMINT_PRESET_KEYS (lib/voicePublishing/runtimeCatalog.ts). That server
   list is the authority for what can be published, and the contract test
   compares the two key for key so they cannot drift.

   "custom" is not in it, and never was: the server maps an uncatalogued
   preset to UNSUPPORTED_PRESET and returns 422 before any provider request.
   It stays *recognised* here — a saved config that carries it must hydrate
   as custom and be reported truthfully, never quietly re-labelled as a
   supported preset. */

export const SUPPORTED_VOICE_PRESET_IDS = [
  "natural-balanced",
  "fast-response",
  "highest-intelligence",
  "budget-friendly",
] as const;

export type SupportedVoicePresetId = (typeof SUPPORTED_VOICE_PRESET_IDS)[number];

/** Values a previously saved config may still carry that are no longer selectable. */
export const RETIRED_VOICE_PRESET_IDS = ["custom"] as const;

export type RetiredVoicePresetId = (typeof RETIRED_VOICE_PRESET_IDS)[number];

/** Everything voiceModel.preset may hold — what is selectable, plus what may already be stored. */
export type StoredVoicePresetId = SupportedVoicePresetId | RetiredVoicePresetId;

const SUPPORTED_SET: ReadonlySet<string> = new Set(SUPPORTED_VOICE_PRESET_IDS);
const RETIRED_SET: ReadonlySet<string> = new Set(RETIRED_VOICE_PRESET_IDS);

export function isSupportedVoicePreset(value: unknown): value is SupportedVoicePresetId {
  return typeof value === "string" && SUPPORTED_SET.has(value);
}

export function isRetiredVoicePreset(value: unknown): value is RetiredVoicePresetId {
  return typeof value === "string" && RETIRED_SET.has(value);
}

/** True for any value the builder may legitimately hold, selectable or merely stored. */
export function isStoredVoicePreset(value: unknown): value is StoredVoicePresetId {
  return isSupportedVoicePreset(value) || isRetiredVoicePreset(value);
}

/* ── List ──────────────────────────────────────────────────────────────── */

export const LIST = {
  title: "Assistants",
  /* Owner-approved wording. The line it replaces — "Build and manage the AI
     voice assistants that answer, qualify, and book for your business." —
     asserted an assistant that answers calls and books appointments. Neither
     is reachable from this journey. */
  detail: "Create, configure, and publish the voice assistants for your business.",
  newAssistant: "New Assistant",
  searchPlaceholder: "Search assistants…",
  searchLabel: "Search assistants",
  statusFilterLabel: "Filter by status",
  allStatuses: "All statuses",
  viewLabel: "Assistants view",
  cardsView: "Card view",
  tableView: "Table view",
  cards: "Cards",
  table: "Table",

  colName: "Name",
  colTemplate: "Template",
  colStatus: "Status",
  colProviderLink: "Provider link",
  colUpdated: "Updated",
  colActions: "Actions",

  emptyTitle: "Create your first assistant",
  emptyDetail:
    "Pick a template to get started. Nothing is saved until you select Save Draft in the builder.",
  noMatchTitle: "No assistants match your search",
  noMatchDetail: "Try a different name, template, or status filter.",
  errorTitle: "Couldn't load assistants",

  /* The only row control outside the overflow menu. It navigates and does
     nothing else, so it is named for the navigation. */
  open: "Open",
  moreActions: "More actions",
  duplicate: "Duplicate",
  delete: "Delete",
  deleteDetail: "This permanently deletes this assistant draft. This action cannot be undone.",
  cancel: "Cancel",

  draft: "Draft",
  locked: "Locked",
} as const;

/** Every row control names its assistant, so a screen reader hears which row it is on. */
export function openAccessibleName(assistantName: string): string {
  return `${LIST.open} ${assistantName}`;
}

export function moreActionsAccessibleName(assistantName: string): string {
  return `${LIST.moreActions} for ${assistantName}`;
}

export function deleteDialogTitle(assistantName: string): string {
  return `Delete "${assistantName}"?`;
}

/* ── Provider link ─────────────────────────────────────────────────────────
   Two words for one fact: whether a provider-side assistant exists for this
   row. Not whether it can take a call, and not which vendor it is — the
   vendor name is an internal detail the customer has no action to take on. */

export const PROVIDER_LINKED = "Linked";
export const PROVIDER_NOT_LINKED = "Not linked";

export function providerLinkLabel(assistant: {
  provider: string | null;
  providerAssistantId: string | null;
}): string {
  return assistant.provider && assistant.providerAssistantId
    ? PROVIDER_LINKED
    : PROVIDER_NOT_LINKED;
}

/* ── Builder ───────────────────────────────────────────────────────────────
   The two sentences these replace both ended with a fixed phone-number
   readiness string, rendered whether or not anything had been published and
   describing a setup step that does not exist. */

export const BUILDER = {
  linkedNote: "Linked to the voice provider.",
  notLinkedNote: "Not linked to a voice provider.",
  savePrompt: "Save your changes before publishing.",
} as const;

export function lastSyncedNote(display: string): string {
  return `Last synced ${display}.`;
}

/* ── Retired-preset recovery ───────────────────────────────────────────────
   Shown when a saved config carries a preset that is no longer selectable.
   It states the situation and names the one action that resolves it. It
   changes nothing on its own: the draft is not rewritten, no request is
   made, and the saved configuration stays exactly as it was until the
   customer chooses a preset and saves. */

export const PRESET_RECOVERY = {
  title: "This assistant's saved voice preset is no longer available",
  detail:
    "Publishing needs one of the presets below. Choose one, then save your changes. Nothing is changed until you do.",
  publishBlocked: "Choose a supported voice preset and save before publishing.",
  estimatesUnavailable: "Estimates appear once you choose a preset.",
} as const;

/* ── Voice & Model ─────────────────────────────────────────────────────────
   The heading detail replaces one that ended "Provider details live under
   Advanced." — there is no Advanced tab. The file exists but nothing imports
   it, so that sentence pointed at nothing. */

export const VOICE_MODEL = {
  title: "Voice & Model",
  detail: "Choose how this assistant sounds and thinks.",
  presetGroupLabel: "Voice and model preset",
  includedHeading: "What's included",
} as const;

/* ── Template picker ───────────────────────────────────────────────────────
   Template copy describes what selecting a template *prefills*. The lines it
   replaces were written as promises of a working answering service, which
   this journey cannot deliver and which no endpoint behind it supports. */

export const CREATE = {
  title: "Choose a starting point",
  detail:
    "Pick a template to prefill the builder, or start from a blank assistant. Nothing is saved until you select Save Draft — you can change everything before then.",
  back: "Assistants",
  select: "Select template",
  startBlank: "Start from blank",
} as const;

/* ── Estimates ─────────────────────────────────────────────────────────────
   Kept, because they are already marked as what they are. Both figures carry
   a visible chip ("Estimate" / "Guidance") and a sentence naming the limit.
   The test requires the chip and the sentence to travel with the number. */

export const ESTIMATE_CHIP = "Estimate";
export const GUIDANCE_CHIP = "Guidance";
export const ESTIMATE_HEADING = "Estimated configuration range";
export const GUIDANCE_HEADING = "Latency guidance";
export const ESTIMATE_NOTE = "Final pricing available after provider connection.";
export const GUIDANCE_NOTE =
  "Illustrative planning guidance, not a measurement of this assistant's live performance.";

/* ── Routing ───────────────────────────────────────────────────────────────
   Base-relative, exactly as lib/routes.ts declares them; wouter prepends the
   app's base itself, so these are correct under both the configured prefix
   and a root-base build. */

export const LIST_PATH = "/assistants";
export const NEW_PATH = "/assistants/new";

/** Where every row control lands. One destination, named once. */
export function assistantHref(id: number, tab = "setup"): string {
  return `${LIST_PATH}/${id}/${tab}`;
}

/* ── Exhaustive string surface ─────────────────────────────────────────────
   Everything this journey can render from this module. A phrase not
   reachable from here is not reachable from any Assistants page. */

export function everyRenderableString(): string[] {
  return [
    ...Object.values(LIST),
    ...Object.values(BUILDER),
    ...Object.values(PRESET_RECOVERY),
    ...Object.values(VOICE_MODEL),
    ...Object.values(CREATE),
    PROVIDER_LINKED,
    PROVIDER_NOT_LINKED,
    ESTIMATE_CHIP,
    GUIDANCE_CHIP,
    ESTIMATE_HEADING,
    GUIDANCE_HEADING,
    ESTIMATE_NOTE,
    GUIDANCE_NOTE,
    openAccessibleName("Front Desk"),
    moreActionsAccessibleName("Front Desk"),
    deleteDialogTitle("Front Desk"),
    lastSyncedNote("Aug 25, 2026, 4:20 PM"),
    providerLinkLabel({ provider: null, providerAssistantId: null }),
    providerLinkLabel({ provider: "vapi", providerAssistantId: "abc" }),
  ];
}
