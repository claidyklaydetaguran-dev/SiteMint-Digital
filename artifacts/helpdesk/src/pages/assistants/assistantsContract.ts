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

/**
 * V5 PR-6 (C-4): the two presets the Voice tab offers as primary choices. A
 * subset of `SUPPORTED_VOICE_PRESET_IDS`, not a replacement for it — every
 * value in `SUPPORTED_VOICE_PRESET_IDS` stays publishable and stays
 * recognised by hydration; the other two just move under the tab's Advanced
 * disclosure instead of disappearing.
 */
export const CURATED_VOICE_PRESET_IDS = ["natural-balanced", "fast-response"] as const;

export type CuratedVoicePresetId = (typeof CURATED_VOICE_PRESET_IDS)[number];

const CURATED_VOICE_PRESET_SET: ReadonlySet<string> = new Set(CURATED_VOICE_PRESET_IDS);

export function isCuratedVoicePreset(value: unknown): value is CuratedVoicePresetId {
  return typeof value === "string" && CURATED_VOICE_PRESET_SET.has(value);
}

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

  /* The list is rows in the shared `sd-list`, not a table with a header row,
     so the five column headings this used to carry are gone rather than left
     unreachable. "Updated" survives because it still labels a value. */
  colUpdated: "Updated",

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

  /* V5 PR-6 (C-1): one assistant per firm in beta. "New Assistant" above is
     shown only when zero or more-than-one assistants exist (the >1 case is
     legacy data — the create flow itself is unchanged). Once exactly one
     exists, this line replaces it. */
  contactToAddAnother: "Contact SiteMint to add another assistant.",

  /* V8 presentation pass. The page previously had no loading state of its own
     (a bare skeleton grid), and its failure state named no recovery. Both are
     stated now, in the same words the rest of the dashboard uses. */
  eyebrow: "ASSISTANT",
  loading: "Loading your assistant",
  errorDetail: "The request failed. Nothing was lost — your settings are still saved.",
  retry: "Try again",
  retrying: "Trying again…",
} as const;

/* ── One-assistant status card (C-1) ─────────────────────────────────────── */

/* V8 presentation pass. What this block no longer carries is the point of it.

   "Provider link" left: it says whether a provider-side record exists, which
   is a question SiteMint support asks and a business owner never does. It is
   not deleted — it is real evidence — it moved to `DIAGNOSTICS` below, behind
   a disclosure that names its audience.

   The four per-tab quick links left too. They carried their own labels here
   ("Configuration", "Prompt", "Voice", "Test") while the builder's rail called
   the same four destinations something else, so a link was named differently
   from the section it opened. They now read `SECTIONS`. */

export const CARD = {
  lastPublishedLabel: "Last published",
  notYetPublished: "Not yet published",
  openLabel: "Open the builder",
  quickLinksLabel: "Jump to",
} as const;

/* ── The builder's sections, named once ────────────────────────────────────
   Both the list page's quick links and the builder's own rail read these.
   `BUILDER_TABS` in `assistant-builder/BuilderShell.tsx` keeps the keys —
   routing, the legacy-alias map and the default tab are all unchanged — and
   takes only its labels from here. */

export const SECTIONS = {
  configuration: "Business information",
  voice: "Greeting & voice",
  actions: "What it can do",
  testing: "Test & publish",
  prompt: "Advanced",
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
  providerLinked: boolean;
}): string {
  return assistant.provider && assistant.providerLinked
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
} as const;

/* ── Builder chrome (V8 presentation pass) ─────────────────────────────────
   The builder used to carry its own header, its own card stack and its own
   footer, written in raw utility classes — a second visual language inside a
   dashboard that already has one. These are the strings that chrome needs so
   it can be rebuilt from the shared page/section/field vocabulary instead. */

export const BUILDER_PAGE = {
  eyebrow: "ASSISTANT",
  back: "Assistants",
  untitled: "Untitled assistant",
  nameLabel: "Assistant name",
  nameHelp: "Only you see this. It labels the assistant in SiteMint, and callers never hear it.",
  sectionsLabel: "Assistant builder sections",
  /* The name field and the state chip sit together, so the group needs a name
     of its own for assistive technology. */
  identityLabel: "Name and current state",
} as const;

/* ── Test & publish (V8 presentation pass) ─────────────────────────────────
   These three sentences were inline in the builder shell. They are the most
   consequential copy in the journey — one of them describes the only
   irreversible action a customer can take here — so they belong in the
   module the contract test can enumerate. Wording is unchanged from what
   shipped, except that "Current state" now says what the state is about. */

