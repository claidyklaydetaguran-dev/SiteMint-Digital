// ── Three things that send messages, and the one sentence that tells them apart ──
//
// A campaign, a sequence and the sequence queue all put email in front of
// customers, and two of them were once both called "campaign". An operator has
// to be able to tell which one they are looking at from the screen alone, so the
// sentence that defines each lives here once and every screen that names one
// uses it. `lives` is the navigation label that leads to it.

export const MESSAGING_CONCEPTS = {
  campaign: {
    name: "Campaign",
    lives: "Marketing",
    summary: "One email, sent once, to a list of people.",
  },
  sequence: {
    name: "Sequence",
    lives: "Sequences",
    summary: "Several messages over days. Contacts are enrolled, and each step goes out on its own schedule.",
  },
  queue: {
    name: "Sequence queue",
    lives: "Sequence Queue",
    summary: "Every message a sequence has scheduled, one row per message per contact. Marketing campaigns never appear here.",
  },
} as const;

export type MessagingConcept = keyof typeof MESSAGING_CONCEPTS;
