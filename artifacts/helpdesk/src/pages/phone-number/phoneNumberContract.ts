/**
 * V5 PR-8 — every string the Phone Number screen displays.
 *
 * Reads `GET /receptionist/voice/numbers`. This screen shows the single
 * number SiteMint assigns during onboarding — assignment itself is not
 * offered here (see `lib/numbersApi.ts`'s note on `assignNumber`), only
 * pause/unpause of a number that's already assigned.
 */

export const PAGE = {
  eyebrow: "CHANNELS",
  title: "Phone Number",
  detail: "The number your AI receptionist answers on.",
  loading: "Checking your session…",
} as const;

export type NumberViewState = "loading" | "error" | "none-assigned" | "assigned" | "paused";

export function numberViewState(inputs: {
  loading: boolean;
  isError: boolean;
  state: "inventory" | "assigned" | "paused" | "released" | undefined;
}): NumberViewState {
  if (inputs.loading) return "loading";
  if (inputs.isError) return "error";
  if (inputs.state === "assigned") return "assigned";
  if (inputs.state === "paused") return "paused";
  return "none-assigned";
}

export const COPY = {
  errorTitle: "Your phone number couldn't be loaded",
  errorDetail: "SiteMint couldn't read your assigned number. Try again.",
  retryLabel: "Try again",
  retryingLabel: "Trying…",

  noneTitle: "No number assigned yet",
  noneDetail: "Choose how customers will reach you. SiteMint checks availability and connects the number to your published receptionist.",

  numberLabel: "Number",
  capabilitiesHeading: "Capabilities",
  capabilitiesLine: "Voice — managed by SiteMint; SMS on this number is not enabled.",
  stateLabel: "Status",
  stateAssigned: "Active",
  statePaused: "Paused",

  pauseLabel: "Pause number",
  pausePendingLabel: "Pausing…",
  pauseConfirmTitle: "Pause this number?",
  pauseConfirmDetail: "Calls to this number will not reach your AI receptionist while it's paused.",
  pauseConfirmAction: "Pause number",
  pauseConfirmDismiss: "Keep active",
  pauseFailedTitle: "The number wasn't paused",
  pauseFailedDetail: "Nothing changed. Try again.",

  unpauseLabel: "Resume number",
  unpausePendingLabel: "Resuming…",
  unpauseFailedTitle: "The number wasn't resumed",
  unpauseFailedDetail: "Nothing changed. Try again.",

  pausedBannerTitle: "This number is paused",
  pausedBannerDetail: "Calls are not reaching your AI receptionist.",
} as const;

export const NUMBER_REQUEST = {
  subject: "Phone number setup",
  heading: "Connect a phone number",
  newLabel: "Get a new number",
  newDetail: "Request a number in your preferred country and area. Availability and any charges are confirmed before activation.",
  existingLabel: "Use my existing business number",
  existingDetail: "Keep your current number by forwarding calls to an assigned receptionist number, or ask SiteMint to check an eligible provider import.",
  regionLabel: "Country and preferred area code",
  regionPlaceholder: "For example, United States, 415",
  phoneLabel: "Existing business number",
  phonePlaceholder: "+1 415 555 0123",
  notesLabel: "Anything else we should know? (optional)",
  notesDetail: "Mention your current carrier if using an existing number. Do not enter passwords or provider keys.",
  submit: "Request number setup",
  submitting: "Saving request…",
  loading: "Checking number requests…",
  readFailed: "We couldn't check your requests. Try again before sending another.",
  failed: "Your request couldn't be saved. Your details are still here; try again.",
  pendingTitle: "Number setup requested",
  pendingDetail: "Follow your request in Support. A request does not activate a number or start a subscription.",
  viewSupport: "View request in Support",
  browserTest: "Test with your browser while you wait",
  regionRequired: "Enter a country and preferred area code.",
  phoneRequired: "Enter the existing number, including its country code.",
} as const;

export function numberRequestBody(input: { kind: "new" | "existing"; region: string; phone: string; notes: string }): string | null {
  const normalizedPhone = input.phone.trim().replace(/[ ()-]/g, "");
  if (!input.region.trim() || (input.kind === "existing" && !/^\+[1-9]\d{6,14}$/.test(normalizedPhone))) return null;
  return [
    input.kind === "new" ? "Request: new receptionist number" : "Request: use my existing business number",
    `Country / area: ${input.region.trim()}`,
    ...(input.kind === "existing" ? [`Existing number: ${input.phone.trim()}`] : []),
    ...(input.notes.trim() ? [`Notes: ${input.notes.trim()}`] : []),
    "Please confirm availability, ownership requirements and any charges before activation.",
  ].join("\n");
}

export function everyRenderableString(): string[] {
  return [...Object.values(PAGE), ...Object.values(COPY), ...Object.values(NUMBER_REQUEST)];
}