export const TEST_PUBLISH = {
  stateTitle: "What callers reach right now",
  stateDetail: "And whether it matches the settings you last saved.",
  testTitle: "Hear it yourself",
  testDetail:
    "A test call runs in this browser, using your microphone. No caller is involved and nothing is dialled.",
  publishTitle: "Put it live",
  publishDetail:
    "Publishing sends your saved settings to the voice provider. Callers hear the published version, never your unsaved edits.",
  testLabel: "Test call",
  publishLabel: "Publish",
  /* Shown in place of a control this build does not have. It names the state
     of the workspace rather than a checkpoint or a flag. */
  notEnabled: "Not switched on for this workspace yet.",
  testUnavailableDefault: "Save and publish this assistant before testing.",
  publishUnavailableDefault: "Save this assistant as a draft before publishing.",
} as const;

/* ── Saving (V8 presentation pass) ─────────────────────────────────────────
   Saved-versus-unsaved was previously carried by a badge in the header and a
   button in a footer bar, which could disagree at a glance. One save bar now
   states the condition in words and holds the only save control. */

export const SAVE = {
  save: "Save changes",
  saving: "Saving…",
  saved: "Changes saved",
  clean: "No unsaved changes",
  dirty: "Unsaved changes",
  failedTitle: "Your changes weren't saved",
  retry: "Retry",
} as const;

/* ── Diagnostics (V8 presentation pass) ────────────────────────────────────
   Provider link state, the last synchronisation time and the raw status the
   server reports are useful to SiteMint and to nobody else. They stay on the
   page — removing them would lose real evidence — but behind a disclosure
   that says who they are for, so the main flow reads as a business setting
   rather than a console. */

export const DIAGNOSTICS = {
  label: "Technical details",
  detail: "For SiteMint support. You never need these to run your assistant.",
  providerLink: "Provider link",
  lastSynced: "Last sent to the voice provider",
  reportedStatus: "Status SiteMint has recorded",
  never: "Never",
} as const;

/* ── Keeping the provider in step with what is saved ───────────────────────
   Publishing CREATES the provider's assistant; synchronising UPDATES one that
   already exists. The builder disables Publish the moment an assistant is
   published, and the synchronise control exists only when
   `VITE_VOICE_SYNC_ENABLED` is on — so in a build without that flag there is no
   control at all that can carry a later edit to the provider. The edit is saved
   here, the provider keeps serving the configuration it last confirmed, and
   nothing on screen said so. These sentences say it. */

export const SYNC = {
  /* Replaces "This configuration is saved here but has not been sent to the
     voice provider." That was accurate for a genuine pending update, but the
     same banner also appeared when the only difference was tool readiness
     SiteMint had recomputed by itself — telling an owner their edits had not
     been sent when they had been. The wording now describes the state of the
     provider rather than accusing the owner's last save of never arriving. */
  localChangesTitle: "The voice provider is running an earlier version",
  localChangesDetail:
    "What is saved here differs from what the provider last confirmed. Callers hear the version the provider has until an update is sent.",

  /* Shown in place of a control this build does not have. Naming the
     dependency is the honest answer: the owner cannot fix it from here, and a
     disabled button with a tooltip would imply they could. */
  unavailableDetail:
    "Sending a saved change to the provider is a separate capability, and it isn't switched on for this workspace. Publish is already finished for this assistant, so contact SiteMint to have this update applied.",

  /* The browser test always dials the provider's assistant, so it plays back
     the last confirmed configuration — not what is on screen. */
  testUsesPublished:
    "This test uses the configuration the provider last confirmed, which is not what is saved here now. Recent changes won't be part of it.",
} as const;

/* ── Unsaved-changes prompt ────────────────────────────────────────────────

   AR-001J owner review, correction B.

   AR-001I shipped one sentence here — "Save your changes before publishing."
   — rendered beside Save Draft whenever the draft was dirty. It is not a
   publish control, so the AR-001J build boundary left it alone, and it was
   therefore emitted and rendered in builds that cannot publish at all. It
   named an action the customer had no way to take.

   Saving is a precondition of the two subordinate actions, so the truthful
   sentence is the one that matches what this build can actually do. The
   three below are the whole table; which one applies is decided in
   `pages/AssistantBuilder.tsx`, beside the two constants that already decide
   whether each feature is in the build at all, and the selection is a
   ternary over folded literals so the two the build cannot use are removed
   rather than shipped unreachable.

   `EITHER` is the both-enabled wording, and it is deliberately neutral. This
   line is rendered from the draft being dirty, not from an activation, so at
   the moment it first appears there is no attempted action to name; and the
   only place an activation of an ineligible control is observable is inside
   the shared `PublishButton`/`BrowserTestButton` guards, which are outside
   this correction's authorised set. Guidance tied to the attempted action
   does already exist and is unchanged: each control carries its own
   tooltip + screen-reader reason, and while the draft is dirty those read
   "Save your changes before publishing." and "Save your changes before
   testing." respectively.

   Nothing here changes when a save happens, what it sends, or what either
   subordinate action does. It is one line of copy. */

