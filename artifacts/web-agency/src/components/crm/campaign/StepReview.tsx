import { useMemo, useState } from "react";
import {
  AlertCircle, AlertTriangle, CheckCircle2, Loader2, Monitor, RefreshCw, Send, Smartphone,
} from "lucide-react";
import type { EmailBlock } from "@/components/crm/EmailDesigner";
import {
  btnGhost, btnPrimary, cardClass, inputClass,
  type AudiencePreview, type MarketingSettings, type Preflight,
} from "./shared";

// ── Step 3: does this actually work ──────────────────────────────────────────
//
// Two questions, answered in the operator's language rather than the system's:
// what will a real person see, and what is wrong with it.
//
// The preview is the SERVER's render — the same function that builds the
// outgoing message — so approving it is a judgement about the real email. And
// every problem is phrased as a consequence rather than a rule: "the button
// doesn't go anywhere yet" rather than "block 3 has no url".

interface Issue {
  id: string;
  severity: "must" | "worth";
  text: string;
}

interface Props {
  blocks: EmailBlock[];
  subject: string;
  preheader: string;
  preflight: Preflight | null;
  audience: AudiencePreview | null;
  settings: MarketingSettings | null;

  previewHtml: string | null;
  previewLoading: boolean;
  previewError: string | null;
  previewAs: { id: number; name: string } | null;
  previewLeadId: number | null;
  fallbacksUsed: string[];
  onPreviewAs: (leadId: number | null) => void;
  onRefreshPreview: () => void;

  testTo: string;
  onTestTo: (v: string) => void;
  onTestSend: () => void;
  testBusy: boolean;
  testResult: { ok: boolean; text: string } | null;
  readOnly?: boolean;
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

export default function StepReview(props: Props) {
  const {
    blocks, subject, preheader, preflight, audience, settings,
    previewHtml, previewLoading, previewError, previewAs, previewLeadId,
    fallbacksUsed, onPreviewAs, onRefreshPreview,
    testTo, onTestTo, onTestSend, testBusy, testResult, readOnly,
  } = props;

  const [width, setWidth] = useState<"desktop" | "mobile">("desktop");

  const issues = useMemo(
    () => issuesFor({ blocks, subject, preheader, preflight, audience, settings }),
    [blocks, subject, preheader, preflight, audience, settings],
  );
  const must = issues.filter((i) => i.severity === "must");
  const worth = issues.filter((i) => i.severity === "worth");

  const examples = audience?.eligible ?? [];

  return (
    <div className="space-y-4">
      {/* ══ What is wrong ══ */}
      <div className={cardClass}>
        <div className="px-3.5 py-3 border-b border-border flex items-start gap-2">
          {must.length > 0
            ? <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            : <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
          <div>
            <p className="text-sm font-semibold text-foreground">
              {must.length > 0
                ? `${must.length} thing${must.length === 1 ? "" : "s"} to fix before this can go out`
                : "Nothing is stopping this from going out"}
            </p>
            {worth.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {worth.length} other {worth.length === 1 ? "thing is" : "things are"} worth knowing about.
              </p>
            )}
          </div>
        </div>

        {(must.length > 0 || worth.length > 0) && (
          <ul className="divide-y divide-border">
            {must.map((i) => (
              <li key={i.id} className="px-3.5 py-2.5 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                <span className="text-sm text-foreground">{i.text}</span>
              </li>
            ))}
            {worth.map((i) => (
              <li key={i.id} className="px-3.5 py-2.5 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span className="text-sm text-muted-foreground">{i.text}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="px-3.5 py-2 text-xs text-muted-foreground border-t border-border">
          Fixing any of these is a step back to the email — nothing you have written is lost.
        </p>
      </div>

      {/* ══ What a real person sees ══ */}
      <div className={`${cardClass} overflow-hidden`}>
        <div className="px-3.5 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">What a real person sees</p>
            <p className="text-xs text-muted-foreground truncate">
              {previewAs ? `Rendered with ${previewAs.name}'s own details` : "Pick a recipient to see their version"}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button" onClick={() => setWidth("desktop")}
              aria-label="Desktop width" aria-pressed={width === "desktop"}
              className={`p-2.5 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center ${
                width === "desktop" ? "bg-teal-100 text-teal-800" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              <Monitor className="w-4 h-4" />
            </button>
            <button
              type="button" onClick={() => setWidth("mobile")}
              aria-label="Mobile width" aria-pressed={width === "mobile"}
              className={`p-2.5 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center ${
                width === "mobile" ? "bg-teal-100 text-teal-800" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              <Smartphone className="w-4 h-4" />
            </button>
            <button
              type="button" onClick={onRefreshPreview}
              aria-label="Refresh preview"
              className="p-2.5 rounded-lg text-muted-foreground hover:bg-accent min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="px-3.5 py-2.5 border-b border-border bg-muted/30">
          <label className="block text-xs font-semibold text-foreground mb-1">Preview as</label>
          <select
            className={inputClass}
            value={previewLeadId ?? ""}
            onChange={(e) => onPreviewAs(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Nobody — show the merge tags as written</option>
            {examples.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ""}</option>
            ))}
          </select>
          {examples.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Nobody is in the audience yet, so there is no real example to render.
            </p>
          )}
        </div>

        {previewError ? (
          <div className="p-4">
            <p className="text-sm text-red-700 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {previewError}
            </p>
            <button type="button" className={`${btnGhost} mt-2`} onClick={onRefreshPreview}>
              <RefreshCw className="w-3.5 h-3.5" /> Try again
            </button>
          </div>
        ) : previewHtml === null ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {previewLoading ? "Rendering…" : "No preview yet."}
          </p>
        ) : (
          <div className="overflow-auto p-3 bg-muted/30">
            <iframe
              title="Email preview"
              srcDoc={previewHtml}
              sandbox=""
              className="bg-white border border-border rounded-md mx-auto block"
              style={{ width: width === "mobile" ? 375 : 620, height: 620, maxWidth: "100%" }}
            />
          </div>
        )}

        {fallbacksUsed.length > 0 && (
          <p className="px-3.5 py-2 text-xs text-amber-900 bg-amber-50 border-t border-amber-200">
            This person has no {fallbacksUsed.join(", ")} on file, so the words you chose as a
            fallback are what they see.
          </p>
        )}
        <p className="px-3.5 py-2 text-xs text-muted-foreground border-t border-border">
          Rendered by the server with the same function that builds the outgoing message. What is
          here is what is sent.
        </p>
      </div>

      {/* ══ Send yourself a copy ══ */}
      <div className={`${cardClass} p-3.5 space-y-2.5`}>
        <div>
          <p className="text-sm font-semibold text-foreground">Send yourself a copy</p>
          <p className="text-xs text-muted-foreground">
            A test can only go to a staff account here — never to a customer, even by accident.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            className={inputClass}
            value={testTo}
            disabled={readOnly}
            onChange={(e) => onTestTo(e.target.value)}
          >
            <option value="">Choose a staff address…</option>
            {(settings?.testAddresses ?? []).map((s) => (
              <option key={s.id} value={s.email}>
                {s.displayName ? `${s.displayName} — ${s.email}` : s.email}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={btnGhost}
            disabled={readOnly || testBusy || !testTo}
            onClick={onTestSend}
          >
            {testBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send a test
          </button>
        </div>
        {testResult && (
          <p className={`text-sm flex items-start gap-2 ${testResult.ok ? "text-emerald-800" : "text-red-700"}`}>
            {testResult.ok
              ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
            {testResult.text}
          </p>
        )}
      </div>
    </div>
  );
}
