// The transfer destination this server hands the voice provider when an
// assistant asks to put a caller through.
//
// Warm, not blind. With a blind transfer the assistant leaves the call the
// moment it dials, so a busy line or an unanswered phone drops the caller with
// nobody to take a message. `warm-transfer-experimental` keeps the caller on
// hold while the person is dialled, and only connects them if a human
// answers; otherwise the fallback message is spoken and — because
// `endCallEnabled` is false — the assistant stays on the call to take a
// message. Provider vocabulary lives here, not in the webhook route.

export interface TransferDestinationInput {
  /** E.164 number of a consented, active transfer contact. */
  destinationE164: string;
  /** The contact's display label, spoken to the caller. */
  label: string;
}

export interface VapiNumberTransferDestination {
  type: "number";
  number: string;
  message: string;
  transferPlan: {
    mode: "warm-transfer-experimental";
    message: string;
    fallbackPlan: { message: string; endCallEnabled: false };
  };
}

export function buildVapiTransferDestination(input: TransferDestinationInput): VapiNumberTransferDestination {
  const label = input.label.trim().slice(0, 80) || "the team";
  return {
    type: "number",
    number: input.destinationE164,
    message: `Please hold while I connect you to ${label}.`,
    transferPlan: {
      mode: "warm-transfer-experimental",
      // Said to the person who answers, before the caller is connected.
      message: "Hi, this is the AI receptionist with a caller who asked to speak with you. Connecting you now.",
      fallbackPlan: {
        message: `I couldn't reach ${label} just now. I can take a detailed message so they can call you back — what would you like me to pass on?`,
        endCallEnabled: false,
      },
    },
  };
}