export const SAVE_PROMPT_PUBLISH = "Save your changes before publishing.";
export const SAVE_PROMPT_TEST = "Save your changes before testing.";
export const SAVE_PROMPT_EITHER = "Save your changes before continuing.";

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
  /* 2026-09-17: a voice (who speaks) and a response style (how quickly and
     carefully it answers) are separate choices. Both lists come from the
     server catalog, so every option shown can be published. */
  title: "Greeting & voice",
  detail: "What callers hear first, and the voice that says it.",
  greetingHelp: "The opening line on every call.",
  voiceHeading: "Voice",
  presetGroupLabel: "Response style",
  voiceDetail: "Press Play to hear each voice before choosing.",
  singleVoice: "This workspace uses one standard voice.",
  greetingPreviewNote: "To hear your own greeting in the chosen voice, save and start a browser test — the assistant says it first.",
  styleHeading: "Response style",
  styleDetail: "How quickly and how carefully the assistant answers.",
  advancedHeading: "Advanced: cost and speed estimates",
  advancedDetail: "Estimates for the selected response style. They are guides, not a bill.",
} as const;

/** A saved choice this environment can no longer publish. Nothing changes until the business chooses. */
export const VOICE_UNAVAILABLE = {
  styleTitle: "The saved response style isn't available",
  styleDetail: "Choose one of the response styles below, then save. Nothing changes until you do.",
  voiceTitle: "The saved voice isn't available",
  voiceDetail: "Choose one of the voices below, then save. Nothing changes until you do.",
  publishBlocked: "Choose an available voice and response style, then save before publishing.",
} as const;

/* ── Configuration tab (C-2) ───────────────────────────────────────────────
   "Setup" renamed "Configuration". Business name and industry are no longer
   editable fields here — they are read live from Workspace Settings and
   shown for reference only; the customer edits them there. */

export const CONFIGURATION = {
  // V8: named for what the owner is entering, and matching the section label in
  // the rail. A panel headed "Configuration" inside a section called "Business
  // information" is two names for one thing, which is how a screen starts
  // reading like a settings file.
  title: "Business information",
  detail: "Who this assistant is for, and the facts it may rely on when answering callers.",
  businessFromWorkspace: "From Workspace Settings",
  editWorkspaceSettings: "Edit in Workspace Settings",
  permittedActionsLabel: "Permitted actions",
  permittedActionsDetail: "What this assistant is allowed to do on a call.",
} as const;

/* ── Prompt tab (C-3) ─────────────────────────────────────────────────────
   Guided sections by default, composed deterministically by
   `lib/promptComposer.ts` into `prompt.systemInstructions` — the exact text
   published. Unrestricted editing lives behind the Advanced disclosure. */

export const PROMPT_TAB = {
  title: "Prompt",
  detail: "How the assistant opens, speaks, and knows when to stop or hand off.",
  generatedHeading: "Generated prompt",
  generatedDetail: "This is exactly what gets published — generated from the sections above.",
  callerPreviewHeading: "How callers will hear this",
  callerPreviewSimulatedLabel: "Simulated — not a live call",
  callerPreviewEmpty: "Add a greeting to preview how callers will hear this.",
  advancedToggleLabel: "Edit the full prompt directly",
  advancedToggleDetail:
    "Off: the sections above generate this automatically. On: edit it yourself — the sections above stop being applied.",
  permittedActionsNote: "Edit permitted actions from the Configuration tab.",
} as const;

/* ── Template picker ───────────────────────────────────────────────────────
   Template copy describes what selecting a template *prefills*. The lines it
   replaces were written as promises of a working answering service, which
   this journey cannot deliver and which no endpoint behind it supports. */

