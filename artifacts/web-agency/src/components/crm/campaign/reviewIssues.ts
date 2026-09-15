// ── Everything wrong with an email, said before it is sent ──────────────────
//
// Kept out of StepReview.tsx so the rules can be tested without a DOM. The
// preview step renders exactly this list, so "missing merge values are warned
// about before sending" is a property of this function, not of a screenshot.

import type { EmailBlock } from "@/components/crm/EmailDesigner";
import type { AudiencePreview, MarketingSettings, Preflight } from "./shared";

export interface Issue {
  id: string;
  severity: "must" | "worth";
  text: string;
}

/** Everything wrong with this email, said as a consequence. */
export function issuesFor(args: {
  blocks: EmailBlock[];
  subject: string;
  preheader: string;
  preflight: Preflight | null;
  audience: AudiencePreview | null;
  settings: MarketingSettings | null;
}): Issue[] {
  const { blocks, subject, preheader, preflight, audience, settings } = args;
  const issues: Issue[] = [];

  for (const [i, b] of (preflight?.blockers ?? []).entries()) {
    issues.push({ id: `blocker-${i}`, severity: "must", text: b });
  }

  blocks.forEach((b, i) => {
    const label = b.text?.trim() ? `“${b.text.trim().slice(0, 40)}”` : "one of the buttons";
    if (b.type === "button" && !(b.url ?? "").trim()) {
      issues.push({ id: `btn-${i}`, severity: "must", text: `The button ${label} does not go anywhere yet. Readers who click it will get nothing.` });
    }
    if (b.type === "button" && (b.url ?? "").trim() && !/^(https?:\/\/|mailto:)/i.test((b.url ?? "").trim())) {
      issues.push({ id: `btnurl-${i}`, severity: "must", text: `The link on the button ${label} is not a web address, so it will be dropped from the email entirely.` });
    }
    if (b.type === "image" && !(b.url ?? "").trim()) {
      issues.push({ id: `img-${i}`, severity: "must", text: "An image block has no picture in it, so that part of the email will be empty." });
    }
    if (b.type === "image" && (b.url ?? "").trim() && !(b.alt ?? "").trim()) {
      issues.push({ id: `alt-${i}`, severity: "worth", text: "An image has no description. Most inboxes block images by default, so those readers will see a blank space." });
    }
  });

  if (subject.trim().length > 70) {
    issues.push({ id: "subject-long", severity: "worth", text: `The subject is ${subject.trim().length} characters. Most inboxes cut it off around 60, so the end will not be read.` });
  }
  if (!preheader.trim()) {
    issues.push({ id: "no-preheader", severity: "worth", text: "There is no preview line, so inboxes will show the first words of the email instead — usually the greeting." });
  }

  for (const w of preflight?.fallbackWarnings ?? []) {
    issues.push({
      id: `fallback-${w.field}`,
      severity: "worth",
      text: `${w.count} of the ${preflight?.sendable ?? 0} recipients (${w.share}%) have no ${w.field.replace(/_/g, " ")} on file, so they will see the fallback word you wrote instead.`,
    });
  }

  const suppressed = (audience?.excludedByReason ?? []).filter((b) => b.reason === "suppressed" || b.reason === "unsubscribed");
  const suppressedCount = suppressed.reduce((s, b) => s + b.count, 0);
  if (suppressedCount > 0) {
    issues.push({
      id: "suppressed",
      severity: "worth",
      text: `${suppressedCount} ${suppressedCount === 1 ? "person is" : "people are"} on the do-not-email list and will be skipped. That is deliberate — they asked, or their mailbox rejected us permanently.`,
    });
  }

  if (settings && !settings.delivery.configured) {
    issues.push({
      id: "delivery",
      severity: "worth",
      text: `${settings.delivery.operatorNote} A test send will still show you exactly what it looks like.`,
    });
  }

  return issues;
}
