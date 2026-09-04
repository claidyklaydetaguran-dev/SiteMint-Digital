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
  noneDetail: "SiteMint assigns your number during onboarding. Reach out if you believe this is a mistake.",

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

export function everyRenderableString(): string[] {
  return [...Object.values(PAGE), ...Object.values(COPY)];
}