export const CREATE = {
  eyebrow: "ASSISTANT",
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

/**
 * V8 — "What it can do" copy.
 *
 * The wording keeps two claims apart on purpose. A capability card states what
 * the assistant CAN do, which the server derives from the published payload's
 * own rules. A permitted-action checkbox states what the owner WANTS it to do.
 * When those disagree the screen says so rather than letting the tick imply the
 * capability, because a ticked box that does nothing is the most expensive kind
 * of wrong on this journey.
 */
export const ACTIONS = {
  availableTitle: "What this assistant can do on a call",
  availableDetail:
    "Set by SiteMint and by what you have finished setting up. This is what a caller can actually get.",
  loading: "Checking what's available…",
  loadFailed: "SiteMint couldn't check what this assistant can do. Try again.",
  noneAttachable:
    "Your assistant can answer questions and speak with callers, but it cannot take actions like saving a message yet. Contact SiteMint to switch that on.",
  stateActive: "Available",
  stateUnavailable: "Not available yet",
  /**
   * Said plainly because the two can legitimately differ for a while. This list
   * is what your setup supports RIGHT NOW; the assistant callers reach is the
   * version you last published. If you change your scheduling setup, the
   * assistant stops offering what it can no longer do straight away — but the
   * published version only catches up when you publish again.
   */
  publishToApply:
    "This is what your setup supports now. Publish again to update the assistant callers reach.",

  permittedTitle: "What you want it to do",
  permittedDetail:
    "Tick the actions this assistant should take. Ticking one does not switch on a capability that isn't available yet.",
  wantedButUnavailable: "You've asked for this, but it isn't available yet:",

  escalationLabel: "When to hand over to a person",
  escalationPlaceholder: "When should this assistant stop and pass the caller to someone?",
  escalationHelp: "Also editable in Advanced, under the full prompt.",
} as const;

/**
 * Which server capability a permitted action depends on, or null when it needs
 * none. Answering questions and ending a call politely are prompt behaviour —
 * they require no tool, so they are never blocked by one.
 */
const CAPABILITY_BY_ACTION: Record<string, string | null> = {
  answer_questions: null,
  check_availability: "scheduling",
  create_appointment_requests: "scheduling",
  take_messages: "messages",
  end_call_politely: null,
};

export function capabilityForAction(actionId: string): string | null {
  return CAPABILITY_BY_ACTION[actionId] ?? null;
}

export const LIST_PATH = "/assistants";
export const NEW_PATH = "/assistants/new";

/**
 * V5 PR-6 (C-2/C-4): the builder's tab keys were renamed ("setup" ->
 * "configuration", "voice-model" -> "voice") to match the new tab titles.
 * `BUILDER_TAB_ALIASES` in `assistant-builder/BuilderShell.tsx` maps the old
 * keys to the new ones so a bookmarked or previously-shared URL still
 * resolves — it redirects (replacing history) to the canonical path rather
 * than 404ing or silently rendering the wrong tab.
 */
export const DEFAULT_BUILDER_TAB = "configuration";

/** Where every row control lands. One destination, named once. */
export function assistantHref(id: number, tab: string = DEFAULT_BUILDER_TAB): string {
  return `${LIST_PATH}/${id}/${tab}`;
}

/* ── Exhaustive string surface ─────────────────────────────────────────────
   Everything this journey can render from this module. A phrase not
   reachable from here is not reachable from any Assistants page. */

export function everyRenderableString(): string[] {
  return [
    ...Object.values(LIST),
    ...Object.values(CARD),
    ...Object.values(SECTIONS),
    ...Object.values(BUILDER),
    ...Object.values(BUILDER_PAGE),
    ...Object.values(TEST_PUBLISH),
    ...Object.values(SAVE),
    ...Object.values(DIAGNOSTICS),
    ...Object.values(SYNC),
    ...Object.values(PRESET_RECOVERY),
    ...Object.values(VOICE_MODEL),
    ...Object.values(CONFIGURATION),
    ...Object.values(PROMPT_TAB),
    ...Object.values(CREATE),
    PROVIDER_LINKED,
    PROVIDER_NOT_LINKED,
    // All three unsaved-changes sentences, not just the one a given build
    // selects: this surface exists so a banned phrase cannot hide in copy the
    // module can produce, and every one of them is copy it can produce.
    SAVE_PROMPT_PUBLISH,
    SAVE_PROMPT_TEST,
    SAVE_PROMPT_EITHER,
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
    providerLinkLabel({ provider: null, providerLinked: false }),
    providerLinkLabel({ provider: "vapi", providerLinked: true }),
    ...Object.values(ACTIONS),
  ];
}
